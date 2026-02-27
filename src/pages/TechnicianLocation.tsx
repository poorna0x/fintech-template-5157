import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation, ExternalLink, Loader2, MapIcon, Clock, Search, AlertCircle, RotateCcw, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import DraggableMap from '@/components/DraggableMap';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/supabase';
import { isIOS } from '@/lib/cameraUtils';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

const TechnicianLocation = () => {
  const { user } = useAuth();
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'permission' | 'upload' | 'location' | 'other' | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedLocation, setSearchedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<{ value: number; unit: string } | null>(null);
  const [duration, setDuration] = useState<{ value: number; unit: string } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [googleMapsLink, setGoogleMapsLink] = useState('');
  const [isProcessingLink, setIsProcessingLink] = useState(false);
  const googleMapsLinkRef = useRef<HTMLInputElement>(null);
  const lastUpdateAttemptRef = useRef<number>(0);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const getCurrentLocation = useCallback(async (autoUpdate: boolean = false) => {
    console.log('📍 [TechnicianLocation] getCurrentLocation called', { autoUpdate });
    
    // Check if location tracking is enabled - block ALL updates when disabled
    const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
    const settingValue = localStorage.getItem('technician_location_tracking_enabled');
    console.log('📍 [TechnicianLocation] Location tracking setting check:', {
      settingValue,
      locationTrackingEnabled,
      willProceed: locationTrackingEnabled
    });
    
    if (!locationTrackingEnabled) {
      console.log('🚫 [TechnicianLocation] Location tracking is DISABLED - BLOCKING all location operations');
      console.log('🚫 [TechnicianLocation] - Geolocation API call: BLOCKED');
      console.log('🚫 [TechnicianLocation] - Database update: BLOCKED');
      if (!autoUpdate) {
        setError('Location tracking is disabled in settings. Please enable it in Settings to update your location.');
        setErrorType('other');
        toast.error('🚫 Location tracking is disabled. Enable it in Settings to update your location.');
      }
      setIsLoading(false);
      return;
    }
    
    console.log('✅ [TechnicianLocation] Location tracking is ENABLED - proceeding with location update');

    setIsLoading(true);
    setError(null);
    setErrorType(null);
    setPermissionDenied(false);

    if (!navigator.geolocation) {
      const errorMsg = 'Geolocation is not supported by your browser';
      setError(errorMsg);
      setErrorType('other');
      if (!autoUpdate) {
        toast.error(errorMsg);
      }
      setIsLoading(false);
      return;
    }

    // Check if we're on HTTPS or localhost (required for geolocation)
    const isSecure = window.location.protocol === 'https:' || 
                     window.location.hostname === 'localhost' || 
                     window.location.hostname === '127.0.0.1';
    
    if (!isSecure) {
      const errorMsg = 'Location access requires HTTPS. Please use a secure connection.';
      setError(errorMsg);
      setErrorType('other');
      if (!autoUpdate) {
        toast.error(errorMsg);
      }
      setIsLoading(false);
      return;
    }

    // Check permission status for UI purposes only (don't block - Permissions API is unreliable)
    // On iOS and some browsers (including Chrome), Permissions API doesn't work correctly
    // We always try getCurrentPosition and let it handle permission prompts naturally
    let permissionStatus = 'unknown';
    try {
      if ('permissions' in navigator) {
        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        permissionStatus = result.state;
        // Listen for permission changes
        result.onchange = () => {
          if (result.state === 'granted') {
            setPermissionDenied(false);
            setError(null);
            setErrorType(null);
          } else if (result.state === 'denied') {
            setPermissionDenied(true);
            setErrorType('permission');
          }
        };
      }
    } catch (e) {
      // Permissions API not supported or failed - this is common on iOS and some browsers
      console.log('Permissions API not available or unreliable - will try getCurrentPosition directly');
    }

    // Don't block based on permission check - let getCurrentPosition handle it naturally
    // The Permissions API can return incorrect states, especially on mobile browsers and iOS
    // Only use it for informational purposes, not to prevent the geolocation call

    console.log('🌐 [TechnicianLocation] Calling navigator.geolocation.getCurrentPosition...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log('✅ [TechnicianLocation] Geolocation API returned position:', {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          timestamp: position.timestamp,
        };
        setLocation(locationData);
        setMapCenter({ lat: locationData.latitude, lng: locationData.longitude });
        console.log('📍 [TechnicianLocation] Location set in state:', locationData);
        
        // Update location in database if user is logged in
        // Double-check location tracking is still enabled before saving to DB
        const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
        const settingValue = localStorage.getItem('technician_location_tracking_enabled');
        console.log('💾 [TechnicianLocation] Before database update - checking setting again:', {
          settingValue,
          locationTrackingEnabled
        });
        
        if (!locationTrackingEnabled) {
          console.log('🚫 [TechnicianLocation] Location tracking DISABLED - BLOCKING database update');
          console.log('🚫 [TechnicianLocation] - current_location field: NOT SAVED');
          return;
        }
        
        console.log('✅ [TechnicianLocation] Location tracking still ENABLED - proceeding with database update');

        if (user?.technicianId) {
          try {
            const locationUpdateData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              lastUpdated: new Date().toISOString(),
              accuracy: position.coords.accuracy || null
            };

            console.log('💾 [TechnicianLocation] Updating database with location data:', locationUpdateData);
            const { error: updateError } = await db.technicians.update(user.technicianId, {
              current_location: locationUpdateData,
            });

            if (updateError) {
              console.error('❌ [TechnicianLocation] Error updating location in database:', updateError);
              const dbErrorMsg = `Location captured but failed to upload to server. Please check your internet connection and try again. Error: ${updateError.message}`;
              setError(dbErrorMsg);
              setErrorType('upload');
              if (!autoUpdate) {
                toast.error(dbErrorMsg, { duration: 8000 });
              } else {
                toast.error('Failed to upload location. Please try again.', { duration: 6000 });
              }
            } else {
              console.log('✅ [TechnicianLocation] Location updated in database successfully:', {
                location: locationUpdateData,
                fieldUpdated: 'current_location'
              });
              setError(null);
              setErrorType(null);
              if (!autoUpdate) {
                toast.success('Location captured and saved successfully!');
              }
            }
          } catch (dbError) {
            console.error('Error updating location in database:', dbError);
            const dbErrorMsg = `Location captured but failed to upload to server. Please check your internet connection and try again. Error: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`;
            setError(dbErrorMsg);
            setErrorType('upload');
            if (!autoUpdate) {
              toast.error(dbErrorMsg, { duration: 8000 });
            } else {
              toast.error('Failed to upload location. Please try again.', { duration: 6000 });
            }
          }
        } else {
          if (!autoUpdate) {
            toast.success('Location captured successfully!');
          }
        }
        
        setIsLoading(false);
        lastUpdateAttemptRef.current = Date.now();
      },
      (error) => {
        let errorMsg = 'Failed to get your location';
        let detailedError = '';
        let errorTypeValue: 'permission' | 'upload' | 'location' | 'other' = 'location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location permission denied';
            detailedError = 'Click "Request Permission Again" to ask for location access. If that doesn\'t work, enable location access in your browser settings.';
            errorTypeValue = 'permission';
            setPermissionDenied(true);
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable';
            detailedError = 'Your device could not determine your location. Make sure GPS is enabled and you have a clear view of the sky, or try again in a different location.';
            errorTypeValue = 'location';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out';
            detailedError = 'The location request took too long. This can happen if GPS signal is weak. Try moving to an area with better signal or try again.';
            errorTypeValue = 'location';
            break;
          default:
            errorMsg = 'An unknown error occurred';
            detailedError = `Error code: ${error.code}. Please try again or contact support if the problem persists.`;
            errorTypeValue = 'other';
            break;
        }
        
        setError(`${errorMsg}. ${detailedError}`);
        setErrorType(errorTypeValue);
        if (!autoUpdate) {
          toast.error(`${errorMsg}. ${detailedError}`, { duration: 8000 });
        } else {
          // For auto-updates, show a less intrusive message
          console.warn('Auto location update failed:', errorMsg, detailedError);
          toast.error(`${errorMsg}. Please try again.`, { duration: 6000 });
        }
        setIsLoading(false);
        lastUpdateAttemptRef.current = Date.now();
      },
      {
        enableHighAccuracy: false, // Set to false for faster response - GPS can be very slow on mobile/PWA
        timeout: 25000, // 25s - balance between slow phones and not failing too soon
        maximumAge: 300000, // 5 minutes - use cached location if available (helps with timeout issues)
      }
    );
  }, [user?.technicianId]);

  // Auto-update location on page load/refresh
  useEffect(() => {
    // Check if location tracking is enabled
    const locationTrackingEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
    const settingValue = localStorage.getItem('technician_location_tracking_enabled');
    console.log('⏰ [TechnicianLocation] Auto-update on page load check:', {
      settingValue,
      locationTrackingEnabled,
      willSetupAutoUpdates: locationTrackingEnabled
    });
    
    if (!locationTrackingEnabled) {
      console.log('🚫 [TechnicianLocation] Location tracking is DISABLED - skipping auto-updates');
      console.log('🚫 [TechnicianLocation] - No initial update on page load');
      console.log('🚫 [TechnicianLocation] - No visibility change updates');
      console.log('🚫 [TechnicianLocation] - No page refresh updates');
      return;
    }
    
    console.log('✅ [TechnicianLocation] Location tracking ENABLED - setting up auto-updates');

    // Wait a bit before first update to ensure page is fully loaded
    const initialDelay = setTimeout(() => {
      console.log('🔄 [TechnicianLocation] Initial delay complete - triggering location update on page load');
      getCurrentLocation(true); // Auto-update mode
    }, 1000); // Wait 1 second after page load

    // Also update when page becomes visible (e.g., when switching back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Check if tracking is still enabled
        const stillEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
        console.log('👁️ [TechnicianLocation] Visibility change:', {
          hidden: document.hidden,
          stillEnabled,
          willUpdate: stillEnabled && !document.hidden
        });
        
        if (stillEnabled) {
          // Only update if it's been more than 1 minute since last attempt
          const timeSinceLastUpdate = Date.now() - lastUpdateAttemptRef.current;
          if (timeSinceLastUpdate > 60000) { // 1 minute
            console.log('🔄 [TechnicianLocation] Page became visible - triggering location update');
            setTimeout(() => {
              getCurrentLocation(true);
            }, 500);
          } else {
            console.log('⏸️ [TechnicianLocation] Too soon since last update, skipping');
          }
        } else {
          console.log('🚫 [TechnicianLocation] Location tracking disabled - skipping visibility update');
        }
      }
    };

    // Listen for storage changes (when setting is toggled in Settings page - cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'technician_location_tracking_enabled') {
        const isEnabled = e.newValue !== 'false';
        if (isEnabled && !document.hidden) {
          console.log('Location tracking enabled - requesting location update');
          setTimeout(() => {
            getCurrentLocation(true);
          }, 500);
        }
      }
    };

    // Listen for custom event (when setting is toggled in same window)
    const handleLocationTrackingChanged = (e: CustomEvent) => {
      const isEnabled = e.detail?.enabled !== false;
      console.log('🔔 [TechnicianLocation] Location tracking setting changed:', {
        enabled: isEnabled,
        pageVisible: !document.hidden,
        willUpdate: isEnabled && !document.hidden
      });
      
      if (isEnabled && !document.hidden) {
        console.log('✅ [TechnicianLocation] Location tracking ENABLED - requesting location update');
        setTimeout(() => {
          getCurrentLocation(true);
        }, 500);
      } else if (!isEnabled) {
        console.log('🚫 [TechnicianLocation] Location tracking DISABLED - no updates will be made');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('locationTrackingChanged', handleLocationTrackingChanged as EventListener);

    // Update on page refresh (beforeunload won't work, but we can use pageshow)
    const handlePageShow = (e: PageTransitionEvent) => {
      const stillEnabled = localStorage.getItem('technician_location_tracking_enabled') !== 'false';
      if (stillEnabled && (e.persisted || performance.navigation.type === 1)) {
        // Page was loaded from cache or refreshed
        setTimeout(() => {
          getCurrentLocation(true);
        }, 1000);
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => {
      clearTimeout(initialDelay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('locationTrackingChanged', handleLocationTrackingChanged as EventListener);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [getCurrentLocation]); // Include getCurrentLocation in dependencies

  const openInGoogleMaps = () => {
    if (!location) {
      toast.error('No location data available');
      return;
    }

    const { latitude, longitude } = location;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
    window.open(googleMapsUrl, '_blank');
    toast.success('Opening location in Google Maps...');
  };

  const openInGoogleMapsDirections = (destination: { lat: number; lng: number }) => {
    if (!location) {
      toast.error('No location data available');
      return;
    }

    const { latitude, longitude } = location;
    const googleMapsUrl = `https://www.google.com/maps/dir/${latitude},${longitude}/${destination.lat},${destination.lng}`;
    window.open(googleMapsUrl, '_blank');
    toast.success('Opening directions in Google Maps...');
  };

  // Sample destination locations for testing
  const sampleDestinations = [
    { name: 'Customer Location 1', lat: 12.9716, lng: 77.5946 },
    { name: 'Customer Location 2', lat: 12.9150, lng: 77.6118 },
    { name: 'Customer Location 3', lat: 12.9784, lng: 77.6408 },
  ];

  // Calculate distance and duration using Distance Matrix API
  const calculateDistanceAndTime = async (origin: { lat: number; lng: number }, destination: { lat: number; lng: number }) => {
    setIsCalculating(true);
    
    try {
      const distanceMatrix = new google.maps.DistanceMatrixService();
      
      distanceMatrix.getDistanceMatrix(
        {
          origins: [origin],
          destinations: [destination],
          travelMode: google.maps.TravelMode.DRIVING,
          unitSystem: google.maps.UnitSystem.METRIC,
        },
        (response, status) => {
          setIsCalculating(false);
          
          if (status === google.maps.DistanceMatrixStatus.OK && response) {
            const result = response.rows[0].elements[0];
            
            if (result.status === google.maps.DistanceMatrixElementStatus.OK) {
              setDistance({
                value: result.distance.value,
                unit: result.distance.text,
              });
              setDuration({
                value: result.duration.value,
                unit: result.duration.text,
              });
              toast.success('Distance and time calculated!');
            } else {
              toast.error('Could not calculate distance');
            }
          } else {
            toast.error('Error calculating distance');
          }
        }
      );
    } catch (error) {
      setIsCalculating(false);
      toast.error('Failed to calculate distance');
    }
  };

  // Handle Google Maps link
  const handleGoogleMapsLink = async () => {
    if (!googleMapsLink.trim()) {
      toast.error('Please enter a Google Maps link');
      return;
    }

    setIsProcessingLink(true);
    setError(null);

    try {
      // Extract coordinates from various Google Maps URL formats
      let extractedLocation: { lat: number; lng: number } | null = null;

      // Pattern 1: Standard Google Maps URL with @lat,lng (most common)
      // Example: https://www.google.com/maps/@12.9716,77.5946,15z
      const atMatch = googleMapsLink.match(/@([+-]?[\d.]+),([+-]?[\d.]+)/);
      if (atMatch) {
        extractedLocation = {
          lat: parseFloat(atMatch[1]),
          lng: parseFloat(atMatch[2])
        };
      }

      // Pattern 2: URL with /place/ and !3d!4d coordinates
      // Example: https://www.google.com/maps/place/.../@12.9716,77.5946,15z/data=!3d...
      const placeMatch = googleMapsLink.match(/!3d([+-]?[\d.]+)!4d([+-]?[\d.]+)/);
      if (placeMatch && !extractedLocation) {
        extractedLocation = {
          lat: parseFloat(placeMatch[1]),
          lng: parseFloat(placeMatch[2])
        };
      }

      // Pattern 3: URL with ?q=coordinates
      // Example: https://www.google.com/maps/search/?api=1&query=12.9716,77.5946
      if (!extractedLocation) {
        const queryMatch = googleMapsLink.match(/[?&]query=([+-]?[\d.]+),([+-]?[\d.]+)/);
        if (queryMatch) {
          extractedLocation = {
            lat: parseFloat(queryMatch[1]),
            lng: parseFloat(queryMatch[2])
          };
        }
      }

      // Pattern 4: Short link - show helpful message
      if ((googleMapsLink.includes('maps.app.goo.gl') || googleMapsLink.includes('goo.gl/maps')) && !extractedLocation) {
        toast.error(
          'Short links cannot be processed. Open the link in your browser, copy the full URL with @lat,lng, or use the search box above.',
          { duration: 6000 }
        );
        setIsProcessingLink(false);
        return;
      }

      if (extractedLocation && extractedLocation.lat && extractedLocation.lng && 
          !isNaN(extractedLocation.lat) && !isNaN(extractedLocation.lng) &&
          extractedLocation.lat >= -90 && extractedLocation.lat <= 90 &&
          extractedLocation.lng >= -180 && extractedLocation.lng <= 180) {
        setSearchedLocation(extractedLocation);
        setMapCenter(extractedLocation);
        toast.success('Location extracted from Google Maps link!');
        
        // Automatically calculate distance if current location is available
        if (location) {
          calculateDistanceAndTime(
            { lat: location.latitude, lng: location.longitude },
            extractedLocation
          );
        }
      } else {
        toast.error(
          'Could not extract coordinates. Use full Google Maps URL with @lat,lng (e.g., maps.google.com/@12.9716,77.5946) or use the search box.',
          { duration: 6000 }
        );
      }
    } catch (error) {
      toast.error('Failed to process Google Maps link. Please use the search box above instead.');
      console.error('Error processing link:', error);
    } finally {
      setIsProcessingLink(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Technician Location Manager
          </h1>
          <p className="text-gray-600 dark:text-gray-300">
            Get your current location and navigate to customer locations
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Navigation className="w-5 h-5" />
              Get Current Location
            </CardTitle>
            <CardDescription>
              Click the button below to get your current GPS coordinates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={getCurrentLocation}
              disabled={isLoading}
              size="lg"
              className="w-full sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Getting Location...
                </>
              ) : (
                <>
                  <MapPin className="w-4 h-4 mr-2" />
                  Get My Location
                </>
              )}
            </Button>
            
            {error && (
              <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-red-800 dark:text-red-200 font-medium mb-1">Error:</p>
                    <p className="text-red-600 dark:text-red-300 text-sm mb-3">{error}</p>
                    <div className="flex flex-wrap gap-2">
                      {errorType === 'permission' && (
                        <Button
                          onClick={() => {
                            setError(null);
                            setErrorType(null);
                            setPermissionDenied(false);
                            getCurrentLocation(false);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          <RotateCcw className="w-4 h-4 mr-2" />
                          Request Permission Again
                        </Button>
                      )}
                      {(errorType === 'upload' || errorType === 'location') && (
                        <Button
                          onClick={() => {
                            setError(null);
                            setErrorType(null);
                            getCurrentLocation(false);
                          }}
                          size="sm"
                          variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/30"
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Try Again
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {location && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  Current Location
                </CardTitle>
                <CardDescription>
                  Your GPS coordinates have been captured
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                        Latitude
                      </p>
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {location.latitude.toFixed(6)}
                      </p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                      <p className="text-sm font-medium text-green-900 dark:text-green-200 mb-1">
                        Longitude
                      </p>
                      <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                        {location.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Accuracy
                    </p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      ±{(location.accuracy).toFixed(0)} meters
                    </p>
                  </div>

                  <Button
                    onClick={openInGoogleMaps}
                    className="w-full"
                    variant="outline"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open in Google Maps
                  </Button>
                </div>
              </CardContent>
            </Card>

            {mapCenter && (
              <>
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      Search Location
                    </CardTitle>
                    <CardDescription>
                      Search for any address or place name
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Input
                        ref={searchInputRef}
                        type="text"
                        placeholder="Search for address or place..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1"
                        onFocus={() => {
                          // Initialize autocomplete when focused
                          if (window.google && window.google.maps && window.google.maps.places && searchInputRef.current && !autocompleteRef.current) {
                            autocompleteRef.current = new google.maps.places.Autocomplete(searchInputRef.current, {
                              fields: ['geometry', 'name', 'formatted_address'],
                              componentRestrictions: { country: 'in' }, // India only
                            });
                            
                            autocompleteRef.current.addListener('place_changed', () => {
                              const place = autocompleteRef.current?.getPlace();
                              if (place?.geometry?.location) {
                                const searchedLoc = {
                                  lat: place.geometry.location.lat(),
                                  lng: place.geometry.location.lng(),
                                };
                                setSearchedLocation(searchedLoc);
                                setMapCenter(searchedLoc);
                                toast.success(`Found: ${place.name || place.formatted_address}`);
                              }
                            });
                          }
                        }}
                      />
                      {searchedLocation && (
                        <Button
                          onClick={() => {
                            if (location && searchedLocation) {
                              calculateDistanceAndTime(
                                { lat: location.latitude, lng: location.longitude },
                                searchedLocation
                              );
                            }
                          }}
                          disabled={isCalculating}
                          variant="outline"
                        >
                          {isCalculating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Clock className="w-4 h-4 mr-2" />
                              Get Distance & Time
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Google Maps Link Input */}
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="w-5 h-5" />
                      Paste Google Maps Link
                    </CardTitle>
                    <CardDescription>
                      Paste a Google Maps link with coordinates (e.g., maps.google.com/@12.9716,77.5946)
                      <br />
                      <span className="text-xs text-muted-foreground mt-1 block">
                        💡 For short links (maps.app.goo.gl): Open in browser, then copy the full URL from address bar
                      </span>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      <Input
                        ref={googleMapsLinkRef}
                        type="text"
                        placeholder="https://www.google.com/maps/@12.9716,77.5946,15z or use search above"
                        value={googleMapsLink}
                        onChange={(e) => setGoogleMapsLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleGoogleMapsLink();
                          }
                        }}
                      />
                      <Button
                        onClick={handleGoogleMapsLink}
                        disabled={isProcessingLink || !googleMapsLink.trim()}
                        className="w-full"
                      >
                        {isProcessingLink ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing Link...
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4 mr-2" />
                            Extract Location
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {distance && duration && (
                      <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
                            <p className="text-sm font-medium text-purple-900 dark:text-purple-200 mb-1">
                              Distance
                            </p>
                            <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                              {distance.unit}
                            </p>
                          </div>
                          <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
                            <p className="text-sm font-medium text-orange-900 dark:text-orange-200 mb-1">
                              Estimated Time
                            </p>
                            <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">
                              {duration.unit}
                            </p>
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                              (for 2-wheeler)
                            </p>
                          </div>
                        </div>
                        {location && searchedLocation && (
                          <Button
                            onClick={() => {
                              const googleMapsUrl = `https://www.google.com/maps/dir/${location.latitude},${location.longitude}/${searchedLocation.lat},${searchedLocation.lng}`;
                              window.open(googleMapsUrl, '_blank');
                              toast.success('Opening directions in Google Maps...');
                            }}
                            className="w-full"
                            size="lg"
                          >
                            <Navigation className="w-4 h-4 mr-2" />
                            Open in Google Maps for Turn-by-Turn Navigation
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapIcon className="w-5 h-5" />
                      Interactive Map
                    </CardTitle>
                    <CardDescription>
                      Drag the marker to adjust your location
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <DraggableMap
                      center={mapCenter}
                      onLocationChange={(newLocation) => {
                        setLocation({
                          latitude: newLocation.lat,
                          longitude: newLocation.lng,
                          accuracy: location?.accuracy || 0,
                          timestamp: Date.now(),
                        });
                        setMapCenter(newLocation);
                      }}
                      height="50vh"
                    />
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Navigation to Customers</CardTitle>
                <CardDescription>
                  Get directions to customer locations from your current position
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sampleDestinations.map((destination, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {destination.name}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {destination.lat}, {destination.lng}
                        </p>
                      </div>
                      <Button
                        onClick={() => openInGoogleMapsDirections(destination)}
                        size="sm"
                        variant="ghost"
                      >
                        <Navigation className="w-4 h-4 mr-2" />
                        Directions
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default TechnicianLocation;


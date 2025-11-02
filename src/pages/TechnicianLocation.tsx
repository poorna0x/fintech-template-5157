import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MapPin, Navigation, ExternalLink, Loader2, MapIcon, Clock, Search } from 'lucide-react';
import { toast } from 'sonner';
import DraggableMap from '@/components/DraggableMap';

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

const TechnicianLocation = () => {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const getCurrentLocation = () => {
    setIsLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      const errorMsg = 'Geolocation is not supported by your browser';
      setError(errorMsg);
      toast.error(errorMsg);
      setIsLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy || 0,
          timestamp: position.timestamp,
        };
        setLocation(locationData);
        setMapCenter({ lat: locationData.latitude, lng: locationData.longitude });
        toast.success('Location captured successfully!');
        setIsLoading(false);
      },
      (error) => {
        let errorMsg = 'Failed to get your location';
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Permission denied. Please allow location access.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'Location request timed out. Please try again.';
            break;
          default:
            errorMsg = 'An unknown error occurred.';
            break;
        }
        
        setError(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

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
                <p className="text-red-800 dark:text-red-200 font-medium">Error:</p>
                <p className="text-red-600 dark:text-red-300">{error}</p>
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


import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

declare global {
  interface Window {
    google: typeof google;
  }
}

interface GooglePlaceAutocompleteProps {
  inputRef: React.RefObject<HTMLInputElement>;
  onPlaceSelect?: (place: google.maps.places.PlaceResult) => void;
  countryRestriction?: string[];
  className?: string;
  placeholder?: string;
}

const GooglePlaceAutocomplete: React.FC<GooglePlaceAutocompleteProps> = ({
  inputRef,
  onPlaceSelect,
  countryRestriction = ['in'],
  className,
  placeholder = 'Search location...'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef<Loader | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const placeAutocompleteElementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);

  useEffect(() => {
    const initializeAutocomplete = async () => {
      if (!inputRef.current || isLoading) return;

      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!apiKey) {
        console.warn('Google Maps API key not found');
        return;
      }

      try {
        setIsLoading(true);
        
        // Load Google Maps API
        if (!loaderRef.current) {
          loaderRef.current = new Loader({
            apiKey,
            version: 'weekly',
            libraries: ['places']
          });
        }

        await loaderRef.current.load();

        // Check if Autocomplete is still available (for existing customers)
        if (window.google?.maps?.places?.Autocomplete) {
          // Use legacy Autocomplete (still works for existing customers)
          if (inputRef.current && !autocompleteRef.current) {
            autocompleteRef.current = new window.google.maps.places.Autocomplete(
              inputRef.current,
              {
                componentRestrictions: countryRestriction.length > 0 ? { country: countryRestriction as any } : undefined,
                fields: ['formatted_address', 'geometry', 'place_id', 'name', 'address_components']
              }
            );

            autocompleteRef.current.addListener('place_changed', () => {
              const place = autocompleteRef.current?.getPlace();
              if (place && onPlaceSelect) {
                onPlaceSelect(place);
              }
            });
          }
        } else if (window.google?.maps?.places?.PlaceAutocompleteElement) {
          // Use new PlaceAutocompleteElement (recommended for new customers)
          console.log('Using new PlaceAutocompleteElement API');
          // Note: PlaceAutocompleteElement is a web component and requires different handling
          // For now, fallback to showing error
          setError('New PlaceAutocompleteElement API not fully implemented. Please contact support.');
        }
      } catch (err) {
        console.error('Failed to load Google Maps:', err);
        setError('Failed to load Google Maps. Please check your API key.');
      } finally {
        setIsLoading(false);
      }
    };

    // Initialize when input ref is available
    const checkAndInit = setInterval(() => {
      if (inputRef.current) {
        clearInterval(checkAndInit);
        initializeAutocomplete();
      }
    }, 100);

    return () => {
      clearInterval(checkAndInit);
    };
  }, [inputRef, countryRestriction, onPlaceSelect, isLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        placeholder={placeholder}
        className={className}
        disabled={isLoading}
      />
      {isLoading && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
        </div>
      )}
      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
};

export default GooglePlaceAutocomplete;

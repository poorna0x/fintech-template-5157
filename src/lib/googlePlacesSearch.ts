import { ensureGoogleMapsApi } from '@/lib/googleMapsLink';

export type GooglePlacePrediction = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

function asText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && typeof (value as { toString?: () => string }).toString === 'function') {
    return String((value as { toString: () => string }).toString());
  }
  return '';
}

async function fetchPredictionsLegacy(input: string): Promise<GooglePlacePrediction[]> {
  const AutocompleteService = window.google?.maps?.places?.AutocompleteService;
  if (!AutocompleteService) return [];
  const service = new AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions(
      {
        input,
        componentRestrictions: { country: 'in' },
      },
      (results, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          resolve([]);
          return;
        }
        resolve(
          results.map((item) => ({
            placeId: item.place_id,
            mainText: item.structured_formatting?.main_text || item.description,
            secondaryText: item.structured_formatting?.secondary_text || '',
          }))
        );
      }
    );
  });
}

/**
 * Place search for booking + Location Hubs.
 * Uses AutocompleteSuggestion when the loaded Maps library has it; otherwise
 * the older AutocompleteService (still supported, just deprecated for new keys).
 */
export async function fetchGooglePlacePredictions(input: string): Promise<GooglePlacePrediction[]> {
  const trimmed = input.trim();
  if (trimmed.length < 2) return [];
  await ensureGoogleMapsApi();

  try {
    const placesLib = (await window.google.maps.importLibrary('places')) as {
      AutocompleteSuggestion?: {
        fetchAutocompleteSuggestions: (request: {
          input: string;
          includedRegionCodes?: string[];
          language?: string;
        }) => Promise<{
          suggestions?: Array<{
            placePrediction?: {
              placeId?: string;
              text?: unknown;
              mainText?: unknown;
              secondaryText?: unknown;
            };
          }>;
        }>;
      };
    };
    const Suggestion = placesLib?.AutocompleteSuggestion;
    if (Suggestion?.fetchAutocompleteSuggestions) {
      const { suggestions } = await Suggestion.fetchAutocompleteSuggestions({
        input: trimmed,
        includedRegionCodes: ['IN'],
        language: 'en-IN',
      });
      return (suggestions || [])
        .map((row) => {
          const pred = row.placePrediction;
          const placeId = String(pred?.placeId || '').trim();
          if (!placeId) return null;
          return {
            placeId,
            mainText: asText(pred?.mainText) || asText(pred?.text),
            secondaryText: asText(pred?.secondaryText),
          };
        })
        .filter((row): row is GooglePlacePrediction => Boolean(row));
    }
  } catch {
    /* fall through to AutocompleteService */
  }

  return fetchPredictionsLegacy(trimmed);
}

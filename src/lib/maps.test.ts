import { describe, expect, it } from 'vitest';
import { plusesToSpacesPreservingOlc, removePlusCode, restAfterLeadingOlcPlusCode } from './maps';
import { extractPlaceNameFromMapsUrl } from './googleMapsLink';
import { extractPlaceFromPlusCodeAddress, mapsPlaceLabelForStreetAddress } from './adminUtils';

describe('removePlusCode', () => {
  it('does not chop Krishna Mystiq down to tiq', () => {
    expect(removePlusCode('Krishna+Mystiq')).toBe('Krishna Mystiq');
    expect(removePlusCode('Krishna Mystiq')).toBe('Krishna Mystiq');
    expect(mapsPlaceLabelForStreetAddress('Krishna+Mystiq')).toBe('Krishna Mystiq');
  });

  it('still strips real Open Location Codes', () => {
    expect(removePlusCode('2QG7+J9F Assetz Marq 1.0 apartments')).toBe(
      'Assetz Marq 1.0 apartments'
    );
    expect(removePlusCode('VM99+4P, Bengaluru')).toBe('Bengaluru');
  });

  it('does not treat Krishna Mystiq as a Plus Code line', () => {
    expect(restAfterLeadingOlcPlusCode('Krishna+Mystiq Bengaluru')).toBeNull();
    expect(extractPlaceFromPlusCodeAddress('Krishna+Mystiq, Basapura, Bengaluru')).toBeNull();
    expect(restAfterLeadingOlcPlusCode('3Q5F+23 Amanidoddakere, India')).toBe(
      'Amanidoddakere, India'
    );
  });
});

describe('extractPlaceNameFromMapsUrl', () => {
  it('keeps Krishna Mystiq from a /place/ slug', () => {
    const name = extractPlaceNameFromMapsUrl(
      'https://www.google.com/maps/place/Krishna+Mystiq/@12.8646631,77.6543808,17z'
    );
    expect(name).toMatch(/^Krishna Mystiq/i);
    expect(name).not.toMatch(/^tiq/i);
  });
});

describe('plusesToSpacesPreservingOlc', () => {
  it('turns Maps space-plus into spaces but keeps a Plus Code plus', () => {
    expect(plusesToSpacesPreservingOlc('Krishna+Mystiq')).toBe('Krishna Mystiq');
    expect(plusesToSpacesPreservingOlc('2QG7+J9F+Assetz+Marq')).toBe('2QG7+J9F Assetz Marq');
  });
});

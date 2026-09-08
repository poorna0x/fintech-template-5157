import { describe, expect, it } from 'vitest';
import { plusesToSpacesPreservingOlc, removePlusCode, restAfterLeadingOlcPlusCode } from './maps';
import {
  extractPlaceHintFromShareText,
  extractPlaceNameFromMapsUrl,
} from './googleMapsLink';
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

  it('does not treat letter-only OLC-looking tokens as Plus Codes', () => {
    expect(removePlusCode('CHMP+QR Cafe')).toBe('CHMP QR Cafe');
    expect(removePlusCode('CGHJ+MP Place')).toBe('CGHJ MP Place');
  });

  it('keeps common Maps slug place names', () => {
    expect(removePlusCode('Trust+Flow')).toBe('Trust Flow');
    expect(removePlusCode('Camp+Road')).toBe('Camp Road');
    expect(removePlusCode('H2O+Purifiers')).toBe('H2O Purifiers');
    expect(removePlusCode('9th+Cross+Residency')).toBe('9th Cross Residency');
  });

  it('does not treat Krishna Mystiq as a Plus Code line', () => {
    expect(restAfterLeadingOlcPlusCode('Krishna+Mystiq Bengaluru')).toBeNull();
    expect(extractPlaceFromPlusCodeAddress('Krishna+Mystiq, Basapura, Bengaluru')).toBeNull();
    expect(restAfterLeadingOlcPlusCode('3Q5F+23 Amanidoddakere, India')).toBe(
      'Amanidoddakere, India'
    );
    expect(restAfterLeadingOlcPlusCode('3Q5F+23, Amanidoddakere, India')).toBe(
      'Amanidoddakere, India'
    );
    expect(extractPlaceFromPlusCodeAddress('3Q5F+23, Amanidoddakere, India')).toBe(
      'Amanidoddakere'
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

  it('keeps society name after a real Plus Code in the slug', () => {
    const name = extractPlaceNameFromMapsUrl(
      'https://www.google.com/maps/place/2QG7%2BJ9F+Assetz+Marq+1.0+apartments/@12.9,77.6,17z'
    );
    expect(name).toMatch(/Assetz Marq/i);
    expect(removePlusCode(name || '')).toMatch(/^Assetz Marq/i);
  });

  it('handles encoded apostrophes and ampersands', () => {
    expect(
      extractPlaceNameFromMapsUrl(
        "https://www.google.com/maps/place/Joe%27s+Cafe/@12.9,77.6,17z"
      )
    ).toMatch(/^Joe's Cafe/i);
    expect(
      extractPlaceNameFromMapsUrl(
        'https://www.google.com/maps/place/A+%26+B+Residency/@12.9,77.6,17z'
      )
    ).toMatch(/^A & B Residency/i);
  });
});

describe('extractPlaceHintFromShareText', () => {
  it('keeps mobile share place name when spaces were encoded as +', () => {
    const hint = extractPlaceHintFromShareText(
      'Krishna+Mystiq\nhttps://maps.app.goo.gl/abc123'
    );
    expect(hint).toMatch(/^Krishna Mystiq/i);
    expect(hint?.toLowerCase().startsWith('tiq')).toBe(false);
  });

  it('uses the first share lines above a short link', () => {
    const hint = extractPlaceHintFromShareText(
      'Sobha Dream Acres\nWhitefield\nhttps://maps.app.goo.gl/xyz'
    );
    expect(hint).toMatch(/Sobha Dream Acres/i);
  });
});

describe('plusesToSpacesPreservingOlc', () => {
  it('turns Maps space-plus into spaces but keeps a Plus Code plus', () => {
    expect(plusesToSpacesPreservingOlc('Krishna+Mystiq')).toBe('Krishna Mystiq');
    expect(plusesToSpacesPreservingOlc('2QG7+J9F+Assetz+Marq')).toBe('2QG7+J9F Assetz Marq');
  });
});

describe('mapsPlaceLabelForStreetAddress', () => {
  it('keeps digit-leading place names with letters', () => {
    expect(mapsPlaceLabelForStreetAddress('9th Cross Residency')).toBe('9th Cross Residency');
  });
});

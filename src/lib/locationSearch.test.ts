import { describe, expect, it } from 'vitest';
import {
  filterLocationSuggestions,
  isHouseNumberToken,
  locationQueryMatchesText,
  tokenizeLocationQuery,
} from './locationSearch';

describe('tokenizeLocationQuery', () => {
  it('splits space-separated areas and drops filler words', () => {
    const tokens = tokenizeLocationQuery('Kasavanahalli main road, Haralur');
    expect(tokens).toContain('kasavanahalli');
    expect(tokens).toContain('haralur');
    expect(tokens).not.toContain('main');
    expect(tokens).not.toContain('road');
  });

  it('adds a short prefix so a near-miss spelling still matches', () => {
    const tokens = tokenizeLocationQuery('Kasavanahali');
    expect(tokens.some((t) => t.startsWith('kasavana'))).toBe(true);
    expect(tokenizeLocationQuery('Haralur')).toContain('haralu');
  });

  it('keeps a 6-digit pincode and house/flat numbers', () => {
    expect(tokenizeLocationQuery('Haralur 560035')).toEqual(
      expect.arrayContaining(['haralur', '560035'])
    );
    expect(tokenizeLocationQuery('123 Haralur')).toEqual(
      expect.arrayContaining(['123', 'haralur'])
    );
    expect(tokenizeLocationQuery('12/3 Kasavanahalli')).toEqual(
      expect.arrayContaining(['12/3', 'kasavanahalli'])
    );
    expect(tokenizeLocationQuery('Haralur 1.0')).not.toContain('1');
  });

  it('falls back to the typed phrase when only stopwords remain', () => {
    expect(tokenizeLocationQuery('near the road')).toEqual(['near the road']);
  });
});

describe('isHouseNumberToken', () => {
  it('accepts common flat / house forms', () => {
    expect(isHouseNumberToken('123')).toBe(true);
    expect(isHouseNumberToken('12A')).toBe(true);
    expect(isHouseNumberToken('B204')).toBe(true);
    expect(isHouseNumberToken('12/3')).toBe(true);
    expect(isHouseNumberToken('10-2')).toBe(true);
    expect(isHouseNumberToken('1')).toBe(false);
    expect(isHouseNumberToken('560035')).toBe(false);
  });
});

describe('locationQueryMatchesText', () => {
  it('matches Kasavanahalli when the query is a letter short', () => {
    expect(locationQueryMatchesText('kasavanahali', 'Kasavanahalli, Bengaluru')).toBe(true);
  });

  it('matches when extra words like layout/road are in the query', () => {
    expect(locationQueryMatchesText('Haralur main road', 'Haralur')).toBe(true);
  });

  it('matches a flat number in an address line', () => {
    expect(locationQueryMatchesText('123', '123, Kasavanahalli')).toBe(true);
  });
});

describe('filterLocationSuggestions', () => {
  const areas = ['Kasavanahalli', 'Haralur', 'HSR Layout', 'Koramangala'];

  it('still ranks an exact substring first', () => {
    expect(filterLocationSuggestions('hsr', areas)[0]).toBe('HSR Layout');
  });

  it('suggests Kasavanahalli for a slightly wrong spelling', () => {
    expect(filterLocationSuggestions('kasavanahali', areas)).toContain('Kasavanahalli');
  });
});

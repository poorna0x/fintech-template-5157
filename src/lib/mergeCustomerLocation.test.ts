import { describe, expect, it } from 'vitest';
import {
  MERGE_LOCATION_CHOICE_METERS,
  formatMergePinDistance,
  mergeLocationSummary,
  mergePinsDistanceMeters,
  mergePinsNeedChoice,
} from './mergeCustomerLocation';

describe('mergeCustomerLocation', () => {
  const nearbyA = { latitude: 12.9716, longitude: 77.5946 };
  const nearbyB = { latitude: 12.9724, longitude: 77.5948 };
  const far = { latitude: 13.0827, longitude: 80.2707 };

  it('does not ask to choose when a pin is missing or 0,0', () => {
    expect(mergePinsNeedChoice(nearbyA, null)).toBe(false);
    expect(mergePinsNeedChoice(nearbyA, { latitude: 0, longitude: 0 })).toBe(false);
    expect(mergePinsNeedChoice({}, nearbyA)).toBe(false);
  });

  it('does not ask to choose when pins are within 200 m', () => {
    const meters = mergePinsDistanceMeters(nearbyA, nearbyB);
    expect(meters).not.toBeNull();
    expect(meters as number).toBeLessThanOrEqual(MERGE_LOCATION_CHOICE_METERS);
    expect(mergePinsNeedChoice(nearbyA, nearbyB)).toBe(false);
  });

  it('asks to choose when pins are farther than 200 m', () => {
    const meters = mergePinsDistanceMeters(nearbyA, far);
    expect(meters).toBeGreaterThan(MERGE_LOCATION_CHOICE_METERS);
    expect(mergePinsNeedChoice(nearbyA, far)).toBe(true);
  });

  it('formats distance and address labels', () => {
    expect(formatMergePinDistance(180)).toBe('180 m');
    expect(formatMergePinDistance(1500)).toBe('1.5 km');
    expect(mergeLocationSummary({ visible_address: 'Indiranagar' })).toBe('Indiranagar');
    expect(mergeLocationSummary({ address: { street: '1st Main', area: 'Koramangala', city: 'Bengaluru' } })).toBe(
      '1st Main, Koramangala, Bengaluru'
    );
    expect(mergeLocationSummary({ location: nearbyA })).toMatch(/12\.97/);
  });
});

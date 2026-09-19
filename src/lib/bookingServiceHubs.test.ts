import { describe, expect, it } from 'vitest';
import {
  clampHubRadiusKm,
  formatOutOfServiceAreaMessage,
  matchPointToServiceHubs,
  parseBookingServiceHub,
  type BookingServiceHub,
} from './bookingServiceHubs';

function hub(partial: Partial<BookingServiceHub> & Pick<BookingServiceHub, 'id' | 'name' | 'lat' | 'lng'>): BookingServiceHub {
  return {
    address: '',
    radius_km: 5,
    is_active: true,
    sort_order: 0,
    ...partial,
  };
}

const HSR = hub({ id: '1', name: 'HSR Layout', lat: 12.9121, lng: 77.6446, radius_km: 4 });
const BELLANDUR = hub({ id: '2', name: 'Bellandur', lat: 12.9255, lng: 77.6765, radius_km: 5 });
const BTM = hub({ id: '3', name: 'BTM Layout', lat: 12.9166, lng: 77.6101, radius_km: 4, is_active: false });

describe('matchPointToServiceHubs', () => {
  it('allows anywhere when no active hubs exist', () => {
    expect(matchPointToServiceHubs(12.9, 77.6, [])).toEqual({ ok: true, enforced: false });
    expect(matchPointToServiceHubs(12.9, 77.6, [BTM])).toEqual({ ok: true, enforced: false });
  });

  it('matches a pin inside a hub circle', () => {
    const result = matchPointToServiceHubs(12.9122, 77.6447, [HSR, BELLANDUR, BTM]);
    expect(result.ok).toBe(true);
    if (result.ok && result.enforced) {
      expect(result.hub.name).toBe('HSR Layout');
    }
  });

  it('rejects a pin well outside all hubs and lists nearest names', () => {
    // Mysuru-ish, far from Bengaluru east hubs
    const result = matchPointToServiceHubs(12.2958, 76.6394, [HSR, BELLANDUR]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.nearest.length).toBeGreaterThan(0);
      expect(formatOutOfServiceAreaMessage(result)).toMatch(/HSR Layout/);
    }
  });

  it('ignores inactive hubs even if the pin is inside them', () => {
    const tightHsr = hub({ ...HSR, radius_km: 1 });
    const result = matchPointToServiceHubs(12.9166, 77.6101, [BTM, tightHsr]);
    expect(result.ok).toBe(false);
  });
});

describe('clampHubRadiusKm', () => {
  it('keeps radius in the allowed band', () => {
    expect(clampHubRadiusKm(0)).toBe(0.5);
    expect(clampHubRadiusKm(40)).toBe(25);
    expect(clampHubRadiusKm(5.26)).toBe(5.3);
  });
});

describe('parseBookingServiceHub', () => {
  it('drops 0,0 placeholders', () => {
    expect(parseBookingServiceHub({ id: 'x', name: 'X', lat: 0, lng: 0, radius_km: 5 })).toBeNull();
  });
});

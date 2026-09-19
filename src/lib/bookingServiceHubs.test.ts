import { describe, expect, it } from 'vitest';
import {
  clampHubRadiusKm,
  formatOutOfServiceAreaMessage,
  hubContainsPoint,
  hubCustomerNote,
  matchPointToServiceHubs,
  parseBookingServiceHub,
  pointInHubPolygon,
  type BookingServiceHub,
} from './bookingServiceHubs';

function hub(partial: Partial<BookingServiceHub> & Pick<BookingServiceHub, 'id' | 'name' | 'lat' | 'lng'>): BookingServiceHub {
  return {
    address: '',
    radius_km: 5,
    polygon: [],
    service_kind: 'normal',
    is_active: true,
    sort_order: 0,
    customer_note: '',
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
      expect(result.kind).toBe('normal');
    }
  });

  it('rejects a pin well outside all hubs and lists nearest names', () => {
    // Mysuru-ish, far from Bengaluru east hubs
    const result = matchPointToServiceHubs(12.2958, 76.6394, [HSR, BELLANDUR]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('out_of_area');
      expect(result.nearest.length).toBeGreaterThan(0);
      expect(formatOutOfServiceAreaMessage(result)).toMatch(/not be able to come here/i);
      expect(formatOutOfServiceAreaMessage(result)).not.toMatch(/HSR Layout|New hub|usually serve/i);
      expect(formatOutOfServiceAreaMessage(result, 'Sorry, too far from {hubs}.')).toMatch(/HSR Layout/);
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
    expect(clampHubRadiusKm(40)).toBe(40);
    expect(clampHubRadiusKm(250)).toBe(200);
    expect(clampHubRadiusKm(5.26)).toBe(5.3);
  });
});

describe('parseBookingServiceHub', () => {
  it('drops 0,0 placeholders', () => {
    expect(parseBookingServiceHub({ id: 'x', name: 'X', lat: 0, lng: 0, radius_km: 5 })).toBeNull();
  });
});

describe('hub polygons', () => {
  it('lets a custom polygon cut a slice out of the circle', () => {
    const north = { lat: HSR.lat + 0.04, lng: HSR.lng };
    const east = { lat: HSR.lat, lng: HSR.lng + 0.04 };
    const south = { lat: HSR.lat - 0.04, lng: HSR.lng };
    const westCut = { lat: HSR.lat, lng: HSR.lng + 0.002 };
    const shaped = hub({
      ...HSR,
      polygon: [north, east, south, westCut],
    });
    expect(hubContainsPoint(HSR, HSR.lat, HSR.lng - 0.01)).toBe(true);
    expect(hubContainsPoint(shaped, HSR.lat, HSR.lng - 0.01)).toBe(false);
    expect(matchPointToServiceHubs(HSR.lat, HSR.lng + 0.01, [shaped]).ok).toBe(true);
  });

  it('uses ray-casting for a simple square', () => {
    const square = [
      { lat: 12.9, lng: 77.6 },
      { lat: 12.9, lng: 77.7 },
      { lat: 13.0, lng: 77.7 },
      { lat: 13.0, lng: 77.6 },
    ];
    expect(pointInHubPolygon(12.95, 77.65, square)).toBe(true);
    expect(pointInHubPolygon(12.8, 77.65, square)).toBe(false);
    expect(pointInHubPolygon(12.9, 77.6, square)).toBe(true);
  });

  it('still matches a pin just outside a polygon edge (GPS slack)', () => {
    const squareHub = hub({
      ...HSR,
      polygon: [
        { lat: 12.9, lng: 77.6 },
        { lat: 12.9, lng: 77.7 },
        { lat: 13.0, lng: 77.7 },
        { lat: 13.0, lng: 77.6 },
      ],
    });
    expect(hubContainsPoint(squareHub, 12.95, 77.6 - 0.00025)).toBe(true);
    expect(hubContainsPoint(squareHub, 12.95, 77.5)).toBe(false);
  });
});

describe('hub service kinds', () => {
  it('lets a normal hub book even when a larger no-service area overlaps it', () => {
    const karnataka = hub({
      id: 'ka',
      name: 'Karnataka',
      lat: HSR.lat,
      lng: HSR.lng,
      radius_km: 25,
      service_kind: 'no_service',
    });
    const result = matchPointToServiceHubs(HSR.lat, HSR.lng, [karnataka, HSR]);
    expect(result.ok).toBe(true);
    if (result.ok && result.enforced) {
      expect(result.kind).toBe('normal');
      expect(result.hub.id).toBe('1');
    }
  });

  it('still blocks a no-service area when no normal hub covers the pin', () => {
    const karnataka = hub({
      id: 'ka',
      name: 'Karnataka',
      lat: HSR.lat,
      lng: HSR.lng,
      radius_km: 25,
      service_kind: 'no_service',
    });
    const justOutsideCity = matchPointToServiceHubs(HSR.lat + 0.09, HSR.lng, [karnataka, HSR]);
    expect(justOutsideCity.ok).toBe(false);
    if (!justOutsideCity.ok) expect(justOutsideCity.reason).toBe('no_service');
  });

  it('does not let a callback hub override a no-service area', () => {
    const karnataka = hub({
      id: 'ka',
      name: 'Karnataka',
      lat: HSR.lat,
      lng: HSR.lng,
      radius_km: 25,
      service_kind: 'no_service',
    });
    const delayed = hub({
      ...HSR,
      id: 'slow',
      service_kind: 'callback',
    });
    const result = matchPointToServiceHubs(HSR.lat, HSR.lng, [karnataka, delayed]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_service');
  });

  it('allows callback areas with a call-back notice', () => {
    const delayed = hub({
      ...BELLANDUR,
      service_kind: 'callback',
    });
    const result = matchPointToServiceHubs(BELLANDUR.lat, BELLANDUR.lng, [delayed]);
    expect(result.ok).toBe(true);
    if (result.ok && result.enforced) {
      expect(result.kind).toBe('callback');
      expect(hubCustomerNote(result)).toMatch(/call you back/i);
    }
  });

  it('prefers normal coverage over an overlapping callback hub', () => {
    const delayed = hub({
      ...HSR,
      id: 'slow',
      service_kind: 'callback',
    });
    const result = matchPointToServiceHubs(HSR.lat, HSR.lng, [delayed, HSR]);
    expect(result.ok).toBe(true);
    if (result.ok && result.enforced) {
      expect(result.kind).toBe('normal');
      expect(result.hub.id).toBe('1');
    }
  });

  it('fails open when only no-service hubs exist and the pin is outside them', () => {
    const hole = hub({
      id: 'hole',
      name: 'Restricted',
      lat: HSR.lat,
      lng: HSR.lng,
      radius_km: 0.5,
      service_kind: 'no_service',
    });
    expect(matchPointToServiceHubs(12.2958, 76.6394, [hole])).toEqual({
      ok: true,
      enforced: false,
    });
  });
});

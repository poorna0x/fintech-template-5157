/**
 * Reverse-geocode WhatsApp pins → short area for CRM visible_address / admin.
 * Prefer Google (server key) → Nominatim → BigDataCloud.
 */
const VISIBLE_ADDRESS_MAX_LEN = 40;

const GENERIC = new Set(
  [
    'bengaluru',
    'bangalore',
    'karnataka',
    'india',
    'in',
    'ka',
    'urban',
    'rural',
    'district',
    'taluk',
    'hobli',
    'bengaluru urban',
    'bangalore urban',
    'bengaluru rural',
    'bangalore rural',
    'bengaluru urban district',
    'bangalore urban district',
    'bangalore north',
    'bangalore south',
    'bengaluru north',
    'bengaluru south',
    'bengaluru central city corporation',
    'bengaluru city corporation',
  ].map((s) => s.toLowerCase())
);

const SHORT_TYPES = [
  'neighborhood',
  'sublocality_level_1',
  'sublocality',
  'sublocality_level_2',
  'administrative_area_level_3',
  'administrative_area_level_2',
  'locality',
  'premise',
];

function clip(value) {
  return String(value || '')
    .trim()
    .substring(0, VISIBLE_ADDRESS_MAX_LEN);
}

function isGeneric(name) {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  if (!n || n.length < 3) return true;
  if (GENERIC.has(n)) return true;
  if (/^\d{6}$/.test(n)) return true;
  if (/\b(bengaluru|bangalore)\b/.test(n) && /\b(urban|rural|district|division|metropolitan|corporation|taluk|north|south)\b/.test(n)) {
    return true;
  }
  if (/\btaluk\b/.test(n)) return true;
  return false;
}

function cleanLabel(raw) {
  const cleaned = String(raw || '')
    .trim()
    .replace(/\s+(Taluk|District|Hobli)$/i, '')
    .trim();
  if (!cleaned || isGeneric(cleaned)) return null;
  return clip(cleaned);
}

function labelOf(comp) {
  return String(comp?.long_name || comp?.short_name || '').trim();
}

function shortFromComponents(components) {
  if (!Array.isArray(components) || !components.length) return null;
  for (const type of SHORT_TYPES) {
    const comp = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    const got = cleanLabel(labelOf(comp || {}));
    if (got) return got;
  }
  return null;
}

function shortFromPlusCode(formatted) {
  if (!formatted?.trim()) return null;
  const m = formatted.trim().match(/^[A-Z0-9]{2,}\+[A-Z0-9]{2,}\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1]
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const got = cleanLabel(part);
    if (got) return got;
  }
  return null;
}

function pickShortFromCandidates(candidates) {
  for (const c of candidates) {
    const got = cleanLabel(c);
    if (got) return got;
  }
  return null;
}

function getGoogleMapsKey() {
  const k = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
  return String(k).trim() || null;
}

async function reverseGeocodeGoogle(lat, lng) {
  const apiKey = getGoogleMapsKey();
  if (!apiKey) return null;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', 'en');
  url.searchParams.set('region', 'in');
  url.searchParams.set('key', apiKey);
  const res = await fetch(url.toString(), {
    headers: {
      Referer: 'https://hydrogenro.com/',
      'User-Agent': 'HydrogenRO-CRM/1.0',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) {
    if (data.status && data.status !== 'ZERO_RESULTS') {
      console.warn('[whatsapp-location] Google geocode', data.status, data.error_message || '');
    }
    return null;
  }
  const top = data.results[0];
  const formattedAddress = String(top.formatted_address || '').trim() || null;
  const shortLocation =
    shortFromComponents(top.address_components) ||
    shortFromPlusCode(formattedAddress || '');
  return { formattedAddress, shortLocation };
}

/** OpenStreetMap Nominatim — good suburb names when Google key is browser-restricted. */
async function reverseGeocodeNominatim(lat, lng) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '18');
  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'HydrogenRO-CRM-WhatsAppBot/1.0 (local; service booking)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  const a = data.address || {};
  const shortLocation = pickShortFromCandidates([
    a.suburb,
    a.neighbourhood,
    a.neighborhood,
    a.quarter,
    a.city_district,
    a.village,
    a.town,
    a.hamlet,
    a.residential,
    a.city,
  ]);
  const formattedAddress = String(data.display_name || '').trim() || null;
  return {
    formattedAddress,
    shortLocation,
  };
}

async function reverseGeocodeBigDataCloud(lat, lng) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const adminNames = Array.isArray(data.localityInfo?.administrative)
    ? data.localityInfo.administrative.map((x) => x?.name).filter(Boolean)
    : [];
  const shortLocation = pickShortFromCandidates([
    data.locality,
    ...adminNames,
    data.city,
    data.principalSubdivision,
  ]);
  const formattedAddress = [data.locality, data.city, data.principalSubdivision, data.countryName]
    .filter(Boolean)
    .join(', ');
  return {
    formattedAddress: formattedAddress || null,
    shortLocation,
  };
}

/**
 * Enrich a WhatsApp location pin with formatted address + short area (admin visible_address).
 * @param {{ latitude?: number, longitude?: number, lat?: number, lng?: number, name?: string|null, address?: string|null }} loc
 */
async function enrichWhatsAppLocation(loc) {
  const lat = Number(loc?.latitude ?? loc?.lat);
  const lng = Number(loc?.longitude ?? loc?.lng);
  const name = loc?.name != null ? String(loc.name).trim() || null : null;
  const address = loc?.address != null ? String(loc.address).trim() || null : null;

  const base = {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    name,
    address,
    shortLocation: null,
    formattedAddress: address || name || null,
  };

  if (base.lat == null || base.lng == null) return base;

  try {
    const sources = [reverseGeocodeGoogle, reverseGeocodeNominatim, reverseGeocodeBigDataCloud];
    let geo = null;
    for (const fn of sources) {
      try {
        const result = await fn(base.lat, base.lng);
        if (!result) continue;
        if (!geo) geo = result;
        if (result.shortLocation) {
          geo = {
            formattedAddress: result.formattedAddress || geo.formattedAddress,
            shortLocation: result.shortLocation,
          };
          break;
        }
        if (result.formattedAddress && !geo.formattedAddress) {
          geo.formattedAddress = result.formattedAddress;
        }
      } catch (err) {
        console.warn('[whatsapp-location] reverse failed', fn.name, err?.message || err);
      }
    }

    if (geo) {
      base.formattedAddress = geo.formattedAddress || base.formattedAddress;
      base.shortLocation = geo.shortLocation || null;
      if (!base.address && geo.formattedAddress) base.address = geo.formattedAddress;
      if (!base.name && geo.shortLocation) base.name = geo.shortLocation;
    }
  } catch (err) {
    console.warn('[whatsapp-location] enrich failed', err?.message || err);
  }

  // WhatsApp place name as last-resort short area
  if (!base.shortLocation && name) {
    const fromName = cleanLabel(name);
    if (fromName) base.shortLocation = fromName;
  }

  return base;
}

module.exports = {
  VISIBLE_ADDRESS_MAX_LEN,
  enrichWhatsAppLocation,
  reverseGeocodeGoogle,
  clipVisibleAddress: clip,
};

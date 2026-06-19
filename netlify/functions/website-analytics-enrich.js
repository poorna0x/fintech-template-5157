// Server-side enrichment for website analytics (geo, device, browser, referrer).
const OWN_HOSTS = ['hydrogenro.com', 'elevenro.com', 'localhost', '127.0.0.1'];

function header(headers, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return '';
}

function parseNetlifyGeo(headers) {
  const raw = header(headers, 'x-nf-geo');
  if (raw) {
    try {
      const geo = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const city = geo.city ? String(geo.city).trim() : '';
      const countryCode = geo.country?.code ? String(geo.country.code).trim() : '';
      const countryName = geo.country?.name ? String(geo.country.name).trim() : '';
      return {
        city: city || undefined,
        country: countryCode || countryName || undefined,
      };
    } catch {
      /* fall through */
    }
  }

  const country = header(headers, 'x-country');
  const city = header(headers, 'x-city');
  return {
    city: city ? String(city).trim() : undefined,
    country: country ? String(country).trim() : undefined,
  };
}

function parseUserAgent(ua) {
  const s = String(ua || '');
  let device = 'desktop';
  if (/ipad|tablet|kindle|silk|playbook/i.test(s)) device = 'tablet';
  else if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini|webos/i.test(s)) device = 'mobile';

  let browser = 'other';
  if (/edg\//i.test(s)) browser = 'edge';
  else if (/samsungbrowser/i.test(s)) browser = 'samsung';
  else if (/firefox\//i.test(s)) browser = 'firefox';
  else if (/chrome\//i.test(s) && !/edg\//i.test(s)) browser = 'chrome';
  else if (/safari\//i.test(s) && !/chrome\//i.test(s)) browser = 'safari';
  else if (/opr\//i.test(s) || /opera/i.test(s)) browser = 'opera';

  return { device, browser };
}

function hostFromUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isOwnHost(host) {
  if (!host) return false;
  return OWN_HOSTS.some((own) => host === own || host.endsWith(`.${own}`));
}

function classifyReferrer(referrerUrl) {
  const host = hostFromUrl(referrerUrl);
  if (!host) return { referrer: 'direct' };
  if (isOwnHost(host)) return { referrer: 'internal' };

  if (/google\./i.test(host)) return { referrer: 'google' };
  if (/bing\.|yahoo\.|duckduckgo\.|baidu\./i.test(host)) return { referrer: 'search' };
  if (/facebook\.|instagram\.|fb\.|twitter\.|x\.com|t\.co|linkedin\.|youtube\.|whatsapp\./i.test(host)) {
    return { referrer: 'social', referrer_host: host.slice(0, 64) };
  }

  return { referrer: 'other', referrer_host: host.slice(0, 64) };
}

function enrichEventMetadata(clientMeta, headers) {
  const meta = clientMeta && typeof clientMeta === 'object' && !Array.isArray(clientMeta) ? { ...clientMeta } : {};
  const referrerUrl = meta.referrer_url;
  delete meta.referrer_url;

  const ua = header(headers, 'user-agent');
  const { device, browser } = parseUserAgent(ua);
  const geo = parseNetlifyGeo(headers);
  const classified = classifyReferrer(referrerUrl);

  meta.device = device;
  meta.browser = browser;
  if (geo.city) meta.geo_city = geo.city;
  if (geo.country) meta.geo_country = geo.country;
  meta.referrer = classified.referrer;
  if (classified.referrer_host) meta.referrer_host = classified.referrer_host;

  return meta;
}

module.exports = { enrichEventMetadata };

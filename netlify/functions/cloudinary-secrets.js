/**
 * Cloudinary admin credentials.
 * Production (preferred — stay under Netlify 4KB env): app_secrets.cloudinary JSON.
 * Local env fallback: CLOUDINARY_* / CLOUDINARY_SECONDARY_*.
 */
const { createClient } = require('@supabase/supabase-js');

const APP_SECRET_KEY = 'cloudinary';
const CACHE_TTL_MS = 60_000;

const trim = (s) => (s && typeof s === 'string' ? s.trim() : '');

let cachedBundle = null;
let cachedAt = 0;

function getServiceSupabase() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function emptyBundle() {
  return {
    cloudName: '',
    apiKey: '',
    apiSecret: '',
    uploadPreset: '',
    secondaryCloudName: '',
    secondaryApiKey: '',
    secondaryApiSecret: '',
    secondaryUploadPreset: '',
  };
}

function bundleFromEnv() {
  return {
    cloudName: trim(process.env.CLOUDINARY_CLOUD_NAME),
    apiKey: trim(process.env.CLOUDINARY_API_KEY),
    apiSecret: trim(process.env.CLOUDINARY_API_SECRET),
    uploadPreset: trim(process.env.CLOUDINARY_UPLOAD_PRESET),
    secondaryCloudName: trim(process.env.CLOUDINARY_SECONDARY_CLOUD_NAME),
    secondaryApiKey: trim(process.env.CLOUDINARY_SECONDARY_API_KEY),
    secondaryApiSecret: trim(process.env.CLOUDINARY_SECONDARY_API_SECRET),
    secondaryUploadPreset: trim(process.env.CLOUDINARY_SECONDARY_UPLOAD_PRESET),
  };
}

function bundleFromSecretObject(raw) {
  if (!raw || typeof raw !== 'object') return emptyBundle();
  const secondary = raw.secondary && typeof raw.secondary === 'object' ? raw.secondary : {};
  return {
    cloudName: trim(raw.cloudName || raw.cloud_name),
    apiKey: trim(raw.apiKey || raw.api_key),
    apiSecret: trim(raw.apiSecret || raw.api_secret),
    uploadPreset: trim(raw.uploadPreset || raw.upload_preset),
    secondaryCloudName: trim(
      raw.secondaryCloudName || raw.secondary_cloud_name || secondary.cloudName || secondary.cloud_name
    ),
    secondaryApiKey: trim(
      raw.secondaryApiKey || raw.secondary_api_key || secondary.apiKey || secondary.api_key
    ),
    secondaryApiSecret: trim(
      raw.secondaryApiSecret || raw.secondary_api_secret || secondary.apiSecret || secondary.api_secret
    ),
    secondaryUploadPreset: trim(
      raw.secondaryUploadPreset ||
        raw.secondary_upload_preset ||
        secondary.uploadPreset ||
        secondary.upload_preset
    ),
  };
}

function mergeBundles(preferred, fallback) {
  const out = emptyBundle();
  for (const key of Object.keys(out)) {
    out[key] = preferred[key] || fallback[key] || '';
  }
  return out;
}

function accountsFromBundle(bundle) {
  const accounts = [];
  if (bundle.cloudName && bundle.apiKey && bundle.apiSecret) {
    accounts.push({
      id: 'primary',
      label: 'Primary',
      cloudName: bundle.cloudName,
      apiKey: bundle.apiKey,
      apiSecret: bundle.apiSecret,
    });
  }
  if (bundle.secondaryCloudName && bundle.secondaryApiKey && bundle.secondaryApiSecret) {
    accounts.push({
      id: 'secondary',
      label: 'Secondary',
      cloudName: bundle.secondaryCloudName,
      apiKey: bundle.secondaryApiKey,
      apiSecret: bundle.secondaryApiSecret,
    });
  }
  return accounts;
}

function configFromBundle(bundle, useSecondary) {
  if (useSecondary) {
    return bundle.secondaryCloudName && bundle.secondaryApiKey && bundle.secondaryApiSecret
      ? {
          cloudName: bundle.secondaryCloudName,
          apiKey: bundle.secondaryApiKey,
          apiSecret: bundle.secondaryApiSecret,
        }
      : null;
  }
  return bundle.cloudName && bundle.apiKey && bundle.apiSecret
    ? { cloudName: bundle.cloudName, apiKey: bundle.apiKey, apiSecret: bundle.apiSecret }
    : null;
}

async function readSecretBundle() {
  const db = getServiceSupabase();
  if (!db) return emptyBundle();
  const { data, error } = await db.from('app_secrets').select('value').eq('key', APP_SECRET_KEY).maybeSingle();
  if (error || !data?.value) return emptyBundle();
  try {
    return bundleFromSecretObject(JSON.parse(String(data.value).trim()));
  } catch {
    return emptyBundle();
  }
}

async function resolveCloudinaryBundle() {
  const now = Date.now();
  if (cachedBundle && now - cachedAt < CACHE_TTL_MS) return cachedBundle;
  const merged = mergeBundles(await readSecretBundle(), bundleFromEnv());
  cachedBundle = merged;
  cachedAt = now;
  return merged;
}

function getCloudinaryAdminAccountsFromEnv() {
  return accountsFromBundle(bundleFromEnv());
}

async function resolveCloudinaryAdminAccounts() {
  return accountsFromBundle(await resolveCloudinaryBundle());
}

async function resolveCloudinaryConfig(useSecondary) {
  return configFromBundle(await resolveCloudinaryBundle(), !!useSecondary);
}

function clearCloudinarySecretsCache() {
  cachedBundle = null;
  cachedAt = 0;
}

module.exports = {
  APP_SECRET_KEY,
  getCloudinaryAdminAccountsFromEnv,
  resolveCloudinaryAdminAccounts,
  resolveCloudinaryConfig,
  clearCloudinarySecretsCache,
};

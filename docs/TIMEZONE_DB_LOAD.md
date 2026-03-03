# Timezone list and DB load (pg_timezone_names)

## If you see `SELECT name FROM pg_timezone_names` in DB stats

- **Role:** Usually `authenticator` (Supabase PostgREST).
- **Source:** Not from this app. The app **never** queries `pg_timezone_names`.
- **Likely cause:** Supabase Dashboard (Table Editor / SQL Editor) or PostgREST validating the `Prefer: timezone` header / schema introspection. Each call scans system catalogs and can have 0% cache hit rate.

## What this project does

- **No DB call for timezone list.** Any timezone dropdown or list must use the static list in `src/lib/timezones.ts`:
  - `getTimezoneOptions()` – for dropdowns
  - `getTimezoneNames()` – raw names
- **Do not** add an RPC or `supabase.from(...)` that selects from `pg_timezone_names`.
- **Do not** call it in `useEffect` or on every request.

## Why DB load reduces

- Avoiding any app-side query to `pg_timezone_names` removes that cost from your application. If the query still appears in stats, it is from Supabase/Dashboard usage; reducing Dashboard usage or asking Supabase support can help further.

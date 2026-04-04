# Reverted work and context (reference)

This file records what was **removed from the repo** when `main` was reset to **`146d61f`** (`revert: restore 6h AMC throttle in all environments`) and **force-pushed**, so you can restore behavior or re-implement later without losing the design notes from those sessions.

---

## 1. Git: what was undone

| Item | Detail |
|------|--------|
| **Removed commit** | `2708b68` — *feat(storage): primary photo provider (Cloudinary vs Supabase)* |
| **Parent (current `main` tip)** | `146d61f` |
| **Remote** | `origin/main` was force-updated to match; anyone else should `git fetch && git reset --hard origin/main` if they still had `2708b68` |

### Files touched by the reverted commit (10 files)

- `.env.example` — `VITE_SUPABASE_STORAGE_BUCKET` and Supabase Storage notes  
- `src/lib/primaryImageStorage.ts` — **deleted** (entire module)  
- `src/lib/supabaseStorageUpload.ts` — **deleted** (entire module)  
- `src/pages/Settings.tsx` — Photo storage card (Cloudinary vs Supabase), confirm dialog, `localStorage` key  
- `src/components/AdminDashboard.tsx` — `uploadPrimaryImage`, `deleteStoredImageByUrl` for photo add/remove  
- `src/components/ImageUpload.tsx` — primary path via `uploadPrimaryImage` when not `useSecondaryAccount`  
- `src/components/admin/NewJobDialog.tsx`  
- `src/components/admin/EditCompletedJobDialog.tsx`  
- `src/lib/retryPhotoUpload.ts` — primary vs secondary upload split  
- `src/pages/Booking.tsx` — public booking forced Cloudinary via `uploadPrimaryImage(..., 'public_booking')`  

### How to inspect or re-apply the old commit

```bash
git show 2708b68 --stat
git show 2708b68
# Optional: cherry-pick onto current main (resolve conflicts if any)
git cherry-pick 2708b68
```

---

## 2. Behavior that commit implemented (summary)

- **Settings (admin):** “Save new photos to” → Cloudinary or Supabase; stored in **`localStorage`** key `admin_primary_storage_provider`; confirmation dialog on change.  
- **Primary uploads:** `uploadPrimaryImage(file, folder)` — if Supabase selected and user is not on `public_booking`, upload to Storage bucket (default **`uploads`**, overridable by `VITE_SUPABASE_STORAGE_BUCKET`); object path `{folder}/{uuid}-{sanitizedName}`.  
- **Always Cloudinary:** `public_booking` context; **`useSecondaryAccount`** bill/payment flows (secondary Cloudinary); unchanged.  
- **Deletes:** `deleteStoredImageByUrl(url)` — Cloudinary via Netlify `cloudinary-delete` + `extractPublicId`; Supabase via public URL parse `/storage/v1/object/public/{bucket}/...` + `remove`.  
- **Not in that commit:** `app_settings` DB sync (see §4) — was only drafted in a follow-up, never merged before the reset.

---

## 3. Product / support context (from the same discussions)

### Customer photos vs Storage

- The **customer photo gallery** builds URLs from **Postgres** (`jobs.before_photos`, `after_photos`, `images`, and `requirements` → `bill_photos`, `payment_photos`, `qr_photos.payment_screenshot`).  
- Deleting a file **only in Supabase (or Cloudinary)** does **not** remove the URL from the DB — thumbnails may break until the URL is edited/removed in-app.

### Technician “Complete job” — folders (primary path when not secondary)

| UI | Cloudinary folder / Supabase prefix | Notes |
|----|-------------------------------------|--------|
| Optional photos (job had none) | `job-photos` | Merged into `job.images` |
| Bill photo | `bills` | Also `requirements.bill_photos`, `after_photos` |
| Payment screenshot | `payment-receipts` | **`useSecondaryAccount: true` → always secondary Cloudinary**, not Supabase primary |
| Extra step-6 photos | `ro-service` | `after_photos` + `job.images` |

### Why bills could “still be Cloudinary” with Supabase selected

- **Payment screenshot** is intentionally **secondary Cloudinary**.  
- **Bill photos** use the **primary** pipeline *only on that browser*: the old feature stored the choice in **`localStorage`**, so **technicians’ phones** never saw the admin’s Settings unless they opened Settings there — a known gap. The drafted fix was **§4**.

### Supabase storage test page

- A dedicated **`/settings/storage-test`** page and **`SupabaseStorageTestPage.tsx`** were removed in the same era as the feature; they were not necessarily in `2708b68` (may never have been on `main`). If reviving tests, use env + bucket docs instead.

---

## 4. Draft fix never shipped: sync primary storage for technicians

**Problem:** `getPrimaryStorageProvider()` read only `localStorage`, so technicians defaulted to Cloudinary on their devices.

**Intended approach (abandoned when repo was reset):**

1. Add table **`public.app_settings`** (`key` PK, `value`, `updated_at`) with permissive RLS (match other tables).  
2. Row key e.g. `primary_photo_storage` → `cloudinary` | `supabase`.  
3. **`syncPrimaryStorageFromDatabase()`** after login — overwrite `localStorage` from DB.  
4. **`seedPrimaryStorageToDatabaseIfMissing()`** for **non-technician** only — if no row, upsert current `localStorage` so first admin login seeds org.  
5. **`persistPrimaryStorageToDatabase()`** when admin confirms Settings.  
6. Hook from **`AuthContext`** `useEffect` on `user?.id` / `user?.role`.  
7. Extend **`Database`** types in `src/types/index.ts` for `app_settings`.

None of that exists on current `main` after the reset.

---

## 5. Optional: restore only the feature commit

If you want the storage feature back without retyping:

1. `git cherry-pick 2708b68`  
2. Re-run **`npm run build`** / **`tsc`**  
3. Add **`app_settings`** SQL on Supabase if you implement §4  
4. Re-test technician bill upload on a device that never opened Settings

---

*Generated as a personal reference after resetting to `146d61f` and force-pushing. Update this file if you cherry-pick or re-implement differently.*

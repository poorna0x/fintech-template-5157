# AMC view: 30 on mobile vs 0 on desktop/incognito – investigation

## What caused this

1. **Supabase Row Level Security (RLS)**  
   The `amc_contracts` table only returns rows when the request is **authenticated**. Unauthenticated or missing session → 0 rows.

2. **Session is per browser/device**  
   The app stores the auth session in **localStorage** (via the Chrome-compatible storage adapter). That storage is **not shared** across:
   - Different devices (e.g. phone vs laptop)
   - Different browsers (e.g. Chrome vs Safari)
   - Normal window vs **incognito** (incognito has its own empty storage and clears when closed)

3. **Result**  
   On the device where you logged in (e.g. mobile), the session exists → Supabase gets an auth token → RLS allows read → you see 30 AMCs.  
   On desktop or in incognito, there is no session (or a different one) → no auth token sent → RLS returns 0 rows → you see 0 AMCs.

So the behaviour is **by design**: same code everywhere, different session per context.

## How to fix it

### 1. What you do (user fix)

- **On each device/browser where you want to see AMC contracts:** open the admin app and **sign in with the same admin account** you use on the device that shows 30.
- **Incognito:** you have to sign in again in that window; when you close incognito, the session is gone.

### 2. What we did in code (already done)

- **AMC View:** Only show "Sign in to view AMC contracts" when the app has no user. When you're signed in, we always show the list (or empty + Retry).
- **Empty list:** When signed in but 0 records, we show a **Retry** button and a hint to use the same account on this device.
- **Optional safeguard:** Before loading AMC list, we ensure the Supabase client has restored the session from storage so the first request is sent with auth (avoids rare "request-before-session-ready" races).

### 3. Why it can't be "fixed" in code to show 30 everywhere

We cannot share one login across devices from the front end alone. Each browser/device has its own storage; we don't have cookies or a backend that keeps you logged in on every device. So the only way to see AMC data on another device is to **sign in on that device**.

---

## Git history (for reference)

- **`amcContracts.getAll()`** was not changed in any recent commit.
- **Commit `0fb2dff`** only changed `createAMCServiceJobs()` and `reminders.getAll()`, not the AMC list API.
- So the 30 vs 0 difference is **not** due to a recent code change; it's session/auth as above.

# Realtime Troubleshooting Guide

## Current Status
✅ Database configuration is CORRECT:
- Realtime publication exists
- Jobs table is in realtime publication  
- Anon RLS policy exists

❌ WebSocket connection is FAILING:
- This is a service-level issue, not database configuration

## Steps to Enable Realtime Service

### 1. Check Supabase Dashboard

Go to your Supabase Dashboard and check:

**Option A: Settings → API**
- Look for "Realtime" section
- Check if there's a toggle to enable Realtime
- Some projects have Realtime disabled by default

**Option B: Database → Replication**  
- Check if Realtime service is enabled
- Look for any service status indicators

**Option C: Project Settings**
- Go to Project Settings → General
- Check for Realtime service status
- Some projects need Realtime explicitly enabled

### 2. Check Your Supabase Plan

- **Free Tier**: Realtime is usually enabled but may have limitations
- **Pro Tier**: Realtime should be fully enabled
- **Enterprise**: Realtime is fully enabled

If you're on Free tier, check if you've hit any Realtime limits.

### 3. Verify Realtime Service Status

Run this SQL to check if the service is actually running:

```sql
-- Check if realtime publication is active
SELECT 
  pubname,
  puballtables,
  pubinsert,
  pubupdate,
  pubdelete
FROM pg_publication 
WHERE pubname = 'supabase_realtime';

-- Check replication slots (realtime uses these)
SELECT 
  slot_name,
  slot_type,
  active,
  database
FROM pg_replication_slots 
WHERE slot_name LIKE '%realtime%' OR slot_name LIKE '%supabase%';
```

### 4. Check Network/Firewall

The WebSocket connection might be blocked:

1. **Browser Console**: Check for WebSocket connection errors
2. **Network Tab**: Look for failed WebSocket connections
3. **Firewall**: Check if your network/firewall blocks WebSocket (ws:// or wss://)
4. **Browser Extensions**: Some extensions block WebSocket connections

### 5. Test WebSocket Connection Directly

Open browser console and run:

```javascript
// Test WebSocket connection to Supabase
const ws = new WebSocket('wss://cgpjfmbyxjetmzehkumo.supabase.co/realtime/v1/websocket');
ws.onopen = () => console.log('✅ WebSocket connected!');
ws.onerror = (e) => console.error('❌ WebSocket error:', e);
ws.onclose = (e) => console.log('⚠️ WebSocket closed:', e);
```

### 6. Contact Supabase Support

If all database checks pass but WebSocket still fails:
1. Go to Supabase Dashboard → Support
2. Report that:
   - Database configuration is correct (publication, RLS policy)
   - WebSocket connection fails with `conn.onerror`
   - Provide your project reference ID

### 7. Alternative: Use Supabase REST API with Polling

The current implementation already has polling fallback, but if you need "near-realtime":
- Reduce polling interval to 2-3 seconds (instead of 10)
- This gives near-instant updates without WebSocket

## Quick Fix: Enable Realtime in Dashboard

1. Go to Supabase Dashboard
2. Navigate to **Settings** → **API** (or **Database** → **Replication**)
3. Look for **Realtime** toggle/switch
4. Enable it if it's disabled
5. Wait a few minutes for service to start
6. Refresh your app

## Verify It's Working

After enabling, check browser console:
- Should see: `✅ Realtime subscription status: SUBSCRIBED`
- Should see: `🎉 Successfully subscribed to realtime updates for jobs`
- Should NOT see: `CHANNEL_ERROR`


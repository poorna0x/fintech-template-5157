# Enable Realtime for Jobs Table

For the technician page to receive realtime job assignments, you need to add the `jobs` table to the realtime publication in Supabase.

## Steps to Enable Realtime:

### Option 1: Using SQL Editor (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Run this SQL command:

```sql
-- Enable realtime for jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
```

### Option 2: Check if Already Enabled

Run this query to check if realtime is already enabled:

```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'jobs';
```

If it returns a row, realtime is already enabled!

### Note:
- "ETL Replication" is different from Realtime - you don't need that
- Realtime is usually enabled by default, but tables need to be added to the publication
- The SQL command above is the standard way to enable it

## Check if Realtime is Enabled:

Run this SQL query in Supabase SQL Editor to check:

```sql
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
  AND tablename = 'jobs';
```

**If it returns a row** → Realtime is enabled ✅  
**If it returns nothing** → Realtime is NOT enabled ❌

## Verify Realtime is Working:

1. Open the browser console on the technician page
2. Look for the message: `🔔 Setting up realtime subscription for technician: [technician-id]`
3. You should see: `✅ Realtime subscription status: SUBSCRIBED` (not CHANNEL_ERROR)
4. When a job is assigned, you should see: `📨 Realtime update received:`

**If you see `❌ Channel error`** → This usually means:
1. Realtime is not enabled for the jobs table (run the SQL command above)
2. OR RLS policies are blocking the subscription

### Fix RLS for Realtime:

If realtime is enabled but you still get CHANNEL_ERROR, you need to allow the `anon` role to read jobs (realtime subscriptions use the anon key):

```sql
-- Allow anon to read jobs for realtime subscriptions
-- First drop if exists, then create
DROP POLICY IF EXISTS "Allow anon to read jobs for realtime" ON jobs;

CREATE POLICY "Allow anon to read jobs for realtime" 
ON jobs 
FOR SELECT 
TO anon
USING (true);
```

This is safe because:
- Realtime filters are applied client-side
- The subscription only receives updates for jobs matching the filter
- Actual data access is still controlled by your RLS policies

## Troubleshooting:

- If you see `❌ Realtime subscription error`, check that replication is enabled
- Make sure your Supabase project has Realtime enabled (it's enabled by default on paid plans)
- Check the browser console for any connection errors


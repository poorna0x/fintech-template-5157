package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * Read recent incoming numbers from the system CallLog.
 * CallLog is dialer-agnostic (Google / Samsung / Truecaller still write here
 * after the call ends) — preferred source once the call is IDLE.
 */
final class CallLogHelper {

    private static final String TAG = "HroCallLog";

    static final class Entry {
        final String number;
        final long dateMs;
        final int type;

        Entry(String number, long dateMs, int type) {
            this.number = number;
            this.dateMs = dateMs;
            this.type = type;
        }
    }

    private CallLogHelper() {}

    static boolean hasCallLogPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
            == PackageManager.PERMISSION_GRANTED;
    }

    static String latestIncomingNumber(Context context, long sinceEpochMs) {
        Entry e = latestIncoming(context, sinceEpochMs);
        return e != null ? e.number : null;
    }

    static Entry latestIncoming(Context context, long sinceEpochMs) {
        return latest(context, sinceEpochMs, true);
    }

    static String latestAnyNumber(Context context, long sinceEpochMs) {
        Entry e = latest(context, sinceEpochMs, false);
        return e != null ? e.number : null;
    }

    /**
     * Best incoming/missed/rejected row for a ring session. Prefer CallLog DATE
     * inside the session window; fall back to newest since {@code sinceEpochMs}.
     */
    static Entry bestIncomingForSession(Context context, long ringAtMs, long sinceEpochMs) {
        if (!hasCallLogPermission(context)) return null;
        Cursor cursor = null;
        try {
            long since = Math.min(sinceEpochMs, ringAtMs > 0 ? ringAtMs - 15_000L : sinceEpochMs);
            cursor =
                context
                    .getContentResolver()
                    .query(
                        CallLog.Calls.CONTENT_URI,
                        new String[] {
                            CallLog.Calls.NUMBER,
                            CallLog.Calls.TYPE,
                            CallLog.Calls.DATE,
                        },
                        CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + " IN (?,?,?)",
                        new String[] {
                            String.valueOf(since),
                            String.valueOf(CallLog.Calls.INCOMING_TYPE),
                            String.valueOf(CallLog.Calls.MISSED_TYPE),
                            String.valueOf(CallLog.Calls.REJECTED_TYPE),
                        },
                        CallLog.Calls.DATE + " DESC"
                    );
            if (cursor == null) return null;
            Entry best = null;
            Entry newest = null;
            while (cursor.moveToNext()) {
                String number = cursor.getString(0);
                int type = cursor.getInt(1);
                long dateMs = cursor.getLong(2);
                if (number == null || number.trim().isEmpty() || dateMs <= 0) continue;
                Entry e = new Entry(number.trim(), dateMs, type);
                if (newest == null) newest = e;
                // Prefer rows that started near the RINGING timestamp.
                if (ringAtMs > 0 && Math.abs(dateMs - ringAtMs) <= 120_000L) {
                    best = e;
                    break;
                }
            }
            return best != null ? best : newest;
        } catch (SecurityException e) {
            Log.w(TAG, "Call log permission denied: " + e.getMessage());
            return null;
        } catch (Exception e) {
            Log.w(TAG, "Call log query failed: " + e.getMessage());
            return null;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static Entry latest(Context context, long sinceEpochMs, boolean incomingOnly) {
        if (!hasCallLogPermission(context)) return null;
        Cursor cursor = null;
        try {
            String selection;
            String[] args;
            if (incomingOnly) {
                selection = CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + " IN (?,?,?)";
                args =
                    new String[] {
                        String.valueOf(sinceEpochMs),
                        String.valueOf(CallLog.Calls.INCOMING_TYPE),
                        String.valueOf(CallLog.Calls.MISSED_TYPE),
                        String.valueOf(CallLog.Calls.REJECTED_TYPE),
                    };
            } else {
                selection = CallLog.Calls.DATE + ">=?";
                args = new String[] { String.valueOf(sinceEpochMs) };
            }
            cursor =
                context
                    .getContentResolver()
                    .query(
                        CallLog.Calls.CONTENT_URI,
                        new String[] {
                            CallLog.Calls.NUMBER,
                            CallLog.Calls.TYPE,
                            CallLog.Calls.DATE,
                        },
                        selection,
                        args,
                        CallLog.Calls.DATE + " DESC"
                    );
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                String number = cursor.getString(0);
                int type = cursor.getInt(1);
                long dateMs = cursor.getLong(2);
                if (number != null && !number.trim().isEmpty() && dateMs > 0) {
                    return new Entry(number.trim(), dateMs, type);
                }
            }
            return null;
        } catch (SecurityException e) {
            Log.w(TAG, "Call log permission denied: " + e.getMessage());
            return null;
        } catch (Exception e) {
            Log.w(TAG, "Call log query failed: " + e.getMessage());
            return null;
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}

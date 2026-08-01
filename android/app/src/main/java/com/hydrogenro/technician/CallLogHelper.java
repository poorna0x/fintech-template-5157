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
 *
 * Truecaller often:
 *  - strips EXTRA_INCOMING_NUMBER during RINGING
 *  - writes CallLog several seconds after hangup
 *  - sometimes uses BLOCKED / answered-externally types
 */
final class CallLogHelper {

    private static final String TAG = "HroCallLog";

    /** How far before RINGING we still accept a CallLog DATE (OEM clock skew). */
    private static final long LOOKBACK_MS = 3 * 60_000L;
    /** How far after RINGING a CallLog row can still belong to this session. */
    private static final long LOOKAHEAD_MS = 3 * 60_000L;

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
     * Best CallLog row for a ring session — closest DATE to {@code ringAtMs}
     * among incoming/missed/rejected/blocked rows in a wide window.
     */
    static Entry bestIncomingForSession(Context context, long ringAtMs, long sinceEpochMs) {
        if (!hasCallLogPermission(context)) return null;
        long ring = ringAtMs > 0 ? ringAtMs : System.currentTimeMillis();
        long since = Math.min(
            sinceEpochMs > 0 ? sinceEpochMs : ring - LOOKBACK_MS,
            ring - LOOKBACK_MS
        );
        long until = ring + LOOKAHEAD_MS;

        Entry best = queryClosest(context, since, until, ring, true);
        if (best != null) return best;
        // Truecaller / OEM sometimes write an atypical type — any numbered row near ring.
        return queryClosest(context, since, until, ring, false);
    }

    private static Entry queryClosest(
        Context context,
        long since,
        long until,
        long ringAtMs,
        boolean inboundTypesOnly
    ) {
        Cursor cursor = null;
        try {
            String selection;
            String[] args;
            if (inboundTypesOnly) {
                // 1 INCOMING, 3 MISSED, 5 REJECTED, 6 BLOCKED (API 24+), 7 ANSWERED_EXTERNALLY
                selection =
                    CallLog.Calls.DATE
                        + ">=? AND "
                        + CallLog.Calls.DATE
                        + "<=? AND "
                        + CallLog.Calls.TYPE
                        + " IN (?,?,?,?,?)";
                args =
                    new String[] {
                        String.valueOf(since),
                        String.valueOf(until),
                        String.valueOf(CallLog.Calls.INCOMING_TYPE),
                        String.valueOf(CallLog.Calls.MISSED_TYPE),
                        String.valueOf(CallLog.Calls.REJECTED_TYPE),
                        "6",
                        "7",
                    };
            } else {
                selection =
                    CallLog.Calls.DATE
                        + ">=? AND "
                        + CallLog.Calls.DATE
                        + "<=? AND "
                        + CallLog.Calls.TYPE
                        + "!=?";
                args =
                    new String[] {
                        String.valueOf(since),
                        String.valueOf(until),
                        String.valueOf(CallLog.Calls.OUTGOING_TYPE),
                    };
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
            Entry best = null;
            long bestDelta = Long.MAX_VALUE;
            while (cursor.moveToNext()) {
                String number = cursor.getString(0);
                int type = cursor.getInt(1);
                long dateMs = cursor.getLong(2);
                if (number == null || number.trim().isEmpty() || dateMs <= 0) continue;
                // Skip private / unknown placeholders some dialers write.
                String trimmed = number.trim();
                if (isUselessNumber(trimmed)) continue;
                long delta = Math.abs(dateMs - ringAtMs);
                if (delta < bestDelta) {
                    bestDelta = delta;
                    best = new Entry(trimmed, dateMs, type);
                }
            }
            if (best != null) {
                Log.i(
                    TAG,
                    "CallLog match type="
                        + best.type
                        + " deltaMs="
                        + bestDelta
                        + " inboundOnly="
                        + inboundTypesOnly
                );
            }
            return best;
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

    static boolean isUselessNumber(String number) {
        if (number == null) return true;
        String digits = number.replaceAll("\\D", "");
        if (digits.isEmpty()) return true;
        String lower = number.toLowerCase();
        return lower.contains("private")
            || lower.contains("unknown")
            || lower.contains("restricted")
            || "-1".equals(number.trim());
    }

    private static Entry latest(Context context, long sinceEpochMs, boolean incomingOnly) {
        if (!hasCallLogPermission(context)) return null;
        Cursor cursor = null;
        try {
            String selection;
            String[] args;
            if (incomingOnly) {
                selection = CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + " IN (?,?,?,?,?)";
                args =
                    new String[] {
                        String.valueOf(sinceEpochMs),
                        String.valueOf(CallLog.Calls.INCOMING_TYPE),
                        String.valueOf(CallLog.Calls.MISSED_TYPE),
                        String.valueOf(CallLog.Calls.REJECTED_TYPE),
                        "6",
                        "7",
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
                if (number != null && !number.trim().isEmpty() && dateMs > 0
                    && !isUselessNumber(number.trim())) {
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

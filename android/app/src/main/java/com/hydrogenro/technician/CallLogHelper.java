package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * Read recent numbers from the system call log.
 * EXTRA_INCOMING_NUMBER is often empty on Indian OEMs / Truecaller;
 * CallLog may appear while the call is still live on some devices.
 */
final class CallLogHelper {

    private static final String TAG = "HroCallLog";

    private CallLogHelper() {}

    static boolean hasCallLogPermission(Context context) {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
            == PackageManager.PERMISSION_GRANTED;
    }

    /**
     * Most recent incoming / missed / rejected number since {@code sinceEpochMs}.
     * Returns null if none or permission missing.
     */
    static String latestIncomingNumber(Context context, long sinceEpochMs) {
        return latestNumber(context, sinceEpochMs, true);
    }

    /**
     * Any recent call-log number since {@code sinceEpochMs} (live-call poll).
     * Some dialers write the row before classifying type.
     */
    static String latestAnyNumber(Context context, long sinceEpochMs) {
        return latestNumber(context, sinceEpochMs, false);
    }

    private static String latestNumber(Context context, long sinceEpochMs, boolean incomingOnly) {
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
                if (number != null && !number.trim().isEmpty()) {
                    return number.trim();
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

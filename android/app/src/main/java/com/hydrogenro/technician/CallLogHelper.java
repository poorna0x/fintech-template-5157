package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * Read recent incoming/missed numbers from the system call log.
 * EXTRA_INCOMING_NUMBER is often empty on Indian OEMs even with READ_CALL_LOG;
 * the call log is the reliable source after the phone rings.
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
        if (!hasCallLogPermission(context)) return null;
        Cursor cursor = null;
        try {
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
                            String.valueOf(sinceEpochMs),
                            String.valueOf(CallLog.Calls.INCOMING_TYPE),
                            String.valueOf(CallLog.Calls.MISSED_TYPE),
                            String.valueOf(CallLog.Calls.REJECTED_TYPE),
                        },
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

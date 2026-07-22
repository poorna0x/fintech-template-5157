package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Recent incoming caller for search prompt + admin JWT notify backup.
 * Prefers CallAlertReceiver prefs; falls back to system CallLog (OEM-safe).
 */
@CapacitorPlugin(name = "RecentCall")
public class RecentCallPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
    }

    private JSObject readRecent(boolean consume) {
        SharedPreferences prefs = prefs();
        String number = prefs.getString(CallAlertReceiver.KEY_LAST_NUMBER, null);
        long at = prefs.getLong(CallAlertReceiver.KEY_LAST_AT, 0L);
        long consumedAt = prefs.getLong(CallAlertReceiver.KEY_CONSUMED_AT, 0L);

        JSObject ret = new JSObject();
        if (number != null && !number.isEmpty() && at > 0 && at != consumedAt) {
            if (consume) {
                prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, at).apply();
            }
            ret.put("number", number);
            ret.put("at", at);
            return ret;
        }

        // Fallback: system call log (when PHONE_STATE never carried the number).
        // Only skip if we just consumed this exact prefs row (same at) — do not
        // block a new call from the same number.
        long since = System.currentTimeMillis() - 5 * 60_000L;
        String fromLog = CallLogHelper.latestIncomingNumber(getContext(), since);
        if (fromLog != null && !fromLog.isEmpty()) {
            long now = System.currentTimeMillis();
            if (
                number != null
                    && fromLog.equals(number)
                    && consumedAt > 0
                    && at > 0
                    && consumedAt == at
                    && (now - consumedAt) < 3_000L
            ) {
                return ret;
            }
            prefs
                .edit()
                .putString(CallAlertReceiver.KEY_LAST_NUMBER, fromLog)
                .putLong(CallAlertReceiver.KEY_LAST_AT, now)
                .apply();
            if (consume) {
                prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, now).apply();
            }
            ret.put("number", fromLog);
            ret.put("at", now);
            ret.put("source", "call_log");
        }
        return ret;
    }

    @PluginMethod
    public void consumeRecentCall(PluginCall call) {
        call.resolve(readRecent(true));
    }

    @PluginMethod
    public void peekRecentCall(PluginCall call) {
        call.resolve(readRecent(false));
    }

    /**
     * Test/diagnostics: always report prefs + CallLog (no consume gating) so
     * we can see if the dialer wrote a number after a call.
     */
    @PluginMethod
    public void debugReadRecentCall(PluginCall call) {
        SharedPreferences prefs = prefs();
        JSObject ret = new JSObject();
        String prefsNumber = prefs.getString(CallAlertReceiver.KEY_LAST_NUMBER, null);
        long prefsAt = prefs.getLong(CallAlertReceiver.KEY_LAST_AT, 0L);
        long consumedAt = prefs.getLong(CallAlertReceiver.KEY_CONSUMED_AT, 0L);
        if (prefsNumber != null) ret.put("prefsNumber", prefsNumber);
        if (prefsAt > 0) ret.put("prefsAt", prefsAt);
        if (consumedAt > 0) ret.put("consumedAt", consumedAt);

        long since = System.currentTimeMillis() - 15 * 60_000L;
        String fromLog = CallLogHelper.latestIncomingNumber(getContext(), since);
        if (fromLog == null || fromLog.isEmpty()) {
            fromLog = CallLogHelper.latestAnyNumber(getContext(), since);
            if (fromLog != null) ret.put("callLogAny", true);
        }
        if (fromLog != null && !fromLog.isEmpty()) {
            ret.put("callLogNumber", fromLog);
        }
        ret.put("hasCallLogPermission", CallLogHelper.hasCallLogPermission(getContext()));
        ret.put("checkedAt", System.currentTimeMillis());
        call.resolve(ret);
    }
}

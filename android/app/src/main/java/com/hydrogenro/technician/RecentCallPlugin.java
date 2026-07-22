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
        long since = System.currentTimeMillis() - 5 * 60_000L;
        String fromLog = CallLogHelper.latestIncomingNumber(getContext(), since);
        if (fromLog != null && !fromLog.isEmpty()) {
            long now = System.currentTimeMillis();
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
}

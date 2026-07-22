package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Recent incoming caller for JWT backup notify.
 * Prefers a fresh CallLog incoming number over stale prefs (so a new call
 * is not hidden behind an older captured number).
 */
@CapacitorPlugin(name = "RecentCall")
public class RecentCallPlugin extends Plugin {

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
    }

    private static String digitsOnly(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("\\D", "");
    }

    private JSObject readRecent(boolean consume) {
        SharedPreferences prefs = prefs();
        String prefsNumber = prefs.getString(CallAlertReceiver.KEY_LAST_NUMBER, null);
        long prefsAt = prefs.getLong(CallAlertReceiver.KEY_LAST_AT, 0L);
        long consumedAt = prefs.getLong(CallAlertReceiver.KEY_CONSUMED_AT, 0L);
        long now = System.currentTimeMillis();

        // Incoming only — never use outgoing "numbers I dialed".
        long since = now - 15 * 60_000L;
        String fromLog = CallLogHelper.latestIncomingNumber(getContext(), since);

        JSObject ret = new JSObject();

        if (fromLog != null && !fromLog.isEmpty()) {
            String logDigits = digitsOnly(fromLog);
            String prefsDigits = digitsOnly(prefsNumber);
            boolean different =
                prefsDigits.isEmpty() || !logDigits.equals(prefsDigits);
            boolean prefsStale = prefsAt <= 0 || now - prefsAt > 60_000L;
            // New/different CallLog row wins so BG notify sees the latest caller.
            if (different || prefsStale || prefsAt == consumedAt) {
                prefs
                    .edit()
                    .putString(CallAlertReceiver.KEY_LAST_NUMBER, fromLog)
                    .putLong(CallAlertReceiver.KEY_LAST_AT, now)
                    .remove(CallAlertReceiver.KEY_CONSUMED_AT)
                    .apply();
                if (consume) {
                    prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, now).apply();
                }
                ret.put("number", fromLog);
                ret.put("at", now);
                ret.put("source", "call_log");
                return ret;
            }
        }

        if (prefsNumber != null && !prefsNumber.isEmpty() && prefsAt > 0 && prefsAt != consumedAt) {
            if (consume) {
                prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, prefsAt).apply();
            }
            ret.put("number", prefsNumber);
            ret.put("at", prefsAt);
            ret.put("source", "prefs");
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

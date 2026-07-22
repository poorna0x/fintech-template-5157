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
 * Uses CallLog DATE so the same customer calling again is a new event
 * (not stuck on the previous capture).
 */
@CapacitorPlugin(name = "RecentCall")
public class RecentCallPlugin extends Plugin {

    static final String KEY_LAST_CALLLOG_DATE = "last_calllog_date";

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
        long lastLogDate = prefs.getLong(KEY_LAST_CALLLOG_DATE, 0L);
        long now = System.currentTimeMillis();

        long since = now - 15 * 60_000L;
        CallLogHelper.Entry fromLog = CallLogHelper.latestIncoming(getContext(), since);

        JSObject ret = new JSObject();

        if (fromLog != null) {
            String logDigits = digitsOnly(fromLog.number);
            String prefsDigits = digitsOnly(prefsNumber);
            boolean differentNumber =
                prefsDigits.isEmpty() || !logDigits.equals(prefsDigits);
            // New CallLog row (newer DATE) = new call, even if same number.
            boolean newerCallLog = fromLog.dateMs > lastLogDate;
            boolean prefsStale = prefsAt <= 0 || now - prefsAt > 60_000L;
            boolean consumed = prefsAt > 0 && prefsAt == consumedAt;

            if (differentNumber || newerCallLog || prefsStale || consumed) {
                prefs
                    .edit()
                    .putString(CallAlertReceiver.KEY_LAST_NUMBER, fromLog.number)
                    .putLong(CallAlertReceiver.KEY_LAST_AT, now)
                    .putLong(KEY_LAST_CALLLOG_DATE, fromLog.dateMs)
                    .remove(CallAlertReceiver.KEY_CONSUMED_AT)
                    .apply();
                if (consume) {
                    prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, now).apply();
                }
                ret.put("number", fromLog.number);
                ret.put("at", now);
                ret.put("callLogDate", fromLog.dateMs);
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

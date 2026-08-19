package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.CallLog;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Recent incoming caller for JWT backup notify.
 * Uses CallLog DATE so the same customer calling again is a new event.
 * If native hangup path already alerted this callId, peek returns alerted=true
 * so JS does not POST a duplicate.
 */
@CapacitorPlugin(name = "RecentCall")
public class RecentCallPlugin extends Plugin {

    static final String KEY_LAST_CALLLOG_DATE = "last_calllog_date";

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
    }

    private static String digitsOnly(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() >= 12 && digits.startsWith("91")) digits = digits.substring(2);
        digits = digits.replaceFirst("^0+", "");
        return digits.length() >= 10 ? digits.substring(digits.length() - 10) : digits;
    }

    private static boolean isMissed(CallLogHelper.Entry entry) {
        return entry != null
            && entry.type != CallLog.Calls.INCOMING_TYPE
            && entry.type != 7; // ANSWERED_EXTERNALLY_TYPE
    }

    private JSObject readRecent(boolean consume) {
        SharedPreferences prefs = prefs();
        String prefsNumber = prefs.getString(CallAlertReceiver.KEY_LAST_NUMBER, null);
        long prefsAt = prefs.getLong(CallAlertReceiver.KEY_LAST_AT, 0L);
        long consumedAt = prefs.getLong(CallAlertReceiver.KEY_CONSUMED_AT, 0L);
        long lastLogDate = prefs.getLong(KEY_LAST_CALLLOG_DATE, 0L);
        long now = System.currentTimeMillis();
        String alertedCallId = prefs.getString(CallAlertReceiver.KEY_ALERTED_CALL_ID, "");

        long since = now - 15 * 60_000L;
        CallLogHelper.Entry fromLog = CallLogHelper.latestIncoming(getContext(), since);

        JSObject ret = new JSObject();

        if (fromLog != null) {
            String logDigits = digitsOnly(fromLog.number);
            String prefsDigits = digitsOnly(prefsNumber);
            boolean differentNumber =
                prefsDigits.isEmpty() || !logDigits.equals(prefsDigits);
            boolean newerCallLog = fromLog.dateMs > lastLogDate;
            boolean consumed = prefsAt > 0 && prefsAt == consumedAt;
            String callId = logDigits.isEmpty() ? "" : (logDigits + ":" + fromLog.dateMs);

            if (!callId.isEmpty() && callId.equals(alertedCallId)) {
                ret.put("alerted", true);
                ret.put("number", fromLog.number);
                ret.put("at", fromLog.dateMs);
                ret.put("callLogDate", fromLog.dateMs);
                ret.put("callId", callId);
                ret.put("missed", isMissed(fromLog));
                ret.put("source", "call_log_alerted");
                return ret;
            }

            if (differentNumber || newerCallLog || consumed) {
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
                ret.put("at", fromLog.dateMs);
                ret.put("callLogDate", fromLog.dateMs);
                if (!callId.isEmpty()) ret.put("callId", callId);
                ret.put("missed", isMissed(fromLog));
                ret.put("source", "call_log");
                return ret;
            }
        }

        if (prefsNumber != null && !prefsNumber.isEmpty() && prefsAt > 0 && prefsAt != consumedAt) {
            String prefsDigits = digitsOnly(prefsNumber);
            long stableAt = lastLogDate > 0 ? lastLogDate : prefsAt;
            String callId =
                !prefsDigits.isEmpty() && stableAt > 0
                    ? (prefsDigits + ":" + stableAt)
                    : "";
            if (!callId.isEmpty() && callId.equals(alertedCallId)) {
                ret.put("alerted", true);
                ret.put("number", prefsNumber);
                ret.put("at", prefsAt);
                ret.put("callLogDate", stableAt);
                ret.put("callId", callId);
                ret.put("source", "prefs_alerted");
                return ret;
            }
            if (consume) {
                prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, prefsAt).apply();
            }
            ret.put("number", prefsNumber);
            ret.put("at", prefsAt);
            ret.put("callLogDate", stableAt);
            if (!callId.isEmpty()) ret.put("callId", callId);
            ret.put(
                "missed",
                !prefs.getBoolean(CallAlertReceiver.KEY_INCOMING_ANSWERED, false)
            );
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

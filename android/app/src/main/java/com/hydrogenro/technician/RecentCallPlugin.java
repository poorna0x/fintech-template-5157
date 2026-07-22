package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the technician search dialog ask "did this customer just call you?".
 * Reads the last incoming call saved by CallAlertReceiver. One-shot per call:
 * a consumed_at marker (not deletion) keeps the receiver's ring-dedupe intact.
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
        }
        return ret;
    }

    @PluginMethod
    public void consumeRecentCall(PluginCall call) {
        call.resolve(readRecent(true));
    }

    /** Same data as consume, but leaves the call available for the search prompt. */
    @PluginMethod
    public void peekRecentCall(PluginCall call) {
        call.resolve(readRecent(false));
    }
}

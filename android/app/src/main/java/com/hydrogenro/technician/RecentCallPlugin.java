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

    @PluginMethod
    public void consumeRecentCall(PluginCall call) {
        SharedPreferences prefs = getContext()
            .getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
        String number = prefs.getString(CallAlertReceiver.KEY_LAST_NUMBER, null);
        long at = prefs.getLong(CallAlertReceiver.KEY_LAST_AT, 0L);
        long consumedAt = prefs.getLong(CallAlertReceiver.KEY_CONSUMED_AT, 0L);

        JSObject ret = new JSObject();
        if (number != null && !number.isEmpty() && at > 0 && at != consumedAt) {
            prefs.edit().putLong(CallAlertReceiver.KEY_CONSUMED_AT, at).apply();
            ret.put("number", number);
            ret.put("at", at);
        }
        call.resolve(ret);
    }
}

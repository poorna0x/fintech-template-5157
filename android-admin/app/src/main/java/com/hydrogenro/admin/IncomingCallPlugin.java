package com.hydrogenro.admin;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Caller lookup, step 2: the web layer calls consumeLastCall() on app
 * open/resume and searches that customer. checkPermissions/requestPermissions
 * come from the Capacitor base class via the annotation below.
 */
@CapacitorPlugin(
    name = "IncomingCall",
    permissions = {
        @Permission(
            alias = "callerId",
            strings = { Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG }
        )
    }
)
public class IncomingCallPlugin extends Plugin {

    /** Return the last captured incoming number and clear it (one-shot). */
    @PluginMethod
    public void consumeLastCall(PluginCall call) {
        SharedPreferences prefs = getContext()
            .getSharedPreferences(CallCaptureReceiver.PREFS, Context.MODE_PRIVATE);
        String number = prefs.getString(CallCaptureReceiver.KEY_NUMBER, null);
        long at = prefs.getLong(CallCaptureReceiver.KEY_AT, 0L);

        JSObject ret = new JSObject();
        if (number != null && !number.isEmpty()) {
            prefs.edit().clear().apply();
            ret.put("number", number);
            ret.put("at", at);
        }
        call.resolve(ret);
    }
}

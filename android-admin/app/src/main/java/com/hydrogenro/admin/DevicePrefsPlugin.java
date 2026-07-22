package com.hydrogenro.admin;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Per-device prefs synced from Settings → Device Tracker.
 * CallCaptureReceiver reads call_alerts_enabled when the app is killed.
 */
@CapacitorPlugin(name = "DevicePrefs")
public class DevicePrefsPlugin extends Plugin {

    static final String PREFS = "hro_device_prefs";
    static final String KEY_CALL_ALERTS = "call_alerts_enabled";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean callAlertsEnabled(Context context) {
        return prefs(context).getBoolean(KEY_CALL_ALERTS, true);
    }

    static boolean shouldProcessIncomingCall(Context context) {
        return callAlertsEnabled(context);
    }

    static String buildDeviceLabel() {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.trim();
        String model = Build.MODEL == null ? "" : Build.MODEL.trim();
        if (manufacturer.isEmpty() && model.isEmpty()) return "Android phone";
        if (manufacturer.isEmpty()) return model;
        if (model.isEmpty()) return capitalize(manufacturer);
        if (model.toLowerCase().startsWith(manufacturer.toLowerCase())) return capitalize(model);
        return capitalize(manufacturer) + " " + model;
    }

    private static String capitalize(String value) {
        if (value == null || value.isEmpty()) return value;
        return value.substring(0, 1).toUpperCase() + value.substring(1);
    }

    @PluginMethod
    public void setPrefs(PluginCall call) {
        Boolean alerts = call.getBoolean("callAlertsEnabled", true);
        prefs(getContext())
            .edit()
            .putBoolean(KEY_CALL_ALERTS, alerts == null || alerts)
            .apply();
        call.resolve();
    }

    @PluginMethod
    public void getPrefs(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("callAlertsEnabled", callAlertsEnabled(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void getDeviceLabel(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("label", buildDeviceLabel());
        call.resolve(ret);
    }
}

package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DevicePrefs")
public class DevicePrefsPlugin extends Plugin {

    static final String PREFS = "hro_device_prefs";
    static final String KEY_CALL_ALERTS = "call_alerts_enabled";
    /** Last FCM token registered with the server — CallAlertReceiver prefers this. */
    static final String KEY_FCM_TOKEN = "fcm_token";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean callAlertsEnabled(Context context) {
        return prefs(context).getBoolean(KEY_CALL_ALERTS, true);
    }

    static boolean shouldProcessIncomingCall(Context context) {
        return callAlertsEnabled(context);
    }

    /** Apply prefs from a silent FCM (app may be killed). */
    static void applyCallAlertsEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_CALL_ALERTS, enabled).apply();
    }

    static void saveFcmToken(Context context, String token) {
        if (token == null) return;
        String trimmed = token.trim();
        if (trimmed.length() < 20) return;
        prefs(context).edit().putString(KEY_FCM_TOKEN, trimmed).apply();
    }

    static String readFcmToken(Context context) {
        String token = prefs(context).getString(KEY_FCM_TOKEN, null);
        if (token == null || token.trim().length() < 20) return null;
        return token.trim();
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
        SharedPreferences.Editor edit = prefs(getContext()).edit();
        edit.putBoolean(KEY_CALL_ALERTS, alerts == null || alerts);
        String token = call.getString("fcmToken");
        if (token != null && token.trim().length() >= 20) {
            edit.putString(KEY_FCM_TOKEN, token.trim());
        }
        edit.apply();
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

    /** Whether Notification access is on (needed for Truecaller number fallback). */
    @PluginMethod
    public void isNotificationAccessEnabled(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", isNotificationListenerEnabled(getContext()));
        call.resolve(ret);
    }

    /** Opens system screen where tech enables HRO Technician notification access. */
    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            android.content.Intent intent =
                new android.content.Intent(
                    "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"
                );
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification access settings");
        }
    }

    static boolean isNotificationListenerEnabled(Context context) {
        String flat =
            android.provider.Settings.Secure.getString(
                context.getContentResolver(),
                "enabled_notification_listeners"
            );
        if (flat == null || flat.isEmpty()) return false;
        String pkg = context.getPackageName();
        for (String component : flat.split(":")) {
            if (component != null && component.contains(pkg)) return true;
        }
        return false;
    }
}

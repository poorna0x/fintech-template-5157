package com.hydrogenro.admin;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
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
    static final String KEY_VIEWING_WA_PHONE = "viewing_whatsapp_phone";

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

    static String viewingWhatsAppPhone(Context context) {
        return prefs(context).getString(KEY_VIEWING_WA_PHONE, "");
    }

    static void setViewingWhatsAppPhone(Context context, String phoneDigits) {
        String digits = phoneDigits == null ? "" : phoneDigits.replaceAll("\\D", "");
        prefs(context).edit().putString(KEY_VIEWING_WA_PHONE, digits).apply();
    }

    static void clearViewingWhatsAppPhone(Context context) {
        prefs(context).edit().remove(KEY_VIEWING_WA_PHONE).apply();
    }

    static String whatsAppTrayTag(String phoneDigits) {
        String digits = phoneDigits == null ? "" : phoneDigits.replaceAll("\\D", "");
        if (digits.isEmpty()) return "whatsapp_inbound";
        return "wa_inbound_" + digits;
    }

    /** Remove WhatsApp inbound tray alert for this customer (team read sync / open chat). */
    static void clearWhatsAppTrayNotification(Context context, String phoneDigits) {
        String tag = whatsAppTrayTag(phoneDigits);
        try {
            NotificationManagerCompat.from(context).cancel(tag, 0);
        } catch (Throwable ignored) {
            /* notifications disabled */
        }
    }

    /** True when this Admin APK is already open on that WhatsApp thread. */
    static boolean isViewingWhatsAppPhone(Context context, String inboundPhone) {
        String viewing = viewingWhatsAppPhone(context);
        if (viewing == null || viewing.isEmpty()) return false;
        String inbound = inboundPhone == null ? "" : inboundPhone.replaceAll("\\D", "");
        return !inbound.isEmpty() && viewing.equals(inbound);
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
    public void setViewingWhatsAppPhone(PluginCall call) {
        String phone = call.getString("phone", "");
        setViewingWhatsAppPhone(getContext(), phone);
        call.resolve();
    }

    @PluginMethod
    public void clearWhatsAppTrayNotification(PluginCall call) {
        String phone = call.getString("phone", "");
        clearWhatsAppTrayNotification(getContext(), phone);
        call.resolve();
    }

    @PluginMethod
    public void getDeviceLabel(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("label", buildDeviceLabel());
        call.resolve(ret);
    }
}

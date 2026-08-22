package com.hydrogenro.admin;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.service.notification.StatusBarNotification;
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

    private static java.util.LinkedHashSet<String> phoneVariants(String digits) {
        java.util.LinkedHashSet<String> out = new java.util.LinkedHashSet<>();
        if (digits == null || digits.isEmpty()) return out;
        out.add(digits);
        if (digits.length() == 10) {
            out.add("91" + digits);
        }
        if (digits.length() >= 12 && digits.startsWith("91")) {
            out.add(digits.substring(digits.length() - 10));
        }
        return out;
    }

    private static boolean phoneTagMatches(String tagDigits, java.util.LinkedHashSet<String> variants) {
        if (tagDigits == null || tagDigits.isEmpty()) return false;
        for (String v : variants) {
            if (tagDigits.equals(v)) return true;
            if (v.length() >= 10 && tagDigits.length() >= 10
                && tagDigits.endsWith(v.substring(v.length() - 10))) {
                return true;
            }
        }
        return false;
    }

    /** India numbers may be 10 digits or 91XXXXXXXXXX — cancel every matching tray entry. */
    static void clearWhatsAppTrayNotification(Context context, String phoneDigits) {
        String digits = phoneDigits == null ? "" : phoneDigits.replaceAll("\\D", "");
        if (digits.isEmpty()) return;
        java.util.LinkedHashSet<String> variants = phoneVariants(digits);
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(context);
            for (String v : variants) {
                String tag = whatsAppTrayTag(v);
                nm.cancel(tag, 0);
                nm.cancel(tag, Math.abs(tag.hashCode()));
            }
            // FCM / OEM may use a different id — scan active shade and cancel by tag.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                NotificationManager sys = context.getSystemService(NotificationManager.class);
                if (sys != null) {
                    StatusBarNotification[] active = sys.getActiveNotifications();
                    if (active != null) {
                        for (StatusBarNotification sbn : active) {
                            String tag = sbn.getTag();
                            if (tag == null) continue;
                            if (!tag.startsWith("wa_inbound_") && !"whatsapp_inbound".equals(tag)) {
                                continue;
                            }
                            String rest = tag.substring("wa_inbound_".length());
                            int cut = rest.indexOf('_');
                            String phonePart = (cut > 0 ? rest.substring(0, cut) : rest).replaceAll("\\D", "");
                            if ("whatsapp_inbound".equals(tag)
                                || phoneTagMatches(phonePart, variants)
                                || phoneTagMatches(rest.replaceAll("\\D", ""), variants)) {
                                nm.cancel(tag, sbn.getId());
                            }
                        }
                    }
                }
            }
        } catch (Throwable ignored) {
            /* notifications disabled */
        }
    }

    /** True when this Admin APK is already open on that WhatsApp thread. */
    static boolean isViewingWhatsAppPhone(Context context, String inboundPhone) {
        String viewing = viewingWhatsAppPhone(context);
        if (viewing == null || viewing.isEmpty()) return false;
        String inbound = inboundPhone == null ? "" : inboundPhone.replaceAll("\\D", "");
        if (inbound.isEmpty()) return false;
        if (viewing.equals(inbound)) return true;
        if (viewing.length() >= 10 && inbound.length() >= 10) {
            return viewing.endsWith(inbound.substring(inbound.length() - 10))
                || inbound.endsWith(viewing.substring(viewing.length() - 10));
        }
        return false;
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

    /** Tech-call alerts saved natively when push arrives (app may be killed). */
    @PluginMethod
    public void listRecentTechCallAlerts(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("itemsJson", TechCallAlertStore.listJson(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void clearRecentTechCallAlerts(PluginCall call) {
        TechCallAlertStore.clear(getContext());
        call.resolve();
    }
}

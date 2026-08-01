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
    /** Company calling number from technicians.phone — synced once on login. */
    static final String KEY_COMPANY_PHONE = "company_phone";
    /** Comma-separated 10-digit SIM MSISDNs cached on the device. */
    static final String KEY_SIM_NUMBERS = "sim_numbers";
    /** "subId=number;…" map for matching CallLog phone accounts. */
    static final String KEY_SIM_SUB_MAP = "sim_sub_map";
    /** "subId=slot1Based;…" — works even when MSISDN is blank. */
    static final String KEY_SIM_SLOT_MAP = "sim_slot_map";
    /**
     * 1-based company SIM slot when numbers can't be read.
     * Default {@link SimLineHelper#DEFAULT_COMPANY_SIM_SLOT} (SIM 2).
     */
    static final String KEY_COMPANY_SIM_SLOT = "company_sim_slot";

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveCompanyPhone(Context context, String phone) {
        String n = SimLineHelper.normalize10(phone);
        prefs(context).edit().putString(KEY_COMPANY_PHONE, n).apply();
        if (!n.isEmpty()) {
            SimLineHelper.refreshSimCache(context);
        } else {
            saveCompanySimSlot(context, SimLineHelper.DEFAULT_COMPANY_SIM_SLOT);
        }
    }

    static String readCompanyPhone(Context context) {
        return prefs(context).getString(KEY_COMPANY_PHONE, "");
    }

    /** 1-based company SIM slot (default SIM 2). */
    static int readCompanySimSlot(Context context) {
        int slot = prefs(context).getInt(KEY_COMPANY_SIM_SLOT, SimLineHelper.DEFAULT_COMPANY_SIM_SLOT);
        return slot >= 1 ? slot : SimLineHelper.DEFAULT_COMPANY_SIM_SLOT;
    }

    static void saveCompanySimSlot(Context context, int slot1Based) {
        int slot = slot1Based >= 1 ? slot1Based : SimLineHelper.DEFAULT_COMPANY_SIM_SLOT;
        prefs(context).edit().putInt(KEY_COMPANY_SIM_SLOT, slot).apply();
    }

    static void saveSimCache(Context context, String numbersCsv, String subMap, String slotMap) {
        prefs(context)
            .edit()
            .putString(KEY_SIM_NUMBERS, numbersCsv != null ? numbersCsv : "")
            .putString(KEY_SIM_SUB_MAP, subMap != null ? subMap : "")
            .putString(KEY_SIM_SLOT_MAP, slotMap != null ? slotMap : "")
            .apply();
    }

    static java.util.List<String> readSimNumbers(Context context) {
        java.util.List<String> out = new java.util.ArrayList<>();
        String raw = prefs(context).getString(KEY_SIM_NUMBERS, "");
        if (raw == null || raw.isEmpty()) return out;
        for (String part : raw.split(",")) {
            String n = SimLineHelper.normalize10(part);
            if (!n.isEmpty() && !out.contains(n)) out.add(n);
        }
        return out;
    }

    static java.util.Map<String, String> readSimSubMap(Context context) {
        java.util.Map<String, String> out = new java.util.HashMap<>();
        String raw = prefs(context).getString(KEY_SIM_SUB_MAP, "");
        if (raw == null || raw.isEmpty()) return out;
        for (String part : raw.split(";")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            String sub = part.substring(0, eq).trim();
            String num = SimLineHelper.normalize10(part.substring(eq + 1));
            if (!sub.isEmpty() && !num.isEmpty()) out.put(sub, num);
        }
        return out;
    }

    static java.util.Map<String, Integer> readSimSlotMap(Context context) {
        java.util.Map<String, Integer> out = new java.util.HashMap<>();
        String raw = prefs(context).getString(KEY_SIM_SLOT_MAP, "");
        if (raw == null || raw.isEmpty()) return out;
        for (String part : raw.split(";")) {
            int eq = part.indexOf('=');
            if (eq <= 0) continue;
            String sub = part.substring(0, eq).trim();
            try {
                int slot = Integer.parseInt(part.substring(eq + 1).trim());
                if (!sub.isEmpty() && slot >= 1) out.put(sub, slot);
            } catch (NumberFormatException ignored) {
            }
        }
        return out;
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
        String companyPhone = call.getString("companyPhone");
        boolean refreshSims = false;
        if (companyPhone != null) {
            String n = SimLineHelper.normalize10(companyPhone);
            edit.putString(KEY_COMPANY_PHONE, n);
            refreshSims = !n.isEmpty();
        }
        edit.apply();
        if (refreshSims) {
            SimLineHelper.refreshSimCache(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void setCompanyPhone(PluginCall call) {
        String phone = call.getString("phone", "");
        saveCompanyPhone(getContext(), phone != null ? phone : "");
        JSObject ret = new JSObject();
        ret.put("companyPhone", readCompanyPhone(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void getPrefs(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("callAlertsEnabled", callAlertsEnabled(getContext()));
        ret.put("companyPhone", readCompanyPhone(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void getDeviceLabel(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("label", buildDeviceLabel());
        call.resolve(ret);
    }
}

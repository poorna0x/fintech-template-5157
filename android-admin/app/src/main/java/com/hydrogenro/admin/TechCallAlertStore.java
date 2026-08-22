package com.hydrogenro.admin;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Map;

/**
 * Persist tech-call FCM alerts on-device when the push arrives (app can be
 * killed; tray does not need to be opened). Recent Accounts reads this via
 * {@link DevicePrefsPlugin}. Retention: 24 hours. One row per phone (newest).
 */
final class TechCallAlertStore {

    private static final String TAG = "HroTechCallStore";
    private static final String PREFS = "hro_admin_recent_tech_calls";
    private static final String KEY = "items_v1";
    private static final int MAX = 50;
    private static final long TTL_MS = 24L * 60L * 60L * 1000L;

    private TechCallAlertStore() {}

    static void remember(Context context, Map<String, String> data) {
        if (context == null || data == null) return;
        String type = str(data.get("type"));
        if (!"tech_call".equals(type) && !"wrong_line_call".equals(type)) return;

        String phone = digits(data.get("phone"));
        if (phone.length() < 10) phone = digits(data.get("query"));
        if (phone.length() < 10) return;
        phone = phone.substring(phone.length() - 10);

        boolean missed =
            "true".equalsIgnoreCase(str(data.get("missed"))) || "1".equals(str(data.get("missed")));
        String kind = "tech_call";
        if ("wrong_line_call".equals(type)) kind = "wrong_line_call";
        else if (missed) kind = "missed_call";

        try {
            JSONObject next = new JSONObject();
            next.put("phone", phone);
            next.put("at", System.currentTimeMillis());
            next.put("kind", kind);
            putOpt(next, "techName", data.get("techName"));
            putOpt(next, "customerId", data.get("customerId"));
            putOpt(next, "callId", data.get("callId"));
            putOpt(next, "fromNumber", data.get("fromNumber"));
            putOpt(next, "companyPhone", data.get("companyPhone"));

            JSONArray arr = readArray(context);
            JSONArray out = new JSONArray();
            out.put(next);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length() && out.length() < MAX; i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;
                long at = row.optLong("at", 0L);
                if (at <= 0 || now - at > TTL_MS) continue;
                // Drop older rows for the same phone (keep newest only).
                if (phone.equals(row.optString("phone", ""))) continue;
                out.put(row);
            }
            prefs(context).edit().putString(KEY, out.toString()).apply();
            Log.i(TAG, "Saved tech-call alert phone=" + phone + " kind=" + kind);
        } catch (Exception e) {
            Log.w(TAG, "remember failed: " + e.getMessage());
        }
    }

    static String listJson(Context context) {
        try {
            JSONArray arr = readArray(context);
            // Collapse any legacy duplicates (same phone) → newest only.
            JSONArray out = new JSONArray();
            java.util.LinkedHashMap<String, JSONObject> byPhone =
                new java.util.LinkedHashMap<>();
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject row = arr.optJSONObject(i);
                if (row == null) continue;
                long at = row.optLong("at", 0L);
                if (at <= 0 || now - at > TTL_MS) continue;
                String phone = row.optString("phone", "");
                if (phone.length() < 10) continue;
                JSONObject prev = byPhone.get(phone);
                if (prev == null || at > prev.optLong("at", 0L)) {
                    byPhone.put(phone, row);
                }
            }
            java.util.List<JSONObject> sorted = new java.util.ArrayList<>(byPhone.values());
            java.util.Collections.sort(
                sorted,
                (a, b) -> Long.compare(b.optLong("at", 0L), a.optLong("at", 0L))
            );
            for (JSONObject row : sorted) {
                if (out.length() >= MAX) break;
                out.put(row);
            }
            if (!out.toString().equals(arr.toString())) {
                prefs(context).edit().putString(KEY, out.toString()).apply();
            }
            return out.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    static void clear(Context context) {
        prefs(context).edit().remove(KEY).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray readArray(Context context) {
        try {
            String raw = prefs(context).getString(KEY, "[]");
            return new JSONArray(raw != null ? raw : "[]");
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static void putOpt(JSONObject o, String key, String value) throws Exception {
        if (value != null && !value.trim().isEmpty()) o.put(key, value.trim());
    }

    private static String str(String v) {
        return v == null ? "" : v.trim();
    }

    private static String digits(String raw) {
        if (raw == null) return "";
        return raw.replaceAll("\\D", "");
    }
}

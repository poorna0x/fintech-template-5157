package com.hydrogenro.technician;

import android.content.Context;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Known local customer is ringing this technician. Tell admin phones now.
 * Does not touch the hang-up upload (missed call / active job stay there).
 */
final class RingAlert {

    private static final String TAG = "HroRingAlert";
    private static final String URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-ring-alert";
    private static final long DEDUPE_MS = 3 * 60 * 1000L;
    private static String lastKey = "";
    private static long lastAt = 0L;

    private RingAlert() {}

    static void send(Context context, String name, String rawNumber) {
        if (context == null || name == null || name.trim().isEmpty()) return;
        String phone = CallerDirectoryDb.phoneKey(rawNumber);
        if (phone.isEmpty()) return;
        String token = DevicePrefsPlugin.readFcmToken(context);
        if (token == null || token.length() < 20) {
            Log.i(TAG, "No FCM token — skip ring push");
            return;
        }
        long now = System.currentTimeMillis();
        synchronized (RingAlert.class) {
            if (phone.equals(lastKey) && now - lastAt < DEDUPE_MS) return;
            lastKey = phone;
            lastAt = now;
        }
        final String safeName = name.trim();
        final String safeToken = token.trim();
        try {
            post(safeToken, phone, safeName);
        } catch (Exception e) {
            Log.w(TAG, "Ring push failed: " + e.getMessage());
        }
    }

    private static void post(String token, String phone, String name) throws Exception {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + escape(token) + "\"," +
                "\"number\":\"" + escape(phone) + "\"," +
                "\"name\":\"" + escape(name) + "\"}";
            conn = (HttpURLConnection) new URL(URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(4_000);
            conn.setReadTimeout(5_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            Log.i(TAG, "Ring push code=" + code);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

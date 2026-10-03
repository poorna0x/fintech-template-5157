package com.hydrogenro.technician;

import android.content.Context;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Known local customer on this technician's phone. Tell admin phones with
 * that name — ringing now, or missed — without a customer-database lookup.
 */
final class RingAlert {

    private static final String TAG = "HroRingAlert";
    private static final String URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-ring-alert";
    private static final long DEDUPE_MS = 3 * 60 * 1000L;
    private static String lastRingKey = "";
    private static long lastRingAt = 0L;
    private static String lastMissedKey = "";
    private static long lastMissedAt = 0L;

    private RingAlert() {}

    static void send(Context context, String name, String rawNumber) {
        send(context, name, rawNumber, false);
    }

    static void send(Context context, String name, String rawNumber, boolean missed) {
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
            if (missed) {
                if (phone.equals(lastMissedKey) && now - lastMissedAt < DEDUPE_MS) return;
                lastMissedKey = phone;
                lastMissedAt = now;
            } else {
                if (phone.equals(lastRingKey) && now - lastRingAt < DEDUPE_MS) return;
                lastRingKey = phone;
                lastRingAt = now;
            }
        }
        final String safeName = name.trim();
        final String safeToken = token.trim();
        boolean ok = false;
        try {
            int code = post(safeToken, phone, safeName, missed);
            ok = code >= 200 && code < 300;
        } catch (Exception e) {
            Log.w(TAG, "Ring push failed: " + e.getMessage());
        }
        if (!ok) clearSent(phone, missed);
    }

    private static void clearSent(String phone, boolean missed) {
        synchronized (RingAlert.class) {
            if (missed) {
                if (phone.equals(lastMissedKey)) {
                    lastMissedKey = "";
                    lastMissedAt = 0L;
                }
            } else if (phone.equals(lastRingKey)) {
                lastRingKey = "";
                lastRingAt = 0L;
            }
        }
    }

    static boolean alreadySent(String phone, boolean missed) {
        if (phone == null || phone.isEmpty()) return false;
        long now = System.currentTimeMillis();
        synchronized (RingAlert.class) {
            if (missed) return phone.equals(lastMissedKey) && now - lastMissedAt < DEDUPE_MS;
            return phone.equals(lastRingKey) && now - lastRingAt < DEDUPE_MS;
        }
    }

    private static int post(String token, String phone, String name, boolean missed) throws Exception {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + escape(token) + "\"," +
                "\"number\":\"" + escape(phone) + "\"," +
                "\"name\":\"" + escape(name) + "\"," +
                "\"missed\":" + missed + "}";
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
            return code;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String escape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}

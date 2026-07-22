package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import android.util.Log;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Silent caller check: when the technician's phone rings, POST the number to
 * tech-call-customer-alert (authenticated by this device's FCM token). The
 * server notifies ADMINS if the caller is a known customer. Nothing is shown
 * on the technician's phone — no notification, no UI, no local record beyond
 * a dedupe timestamp.
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    // Shared with RecentCallPlugin (search dialog "did this customer just call?").
    static final String PREFS = "hro_call_alert";
    static final String KEY_LAST_NUMBER = "last_number";
    static final String KEY_LAST_AT = "last_at";
    static final String KEY_CONSUMED_AT = "consumed_at";
    /** Same number ringing again within this window (missed-call retries) is skipped. */
    private static final long DEDUPE_WINDOW_MS = 10 * 60_000L;

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;
        // Mute is enforced on the server (call_alerts_enabled). Do not gate on
        // native SharedPreferences — stale "off" blocked rings while search worked.

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (!TelephonyManager.EXTRA_STATE_RINGING.equals(state)) return;

        // Android 9+ sends this broadcast twice; only the one for READ_CALL_LOG
        // holders carries the number.
        String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        if (number == null || number.trim().isEmpty()) return;
        final String cleaned = number.trim();

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        String lastNumber = prefs.getString(KEY_LAST_NUMBER, null);
        long lastAt = prefs.getLong(KEY_LAST_AT, 0L);
        if (cleaned.equals(lastNumber) && now - lastAt < DEDUPE_WINDOW_MS) return;
        prefs.edit().putString(KEY_LAST_NUMBER, cleaned).putLong(KEY_LAST_AT, now).apply();

        final PendingResult pending = goAsync();
        final Context app = context.getApplicationContext();
        try {
            final String stored = DevicePrefsPlugin.readFcmToken(app);
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(fresh -> {
                    List<String> tokens = new ArrayList<>();
                    // Fresh first (matches DB after login). Stored as fallback if
                    // getToken rotated ahead of re-register (or vice versa).
                    if (fresh != null && fresh.length() >= 20) tokens.add(fresh.trim());
                    if (stored != null && stored.length() >= 20 && !tokens.contains(stored)) {
                        tokens.add(stored);
                    }
                    if (tokens.isEmpty()) {
                        pending.finish();
                        return;
                    }
                    postAlertTryTokens(app, tokens, cleaned, pending);
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed: " + e.getMessage());
                    if (stored != null) {
                        List<String> tokens = new ArrayList<>();
                        tokens.add(stored);
                        postAlertTryTokens(app, tokens, cleaned, pending);
                    } else {
                        pending.finish();
                    }
                });
        } catch (Exception e) {
            Log.w(TAG, "Call alert threw: " + e.getMessage());
            pending.finish();
        }
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void postAlertTryTokens(
        Context context,
        List<String> tokens,
        String number,
        PendingResult pending
    ) {
        new Thread(() -> {
            try {
                for (String token : tokens) {
                    int code = postOnce(token, number);
                    Log.i(TAG, "Alert POST code=" + code + " tokenLen=" + token.length());
                    if (code == 401) continue; // try next token
                    if (code >= 200 && code < 300) {
                        DevicePrefsPlugin.saveFcmToken(context, token);
                    }
                    break;
                }
            } catch (Exception e) {
                Log.w(TAG, "Alert POST failed: " + e.getMessage());
            } finally {
                pending.finish();
            }
        }).start();
    }

    /** @return HTTP status, or -1 on I/O failure */
    private int postOnce(String token, String number) {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + jsonEscape(token) + "\"," +
                "\"number\":\"" + jsonEscape(number) + "\"}";
            conn = (HttpURLConnection) new URL(ALERT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            InputStream stream =
                code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream != null) {
                try (BufferedReader br =
                    new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    Log.i(TAG, "Alert body: " + sb);
                }
            }
            return code;
        } catch (Exception e) {
            Log.w(TAG, "postOnce failed: " + e.getMessage());
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

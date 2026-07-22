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
 * When the technician phone rings (or the call ends), capture the caller and
 * POST to tech-call-customer-alert so admins are notified for known customers.
 *
 * Fast path (same idea as admin CallCaptureReceiver):
 *  - Android often fires RINGING twice — once without EXTRA_INCOMING_NUMBER,
 *    once with it. Wait for the numbered broadcast; do NOT sleep 6s on CallLog.
 *  - Truecaller / some OEMs never put the number in EXTRA — then CallLog on
 *    IDLE (after the dialer writes the row) is the fallback.
 *
 * Deduping is per ring session only (not per phone for minutes): same number
 * calling again right after hang-up notifies again. Double RINGING + IDLE for
 * one call still posts once.
 *
 * POST uses the stored FCM token immediately; refresh token in the background.
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    static final String PREFS = "hro_call_alert";
    static final String KEY_LAST_NUMBER = "last_number";
    static final String KEY_LAST_AT = "last_at";
    static final String KEY_CONSUMED_AT = "consumed_at";
    private static final String KEY_RING_SEEN_AT = "ring_seen_at";
    /** Ring session already POSTed — collapses double RINGING + IDLE. */
    private static final String KEY_ALERTED_RING_AT = "alerted_ring_at";

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            long now = System.currentTimeMillis();
            long existingRing = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            // Keep one ring-id for the whole call (don't rewrite on 2nd RINGING).
            if (existingRing <= 0 || now - existingRing > 30 * 60_000L) {
                prefs.edit().putLong(KEY_RING_SEEN_AT, now).apply();
            }

            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            if (number == null || number.trim().isEmpty()) {
                number = CallLogHelper.latestIncomingNumber(
                    app,
                    System.currentTimeMillis() - 15_000L
                );
                if (number == null || number.trim().isEmpty()) {
                    Log.i(TAG, "RINGING without number — waiting for numbered RINGING or IDLE");
                    return;
                }
            }

            handleCaller(app, number.trim());
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) return;
            if (System.currentTimeMillis() - ringAt > 30 * 60_000L) {
                prefs.edit().remove(KEY_RING_SEEN_AT).remove(KEY_ALERTED_RING_AT).apply();
                return;
            }

            final PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    Thread.sleep(400);
                    String fromLog = CallLogHelper.latestIncomingNumber(
                        app,
                        ringAt - 5_000L
                    );
                    if (fromLog != null && !fromLog.isEmpty()) {
                        handleCaller(app, fromLog);
                    } else {
                        Log.w(TAG, "IDLE after ring but call log empty");
                    }
                } catch (Exception e) {
                    Log.w(TAG, "IDLE call-log read failed: " + e.getMessage());
                } finally {
                    // End of call — next RINGING is a new session (same number OK).
                    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .remove(KEY_RING_SEEN_AT)
                        .remove(KEY_ALERTED_RING_AT)
                        .apply();
                    pending.finish();
                }
            }).start();
        }
    }

    /** Save locally (for JWT backup) and POST once per ring session. */
    static void handleCaller(Context context, String cleaned) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        cleaned = cleaned.trim();

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
        if (ringAt <= 0) {
            ringAt = now;
            prefs.edit().putLong(KEY_RING_SEEN_AT, ringAt).apply();
        }

        long alertedFor = prefs.getLong(KEY_ALERTED_RING_AT, 0L);
        if (alertedFor == ringAt) {
            Log.i(TAG, "Dedupe skip — already alerted this ring session");
            return;
        }

        prefs
            .edit()
            .putLong(KEY_ALERTED_RING_AT, ringAt)
            .putString(KEY_LAST_NUMBER, cleaned)
            .putLong(KEY_LAST_AT, now)
            .remove(KEY_CONSUMED_AT)
            .apply();

        final String number = cleaned;
        final String stored = DevicePrefsPlugin.readFcmToken(context);

        if (stored != null && stored.length() >= 20) {
            List<String> list = new ArrayList<>();
            list.add(stored.trim());
            postAlertTryTokens(context, list, number);
        }

        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(fresh -> {
                    if (fresh != null && fresh.length() >= 20) {
                        DevicePrefsPlugin.saveFcmToken(context, fresh.trim());
                        if (stored == null || stored.length() < 20) {
                            List<String> tokens = new ArrayList<>();
                            tokens.add(fresh.trim());
                            postAlertTryTokens(context, tokens, number);
                        }
                    }
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed: " + e.getMessage());
                    if (stored == null || stored.length() < 20) {
                        Log.w(TAG, "No FCM token available to POST call alert");
                    }
                });
        } catch (Exception e) {
            Log.w(TAG, "handleCaller threw: " + e.getMessage());
        }
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static void postAlertTryTokens(Context context, List<String> tokens, String number) {
        new Thread(() -> {
            for (String token : tokens) {
                int code = postOnce(token, number);
                Log.i(TAG, "Alert POST code=" + code + " tokenLen=" + token.length());
                if (code == 401) continue;
                if (code >= 200 && code < 300) {
                    DevicePrefsPlugin.saveFcmToken(context, token);
                }
                break;
            }
        }).start();
    }

    private static int postOnce(String token, String number) {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + jsonEscape(token) + "\"," +
                "\"number\":\"" + jsonEscape(number) + "\"}";
            conn = (HttpURLConnection) new URL(ALERT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
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

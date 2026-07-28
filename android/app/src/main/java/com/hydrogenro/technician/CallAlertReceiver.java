package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Detects customer calls on the technician phone and uploads so admins get FCM.
 *
 * Closed-app reliability layers:
 * 1) goAsync + sync POST when EXTRA/CallLog already has the number
 * 2) {@link CallAlertUploadService} foreground short-service (CallLog poll + POST)
 * 3) AlarmManager kicks ({@link CallAlertKickReceiver}) if FGS start was blocked
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    static final String PREFS = "hro_call_alert";
    static final String KEY_LAST_NUMBER = "last_number";
    static final String KEY_LAST_AT = "last_at";
    static final String KEY_CONSUMED_AT = "consumed_at";
    static final String KEY_RING_SEEN_AT = "ring_seen_at";
    static final String KEY_ALERTED_RING_AT = "alerted_ring_at";
    static final String KEY_PENDING_RING_AT = "pending_ring_at";
    static final String KEY_PENDING_NUMBER = "pending_number";
    private static final String KEY_IN_CALL = "in_call";
    private static final String KEY_POST_INFLIGHT_RING = "post_inflight_ring";

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Outgoing wrong-company-line check (independent of incoming admin alert).
        WrongLineCallReceiver.onPhoneState(app, state);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            long now = System.currentTimeMillis();
            boolean wasInCall = prefs.getBoolean(KEY_IN_CALL, false);
            long existingRing = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            long ringAt;
            // Same ringing episode can fire RINGING multiple times — reuse id.
            // After IDLE, always mint a new ring session so re-calls notify again.
            if (
                wasInCall &&
                existingRing > 0 &&
                prefs.getLong(KEY_ALERTED_RING_AT, 0L) != existingRing &&
                now - existingRing < 10 * 60_000L
            ) {
                ringAt = existingRing;
            } else {
                ringAt = now;
                prefs
                    .edit()
                    .putLong(KEY_RING_SEEN_AT, ringAt)
                    .putBoolean(KEY_IN_CALL, true)
                    .apply();
            }

            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            if (number == null || number.trim().isEmpty()) {
                number = CallLogHelper.latestIncomingNumber(app, ringAt - 5_000L);
            }

            if (number != null && !number.trim().isEmpty()) {
                persistPending(prefs, number.trim(), now);
                final String n = number.trim();
                final long ra = ringAt;
                final PendingResult pending = goAsync();
                new Thread(() -> {
                    try {
                        uploadCallerNow(app, n, ra);
                        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) != ra) {
                            CallAlertUploadService.startUpload(app, n, ra);
                        }
                    } finally {
                        pending.finish();
                    }
                }).start();
                return;
            }

            // No number yet — FGS + alarm kicks poll CallLog with app killed.
            CallAlertUploadService.startWatch(app, ringAt);
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            prefs.edit().putBoolean(KEY_IN_CALL, true).apply();
            long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt > 0 && prefs.getLong(KEY_ALERTED_RING_AT, 0L) != ringAt) {
                CallAlertUploadService.startWatch(app, ringAt);
            }
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            prefs.edit().putBoolean(KEY_IN_CALL, false).apply();
            long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) {
                ringAt = prefs.getLong(KEY_PENDING_RING_AT, 0L);
            }
            if (ringAt <= 0) return;
            if (System.currentTimeMillis() - ringAt > 30 * 60_000L) {
                prefs.edit().remove(KEY_RING_SEEN_AT).apply();
                CallAlertUploadService.cancelKicks(app, ringAt);
                return;
            }
            if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                prefs.edit().remove(KEY_RING_SEEN_AT).apply();
                CallAlertUploadService.cancelKicks(app, ringAt);
                return;
            }
            // Keep ring_seen_at until upload succeeds so watch/kicks share one session.
            CallAlertUploadService.startWatch(app, ringAt);
        }
    }

    private static void persistPending(SharedPreferences prefs, String number, long now) {
        prefs
            .edit()
            .putString(KEY_LAST_NUMBER, number)
            .putLong(KEY_LAST_AT, now)
            .putString(KEY_PENDING_NUMBER, number)
            .remove(KEY_CONSUMED_AT)
            .apply();
    }

    /** Synchronous HTTP upload (called from FGS / goAsync / alarm kick). */
    static void uploadCallerNow(Context context, String cleaned, long ringAt) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
        cleaned = cleaned.trim();

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (ringAt <= 0) {
            ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) ringAt = prefs.getLong(KEY_PENDING_RING_AT, 0L);
            if (ringAt <= 0) ringAt = now;
        }

        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
            Log.i(TAG, "Upload skip — already alerted");
            CallAlertUploadService.cancelKicks(context, ringAt);
            return;
        }
        long inflight = prefs.getLong(KEY_POST_INFLIGHT_RING, 0L);
        long lastAt = prefs.getLong(KEY_LAST_AT, 0L);
        if (inflight == ringAt && now - lastAt < 20_000L) {
            Log.i(TAG, "Upload skip — already in flight");
            return;
        }

        prefs
            .edit()
            .putLong(KEY_POST_INFLIGHT_RING, ringAt)
            .putLong(KEY_PENDING_RING_AT, ringAt)
            .putString(KEY_LAST_NUMBER, cleaned)
            .putString(KEY_PENDING_NUMBER, cleaned)
            .putLong(KEY_LAST_AT, now)
            .remove(KEY_CONSUMED_AT)
            .apply();

        String token = DevicePrefsPlugin.readFcmToken(context);
        if (token == null || token.length() < 20) {
            try {
                token =
                    Tasks.await(
                        FirebaseMessaging.getInstance().getToken(),
                        8,
                        TimeUnit.SECONDS
                    );
                if (token != null && token.length() >= 20) {
                    DevicePrefsPlugin.saveFcmToken(context, token.trim());
                    token = token.trim();
                }
            } catch (Exception e) {
                Log.w(TAG, "getToken failed: " + e.getMessage());
                token = null;
            }
        }

        if (token == null || token.length() < 20) {
            Log.w(TAG, "No FCM token — upload aborted");
            clearInflight(context, ringAt);
            return;
        }

        int code = postOnce(token, cleaned);
        Log.i(TAG, "Alert POST code=" + code);
        if (code == 401) {
            try {
                String fresh =
                    Tasks.await(
                        FirebaseMessaging.getInstance().getToken(),
                        8,
                        TimeUnit.SECONDS
                    );
                if (fresh != null && fresh.length() >= 20) {
                    code = postOnce(fresh.trim(), cleaned);
                    Log.i(TAG, "Alert POST retry fresh code=" + code);
                    if (code >= 200 && code < 300) {
                        DevicePrefsPlugin.saveFcmToken(context, fresh.trim());
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Fresh token retry failed: " + e.getMessage());
            }
        }

        if (code >= 200 && code < 300) {
            markAlerted(context, ringAt);
            Log.i(TAG, "Alert upload OK (closed-app safe)");
        } else {
            clearInflight(context, ringAt);
            Log.w(TAG, "Alert upload failed");
        }
    }

    private static void clearInflight(Context context, long ringAt) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getLong(KEY_POST_INFLIGHT_RING, 0L) == ringAt) {
            prefs.edit().remove(KEY_POST_INFLIGHT_RING).apply();
        }
    }

    private static void markAlerted(Context context, long ringAt) {
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_ALERTED_RING_AT, ringAt)
            .remove(KEY_POST_INFLIGHT_RING)
            .remove(KEY_RING_SEEN_AT)
            .apply();
        CallAlertUploadService.cancelKicks(context, ringAt);
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
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

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
 * Capture incoming caller and upload so admins get a push.
 *
 * When the tech app is open, JS JWT backup is fast. When the app is killed,
 * this receiver must finish the HTTP POST before Android freezes the process —
 * so we enqueue {@link CallAlertUploadService} (sticky) and also use goAsync
 * for CallLog polling.
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    static final String PREFS = "hro_call_alert";
    static final String KEY_LAST_NUMBER = "last_number";
    static final String KEY_LAST_AT = "last_at";
    static final String KEY_CONSUMED_AT = "consumed_at";
    private static final String KEY_RING_SEEN_AT = "ring_seen_at";
    private static final String KEY_ALERTED_RING_AT = "alerted_ring_at";
    private static final String KEY_POLL_RING_AT = "poll_ring_at";
    private static final String KEY_POST_INFLIGHT_RING = "post_inflight_ring";

    private static final long LIVE_POLL_INTERVAL_MS = 400L;
    private static final int LIVE_POLL_MAX_TRIES = 150;
    private static final long POST_CALL_POLL_INTERVAL_MS = 500L;
    private static final int POST_CALL_POLL_MAX_TRIES = 120;

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
            long ringAt = existingRing;
            if (existingRing <= 0 || now - existingRing > 30 * 60_000L) {
                ringAt = now;
                prefs.edit().putLong(KEY_RING_SEEN_AT, ringAt).apply();
            }

            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            if (number == null || number.trim().isEmpty()) {
                number = resolveLiveNumber(app, ringAt);
            }

            if (number != null && !number.trim().isEmpty()) {
                enqueueUpload(app, number.trim(), ringAt);
                return;
            }

            startLiveCallLogPoll(app, ringAt);
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt > 0 && prefs.getLong(KEY_ALERTED_RING_AT, 0L) != ringAt) {
                startLiveCallLogPoll(app, ringAt);
            }
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) return;
            if (System.currentTimeMillis() - ringAt > 30 * 60_000L) {
                clearRingSession(prefs);
                return;
            }

            if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                clearRingSession(prefs);
                return;
            }

            final PendingResult pending = goAsync();
            final long ringAtFinal = ringAt;
            new Thread(() -> {
                try {
                    Log.i(TAG, "Post-call CallLog poll started for ring " + ringAtFinal);
                    for (int i = 0; i < POST_CALL_POLL_MAX_TRIES; i++) {
                        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                        if (p.getLong(KEY_ALERTED_RING_AT, 0L) == ringAtFinal) {
                            Log.i(TAG, "Post-call poll stop — already alerted");
                            return;
                        }
                        String fromLog = resolveLiveNumber(app, ringAtFinal);
                        if (fromLog != null && !fromLog.isEmpty()) {
                            Log.i(TAG, "Post-call got number — uploading via service");
                            enqueueUpload(app, fromLog, ringAtFinal);
                            return;
                        }
                        Thread.sleep(POST_CALL_POLL_INTERVAL_MS);
                    }
                    Log.w(TAG, "Post-call poll timed out — CallLog never had number");
                } catch (Exception e) {
                    Log.w(TAG, "Post-call poll failed: " + e.getMessage());
                } finally {
                    // Keep LAST_NUMBER for JS backup; clear ring session only.
                    // Do NOT clear inflight/alerted here — upload service owns that.
                    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .remove(KEY_RING_SEEN_AT)
                        .remove(KEY_POLL_RING_AT)
                        .apply();
                    pending.finish();
                }
            }).start();
        }
    }

    private static void clearRingSession(SharedPreferences prefs) {
        prefs
            .edit()
            .remove(KEY_RING_SEEN_AT)
            .remove(KEY_ALERTED_RING_AT)
            .remove(KEY_POLL_RING_AT)
            .remove(KEY_POST_INFLIGHT_RING)
            .apply();
    }

    private static String resolveLiveNumber(Context app, long ringAt) {
        long since = ringAt - 5_000L;
        return CallLogHelper.latestIncomingNumber(app, since);
    }

    private void startLiveCallLogPoll(Context app, long ringAt) {
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) return;
        if (prefs.getLong(KEY_POLL_RING_AT, 0L) == ringAt) return;
        prefs.edit().putLong(KEY_POLL_RING_AT, ringAt).apply();

        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                Log.i(TAG, "Live CallLog poll started for ring " + ringAt);
                for (int i = 0; i < LIVE_POLL_MAX_TRIES; i++) {
                    SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                    if (p.getLong(KEY_RING_SEEN_AT, 0L) != ringAt) {
                        Log.i(TAG, "Live poll stop — ring session ended");
                        return;
                    }
                    if (p.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                        Log.i(TAG, "Live poll stop — already alerted");
                        return;
                    }
                    String number = resolveLiveNumber(app, ringAt);
                    if (number != null && !number.isEmpty()) {
                        Log.i(TAG, "Live poll got number — uploading via service");
                        enqueueUpload(app, number, ringAt);
                        return;
                    }
                    Thread.sleep(LIVE_POLL_INTERVAL_MS);
                }
                Log.w(TAG, "Live CallLog poll timed out without number");
            } catch (Exception e) {
                Log.w(TAG, "Live poll failed: " + e.getMessage());
            } finally {
                SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                if (p.getLong(KEY_POLL_RING_AT, 0L) == ringAt) {
                    p.edit().remove(KEY_POLL_RING_AT).apply();
                }
                pending.finish();
            }
        }).start();
    }

    /** Save number + start sticky upload service (safe when app is killed). */
    static void enqueueUpload(Context context, String cleaned, long ringAt) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
        cleaned = cleaned.trim();

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (ringAt <= 0) {
            ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) {
                ringAt = now;
                prefs.edit().putLong(KEY_RING_SEEN_AT, ringAt).apply();
            }
        }

        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
            Log.i(TAG, "Dedupe skip — already alerted this ring");
            return;
        }

        // Persist for JS backup if service is killed before POST returns.
        prefs
            .edit()
            .putString(KEY_LAST_NUMBER, cleaned)
            .putLong(KEY_LAST_AT, now)
            .remove(KEY_CONSUMED_AT)
            .apply();

        CallAlertUploadService.enqueue(context, cleaned, ringAt);
    }

    /**
     * Synchronous upload — called from {@link CallAlertUploadService}.
     * Blocks until HTTP finishes so the service isn't stopped early.
     */
    static void uploadCallerNow(Context context, String cleaned, long ringAt) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
        cleaned = cleaned.trim();

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long now = System.currentTimeMillis();
        if (ringAt <= 0) {
            ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) ringAt = now;
        }

        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
            Log.i(TAG, "Upload skip — already alerted");
            return;
        }
        long inflight = prefs.getLong(KEY_POST_INFLIGHT_RING, 0L);
        long lastAt = prefs.getLong(KEY_LAST_AT, 0L);
        // Allow retry if a previous attempt stalled (process killed mid-POST).
        if (inflight == ringAt && now - lastAt < 20_000L) {
            Log.i(TAG, "Upload skip — already in flight");
            return;
        }

        prefs
            .edit()
            .putLong(KEY_POST_INFLIGHT_RING, ringAt)
            .putString(KEY_LAST_NUMBER, cleaned)
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
            Log.w(TAG, "No FCM token — upload aborted (JS backup if app opens)");
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
            Log.i(TAG, "Alert upload OK");
        } else {
            clearInflight(context, ringAt);
            Log.w(TAG, "Alert upload failed — JS JWT backup when app opens");
        }
    }

    /** @deprecated use enqueueUpload — kept name for older call sites */
    static void handleCaller(Context context, String cleaned) {
        enqueueUpload(context, cleaned, 0L);
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
            .apply();
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

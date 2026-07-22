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
 * When the technician phone rings, capture the caller and POST immediately so
 * admins get a push while the call is still live (if the number is known / in
 * CallLog). Server looks up the customer and only notifies when found.
 *
 * Number sources while live:
 *  1. EXTRA_INCOMING_NUMBER on RINGING (fast — same as admin)
 *  2. CallLog poll every ~750ms during the ring/answered session
 *  3. CallLog once more on IDLE (Truecaller often writes only then)
 *
 * Deduping is per ring session only — same number calling again notifies again.
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
    /** Prevents double POST while first request is in flight (not a long block). */
    private static final String KEY_POST_INFLIGHT_RING = "post_inflight_ring";

    private static final long LIVE_POLL_INTERVAL_MS = 400L;
    private static final int LIVE_POLL_MAX_TRIES = 150; // ~60s while call is live
    /** Truecaller / OEM often write CallLog seconds after hang-up — keep trying. */
    private static final long POST_CALL_POLL_INTERVAL_MS = 500L;
    private static final int POST_CALL_POLL_MAX_TRIES = 120; // ~60s after call ends

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
                handleCaller(app, number.trim());
                return;
            }

            // Number not ready yet — poll CallLog while the call is still live.
            startLiveCallLogPoll(app, ringAt);
            return;
        }

        // Answered: keep ring session; live poll continues until IDLE or alerted.
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
                prefs.edit()
                    .remove(KEY_RING_SEEN_AT)
                    .remove(KEY_ALERTED_RING_AT)
                    .remove(KEY_POLL_RING_AT)
                    .remove(KEY_POST_INFLIGHT_RING)
                    .apply();
                return;
            }

            // Already pushed while live — clear session and stop.
            if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                prefs.edit()
                    .remove(KEY_RING_SEEN_AT)
                    .remove(KEY_ALERTED_RING_AT)
                    .remove(KEY_POLL_RING_AT)
                    .remove(KEY_POST_INFLIGHT_RING)
                    .apply();
                return;
            }

            final PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    // After hang-up: keep polling CallLog — Truecaller often
                    // writes the number only once the call is cut.
                    Log.i(TAG, "Post-call CallLog poll started for ring " + ringAt);
                    for (int i = 0; i < POST_CALL_POLL_MAX_TRIES; i++) {
                        SharedPreferences p =
                            app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                        if (p.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                            Log.i(TAG, "Post-call poll stop — already alerted");
                            return;
                        }
                        String fromLog = resolveLiveNumber(app, ringAt);
                        if (fromLog != null && !fromLog.isEmpty()) {
                            Log.i(TAG, "Post-call got number — searching/pushing");
                            handleCaller(app, fromLog);
                            return;
                        }
                        Thread.sleep(POST_CALL_POLL_INTERVAL_MS);
                    }
                    Log.w(TAG, "Post-call poll timed out — CallLog never had number");
                } catch (Exception e) {
                    Log.w(TAG, "Post-call poll failed: " + e.getMessage());
                } finally {
                    app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .remove(KEY_RING_SEEN_AT)
                        .remove(KEY_ALERTED_RING_AT)
                        .remove(KEY_POLL_RING_AT)
                        .remove(KEY_POST_INFLIGHT_RING)
                        .apply();
                    pending.finish();
                }
            }).start();
        }
    }

    /** Prefer incoming CallLog only (never outgoing dialed numbers). */
    private static String resolveLiveNumber(Context app, long ringAt) {
        long since = ringAt - 5_000L;
        return CallLogHelper.latestIncomingNumber(app, since);
    }

    /**
     * While ringing / on the call, poll CallLog until we get a number and POST
     * (search + admin push if customer exists). One poller per ring session.
     */
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
                        Log.i(TAG, "Live poll got number — searching/pushing while call live");
                        handleCaller(app, number);
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

    /** Save locally and POST. Mark ring alerted only after a successful upload
     *  so a failed FCM auth can retry (JS JWT backup also still works). */
    static void handleCaller(Context context, String cleaned) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
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
        long inflight = prefs.getLong(KEY_POST_INFLIGHT_RING, 0L);
        if (inflight == ringAt) {
            Log.i(TAG, "Dedupe skip — POST already in flight for this ring");
            return;
        }

        // Save number for JS backup immediately; do NOT mark alerted yet.
        prefs
            .edit()
            .putLong(KEY_POST_INFLIGHT_RING, ringAt)
            .putString(KEY_LAST_NUMBER, cleaned)
            .putLong(KEY_LAST_AT, now)
            .remove(KEY_CONSUMED_AT)
            .apply();

        final String number = cleaned;
        final long ringAtFinal = ringAt;
        final String stored = DevicePrefsPlugin.readFcmToken(context);

        // Always try stored first, then refresh token on 401 — every call must upload.
        List<String> tokens = new ArrayList<>();
        if (stored != null && stored.length() >= 20) tokens.add(stored.trim());

        if (!tokens.isEmpty()) {
            postAlertTryTokens(context, tokens, number, ringAtFinal, true);
            return;
        }

        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(fresh -> {
                    if (fresh != null && fresh.length() >= 20) {
                        DevicePrefsPlugin.saveFcmToken(context, fresh.trim());
                        List<String> list = new ArrayList<>();
                        list.add(fresh.trim());
                        postAlertTryTokens(context, list, number, ringAtFinal, false);
                    } else {
                        clearInflight(context, ringAtFinal);
                    }
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed: " + e.getMessage());
                    clearInflight(context, ringAtFinal);
                });
        } catch (Exception e) {
            Log.w(TAG, "handleCaller threw: " + e.getMessage());
            clearInflight(context, ringAtFinal);
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
            .apply();
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static void postAlertTryTokens(
        Context context,
        List<String> tokens,
        String number,
        long ringAt,
        boolean retryFreshOn401
    ) {
        new Thread(() -> {
            boolean ok = false;
            boolean saw401 = false;
            for (String token : tokens) {
                int code = postOnce(token, number);
                Log.i(TAG, "Alert POST code=" + code + " tokenLen=" + token.length());
                if (code == 401) {
                    saw401 = true;
                    continue;
                }
                if (code >= 200 && code < 300) {
                    DevicePrefsPlugin.saveFcmToken(context, token);
                    ok = true;
                }
                break;
            }
            if (!ok && saw401 && retryFreshOn401) {
                try {
                    String fresh =
                        com.google.android.gms.tasks.Tasks.await(
                            FirebaseMessaging.getInstance().getToken(),
                            8,
                            java.util.concurrent.TimeUnit.SECONDS
                        );
                    if (fresh != null && fresh.length() >= 20) {
                        int code = postOnce(fresh.trim(), number);
                        Log.i(TAG, "Alert POST retry fresh code=" + code);
                        if (code >= 200 && code < 300) {
                            DevicePrefsPlugin.saveFcmToken(context, fresh.trim());
                            ok = true;
                        }
                    }
                } catch (Exception e) {
                    Log.w(TAG, "Fresh token retry failed: " + e.getMessage());
                }
            }
            if (ok) {
                markAlerted(context, ringAt);
            } else {
                clearInflight(context, ringAt);
                Log.w(TAG, "Alert POST failed — will allow retry / JS JWT backup");
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

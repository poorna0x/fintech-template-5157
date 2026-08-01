package com.hydrogenro.admin;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.telephony.TelephonyManager;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Caller lookup, step 1: the OS wakes this receiver when the phone rings
 * (works with the app killed). The number is used three ways:
 *
 *  1. Saved locally so THIS device auto-searches it on next open/resume
 *     (IncomingCallPlugin) — zero network.
 *  2. Published to the shared admin board (admin-incoming-call-publish) so
 *     EVERY admin page can auto-search the caller for 1.5 minutes.
 *  3. Missed calls (RINGING → IDLE with no OFFHOOK) POST to
 *     tech-call-customer-alert, pushing "Missed call from customer" if the
 *     number matches a customer.
 *
 * (2) and (3) authenticate with this device's FCM token — same trust model as
 * the technician silent-call flow.
 */
public class CallCaptureReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallCapture";

    static final String PREFS = "hro_incoming_call";
    static final String KEY_NUMBER = "number";
    static final String KEY_AT = "at";
    // Missed-call state machine (separate keys so consuming the auto-search
    // number never breaks missed detection).
    private static final String KEY_RING_NUMBER = "ring_number";
    private static final String KEY_RING_AT = "ring_at";
    private static final String KEY_HAD_RING = "had_ring";
    // Dedupe the shared-board publish — Android may fire RINGING twice.
    private static final String KEY_PUB_NUMBER = "pub_number";
    private static final String KEY_PUB_AT = "pub_at";
    private static final long PUBLISH_DEDUPE_MS = 15_000L;
    /** A ring older than this when IDLE arrives is stale — don't alert. */
    private static final long RING_MAX_AGE_MS = 30 * 60_000L;

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";
    private static final String PUBLISH_URL =
        "https://hydrogenro.com/.netlify/functions/admin-incoming-call-publish";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Always clear ring state when the call ends / is answered, even if
        // detection is off — otherwise a later "detect on" + IDLE can false-fire.
        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            prefs
                .edit()
                .remove(KEY_RING_NUMBER)
                .remove(KEY_RING_AT)
                .remove(KEY_HAD_RING)
                .apply();
            return;
        }

        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) {
            if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
                prefs
                    .edit()
                    .remove(KEY_RING_NUMBER)
                    .remove(KEY_RING_AT)
                    .remove(KEY_HAD_RING)
                    .apply();
            }
            return;
        }

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            // Android 9+ / Truecaller may fire RINGING without EXTRA first.
            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            long now = System.currentTimeMillis();
            SharedPreferences.Editor ed =
                prefs.edit().putBoolean(KEY_HAD_RING, true).putLong(KEY_RING_AT, now);
            if (number != null && !number.trim().isEmpty()) {
                number = number.trim();
                ed.putString(KEY_NUMBER, number)
                    .putLong(KEY_AT, now)
                    .putString(KEY_RING_NUMBER, number);
                ed.apply();

                String lastPub = prefs.getString(KEY_PUB_NUMBER, null);
                long lastPubAt = prefs.getLong(KEY_PUB_AT, 0L);
                if (number.equals(lastPub) && now - lastPubAt < PUBLISH_DEDUPE_MS) return;
                prefs.edit().putString(KEY_PUB_NUMBER, number).putLong(KEY_PUB_AT, now).apply();
                postWithToken(PUBLISH_URL, buildPublishPayload(number), number);
            } else {
                ed.apply();
                Log.i(TAG, "RINGING — no EXTRA yet (Truecaller/OEM); will use CallLog on miss");
            }
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            boolean hadRing = prefs.getBoolean(KEY_HAD_RING, false);
            String ringNumber = prefs.getString(KEY_RING_NUMBER, null);
            long ringAt = prefs.getLong(KEY_RING_AT, 0L);
            prefs
                .edit()
                .remove(KEY_RING_NUMBER)
                .remove(KEY_RING_AT)
                .remove(KEY_HAD_RING)
                .apply();
            if (!hadRing && (ringNumber == null || ringNumber.isEmpty())) return;
            if (ringAt <= 0) ringAt = System.currentTimeMillis();
            if (System.currentTimeMillis() - ringAt > RING_MAX_AGE_MS) return;

            final Context app = context.getApplicationContext();
            final long session = ringAt;
            final String cached = ringNumber;
            final PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    try {
                        Thread.sleep(900);
                    } catch (InterruptedException ignored) {
                        /* continue */
                    }
                    String number = cached;
                    if (number == null || number.isEmpty()) {
                        number = latestMissedNumber(app, session - 15_000L);
                    }
                    if (number == null || number.isEmpty()) {
                        Log.i(TAG, "IDLE missed — no number from EXTRA or CallLog");
                        return;
                    }
                    app
                        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .edit()
                        .putString(KEY_NUMBER, number)
                        .putLong(KEY_AT, System.currentTimeMillis())
                        .apply();
                    postWithTokenSync(ALERT_URL, buildMissedPayload(number), number);
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    /** Latest missed/rejected/incoming CallLog row since {@code sinceEpochMs}. */
    private static String latestMissedNumber(Context context, long sinceEpochMs) {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return null;
        }
        Cursor cursor = null;
        try {
            cursor =
                context
                    .getContentResolver()
                    .query(
                        CallLog.Calls.CONTENT_URI,
                        new String[] { CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DATE },
                        CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + " IN (?,?,?)",
                        new String[] {
                            String.valueOf(sinceEpochMs),
                            String.valueOf(CallLog.Calls.MISSED_TYPE),
                            String.valueOf(CallLog.Calls.REJECTED_TYPE),
                            String.valueOf(CallLog.Calls.INCOMING_TYPE),
                        },
                        CallLog.Calls.DATE + " DESC"
                    );
            if (cursor == null) return null;
            while (cursor.moveToNext()) {
                String number = cursor.getString(0);
                if (number != null && !number.trim().isEmpty()) return number.trim();
            }
            return null;
        } catch (Exception e) {
            Log.w(TAG, "CallLog read failed: " + e.getMessage());
            return null;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static String buildPublishPayload(String number) {
        return "{\"token\":\"%TOKEN%\",\"number\":\"" + jsonEscape(number) + "\"}";
    }

    private static String buildMissedPayload(String number) {
        return "{\"token\":\"%TOKEN%\",\"number\":\"" + jsonEscape(number) + "\",\"missed\":true}";
    }

    /** Fetch the FCM token, substitute it into the payload template, and POST. */
    private void postWithToken(String url, String payloadTemplate, String label) {
        final PendingResult pending = goAsync();
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(token -> {
                    if (token == null || token.length() < 20) {
                        pending.finish();
                        return;
                    }
                    String payload = payloadTemplate.replace("%TOKEN%", jsonEscape(token));
                    post(url, payload, pending);
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed (" + label + "): " + e.getMessage());
                    pending.finish();
                });
        } catch (Exception e) {
            Log.w(TAG, "Call POST threw (" + label + "): " + e.getMessage());
            pending.finish();
        }
    }

    /** Blocking token+POST for threads that already hold goAsync(). */
    private void postWithTokenSync(String url, String payloadTemplate, String label) {
        HttpURLConnection conn = null;
        try {
            String token =
                com.google.android.gms.tasks.Tasks.await(
                    FirebaseMessaging.getInstance().getToken(),
                    8,
                    java.util.concurrent.TimeUnit.SECONDS
                );
            if (token == null || token.length() < 20) {
                Log.w(TAG, "No FCM token for missed POST (" + label + ")");
                return;
            }
            String payload = payloadTemplate.replace("%TOKEN%", jsonEscape(token));
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            Log.i(TAG, "POST sync code=" + conn.getResponseCode() + " (" + label + ")");
        } catch (Exception e) {
            Log.w(TAG, "Call POST sync failed (" + label + "): " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void post(String url, String payload, PendingResult pending) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                }
                int code = conn.getResponseCode();
                Log.i(TAG, "POST code=" + code + " url=" + url);
            } catch (Exception e) {
                Log.w(TAG, "Call POST failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                pending.finish();
            }
        }).start();
    }
}

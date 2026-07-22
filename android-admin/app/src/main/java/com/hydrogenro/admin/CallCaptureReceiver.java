package com.hydrogenro.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import android.util.Log;
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
 *     EVERY admin page can auto-search the caller for 3 minutes.
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
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            // Android 9+ sends this broadcast twice: once without the number
            // and once with it (for apps holding READ_CALL_LOG).
            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            if (number == null || number.trim().isEmpty()) return;
            number = number.trim();
            long now = System.currentTimeMillis();
            prefs
                .edit()
                .putString(KEY_NUMBER, number)
                .putLong(KEY_AT, now)
                .putString(KEY_RING_NUMBER, number)
                .putLong(KEY_RING_AT, now)
                .apply();

            // Publish to the shared admin board (once per call).
            String lastPub = prefs.getString(KEY_PUB_NUMBER, null);
            long lastPubAt = prefs.getLong(KEY_PUB_AT, 0L);
            if (number.equals(lastPub) && now - lastPubAt < PUBLISH_DEDUPE_MS) return;
            prefs.edit().putString(KEY_PUB_NUMBER, number).putLong(KEY_PUB_AT, now).apply();
            postWithToken(PUBLISH_URL, buildPublishPayload(number), number);
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            // Answered — not a missed call.
            prefs.edit().remove(KEY_RING_NUMBER).remove(KEY_RING_AT).apply();
            return;
        }

        if (TelephonyManager.EXTRA_STATE_IDLE.equals(state)) {
            String ringNumber = prefs.getString(KEY_RING_NUMBER, null);
            long ringAt = prefs.getLong(KEY_RING_AT, 0L);
            prefs.edit().remove(KEY_RING_NUMBER).remove(KEY_RING_AT).apply();
            if (ringNumber == null || ringNumber.isEmpty()) return;
            if (System.currentTimeMillis() - ringAt > RING_MAX_AGE_MS) return;
            postWithToken(ALERT_URL, buildMissedPayload(ringNumber), ringNumber);
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
                conn.getResponseCode();
            } catch (Exception e) {
                Log.w(TAG, "Call POST failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                pending.finish();
            }
        }).start();
    }
}

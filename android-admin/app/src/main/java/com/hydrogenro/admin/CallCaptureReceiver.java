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
 * (works with the app killed). The caller's number is persisted locally —
 * no network, no service — and the dashboard consumes it via
 * IncomingCallPlugin on the next open/resume to auto-search the customer.
 *
 * Missed calls additionally notify every admin device: RINGING followed by
 * IDLE with no OFFHOOK in between means nobody answered — POST the number to
 * tech-call-customer-alert (authenticated by this device's FCM token), which
 * pushes "Missed call from customer" if the number matches a customer.
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
    /** A ring older than this when IDLE arrives is stale — don't alert. */
    private static final long RING_MAX_AGE_MS = 30 * 60_000L;

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            // Android 9+ sends this broadcast twice: once without the number
            // and once with it (for apps holding READ_CALL_LOG).
            String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
            if (number == null || number.trim().isEmpty()) return;
            long now = System.currentTimeMillis();
            prefs
                .edit()
                .putString(KEY_NUMBER, number.trim())
                .putLong(KEY_AT, now)
                .putString(KEY_RING_NUMBER, number.trim())
                .putLong(KEY_RING_AT, now)
                .apply();
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
            sendMissedCallAlert(ringNumber);
        }
    }

    private void sendMissedCallAlert(String number) {
        final PendingResult pending = goAsync();
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(token -> {
                    if (token == null || token.length() < 20) {
                        pending.finish();
                        return;
                    }
                    postAlert(token, number, pending);
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed: " + e.getMessage());
                    pending.finish();
                });
        } catch (Exception e) {
            Log.w(TAG, "Missed-call alert threw: " + e.getMessage());
            pending.finish();
        }
    }

    private static String jsonEscape(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void postAlert(String token, String number, PendingResult pending) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String payload =
                    "{\"token\":\"" + jsonEscape(token) + "\"," +
                    "\"number\":\"" + jsonEscape(number) + "\"," +
                    "\"missed\":true}";
                conn = (HttpURLConnection) new URL(ALERT_URL).openConnection();
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
                Log.w(TAG, "Missed-call POST failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                pending.finish();
            }
        }).start();
    }
}

package com.hydrogenro.technician;

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
 * Silent caller check: when the technician's phone rings, POST the number to
 * tech-call-customer-alert (authenticated by this device's FCM token). The
 * server notifies ADMINS if the caller is a known customer. Nothing is shown
 * on the technician's phone — no notification, no UI, no local record beyond
 * a dedupe timestamp.
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    // Shared with RecentCallPlugin (search dialog "did they just call?" prompt).
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
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (!TelephonyManager.EXTRA_STATE_RINGING.equals(state)) return;

        // Android 9+ sends the broadcast twice; only the one for READ_CALL_LOG
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

        // Keep the process alive while we fetch the FCM token and POST.
        final PendingResult pending = goAsync();
        try {
            // Prefer the token last saved to the server (SharedPreferences) so
            // ring-time auth matches technician_push_tokens. Fresh getToken()
            // can race a rotation and 401 before re-register.
            String stored = DevicePrefsPlugin.readFcmToken(context);
            if (stored != null) {
                postAlert(stored, cleaned, pending);
                return;
            }
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(token -> {
                    if (token == null || token.length() < 20) {
                        pending.finish();
                        return;
                    }
                    DevicePrefsPlugin.saveFcmToken(context, token);
                    postAlert(token, cleaned, pending);
                })
                .addOnFailureListener(e -> {
                    Log.w(TAG, "FCM token fetch failed: " + e.getMessage());
                    pending.finish();
                });
        } catch (Exception e) {
            Log.w(TAG, "Call alert threw: " + e.getMessage());
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
                conn.getResponseCode();
            } catch (Exception e) {
                Log.w(TAG, "Alert POST failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
                pending.finish();
            }
        }).start();
    }
}

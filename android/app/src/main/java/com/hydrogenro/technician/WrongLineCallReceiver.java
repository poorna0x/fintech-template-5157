package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
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
 * After an outgoing call ends, if the line used ≠ company phone (profile) and
 * the dialed number is a known customer, POST so tech + admins get FCM.
 */
public class WrongLineCallReceiver {

    private static final String TAG = "HroWrongLine";
    private static final String PREFS = "hro_wrong_line";
    private static final String KEY_OUTGOING = "outgoing";
    private static final String KEY_OUTGOING_AT = "outgoing_at";
    private static final String KEY_WAS_RINGING = "was_ringing";
    private static final String KEY_LAST_ALERT_KEY = "last_alert_key";
    private static final String KEY_LAST_ALERT_AT = "last_alert_at";

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-wrong-line-alert";

    private WrongLineCallReceiver() {}

    /** Hook from {@link CallAlertReceiver} PHONE_STATE changes. */
    static void onPhoneState(Context context, String state) {
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            prefs.edit().putBoolean(KEY_WAS_RINGING, true).putBoolean(KEY_OUTGOING, false).apply();
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            if (!prefs.getBoolean(KEY_WAS_RINGING, false)) {
                prefs
                    .edit()
                    .putBoolean(KEY_OUTGOING, true)
                    .putLong(KEY_OUTGOING_AT, System.currentTimeMillis())
                    .apply();
            }
            return;
        }

        if (!TelephonyManager.EXTRA_STATE_IDLE.equals(state)) return;

        boolean outgoing = prefs.getBoolean(KEY_OUTGOING, false);
        long startedAt = prefs.getLong(KEY_OUTGOING_AT, 0L);
        prefs.edit().putBoolean(KEY_WAS_RINGING, false).putBoolean(KEY_OUTGOING, false).apply();
        if (!outgoing || startedAt <= 0) return;

        // CallLog often lags a beat after IDLE.
        final long since = startedAt - 5_000L;
        new Handler(Looper.getMainLooper())
            .postDelayed(
                () ->
                    new Thread(() -> checkAndUpload(app, since)).start(),
                1500
            );
    }

    private static void checkAndUpload(Context context, long sinceEpochMs) {
        SimLineHelper.OutgoingCall call = SimLineHelper.latestOutgoing(context, sinceEpochMs);
        if (call == null) {
            Log.i(TAG, "No outgoing CallLog row");
            return;
        }
        if (!SimLineHelper.isWrongCompanyLine(context, call.fromNumber)) {
            Log.i(TAG, "Outgoing used company line (or undetectable) — skip");
            return;
        }

        String dialed = SimLineHelper.normalize10(call.dialedNumber);
        String from = SimLineHelper.normalize10(call.fromNumber);
        String company = DevicePrefsPlugin.readCompanyPhone(context);
        if (dialed.isEmpty() || company.isEmpty()) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String dedupeKey = company + "|" + dialed + "|" + from;
        long now = System.currentTimeMillis();
        if (
            dedupeKey.equals(prefs.getString(KEY_LAST_ALERT_KEY, ""))
                && now - prefs.getLong(KEY_LAST_ALERT_AT, 0L) < 15 * 60_000L
        ) {
            Log.i(TAG, "Dedupe skip");
            return;
        }

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
            Log.w(TAG, "No FCM token");
            return;
        }

        int code = postOnce(token, dialed, from, company);
        Log.i(TAG, "Wrong-line POST code=" + code);
        if (code >= 200 && code < 300) {
            prefs
                .edit()
                .putString(KEY_LAST_ALERT_KEY, dedupeKey)
                .putLong(KEY_LAST_ALERT_AT, now)
                .apply();
        }
    }

    private static String jsonEscape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static int postOnce(String token, String dialed, String from, String company) {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + jsonEscape(token) + "\"," +
                "\"number\":\"" + jsonEscape(dialed) + "\"," +
                "\"fromNumber\":\"" + jsonEscape(from) + "\"," +
                "\"companyPhone\":\"" + jsonEscape(company) + "\"}";
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
                    Log.i(TAG, "Body: " + sb);
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

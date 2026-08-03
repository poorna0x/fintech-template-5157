package com.hydrogenro.technician;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Fires after on-site dwell: calls auto-ask-otp-on-site, then shows a local OTP
 * notification (with inline reply when nonce is returned) even if FCM is dead.
 */
public class AutoAskOtpAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "HroAutoAskOtp";
    private static final int COLOR = Color.parseColor("#F59E0B");

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !AutoAskOtpAlarmScheduler.ACTION_FIRE.equals(intent.getAction())) {
                return;
            }
            final String jobId = intent.getStringExtra(AutoAskOtpAlarmScheduler.EXTRA_JOB_ID);
            if (jobId == null || jobId.isEmpty()) return;

            final Context app = context.getApplicationContext();
            final PendingResult pending = goAsync();
            new Thread(
                    () -> {
                        try {
                            fire(app, jobId);
                        } catch (Throwable t) {
                            Log.w(TAG, "fire failed", t);
                            showOpenAppFallback(app, jobId, null);
                        } finally {
                            AutoAskOtpAlarmScheduler.cancel(app, jobId);
                            pending.finish();
                        }
                    })
                .start();
        } catch (Throwable t) {
            Log.w(TAG, "onReceive failed", t);
        }
    }

    private static void fire(Context app, String jobId) throws Exception {
        String raw = AutoAskOtpAlarmScheduler.prefs(app)
            .getString("payload:" + jobId, null);
        if (raw == null || raw.isEmpty()) {
            Log.w(TAG, "no payload for " + jobId);
            return;
        }
        JSONObject payload = new JSONObject(raw);
        String accessToken = payload.optString("accessToken", "");
        String endpointUrl = payload.optString("endpointUrl", "");
        String customerName = payload.optString("customerName", "");
        if (accessToken.isEmpty() || endpointUrl.isEmpty()) {
            showOpenAppFallback(app, jobId, customerName);
            return;
        }

        JSONObject body = new JSONObject();
        body.put("jobId", jobId);
        body.put("near", false);

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(endpointUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + accessToken);
            // Native calls often omit Origin; server allows missing Origin for some paths —
            // auto-ask rejects missing Origin. Send a production Origin.
            conn.setRequestProperty("Origin", "https://hydrogenro.com");
            conn.setDoOutput(true);
            conn.setConnectTimeout(20_000);
            conn.setReadTimeout(20_000);
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            InputStream stream =
                code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream();
            String respText = readAll(stream);
            Log.i(TAG, "auto-ask HTTP " + code + " " + respText);

            JSONObject out = null;
            try {
                out = new JSONObject(respText);
            } catch (Throwable ignored) {
                /* */
            }

            if (out != null) {
                String requestId = out.optString("requestId", "");
                String nonce = out.optString("nonce", "");
                String submitUrl = out.optString("submitUrl", "");
                if (!requestId.isEmpty() && !nonce.isEmpty() && !submitUrl.isEmpty()) {
                    String notifBody =
                        customerName != null && !customerName.isEmpty()
                            ? "Ask " + customerName + " for the code, then tap Enter OTP."
                            : "Ask the customer for the code, then tap Enter OTP.";
                    OtpReplyReceiver.showOtpRequestNotification(
                        app, requestId, nonce, submitUrl, notifBody);
                    return;
                }
                String reason = out.optString("reason", "");
                if ("otp_already_entered".equals(reason)) {
                    return;
                }
                // already_asked / pending: FCM may have failed — still nudge open.
            }

            // Pending ask without nonce in response, or network partial — open-app nudge.
            showOpenAppFallback(app, jobId, customerName);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br =
            new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }

    private static void showOpenAppFallback(Context app, String jobId, String customerName) {
        try {
            NotificationChannels.ensureJobAlerts(app);
            int notifId = Math.abs(("auto_ask_otp:" + jobId).hashCode());
            Intent open = new Intent(app, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent openPi =
                PendingIntent.getActivity(
                    app,
                    notifId,
                    open,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            String body =
                customerName != null && !customerName.isEmpty()
                    ? "Ask " + customerName + " for their 4-digit OTP (open app)."
                    : "Ask the customer for their 4-digit OTP (open app).";

            Notification notification =
                new NotificationCompat.Builder(app, NotificationChannels.JOB_ALERTS)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setColor(COLOR)
                    .setContentTitle("OTP needed")
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setAutoCancel(true)
                    .setContentIntent(openPi)
                    .build();
            NotificationManagerCompat.from(app).notify(notifId, notification);
        } catch (Throwable t) {
            Log.w(TAG, "fallback notification failed", t);
        }
    }
}

package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Fires after on-site dwell: calls auto-ask-otp-on-site. Shows the on-screen
 * OTP overlay (and a replyable tray only if FCM did not already send one).
 * Never posts the old "OTP needed / open app" fallback — that duplicated FCM.
 */
public class AutoAskOtpAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "HroAutoAskOtp";

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
            .getString(AutoAskOtpAlarmScheduler.keyPayload(jobId), null);
        if (raw == null || raw.isEmpty()) {
            // Payload cleared after cron/FCM claimed — nothing else to post.
            Log.i(TAG, "no payload for " + jobId + " — skip (FCM path owns UI)");
            return;
        }
        JSONObject payload = new JSONObject(raw);
        String accessToken = payload.optString("accessToken", "");
        String endpointUrl = payload.optString("endpointUrl", "");
        String customerName = payload.optString("customerName", "");
        if (accessToken.isEmpty() || endpointUrl.isEmpty()) {
            Log.w(TAG, "missing token/url for " + jobId);
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

            if (code == 401 || code == 403) {
                Log.w(TAG, "auth failed for " + jobId + " — no open-app fallback");
                return;
            }

            JSONObject out = null;
            try {
                out = new JSONObject(respText);
            } catch (Throwable ignored) {
                /* */
            }
            if (out == null) return;

            String reason = out.optString("reason", "");
            // Cron/JS already claimed — FCM (or prior ask) owns the tray + overlay.
            if (out.optBoolean("skipped", false)
                || "already_asked".equals(reason)
                || "ask_already_pending".equals(reason)
                || "otp_already_on_request".equals(reason)
                || "otp_already_entered".equals(reason)) {
                return;
            }

            String requestId = out.optString("requestId", "");
            String nonce = out.optString("nonce", "");
            String submitUrl = out.optString("submitUrl", "");
            if (requestId.isEmpty() || nonce.isEmpty() || submitUrl.isEmpty()) {
                return;
            }

            String notifBody =
                customerName != null && !customerName.isEmpty()
                    ? "Ask " + customerName + " for the code, then tap Enter OTP."
                    : "Ask the customer for the code, then tap Enter OTP.";
            // If FCM already delivered the replyable tray, don't post a second one.
            boolean fcmSent = out.optBoolean("sent", false);
            if (!fcmSent) {
                OtpReplyReceiver.showOtpRequestNotification(
                    app, requestId, nonce, submitUrl, notifBody);
            }
            java.util.HashMap<String, String> overlayData = new java.util.HashMap<>();
            overlayData.put("showOverlay", "1");
            overlayData.put("type", "otp_request");
            overlayData.put("requestId", requestId);
            overlayData.put("nonce", nonce);
            overlayData.put("submitUrl", submitUrl);
            overlayData.put("title", "Office needs the customer's OTP");
            overlayData.put("body", notifBody);
            if (customerName != null && !customerName.isEmpty()) {
                overlayData.put("customerName", customerName);
                overlayData.put("msgTitle", "OTP — " + customerName);
            }
            TechActionOverlay.maybeShowFromPush(app, TechActionOverlay.Mode.OTP, overlayData);
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
}

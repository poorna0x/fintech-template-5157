package com.hydrogenro.technician;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Handles the code typed into the OTP notification's inline reply field
 * (see HroMessagingService). Validates it's 4 digits, uploads it to
 * submit-tech-otp (authenticated by the push's one-time nonce), then swaps
 * the notification for a success/failure message.
 */
public class OtpReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "HroOtpReply";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_PENDING = Color.parseColor("#F59E0B");
    private static final int COLOR_SUCCESS = Color.parseColor("#16A34A");

    public static final String ACTION_REPLY = "com.hydrogenro.technician.OTP_REPLY";
    public static final String KEY_OTP = "otp";
    public static final String EXTRA_REQUEST_ID = "requestId";
    public static final String EXTRA_NONCE = "nonce";
    public static final String EXTRA_SUBMIT_URL = "submitUrl";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    /** Stable per-request id so a re-ask replaces the previous notification. */
    public static int notificationIdFor(String requestId) {
        return 0x0709 ^ requestId.hashCode();
    }

    /**
     * Notification with an inline "Enter OTP" reply field. Typing the code
     * fires this receiver — no need to open the app. Tapping the body still
     * opens the app (the in-app card is the fallback). Used for the initial
     * push and re-shown when the typed code isn't 4 digits.
     */
    public static void showOtpRequestNotification(
        Context context,
        String requestId,
        String nonce,
        String submitUrl,
        String body
    ) {
        // Data-only pushes can arrive before MainActivity ever ran.
        NotificationChannels.ensureJobAlerts(context);

        int notificationId = notificationIdFor(requestId);

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_OTP)
            .setLabel("4-digit code")
            .build();

        Intent replyIntent = new Intent(context, OtpReplyReceiver.class)
            .setAction(ACTION_REPLY)
            .putExtra(EXTRA_REQUEST_ID, requestId)
            .putExtra(EXTRA_NONCE, nonce)
            .putExtra(EXTRA_SUBMIT_URL, submitUrl)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        // FLAG_MUTABLE is required for the system to attach the typed text.
        PendingIntent replyPending = PendingIntent.getBroadcast(
            context,
            notificationId,
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT |
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0)
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify, "Enter OTP", replyPending)
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(false)
            .build();

        Intent openIntent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            context,
            notificationId,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_PENDING)
            .setContentTitle("Office needs the customer's OTP")
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .addAction(replyAction)
            .setAutoCancel(false)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !ACTION_REPLY.equals(intent.getAction())) return;

            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence typed = results != null ? results.getCharSequence(KEY_OTP) : null;
            String otp = typed != null ? typed.toString().trim() : "";

            String requestId = intent.getStringExtra(EXTRA_REQUEST_ID);
            String nonce = intent.getStringExtra(EXTRA_NONCE);
            String submitUrl = intent.getStringExtra(EXTRA_SUBMIT_URL);
            int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
            if (requestId == null || nonce == null || submitUrl == null) return;

            if (!otp.matches("\\d{4}")) {
                // Re-show with the reply field so they can correct it right there.
                showOtpRequestNotification(context, requestId, nonce, submitUrl,
                    "The code must be exactly 4 digits — try again.");
                return;
            }

            // Acknowledge immediately so the reply spinner in the notification stops.
            showResult(context, notificationId, "Sending code " + otp + "\u2026", false);

            // goAsync keeps the process alive for the network call (~10s budget).
            final PendingResult pending = goAsync();
            new Thread(() -> {
                boolean ok = false;
                HttpURLConnection conn = null;
                try {
                    String payload = "{\"requestId\":\"" + requestId + "\"," +
                        "\"nonce\":\"" + nonce + "\"," +
                        "\"otp\":\"" + otp + "\"}";
                    conn = (HttpURLConnection) new URL(submitUrl).openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json");
                    conn.setDoOutput(true);
                    conn.setConnectTimeout(10_000);
                    conn.setReadTimeout(10_000);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(payload.getBytes(StandardCharsets.UTF_8));
                    }
                    ok = conn.getResponseCode() == 200;
                    if (!ok) Log.w(TAG, "Submit rejected: HTTP " + conn.getResponseCode());
                } catch (Exception e) {
                    Log.w(TAG, "Submit failed", e);
                }
                finally {
                    if (conn != null) conn.disconnect();
                }

                if (ok) {
                    showResult(context, notificationId, "OTP " + otp + " sent to the office \u2713", true);
                } else {
                    showResult(context, notificationId,
                        "Couldn't send the code — open the app and enter it there.", false);
                }
                pending.finish();
            }).start();
        } catch (Throwable t) {
            Log.w(TAG, "onReceive failed", t);
        }
    }

    private void showResult(Context context, int notificationId, String text, boolean success) {
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(success ? COLOR_SUCCESS : COLOR_PENDING)
            .setContentTitle(success ? "OTP delivered" : "Office needs the customer's OTP")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true)
            .setAutoCancel(success)
            .build();
        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    public interface ResultCallback {
        void onDone(boolean ok);
    }

    /** Same network path as notification Enter OTP — used by TechActionOverlay. */
    public static void submitOtp(
        Context context,
        String requestId,
        String nonce,
        String submitUrl,
        String otp,
        ResultCallback callback
    ) {
        if (requestId == null || nonce == null || submitUrl == null || otp == null || !otp.matches("\\d{4}")) {
            if (callback != null) callback.onDone(false);
            return;
        }
        final int notificationId = notificationIdFor(requestId);
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                String payload = "{\"requestId\":\"" + requestId + "\"," +
                    "\"nonce\":\"" + nonce + "\"," +
                    "\"otp\":\"" + otp + "\"}";
                conn = (HttpURLConnection) new URL(submitUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                }
                ok = conn.getResponseCode() == 200;
            } catch (Exception e) {
                Log.w(TAG, "Overlay OTP submit failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            if (ok) {
                try {
                    NotificationChannels.ensureJobAlerts(context);
                    Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_notify)
                        .setColor(COLOR_SUCCESS)
                        .setContentTitle("OTP delivered")
                        .setContentText("OTP " + otp + " sent to the office \u2713")
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setOnlyAlertOnce(true)
                        .setAutoCancel(true)
                        .build();
                    NotificationManagerCompat.from(context).notify(notificationId, notification);
                } catch (Throwable ignored) {
                    /* */
                }
            }
            if (callback != null) callback.onDone(ok);
        }).start();
    }
}

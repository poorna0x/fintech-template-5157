package com.hydrogenro.admin;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Cash-check notification (nightly "today" or morning "yesterday remaining")
 * and its Yes/No buttons. Both answers POST to cash-check-response (HMAC from
 * the push). No: remind the technician. Yes: clear any pending follow-up.
 */
public class CashCheckReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCashCheck";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_ASK = Color.parseColor("#F59E0B");
    private static final int COLOR_REMINDED = Color.parseColor("#DC2626");
    private static final int COLOR_OK = Color.parseColor("#16A34A");

    private static final String ACTION_RESPOND = "com.hydrogenro.admin.CASH_CHECK_RESPONSE";
    private static final String EXTRA_RESPONSE = "response";
    private static final String EXTRA_TECHNICIAN_ID = "technicianId";
    private static final String EXTRA_TECH_NAME = "techName";
    private static final String EXTRA_AMOUNT = "amount";
    private static final String EXTRA_DATE = "date";
    private static final String EXTRA_SIG = "sig";
    private static final String EXTRA_REPLY_URL = "replyUrl";
    private static final String EXTRA_NOTIFICATION_ID = "notificationId";

    /** Stable per-technician-per-day id so a resend replaces, not duplicates. */
    private static int notificationIdFor(String technicianId, String date) {
        return 0x0CA5 ^ (technicianId + "|" + date).hashCode();
    }

    public static void showCashCheckNotification(Context context, Map<String, String> data) {
        String technicianId = data.get("technicianId");
        String amount = data.get("amount");
        String date = data.get("date");
        String sig = data.get("sig");
        String replyUrl = data.get("replyUrl");
        if (technicianId == null || amount == null || date == null || sig == null || replyUrl == null) return;

        String techName = data.get("techName");
        if (techName == null || techName.isEmpty()) techName = "Technician";

        // Data-only pushes can arrive before MainActivity ever ran.
        NotificationChannels.ensureJobAlerts(context);

        int notificationId = notificationIdFor(technicianId, date);

        // Server may send title/body (morning yesterday follow-up). Fall back to tonight's copy.
        String title = data.get("title");
        if (title == null || title.isEmpty()) title = "Cash check \u2014 " + techName;
        String body = data.get("body");
        if (body == null || body.isEmpty()) {
            body = techName + " collected \u20B9" + amount + " in cash today. Has he given the cash?";
        }

        NotificationCompat.Action yesAction = buildAction(
            context, "Yes", "yes", notificationId, technicianId, techName, amount, date, sig, replyUrl);
        NotificationCompat.Action noAction = buildAction(
            context, "No", "no", notificationId, technicianId, techName, amount, date, sig, replyUrl);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_ASK)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .addAction(yesAction)
            .addAction(noAction)
            .setAutoCancel(false)
            .setOngoing(false)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static NotificationCompat.Action buildAction(
        Context context,
        String label,
        String response,
        int notificationId,
        String technicianId,
        String techName,
        String amount,
        String date,
        String sig,
        String replyUrl
    ) {
        Intent intent = new Intent(context, CashCheckReceiver.class)
            .setAction(ACTION_RESPOND)
            .putExtra(EXTRA_RESPONSE, response)
            .putExtra(EXTRA_TECHNICIAN_ID, technicianId)
            .putExtra(EXTRA_TECH_NAME, techName)
            .putExtra(EXTRA_AMOUNT, amount)
            .putExtra(EXTRA_DATE, date)
            .putExtra(EXTRA_SIG, sig)
            .putExtra(EXTRA_REPLY_URL, replyUrl)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        // Unique request code per notification+button so extras don't collide.
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            notificationId + ("yes".equals(response) ? 1 : 2),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Action.Builder(R.drawable.ic_stat_notify, label, pending).build();
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_RESPOND.equals(intent.getAction())) return;

        String response = intent.getStringExtra(EXTRA_RESPONSE);
        String technicianId = intent.getStringExtra(EXTRA_TECHNICIAN_ID);
        String techName = intent.getStringExtra(EXTRA_TECH_NAME);
        String amount = intent.getStringExtra(EXTRA_AMOUNT);
        String date = intent.getStringExtra(EXTRA_DATE);
        String sig = intent.getStringExtra(EXTRA_SIG);
        String replyUrl = intent.getStringExtra(EXTRA_REPLY_URL);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        if (technicianId == null || amount == null || date == null || sig == null || replyUrl == null) return;
        if (techName == null || techName.isEmpty()) techName = "the technician";
        if (response == null) response = "no";

        final boolean isYes = "yes".equals(response);
        showResult(
            context,
            notificationId,
            isYes ? "Marking cash received\u2026" : ("Sending reminder to " + techName + "\u2026"),
            COLOR_ASK,
            false
        );

        final String fTechName = techName;
        final String fResponse = response;
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                String payload = "{\"technicianId\":\"" + technicianId + "\"," +
                    "\"date\":\"" + date + "\"," +
                    "\"amount\":\"" + amount + "\"," +
                    "\"sig\":\"" + sig + "\"," +
                    "\"response\":\"" + fResponse + "\"}";
                conn = (HttpURLConnection) new URL(replyUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(payload.getBytes(StandardCharsets.UTF_8));
                }
                ok = conn.getResponseCode() == 200;
                if (!ok) Log.w(TAG, "Cash check reply rejected: HTTP " + conn.getResponseCode());
            } catch (Exception e) {
                Log.w(TAG, "Cash check reply failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (ok) {
                if (isYes) {
                    showResult(context, notificationId,
                        "Cash from " + fTechName + " marked received \u2713",
                        COLOR_OK, true);
                } else {
                    showResult(context, notificationId,
                        "Reminder sent to " + fTechName + " to hand over \u20B9" + amount + " \u2713",
                        COLOR_REMINDED, true);
                }
            } else {
                showResult(context, notificationId,
                    isYes
                        ? "Couldn't mark received \u2014 check internet and try again."
                        : "Couldn't send the reminder \u2014 check internet and try again from the app.",
                    COLOR_ASK, false);
            }
            pendingResult.finish();
        }).start();
    }

    private void showResult(Context context, int notificationId, String text, int color, boolean autoCancel) {
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(color)
            .setContentTitle("Cash check")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true)
            .setAutoCancel(autoCancel)
            .build();
        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }
}

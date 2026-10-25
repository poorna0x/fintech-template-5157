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
 * Admin parts-check Yes/No (10:10 PM, and one 8:35 AM follow-up if they tapped No).
 * Evening No queues tomorrow morning. Morning No is not saved.
 */
public class PartsCheckReceiver extends BroadcastReceiver {

    private static final String TAG = "HroPartsCheck";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_ASK = Color.parseColor("#F59E0B");
    private static final int COLOR_NO = Color.parseColor("#DC2626");
    private static final int COLOR_OK = Color.parseColor("#16A34A");

    private static final String ACTION_RESPOND = "com.hydrogenro.admin.PARTS_CHECK_RESPONSE";
    private static final String EXTRA_RESPONSE = "response";
    private static final String EXTRA_ASK = "ask";
    private static final String EXTRA_DATE = "date";
    private static final String EXTRA_SIG = "sig";
    private static final String EXTRA_REPLY_URL = "replyUrl";
    private static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private static int notificationIdFor(String date, String ask) {
        return 0x0A71 ^ ((date == null ? "" : date) + "|" + (ask == null ? "" : ask)).hashCode();
    }

    public static void showPartsCheckNotification(Context context, Map<String, String> data) {
        if (data == null) return;
        String date = data.get("date");
        String sig = data.get("sig");
        String replyUrl = data.get("replyUrl");
        String ask = data.get("ask");
        if (date == null || sig == null || replyUrl == null) return;
        if (!"evening".equals(ask) && !"morning".equals(ask)) ask = "evening";

        NotificationChannels.ensureJobAlerts(context);
        int notificationId = notificationIdFor(date, ask);

        String title = data.get("title");
        if (title == null || title.isEmpty()) title = "Parts check";
        String body = data.get("body");
        if (body == null || body.isEmpty()) body = "Were all used parts logged?";

        NotificationCompat.Action yesAction = buildAction(
            context, "Yes", "yes", notificationId, ask, date, sig, replyUrl);
        NotificationCompat.Action noAction = buildAction(
            context, "No", "no", notificationId, ask, date, sig, replyUrl);

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
        String ask,
        String date,
        String sig,
        String replyUrl
    ) {
        Intent intent = new Intent(context, PartsCheckReceiver.class)
            .setAction(ACTION_RESPOND)
            .putExtra(EXTRA_RESPONSE, response)
            .putExtra(EXTRA_ASK, ask)
            .putExtra(EXTRA_DATE, date)
            .putExtra(EXTRA_SIG, sig)
            .putExtra(EXTRA_REPLY_URL, replyUrl)
            .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
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
        if (intent == null || !ACTION_RESPOND.equals(intent.getAction())) return;

        String response = intent.getStringExtra(EXTRA_RESPONSE);
        String ask = intent.getStringExtra(EXTRA_ASK);
        String date = intent.getStringExtra(EXTRA_DATE);
        String sig = intent.getStringExtra(EXTRA_SIG);
        String replyUrl = intent.getStringExtra(EXTRA_REPLY_URL);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        if (date == null || sig == null || replyUrl == null) return;
        if (!"evening".equals(ask) && !"morning".equals(ask)) ask = "evening";
        if (!"yes".equals(response)) response = "no";

        final boolean isYes = "yes".equals(response);
        final boolean isMorning = "morning".equals(ask);
        showResult(context, notificationId, "Saving parts check\u2026", COLOR_ASK, false);

        final String fResponse = response;
        final String fAsk = ask;
        final PendingResult pendingResult = goAsync();
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                String payload = "{\"date\":\"" + date + "\"," +
                    "\"ask\":\"" + fAsk + "\"," +
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
            } catch (Exception e) {
                Log.w(TAG, "Parts check reply failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (ok) {
                if (isYes) {
                    showResult(context, notificationId, "Parts marked checked \u2713", COLOR_OK, true);
                } else if (isMorning) {
                    showResult(context, notificationId,
                        "Noted. We won't ask again for that day.",
                        COLOR_NO, true);
                } else {
                    showResult(context, notificationId,
                        "We'll ask once tomorrow morning.",
                        COLOR_NO, true);
                }
            } else {
                showResult(context, notificationId,
                    "Couldn't save that answer \u2014 check internet and tap again.",
                    COLOR_ASK, false);
            }
            pendingResult.finish();
        }).start();
    }

    private void showResult(Context context, int notificationId, String text, int color, boolean autoCancel) {
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(color)
            .setContentTitle("Parts check")
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

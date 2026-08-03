package com.hydrogenro.admin;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

/**
 * Shows technician push acknowledgments:
 * - dismissed → silent low-importance channel
 * - opened (direct message) → normal job_alerts_v2 with sound
 */
public final class TechPushAckNotifier {

    private static final String TAG = "HroTechAckAdmin";
    private static final int COLOR_DISMISS = Color.parseColor("#64748B");
    private static final int COLOR_OPENED = Color.parseColor("#2563EB");
    private static final int NOTIF_ID_DISMISS = 0x0ACD15;
    private static final int NOTIF_ID_OPENED = 0x0AC0E1;

    private TechPushAckNotifier() {}

    public static void show(Context context, Map<String, String> data) {
        if (context == null || data == null) return;
        String type = data.get("type");
        if ("tech_push_dismissed".equals(type)) {
            showDismissed(context, data);
        } else if ("tech_message_opened".equals(type)) {
            showOpened(context, data);
        }
    }

    private static void showDismissed(Context context, Map<String, String> data) {
        NotificationChannels.ensureTechAcksSilent(context);
        String title = first(data.get("msgTitle"), data.get("title"), "Technician saw the notification");
        String body = first(data.get("msgBody"), data.get("body"), "Cleared from their phone");
        String tag = data.get("tag");
        if (tag == null || tag.isEmpty()) tag = "tech_push_dismissed";

        Intent openIntent =
            new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending =
            PendingIntent.getActivity(
                context,
                NOTIF_ID_DISMISS,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification =
            new NotificationCompat.Builder(context, NotificationChannels.TECH_ACKS_SILENT)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(COLOR_DISMISS)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setSilent(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .build();
        try {
            NotificationManagerCompat.from(context).notify(tag, NOTIF_ID_DISMISS, notification);
            Log.i(TAG, "Posted silent dismiss ack");
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static void showOpened(Context context, Map<String, String> data) {
        NotificationChannels.ensureJobAlerts(context);
        String title = first(data.get("msgTitle"), data.get("title"), "Technician opened message");
        String body = first(data.get("msgBody"), data.get("body"), "Opened office message");
        String tag = data.get("tag");
        if (tag == null || tag.isEmpty()) tag = "tech_message_opened";
        int notifId = NOTIF_ID_OPENED;

        Intent openIntent =
            new Intent(context, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending =
            PendingIntent.getActivity(
                context,
                notifId,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification =
            new NotificationCompat.Builder(context, NotificationChannels.JOB_ALERTS)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(COLOR_OPENED)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(Notification.DEFAULT_ALL)
                .setContentIntent(openPending)
                .setAutoCancel(true)
                .build();
        try {
            NotificationManagerCompat.from(context).notify(tag, notifId, notification);
            Log.i(TAG, "Posted opened-message ack");
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static String first(String a, String b, String fallback) {
        if (a != null && !a.isEmpty()) return a;
        if (b != null && !b.isEmpty()) return b;
        return fallback;
    }
}

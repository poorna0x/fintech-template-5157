package com.hydrogenro.technician;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.graphics.Color;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * When the technician app is in the foreground, FCM does not auto-post tray
 * notifications for messages that include a notification payload. Capacitor
 * only forwards them to JS. This helper posts the same tray alert (sound +
 * light via job_alerts_v2) so alerts still appear while the app is open.
 *
 * Background/killed: the system still shows FCM's own notification and
 * typically does not call onMessageReceived — so this does not double-fire.
 */
public final class ForegroundPushNotifier {

    private static final String TAG = "HroFgPush";
    private static final int FALLBACK_ID = 0x0F60A1;

    private ForegroundPushNotifier() {}

    public static void showIfPresent(Context context, RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data != null ? data.get("type") : null;
        // Silent / already handled with custom UI — never toast these.
        if ("otp_request".equals(type)
            || "office_message".equals(type)
            || "call_customer".equals(type)
            || "going_now".equals(type)
            || "tech_nudge".equals(type)
            || "job_alert_overlay".equals(type)
            || "clear_notifications".equals(type)
            || "location_request".equals(type)) {
            return;
        }

        String title = null;
        String body = null;
        RemoteMessage.Notification notif = remoteMessage.getNotification();
        if (notif != null) {
            title = notif.getTitle();
            body = notif.getBody();
        }
        if ((title == null || title.isEmpty()) && data != null) {
            title = firstNonEmpty(data.get("title"), data.get("msgTitle"));
        }
        if ((body == null || body.isEmpty()) && data != null) {
            body = firstNonEmpty(data.get("body"), data.get("msgBody"));
        }
        if (title == null || title.isEmpty()) return;
        if (body == null) body = "";

        NotificationChannels.ensureJobAlerts(context);

        String tag = data != null ? data.get("tag") : null;
        if (tag == null || tag.isEmpty()) {
            tag = type != null && !type.isEmpty() ? type : "tech_push";
        }

        int color = Color.parseColor("#16A34A");
        String colorHex = data != null ? data.get("color") : null;
        if (colorHex != null && colorHex.matches("#[0-9a-fA-F]{6}")) {
            try {
                color = Color.parseColor(colorHex);
            } catch (IllegalArgumentException ignored) {
                /* keep default */
            }
        }

        String ackToken = data != null ? data.get("ackToken") : null;
        String ackUrl = data != null ? data.get("ackUrl") : null;
        String source = data != null ? data.get("source") : null;
        PendingIntent openPending = TechPushAckReceiver.openPending(
            context,
            FALLBACK_ID,
            ackToken,
            ackUrl,
            source,
            title,
            body,
            tag,
            FALLBACK_ID,
            null
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, NotificationChannels.JOB_ALERTS)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(color)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .setAutoCancel(true);
        PendingIntent deletePending = TechPushAckReceiver.dismissPending(
            context,
            FALLBACK_ID + 50,
            ackToken,
            ackUrl,
            source,
            title,
            body,
            tag,
            FALLBACK_ID
        );
        if (deletePending != null) {
            builder.setDeleteIntent(deletePending);
        }

        try {
            NotificationManagerCompat.from(context).notify(tag, 0, builder.build());
            Log.i(TAG, "Posted foreground tray notification tag=" + tag);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static String firstNonEmpty(String a, String b) {
        if (a != null && !a.isEmpty()) return a;
        if (b != null && !b.isEmpty()) return b;
        return null;
    }
}

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
import java.util.Map;
import java.util.UUID;

/**
 * Nightly expense-review push (daily-expense-review Netlify cron).
 * Yes: dismiss. No / tap body: open the app on Payments → Add technician
 * or Add business expense (deep-linked via Capacitor push extras).
 */
public class ExpenseReviewReceiver extends BroadcastReceiver {

    private static final String TAG = "HroExpenseReview";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_ASK = Color.parseColor("#7C3AED");

    private static final String ACTION_RESPOND = "com.hydrogenro.admin.EXPENSE_REVIEW_RESPONSE";
    private static final String EXTRA_RESPONSE = "response";
    private static final String EXTRA_KIND = "kind";
    private static final String EXTRA_DATE = "date";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_BODY = "body";
    private static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private static int notificationIdFor(String kind, String date) {
        return 0x0E71 ^ ((kind == null ? "" : kind) + "|" + (date == null ? "" : date)).hashCode();
    }

    public static void showExpenseReviewNotification(Context context, Map<String, String> data) {
        if (data == null) return;
        String kind = data.get("kind");
        if (kind == null || (!"technician".equals(kind) && !"business".equals(kind))) return;

        String date = data.get("date");
        if (date == null) date = "";

        String title = data.get("title");
        if (title == null || title.isEmpty()) {
            title = "technician".equals(kind)
                ? "Technician expenses — today"
                : "Business expenses — today";
        }
        String body = data.get("body");
        if (body == null || body.isEmpty()) {
            body = "technician".equals(kind)
                ? "Were all technician expenses for today added in Payments?"
                : "Were all business expenses for today added in Payments?";
        }

        NotificationChannels.ensureJobAlerts(context);

        int notificationId = notificationIdFor(kind, date);

        PendingIntent openPending = PendingIntent.getActivity(
            context,
            notificationId,
            buildOpenPaymentsIntent(context, kind, date, title, body),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Action yesAction = buildAction(
            context, "Yes", "yes", notificationId, kind, date, title, body);
        NotificationCompat.Action noAction = buildAction(
            context, "No", "no", notificationId, kind, date, title, body);

        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_ASK)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .addAction(yesAction)
            .addAction(noAction)
            .setAutoCancel(true)
            .build();

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static Intent buildOpenPaymentsIntent(
        Context context,
        String kind,
        String date,
        String title,
        String body
    ) {
        String messageId = "expense-review-" + kind + "-" + UUID.randomUUID();
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("google.message_id", messageId);
        intent.putExtra("type", "expense_review");
        intent.putExtra("kind", kind);
        intent.putExtra("addExpense", kind);
        intent.putExtra("date", date != null ? date : "");
        intent.putExtra("title", title != null ? title : "");
        intent.putExtra("body", body != null ? body : "");
        intent.putExtra("view", "payments");
        return intent;
    }

    private static NotificationCompat.Action buildAction(
        Context context,
        String label,
        String response,
        int notificationId,
        String kind,
        String date,
        String title,
        String body
    ) {
        Intent intent = new Intent(context, ExpenseReviewReceiver.class)
            .setAction(ACTION_RESPOND)
            .putExtra(EXTRA_RESPONSE, response)
            .putExtra(EXTRA_KIND, kind)
            .putExtra(EXTRA_DATE, date)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
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
        if (!ACTION_RESPOND.equals(intent.getAction())) return;

        String response = intent.getStringExtra(EXTRA_RESPONSE);
        String kind = intent.getStringExtra(EXTRA_KIND);
        String date = intent.getStringExtra(EXTRA_DATE);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0);
        if (kind == null) return;

        NotificationManagerCompat.from(context).cancel(notificationId);

        if ("yes".equals(response)) {
            return;
        }

        // No → open Payments and add expense dialog.
        Intent open = buildOpenPaymentsIntent(context, kind, date, title, body);
        context.startActivity(open);
    }
}

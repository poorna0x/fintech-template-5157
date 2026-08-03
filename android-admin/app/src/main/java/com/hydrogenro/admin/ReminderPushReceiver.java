package com.hydrogenro.admin;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Morning reminder / pending-payment pushes (admin-reminders-push Netlify cron).
 * Pending payments: Open → Settings on that customer; WhatsApp → wa.me with the
 * same pre-filled message as Settings → Pending payments.
 *
 * Important: WhatsApp must use an Activity PendingIntent. Starting wa.me from a
 * BroadcastReceiver while backgrounded is blocked on modern Android (same fix as
 * ExpenseReviewReceiver "No").
 */
public class ReminderPushReceiver extends BroadcastReceiver {

    private static final String TAG = "HroReminderPush";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_GENERAL = Color.parseColor("#D97706");
    private static final int COLOR_PENDING = Color.parseColor("#2563EB");

    private static boolean isElevenRo(String brand) {
        return brand != null && "elevenro".equalsIgnoreCase(brand.trim());
    }
    public static void showReminderNotification(Context context, Map<String, String> data) {
        if (data == null) return;
        String reminderId = data.get("reminderId");
        String title = data.get("title");
        String body = data.get("body");
        if (reminderId == null || title == null || title.isEmpty()) return;
        if (body == null) body = "";

        NotificationChannels.ensureJobAlerts(context);

        String kind = data.get("kind");
        String tag = data.get("tag");
        if (tag == null || tag.isEmpty()) tag = "admin_reminder_" + reminderId;

        int color = COLOR_GENERAL;
        String colorHex = data.get("color");
        if (colorHex != null && colorHex.matches("#[0-9a-fA-F]{6}")) {
            try {
                color = Color.parseColor(colorHex);
            } catch (IllegalArgumentException ignored) {
                if ("pending_payment".equals(kind)) color = COLOR_PENDING;
            }
        } else if ("pending_payment".equals(kind)) {
            color = COLOR_PENDING;
        }

        String messageId = "reminder-" + reminderId + "-" + UUID.randomUUID();

        PendingIntent openPending = PendingIntent.getActivity(
            context,
            reminderId.hashCode(),
            buildOpenIntent(context, data, messageId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(color)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .setAutoCancel(true)
            .addAction(new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify,
                "Open",
                openPending
            ).build());

        String phone = normalizePhone(data.get("phone"));
        if ("pending_payment".equals(kind) && phone != null) {
            String fromPush = data.get("whatsappText");
            String message =
                fromPush != null && !fromPush.trim().isEmpty()
                    ? fromPush
                    : buildWhatsAppMessage(
                        data.get("customerName"),
                        data.get("amount"),
                        data.get("dueDate"),
                        data.get("serviceBrand")
                    );
            String encoded;
            try {
                encoded = URLEncoder.encode(message, "UTF-8");
            } catch (UnsupportedEncodingException e) {
                encoded = message.replace(" ", "%20");
            }
            Intent waIntent = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("https://wa.me/91" + phone + "?text=" + encoded)
            );
            PendingIntent waPending = PendingIntent.getActivity(
                context,
                reminderId.hashCode() + 1,
                waIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify,
                "WhatsApp",
                waPending
            ).build());
        }

        try {
            NotificationManagerCompat.from(context).notify(tag, 0, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static Intent buildOpenIntent(Context context, Map<String, String> data, String messageId) {
        Intent intent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("google.message_id", messageId);
        if (data != null) {
            for (Map.Entry<String, String> e : data.entrySet()) {
                if (e.getKey() != null && e.getValue() != null) {
                    intent.putExtra(e.getKey(), e.getValue());
                }
            }
        }
        return intent;
    }

    private static String normalizePhone(String raw) {
        if (raw == null) return null;
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() >= 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        while (digits.startsWith("0") && digits.length() > 1) {
            digits = digits.substring(1);
        }
        if (digits.length() < 10) return null;
        return digits.substring(digits.length() - 10);
    }

    static String buildWhatsAppMessage(
        String customerName,
        String amountRaw,
        String dueDateRaw,
        String serviceBrand
    ) {
        String name = customerName != null && !customerName.isEmpty() ? customerName : "Customer";
        double amount = 0;
        try {
            amount = Double.parseDouble(amountRaw != null ? amountRaw : "0");
        } catch (NumberFormatException ignored) {
            /* keep 0 */
        }
        String formattedAmount = String.format(Locale.forLanguageTag("en-IN"), "%,.0f", amount);
        boolean eleven = isElevenRo(serviceBrand);
        String brandLabel = eleven ? "Eleven RO" : "Hydrogen RO";
        String team = eleven ? "Eleven RO Team" : "Hydrogen RO Team";
        String dueLine = "";
        if (dueDateRaw != null && dueDateRaw.trim().length() >= 10) {
            String ymd = dueDateRaw.trim().substring(0, 10);
            String pretty = ymd;
            try {
                java.text.SimpleDateFormat in = new java.text.SimpleDateFormat("yyyy-MM-dd", Locale.US);
                java.text.SimpleDateFormat out = new java.text.SimpleDateFormat("d MMM yyyy", Locale.forLanguageTag("en-IN"));
                java.util.Date d = in.parse(ymd);
                if (d != null) pretty = out.format(d);
            } catch (Exception ignored) {
                /* keep ymd */
            }
            dueLine = "\n• Due date: " + pretty;
        }
        return "Hi " + name + " \uD83D\uDE0A\n\n"
            + "Hope you're doing well. Quick reminder from *" + brandLabel
            + "* regarding your water filter service.\n\n"
            + "*Pending payment*\n"
            + "• Amount: \u20B9" + formattedAmount
            + dueLine + "\n\n"
            + "Please clear this at your earliest convenience. If you have already paid, kindly ignore this message.\n\n"
            + "Thanks & regards \uD83D\uDE4F\n"
            + team;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        // WhatsApp / Open use Activity PendingIntents (see showReminderNotification).
        Log.d(TAG, "onReceive ignored action=" + (intent != null ? intent.getAction() : null));
    }
}

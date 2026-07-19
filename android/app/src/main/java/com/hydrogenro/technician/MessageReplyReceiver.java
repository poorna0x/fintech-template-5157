package com.hydrogenro.technician;

import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import androidx.core.graphics.drawable.IconCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Inline reply on office "Message technician" pushes (when admin enables
 * Allow reply). Uploads the typed text to submit-tech-message-reply; nothing
 * is stored server-side — admins get a push with the technician name + reply.
 * Office messages show the bundled HydrogenRO logo as the chat avatar.
 */
public class MessageReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "HroMsgReply";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_PENDING = Color.parseColor("#2563EB");
    private static final int COLOR_SUCCESS = Color.parseColor("#16A34A");
    private static final String OFFICE_SENDER_NAME = "HydrogenRO Office";
    private static final int AVATAR_MAX_PX = 192;

    public static final String ACTION_REPLY = "com.hydrogenro.technician.OFFICE_MSG_REPLY";
    public static final String KEY_REPLY = "reply_text";
    public static final String EXTRA_REPLY_TOKEN = "replyToken";
    public static final String EXTRA_REPLY_URL = "replyUrl";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private static final int NOTIFICATION_ID = 0x0FF1CE;

    public static void showOfficeMessageNotification(
        Context context,
        String title,
        String body,
        String replyToken,
        String replyUrl,
        String tag
    ) {
        NotificationChannels.ensureJobAlerts(context);

        String safeTitle = (title != null && !title.isEmpty()) ? title : "Message from office";
        String safeBody = body != null ? body : "";
        String notifTag = (tag != null && !tag.isEmpty()) ? tag : "office_message";

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY)
            .setLabel("Reply")
            .build();

        Intent replyIntent = new Intent(context, MessageReplyReceiver.class)
            .setAction(ACTION_REPLY)
            .putExtra(EXTRA_REPLY_TOKEN, replyToken)
            .putExtra(EXTRA_REPLY_URL, replyUrl)
            .putExtra(EXTRA_TITLE, safeTitle)
            .putExtra(EXTRA_BODY, safeBody)
            .putExtra(EXTRA_TAG, notifTag)
            .putExtra(EXTRA_NOTIFICATION_ID, NOTIFICATION_ID);
        PendingIntent replyPending = PendingIntent.getBroadcast(
            context,
            NOTIFICATION_ID,
            replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT |
                (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0)
        );

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify, "Reply", replyPending)
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(false)
            .build();

        Intent openIntent = new Intent(context, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // BigTextStyle keeps the full message visible/expanded in the shade.
        // MessagingStyle looks like a chat bubble and collapses to one line on
        // many OEMs — techs couldn't read the nudge without expanding.
        NotificationCompat.BigTextStyle style = new NotificationCompat.BigTextStyle()
            .setBigContentTitle(safeTitle)
            .bigText(safeBody);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_PENDING)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .addAction(replyAction)
            .setAutoCancel(false);
        Bitmap officeAvatar = loadOfficeAvatarBitmap(context);
        if (officeAvatar != null) {
            builder.setLargeIcon(officeAvatar);
        }

        try {
            NotificationManagerCompat.from(context).notify(notifTag, NOTIFICATION_ID, builder.build());
            Log.i(TAG, "Posted office message with Reply + BigTextStyle");
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    /**
     * Call-customer nudge: BigText tray alert with a Call action that opens
     * the dialer (ACTION_DIAL — no CALL_PHONE permission). No Reply.
     */
    public static void showCallCustomerNotification(
        Context context,
        String title,
        String body,
        String phone,
        String tag
    ) {
        NotificationChannels.ensureJobAlerts(context);

        String digits = phone != null ? phone.replaceAll("[^0-9+]", "") : "";
        if (digits.isEmpty()) {
            Log.w(TAG, "call_customer missing phone");
            return;
        }

        String safeTitle = (title != null && !title.isEmpty()) ? title : "Call customer now";
        String safeBody = (body != null && !body.isEmpty()) ? body : digits;
        String notifTag = (tag != null && !tag.isEmpty()) ? tag : "call_customer";
        int notifId = NOTIFICATION_ID + 17; // distinct from reply messages

        Intent dialIntent = new Intent(Intent.ACTION_DIAL, android.net.Uri.parse("tel:" + digits))
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent callPending = PendingIntent.getActivity(
            context,
            notifId,
            dialIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Action callAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify, "Call", callPending)
            .build();

        NotificationCompat.BigTextStyle style = new NotificationCompat.BigTextStyle()
            .setBigContentTitle(safeTitle)
            .bigText(safeBody);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_PENDING)
            .setContentTitle(safeTitle)
            .setContentText(safeBody)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(callPending)
            .addAction(callAction)
            .setAutoCancel(true);
        Bitmap officeAvatar = loadOfficeAvatarBitmap(context);
        if (officeAvatar != null) {
            builder.setLargeIcon(officeAvatar);
        }

        try {
            NotificationManagerCompat.from(context).notify(notifTag, notifId, builder.build());
            Log.i(TAG, "Posted call-customer nudge with Call + BigTextStyle");
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static Person buildOfficePerson(Context context) {
        Person.Builder office = new Person.Builder()
            .setName(OFFICE_SENDER_NAME)
            .setKey("office");
        office.setIcon(IconCompat.createWithResource(context, R.drawable.ic_office_avatar));
        return office.build();
    }

    private static Bitmap loadOfficeAvatarBitmap(Context context) {
        try {
            Bitmap decoded = BitmapFactory.decodeResource(context.getResources(), R.drawable.ic_office_avatar);
            if (decoded == null) return null;
            return toCircularBitmap(decoded, AVATAR_MAX_PX);
        } catch (Exception e) {
            Log.w(TAG, "Office avatar load failed", e);
            return null;
        }
    }

    private static Bitmap toCircularBitmap(Bitmap src, int maxPx) {
        int w = src.getWidth();
        int h = src.getHeight();
        if (w <= 0 || h <= 0) return null;
        int side = Math.min(w, h);
        int left = (w - side) / 2;
        int top = (h - side) / 2;
        Bitmap square = Bitmap.createBitmap(src, left, top, side, side);
        if (square != src) src.recycle();
        int size = Math.min(maxPx, side);
        Bitmap scaled = square.getWidth() == size
            ? square
            : Bitmap.createScaledBitmap(square, size, size, true);
        if (scaled != square) square.recycle();

        Bitmap out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(scaled, new Rect(0, 0, size, size), new Rect(0, 0, size, size), paint);
        if (scaled != out) scaled.recycle();
        return out;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!ACTION_REPLY.equals(intent.getAction())) return;

        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence typed = results != null ? results.getCharSequence(KEY_REPLY) : null;
        String reply = typed != null ? typed.toString().trim() : "";

        String replyToken = intent.getStringExtra(EXTRA_REPLY_TOKEN);
        String replyUrl = intent.getStringExtra(EXTRA_REPLY_URL);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String tag = intent.getStringExtra(EXTRA_TAG);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, NOTIFICATION_ID);
        if (replyToken == null || replyUrl == null) return;

        if (reply.isEmpty()) {
            showOfficeMessageNotification(context, title, body, replyToken, replyUrl, tag);
            return;
        }
        if (reply.length() > 300) {
            reply = reply.substring(0, 300);
        }

        showResult(context, tag, notificationId, "Sending reply\u2026", false);

        final String replyFinal = reply;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                JSONObject payload = new JSONObject();
                payload.put("replyToken", replyToken);
                payload.put("reply", replyFinal);
                conn = (HttpURLConnection) new URL(replyUrl).openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setDoOutput(true);
                conn.setConnectTimeout(10_000);
                conn.setReadTimeout(10_000);
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }
                ok = conn.getResponseCode() == 200;
                if (!ok) Log.w(TAG, "Reply rejected: HTTP " + conn.getResponseCode());
            } catch (Exception e) {
                Log.w(TAG, "Reply failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (ok) {
                showResult(context, tag, notificationId, "Reply sent to office \u2713", true);
            } else {
                showOfficeMessageNotification(context, title,
                    (body != null ? body : "") + "\n\nCouldn't send — type your reply again.",
                    replyToken, replyUrl, tag);
            }
            pending.finish();
        }).start();
    }

    private void showResult(Context context, String tag, int notificationId, String text, boolean success) {
        String notifTag = (tag != null && !tag.isEmpty()) ? tag : "office_message";
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(success ? COLOR_SUCCESS : COLOR_PENDING)
            .setContentTitle(success ? "Reply sent" : "Message from office")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(true)
            .setAutoCancel(success)
            .build();
        try {
            NotificationManagerCompat.from(context).notify(notifTag, notificationId, notification);
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }
}

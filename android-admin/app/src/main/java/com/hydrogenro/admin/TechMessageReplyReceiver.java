package com.hydrogenro.admin;

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
import androidx.core.app.RemoteInput;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.json.JSONObject;

/**
 * Inline reply when a technician answers an office message. Reply is pushed
 * back to that technician (no storage) via submit-admin-message-reply.
 * BigTextStyle keeps the full "{Name} replied / about → reply" text expanded
 * (MessagingStyle collapses to one line on many OEMs). Tech photo stays as
 * largeIcon when available.
 */
public class TechMessageReplyReceiver extends BroadcastReceiver {

    private static final String TAG = "HroAdminMsgReply";
    private static final String CHANNEL_ID = NotificationChannels.JOB_ALERTS;
    private static final int COLOR_PENDING = Color.parseColor("#2563EB");
    private static final int COLOR_SUCCESS = Color.parseColor("#16A34A");
    private static final int PHOTO_TIMEOUT_MS = 2500;
    private static final int PHOTO_MAX_PX = 192;

    public static final String ACTION_REPLY = "com.hydrogenro.admin.TECH_MSG_REPLY";
    public static final String KEY_REPLY = "reply_text";
    public static final String EXTRA_REPLY_TOKEN = "replyToken";
    public static final String EXTRA_REPLY_URL = "replyUrl";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_TECH_NAME = "techName";
    public static final String EXTRA_TECH_PHOTO = "techPhoto";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";

    private static final int NOTIFICATION_ID = 0x0AD71;

    public static void showTechReplyNotification(Context context, Map<String, String> data) {
        String replyToken = data.get("replyToken");
        String replyUrl = data.get("replyUrl");
        if (replyToken == null || replyUrl == null) return;

        NotificationChannels.ensureJobAlerts(context);

        String title = data.get("msgTitle");
        if (title == null || title.isEmpty()) title = data.get("title");
        String techName = data.get("techName");
        if (techName == null || techName.isEmpty()) {
            techName = "Technician";
        }
        if (title == null || title.isEmpty()) {
            title = "Reply from " + techName;
        }
        String body = data.get("msgBody");
        if (body == null) body = data.get("body");
        if (body == null) body = "";
        String tag = data.get("tag");
        if (tag == null || tag.isEmpty()) tag = "office_message_reply";
        String techPhoto = data.get("techPhoto");
        if (techPhoto == null) techPhoto = "";

        Bitmap photoBmp = loadCircularPhoto(techPhoto);

        RemoteInput remoteInput = new RemoteInput.Builder(KEY_REPLY)
            .setLabel("Reply")
            .build();

        Intent replyIntent = new Intent(context, TechMessageReplyReceiver.class)
            .setAction(ACTION_REPLY)
            .putExtra(EXTRA_REPLY_TOKEN, replyToken)
            .putExtra(EXTRA_REPLY_URL, replyUrl)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_BODY, body)
            .putExtra(EXTRA_TAG, tag)
            .putExtra(EXTRA_TECH_NAME, techName)
            .putExtra(EXTRA_TECH_PHOTO, techPhoto)
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

        // Prefer a single expanded block over MessagingStyle (OEMs collapse chat).
        NotificationCompat.BigTextStyle style = new NotificationCompat.BigTextStyle()
            .setBigContentTitle(title)
            .bigText(body);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(COLOR_PENDING)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(style)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(Notification.DEFAULT_ALL)
            .setContentIntent(openPending)
            .addAction(replyAction)
            .setAutoCancel(false);
        if (photoBmp != null) {
            builder.setLargeIcon(photoBmp);
        }

        try {
            NotificationManagerCompat.from(context).notify(tag, NOTIFICATION_ID, builder.build());
            Log.i(TAG, "Posted tech reply with Reply + BigTextStyle"
                + (photoBmp != null ? " + photo" : ""));
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    /** Download + circular-crop technician photo for largeIcon. Fail-soft. */
    private static Bitmap loadCircularPhoto(String photoUrl) {
        if (photoUrl == null || photoUrl.isEmpty()) return null;
        if (!photoUrl.regionMatches(true, 0, "https://", 0, 8)) return null;
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(photoUrl).openConnection();
            conn.setConnectTimeout(PHOTO_TIMEOUT_MS);
            conn.setReadTimeout(PHOTO_TIMEOUT_MS);
            conn.setInstanceFollowRedirects(true);
            int code = conn.getResponseCode();
            if (code < 200 || code >= 300) return null;
            InputStream in = conn.getInputStream();
            Bitmap decoded = BitmapFactory.decodeStream(in);
            if (in != null) in.close();
            if (decoded == null) return null;
            return toCircularBitmap(decoded, PHOTO_MAX_PX);
        } catch (Exception e) {
            Log.w(TAG, "Tech photo load failed", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
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
        String techName = intent.getStringExtra(EXTRA_TECH_NAME);
        String techPhoto = intent.getStringExtra(EXTRA_TECH_PHOTO);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, NOTIFICATION_ID);
        if (replyToken == null || replyUrl == null) return;

        if (reply.isEmpty()) {
            java.util.HashMap<String, String> data = new java.util.HashMap<>();
            data.put("title", title);
            data.put("body", body);
            data.put("replyToken", replyToken);
            data.put("replyUrl", replyUrl);
            data.put("tag", tag);
            if (techName != null) data.put("techName", techName);
            if (techPhoto != null) data.put("techPhoto", techPhoto);
            showTechReplyNotification(context, data);
            return;
        }
        if (reply.length() > 300) reply = reply.substring(0, 300);

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
                showResult(context, tag, notificationId, "Reply sent to technician \u2713", true);
            } else {
                java.util.HashMap<String, String> data = new java.util.HashMap<>();
                data.put("title", title);
                data.put("body", (body != null ? body : "") + "\n\nCouldn't send — try again.");
                data.put("replyToken", replyToken);
                data.put("replyUrl", replyUrl);
                data.put("tag", tag);
                if (techName != null) data.put("techName", techName);
                if (techPhoto != null) data.put("techPhoto", techPhoto);
                showTechReplyNotification(context, data);
            }
            pending.finish();
        }).start();
    }

    private void showResult(Context context, String tag, int notificationId, String text, boolean success) {
        String notifTag = (tag != null && !tag.isEmpty()) ? tag : "office_message_reply";
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(success ? COLOR_SUCCESS : COLOR_PENDING)
            .setContentTitle(success ? "Reply sent" : "Technician reply")
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

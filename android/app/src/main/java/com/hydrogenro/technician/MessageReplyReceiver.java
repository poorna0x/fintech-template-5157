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
    public static final String ACTION_GOING_YES = "com.hydrogenro.technician.GOING_NOW_YES";
    public static final String ACTION_GOING_NO = "com.hydrogenro.technician.GOING_NOW_NO";
    public static final String KEY_REPLY = "reply_text";
    public static final String EXTRA_REPLY_TOKEN = "replyToken";
    public static final String EXTRA_REPLY_URL = "replyUrl";
    public static final String EXTRA_START_TOKEN = "startToken";
    public static final String EXTRA_START_URL = "startUrl";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_ACK_TOKEN = TechPushAckReceiver.EXTRA_ACK_TOKEN;
    public static final String EXTRA_ACK_URL = TechPushAckReceiver.EXTRA_ACK_URL;

    private static final int NOTIFICATION_ID = 0x0FF1CE;
    private static final int GOING_NOTIFICATION_ID = 0x060166;
    /** Same ids used when posting tray alerts — overlay cancels these on dismiss/action. */
    public static final int TRAY_OFFICE_ID = NOTIFICATION_ID;
    public static final int TRAY_CALL_ID = NOTIFICATION_ID + 17;
    public static final int TRAY_GOING_ID = GOING_NOTIFICATION_ID;
    public static final int TRAY_START_ID = GOING_NOTIFICATION_ID + 3;

    public static void showOfficeMessageNotification(
        Context context,
        String title,
        String body,
        String replyToken,
        String replyUrl,
        String tag
    ) {
        showOfficeMessageNotification(
            context, title, body, replyToken, replyUrl, tag, null, null, null);
    }

    public static void showOfficeMessageNotification(
        Context context,
        String title,
        String body,
        String replyToken,
        String replyUrl,
        String tag,
        String ackToken,
        String ackUrl,
        String source
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
            .putExtra(EXTRA_NOTIFICATION_ID, NOTIFICATION_ID)
            .putExtra(EXTRA_ACK_TOKEN, ackToken != null ? ackToken : "")
            .putExtra(EXTRA_ACK_URL, ackUrl != null ? ackUrl : "");
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

        PendingIntent openPending = TechPushAckReceiver.openPending(
            context,
            NOTIFICATION_ID,
            ackToken,
            ackUrl,
            source,
            safeTitle,
            safeBody,
            notifTag,
            NOTIFICATION_ID,
            null
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
        PendingIntent deletePending = TechPushAckReceiver.dismissPending(
            context,
            NOTIFICATION_ID + 50,
            ackToken,
            ackUrl,
            source,
            safeTitle,
            safeBody,
            notifTag,
            NOTIFICATION_ID
        );
        if (deletePending != null) {
            builder.setDeleteIntent(deletePending);
        }
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
        showCallCustomerNotification(context, title, body, phone, tag, null, null, null);
    }

    public static void showCallCustomerNotification(
        Context context,
        String title,
        String body,
        String phone,
        String tag,
        String ackToken,
        String ackUrl,
        String source
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

        PendingIntent callPending = TechPushAckReceiver.callPending(
            context,
            notifId,
            digits,
            ackToken,
            ackUrl,
            safeTitle,
            safeBody,
            notifTag
        );
        if (callPending == null) return;

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
        PendingIntent deletePending = TechPushAckReceiver.dismissPending(
            context,
            notifId + 50,
            ackToken,
            ackUrl,
            source,
            safeTitle,
            safeBody,
            notifTag,
            notifId
        );
        if (deletePending != null) {
            builder.setDeleteIntent(deletePending);
        }
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

    /**
     * Start-job tray nudge.
     * startOnly=true → single Start button; else Yes + No (one-tap, no typing).
     */
    public static void showGoingNowNotification(
        Context context,
        String title,
        String body,
        String startToken,
        String startUrl,
        String replyToken,
        String replyUrl,
        String tag,
        boolean startOnly
    ) {
        showGoingNowNotification(
            context, title, body, startToken, startUrl, replyToken, replyUrl, tag, startOnly,
            null, null, null);
    }

    public static void showGoingNowNotification(
        Context context,
        String title,
        String body,
        String startToken,
        String startUrl,
        String replyToken,
        String replyUrl,
        String tag,
        boolean startOnly,
        String ackToken,
        String ackUrl,
        String source
    ) {
        NotificationChannels.ensureJobAlerts(context);

        String safeTitle = (title != null && !title.isEmpty())
            ? title
            : (startOnly ? "Start this job" : "Are you going?");
        String safeBody = (body != null && !body.isEmpty())
            ? body
            : (startOnly
                ? "Tap Start to mark this job on the way."
                : "Yes starts this job. No tells the office.");
        String notifTag = (tag != null && !tag.isEmpty())
            ? tag
            : (startOnly ? "start_job" : "going_now");
        int notifId = GOING_NOTIFICATION_ID + (startOnly ? 3 : 0);

        Intent yesIntent = new Intent(context, MessageReplyReceiver.class)
            .setAction(ACTION_GOING_YES)
            .putExtra(EXTRA_START_TOKEN, startToken)
            .putExtra(EXTRA_START_URL, startUrl)
            .putExtra(EXTRA_TITLE, safeTitle)
            .putExtra(EXTRA_BODY, safeBody)
            .putExtra(EXTRA_TAG, notifTag)
            .putExtra(EXTRA_NOTIFICATION_ID, notifId)
            .putExtra(EXTRA_ACK_TOKEN, ackToken != null ? ackToken : "")
            .putExtra(EXTRA_ACK_URL, ackUrl != null ? ackUrl : "");
        PendingIntent yesPending = PendingIntent.getBroadcast(
            context,
            notifId + 1,
            yesIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        String yesLabel = startOnly ? "Start" : "Yes";
        NotificationCompat.Action yesAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_stat_notify, yesLabel, yesPending)
            .build();

        PendingIntent openPending = TechPushAckReceiver.openPending(
            context,
            notifId,
            ackToken,
            ackUrl,
            source,
            safeTitle,
            safeBody,
            notifTag,
            notifId,
            null
        );

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
            .addAction(yesAction)
            .setAutoCancel(false);

        if (!startOnly && replyToken != null && replyUrl != null
            && !replyToken.isEmpty() && !replyUrl.isEmpty()) {
            Intent noIntent = new Intent(context, MessageReplyReceiver.class)
                .setAction(ACTION_GOING_NO)
                .putExtra(EXTRA_REPLY_TOKEN, replyToken)
                .putExtra(EXTRA_REPLY_URL, replyUrl)
                .putExtra(EXTRA_TITLE, safeTitle)
                .putExtra(EXTRA_BODY, safeBody)
                .putExtra(EXTRA_TAG, notifTag)
                .putExtra(EXTRA_NOTIFICATION_ID, notifId)
                .putExtra(EXTRA_ACK_TOKEN, ackToken != null ? ackToken : "")
                .putExtra(EXTRA_ACK_URL, ackUrl != null ? ackUrl : "");
            PendingIntent noPending = PendingIntent.getBroadcast(
                context,
                notifId + 2,
                noIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            builder.addAction(new NotificationCompat.Action.Builder(
                    R.drawable.ic_stat_notify, "No", noPending)
                .build());
        }

        PendingIntent deletePending = TechPushAckReceiver.dismissPending(
            context,
            notifId + 50,
            ackToken,
            ackUrl,
            source,
            safeTitle,
            safeBody,
            notifTag,
            notifId
        );
        if (deletePending != null) {
            builder.setDeleteIntent(deletePending);
        }

        Bitmap officeAvatar = loadOfficeAvatarBitmap(context);
        if (officeAvatar != null) {
            builder.setLargeIcon(officeAvatar);
        }

        try {
            NotificationManagerCompat.from(context).notify(notifTag, notifId, builder.build());
            Log.i(TAG, startOnly
                ? "Posted start-job nudge with Start"
                : "Posted going-now nudge with Yes + No");
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
        try {
            handleReceive(context, intent);
        } catch (Throwable t) {
            Log.w(TAG, "onReceive failed", t);
        }
    }

    private void handleReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        // Any button = they saw it (silent admin ack, deduped).
        TechPushAckReceiver.postSeen(
            intent.getStringExtra(EXTRA_ACK_TOKEN),
            intent.getStringExtra(EXTRA_ACK_URL),
            intent.getStringExtra(EXTRA_TITLE),
            intent.getStringExtra(EXTRA_BODY),
            intent.getStringExtra(EXTRA_TAG)
        );

        if (ACTION_GOING_YES.equals(intent.getAction())) {
            handleGoingYes(context, intent);
            return;
        }
        if (ACTION_GOING_NO.equals(intent.getAction())) {
            handleGoingNo(context, intent);
            return;
        }
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
                if (title != null && !title.isEmpty()) {
                    payload.put("originalTitle", title);
                }
                if (body != null && !body.isEmpty()) {
                    payload.put("originalBody", body);
                }
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

    private void handleGoingYes(Context context, Intent intent) {
        String startToken = intent.getStringExtra(EXTRA_START_TOKEN);
        String startUrl = intent.getStringExtra(EXTRA_START_URL);
        String tag = intent.getStringExtra(EXTRA_TAG);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, GOING_NOTIFICATION_ID);
        if (startToken == null || startUrl == null) return;

        showResult(context, tag, notificationId, "Starting job\u2026", false);

        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                JSONObject payload = new JSONObject();
                payload.put("startToken", startToken);
                conn = (HttpURLConnection) new URL(startUrl).openConnection();
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
                if (!ok) Log.w(TAG, "Going-yes rejected: HTTP " + conn.getResponseCode());
            } catch (Exception e) {
                Log.w(TAG, "Going-yes failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (ok) {
                showResult(context, tag, notificationId, "Job started — you\u2019re on the way \u2713", true);
            } else {
                showResult(context, tag, notificationId, "Couldn\u2019t start — open the app", false);
            }
            pending.finish();
        }).start();
    }

    /** One-tap No — tells office without typing. */
    private void handleGoingNo(Context context, Intent intent) {
        String replyToken = intent.getStringExtra(EXTRA_REPLY_TOKEN);
        String replyUrl = intent.getStringExtra(EXTRA_REPLY_URL);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String tag = intent.getStringExtra(EXTRA_TAG);
        int notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, GOING_NOTIFICATION_ID);
        if (replyToken == null || replyUrl == null) return;

        showResult(context, tag, notificationId, "Telling office\u2026", false);

        final PendingResult pending = goAsync();
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                JSONObject payload = new JSONObject();
                payload.put("replyToken", replyToken);
                payload.put("reply", "No");
                if (title != null && !title.isEmpty()) payload.put("originalTitle", title);
                if (body != null && !body.isEmpty()) payload.put("originalBody", body);
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
                if (!ok) Log.w(TAG, "Going-no rejected: HTTP " + conn.getResponseCode());
            } catch (Exception e) {
                Log.w(TAG, "Going-no failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }

            if (ok) {
                showResult(context, tag, notificationId, "Told office \u2014 not going \u2713", true);
            } else {
                showResult(context, tag, notificationId, "Couldn\u2019t send — try again", false);
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

    public interface ResultCallback {
        void onDone(boolean ok);
    }

    /** Same network path as notification Reply — used by TechActionOverlay. */
    public static void submitReply(
        Context context,
        String replyToken,
        String replyUrl,
        String reply,
        String title,
        String body,
        String tag,
        ResultCallback callback
    ) {
        submitReply(context, replyToken, replyUrl, reply, title, body, tag, null, null, callback);
    }

    public static void submitReply(
        Context context,
        String replyToken,
        String replyUrl,
        String reply,
        String title,
        String body,
        String tag,
        String ackToken,
        String ackUrl,
        ResultCallback callback
    ) {
        TechPushAckReceiver.postSeen(ackToken, ackUrl, title, body, tag);
        if (replyToken == null || replyUrl == null || reply == null || reply.trim().isEmpty()) {
            if (callback != null) callback.onDone(false);
            return;
        }
        final String replyFinal = reply.trim().length() > 300 ? reply.trim().substring(0, 300) : reply.trim();
        final String notifTag = (tag != null && !tag.isEmpty()) ? tag : "office_message";
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                JSONObject payload = new JSONObject();
                payload.put("replyToken", replyToken);
                payload.put("reply", replyFinal);
                if (title != null && !title.isEmpty()) payload.put("originalTitle", title);
                if (body != null && !body.isEmpty()) payload.put("originalBody", body);
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
            } catch (Exception e) {
                Log.w(TAG, "Overlay reply failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            if (ok) {
                try {
                    NotificationChannels.ensureJobAlerts(context);
                    Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_stat_notify)
                        .setColor(COLOR_SUCCESS)
                        .setContentTitle("Reply sent")
                        .setContentText("Reply sent to office \u2713")
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setOnlyAlertOnce(true)
                        .setAutoCancel(true)
                        .build();
                    NotificationManagerCompat.from(context).notify(notifTag, NOTIFICATION_ID, notification);
                } catch (Throwable ignored) {
                    /* */
                }
            }
            if (callback != null) callback.onDone(ok);
        }).start();
    }

    public static void submitGoingYes(
        Context context, String startToken, String startUrl, String tag, ResultCallback callback
    ) {
        submitGoingYes(context, startToken, startUrl, tag, null, null, null, null, callback);
    }

    public static void submitGoingYes(
        Context context,
        String startToken,
        String startUrl,
        String tag,
        String ackToken,
        String ackUrl,
        String title,
        String body,
        ResultCallback callback
    ) {
        TechPushAckReceiver.postSeen(ackToken, ackUrl, title, body, tag);
        if (startToken == null || startUrl == null) {
            if (callback != null) callback.onDone(false);
            return;
        }
        new Thread(() -> {
            boolean ok = false;
            HttpURLConnection conn = null;
            try {
                JSONObject payload = new JSONObject();
                payload.put("startToken", startToken);
                conn = (HttpURLConnection) new URL(startUrl).openConnection();
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
            } catch (Exception e) {
                Log.w(TAG, "Overlay going-yes failed", e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            if (callback != null) callback.onDone(ok);
        }).start();
    }

    public static void submitGoingNo(
        Context context,
        String replyToken,
        String replyUrl,
        String title,
        String body,
        String tag,
        ResultCallback callback
    ) {
        submitReply(context, replyToken, replyUrl, "No", title, body, tag, null, null, callback);
    }

    public static void submitGoingNo(
        Context context,
        String replyToken,
        String replyUrl,
        String title,
        String body,
        String tag,
        String ackToken,
        String ackUrl,
        ResultCallback callback
    ) {
        submitReply(context, replyToken, replyUrl, "No", title, body, tag, ackToken, ackUrl, callback);
    }
}

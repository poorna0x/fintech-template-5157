package com.hydrogenro.technician;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/**
 * Dismiss / open acknowledgments for technician pushes. Posts to
 * submit-tech-push-ack so admin phones see silent (dismiss) or normal (open
 * direct message) alerts. Dedupes per notification tag so swipe-after-open
 * does not double-fire.
 */
public class TechPushAckReceiver extends BroadcastReceiver {

    private static final String TAG = "HroTechAck";

    public static final String ACTION_DISMISS = "com.hydrogenro.technician.PUSH_ACK_DISMISS";
    public static final String ACTION_OPEN = "com.hydrogenro.technician.PUSH_ACK_OPEN";

    public static final String EXTRA_ACK_TOKEN = "ackToken";
    public static final String EXTRA_ACK_URL = "ackUrl";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_JOB_ID = "jobId";

    private static final Set<String> SENT_KEYS =
        Collections.synchronizedSet(new HashSet<>());

    /** Fire-and-forget dismiss ack (overlay Dismiss button). Deduped by tag. */
    public static void postDismiss(
        Context context,
        String ackToken,
        String ackUrl,
        String source,
        String title,
        String body,
        String tag
    ) {
        if (ackToken == null || ackToken.isEmpty() || ackUrl == null || ackUrl.isEmpty()) {
            return;
        }
        String dedupeKey = dedupeKey(tag, "dismissed");
        if (!markSent(dedupeKey)) return;
        postAsync(ackUrl, ackToken, "dismissed", title, body);
    }

    public static PendingIntent dismissPending(
        Context context,
        int requestCode,
        String ackToken,
        String ackUrl,
        String source,
        String title,
        String body,
        String tag,
        int notificationId
    ) {
        if (ackToken == null || ackToken.isEmpty() || ackUrl == null || ackUrl.isEmpty()) {
            return null;
        }
        Intent intent =
            new Intent(context, TechPushAckReceiver.class)
                .setAction(ACTION_DISMISS)
                .putExtra(EXTRA_ACK_TOKEN, ackToken)
                .putExtra(EXTRA_ACK_URL, ackUrl)
                .putExtra(EXTRA_SOURCE, source != null ? source : "")
                .putExtra(EXTRA_TITLE, title != null ? title : "")
                .putExtra(EXTRA_BODY, body != null ? body : "")
                .putExtra(EXTRA_TAG, tag != null ? tag : "")
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId);
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /**
     * Open app; for direct_message also POST opened ack first.
     * Falls back to MainActivity when ack fields missing.
     */
    public static PendingIntent openPending(
        Context context,
        int requestCode,
        String ackToken,
        String ackUrl,
        String source,
        String title,
        String body,
        String tag,
        int notificationId,
        String jobId
    ) {
        if (ackToken == null || ackToken.isEmpty() || ackUrl == null || ackUrl.isEmpty()) {
            Intent openIntent =
                new Intent(context, MainActivity.class)
                    .setFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (jobId != null && !jobId.isEmpty()) {
                openIntent.putExtra(JobAlertOverlay.EXTRA_JOB_ID, jobId);
            }
            return PendingIntent.getActivity(
                context,
                requestCode,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }
        Intent intent =
            new Intent(context, TechPushAckReceiver.class)
                .setAction(ACTION_OPEN)
                .putExtra(EXTRA_ACK_TOKEN, ackToken)
                .putExtra(EXTRA_ACK_URL, ackUrl)
                .putExtra(EXTRA_SOURCE, source != null ? source : "")
                .putExtra(EXTRA_TITLE, title != null ? title : "")
                .putExtra(EXTRA_BODY, body != null ? body : "")
                .putExtra(EXTRA_TAG, tag != null ? tag : "")
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                .putExtra(EXTRA_JOB_ID, jobId != null ? jobId : "");
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String dedupeKey(String tag, String action) {
        String t = (tag != null && !tag.isEmpty()) ? tag : "_";
        return t + "|" + action;
    }

    private static boolean markSent(String key) {
        synchronized (SENT_KEYS) {
            if (SENT_KEYS.contains(key)) return false;
            SENT_KEYS.add(key);
            // Bound memory — drop oldest-ish by clearing when large.
            if (SENT_KEYS.size() > 80) SENT_KEYS.clear();
            return true;
        }
    }

    private static void postAsync(
        String ackUrl, String ackToken, String action, String title, String body
    ) {
        new Thread(
                () -> {
                    HttpURLConnection conn = null;
                    try {
                        JSONObject payload = new JSONObject();
                        payload.put("ackToken", ackToken);
                        payload.put("action", action);
                        if (title != null && !title.isEmpty()) {
                            payload.put("originalTitle", title);
                        }
                        if (body != null && !body.isEmpty()) {
                            payload.put("originalBody", body);
                        }
                        conn = (HttpURLConnection) new URL(ackUrl).openConnection();
                        conn.setRequestMethod("POST");
                        conn.setRequestProperty("Content-Type", "application/json");
                        conn.setDoOutput(true);
                        conn.setConnectTimeout(10_000);
                        conn.setReadTimeout(10_000);
                        byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(bytes);
                        }
                        int code = conn.getResponseCode();
                        if (code != 200) {
                            Log.w(TAG, "Ack rejected: HTTP " + code + " action=" + action);
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "Ack failed action=" + action, e);
                    } finally {
                        if (conn != null) conn.disconnect();
                    }
                })
            .start();
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
        String action = intent.getAction();
        String ackToken = intent.getStringExtra(EXTRA_ACK_TOKEN);
        String ackUrl = intent.getStringExtra(EXTRA_ACK_URL);
        String source = intent.getStringExtra(EXTRA_SOURCE);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);
        String tag = intent.getStringExtra(EXTRA_TAG);

        if (ACTION_DISMISS.equals(action)) {
            String key = dedupeKey(tag, "dismissed");
            if (!markSent(key)) return;
            if (ackToken != null && ackUrl != null) {
                final PendingResult pending = goAsync();
                new Thread(
                        () -> {
                            postSync(ackUrl, ackToken, "dismissed", title, body);
                            pending.finish();
                        })
                    .start();
            }
            return;
        }

        if (!ACTION_OPEN.equals(action)) return;

        // Open ack only for direct office messages.
        if ("direct_message".equals(source) && ackToken != null && ackUrl != null) {
            String key = dedupeKey(tag, "opened");
            if (markSent(key)) {
                postAsync(ackUrl, ackToken, "opened", title, body);
            }
            // Swipe after open should not also send dismissed.
            markSent(dedupeKey(tag, "dismissed"));
        }

        Intent openIntent =
            new Intent(context, MainActivity.class)
                .setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String jobId = intent.getStringExtra(EXTRA_JOB_ID);
        if (jobId != null && !jobId.isEmpty()) {
            openIntent.putExtra(JobAlertOverlay.EXTRA_JOB_ID, jobId);
        }
        context.startActivity(openIntent);
    }

    private static void postSync(
        String ackUrl, String ackToken, String action, String title, String body
    ) {
        HttpURLConnection conn = null;
        try {
            JSONObject payload = new JSONObject();
            payload.put("ackToken", ackToken);
            payload.put("action", action);
            if (title != null && !title.isEmpty()) payload.put("originalTitle", title);
            if (body != null && !body.isEmpty()) payload.put("originalBody", body);
            conn = (HttpURLConnection) new URL(ackUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }
            int code = conn.getResponseCode();
            if (code != 200) Log.w(TAG, "Ack rejected: HTTP " + code);
        } catch (Exception e) {
            Log.w(TAG, "Ack failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

package com.hydrogenro.technician;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
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
 * Acknowledgments for technician pushes. Any interaction (swipe, Dismiss,
 * Open, Reply, Yes/No, Call) posts a silent "saw the notification" ack to
 * admins (deduped per tag). Direct Message open also posts a normal
 * "opened" alert.
 */
public class TechPushAckReceiver extends BroadcastReceiver {

    private static final String TAG = "HroTechAck";

    public static final String ACTION_DISMISS = "com.hydrogenro.technician.PUSH_ACK_DISMISS";
    public static final String ACTION_OPEN = "com.hydrogenro.technician.PUSH_ACK_OPEN";
    public static final String ACTION_CALL = "com.hydrogenro.technician.PUSH_ACK_CALL";

    public static final String EXTRA_ACK_TOKEN = "ackToken";
    public static final String EXTRA_ACK_URL = "ackUrl";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_JOB_ID = "jobId";
    public static final String EXTRA_CALL_PHONE = "callPhone";

    private static final Set<String> SENT_KEYS =
        Collections.synchronizedSet(new HashSet<>());

    /**
     * Silent "saw the notification" — call from any button (Reply, Yes, Open,
     * Dismiss, Call). Deduped once per notification tag.
     */
    public static void postSeen(
        String ackToken,
        String ackUrl,
        String title,
        String body,
        String tag
    ) {
        if (ackToken == null || ackToken.isEmpty() || ackUrl == null || ackUrl.isEmpty()) {
            return;
        }
        String key = seenKey(tag);
        if (!markSent(key)) return;
        postAsync(ackUrl, ackToken, "seen", title, body);
    }

    /** @deprecated use {@link #postSeen} — same silent admin ack. */
    public static void postDismiss(
        Context context,
        String ackToken,
        String ackUrl,
        String source,
        String title,
        String body,
        String tag
    ) {
        postSeen(ackToken, ackUrl, title, body, tag);
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
     * Open app; always POST seen first. For direct_message also POST opened
     * (normal sound on admin).
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

    /** Call customer: post seen, then open dialer. */
    public static PendingIntent callPending(
        Context context,
        int requestCode,
        String phone,
        String ackToken,
        String ackUrl,
        String title,
        String body,
        String tag
    ) {
        String digits = phone != null ? phone.replaceAll("[^0-9+]", "") : "";
        if (digits.isEmpty()) return null;
        if (ackToken == null || ackToken.isEmpty() || ackUrl == null || ackUrl.isEmpty()) {
            Intent dialIntent =
                new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + digits))
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            return PendingIntent.getActivity(
                context,
                requestCode,
                dialIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
        }
        Intent intent =
            new Intent(context, TechPushAckReceiver.class)
                .setAction(ACTION_CALL)
                .putExtra(EXTRA_CALL_PHONE, digits)
                .putExtra(EXTRA_ACK_TOKEN, ackToken)
                .putExtra(EXTRA_ACK_URL, ackUrl)
                .putExtra(EXTRA_TITLE, title != null ? title : "")
                .putExtra(EXTRA_BODY, body != null ? body : "")
                .putExtra(EXTRA_TAG, tag != null ? tag : "");
        return PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String seenKey(String tag) {
        String t = (tag != null && !tag.isEmpty()) ? tag : "_";
        return t + "|seen";
    }

    private static boolean markSent(String key) {
        synchronized (SENT_KEYS) {
            if (SENT_KEYS.contains(key)) return false;
            SENT_KEYS.add(key);
            if (SENT_KEYS.size() > 120) {
                SENT_KEYS.clear();
                SENT_KEYS.add(key);
            }
            return true;
        }
    }

    private static void postAsync(
        String ackUrl, String ackToken, String action, String title, String body
    ) {
        new Thread(() -> postSync(ackUrl, ackToken, action, title, body)).start();
    }

    /** Prefer sync + goAsync from receivers so the process is not killed mid-POST. */
    private static boolean postSync(
        String ackUrl, String ackToken, String action, String title, String body
    ) {
        for (int attempt = 0; attempt < 2; attempt++) {
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
                conn.setConnectTimeout(12_000);
                conn.setReadTimeout(12_000);
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }
                int code = conn.getResponseCode();
                if (code == 200) return true;
                Log.w(TAG, "Ack rejected: HTTP " + code + " action=" + action);
            } catch (Exception e) {
                Log.w(TAG, "Ack failed action=" + action + " attempt=" + attempt, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            try {
                Thread.sleep(400);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return false;
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
            if (ackToken == null || ackUrl == null) return;
            String key = seenKey(tag);
            if (!markSent(key)) return;
            final PendingResult pending = goAsync();
            new Thread(
                    () -> {
                        postSync(ackUrl, ackToken, "seen", title, body);
                        pending.finish();
                    })
                .start();
            return;
        }

        if (ACTION_CALL.equals(action)) {
            String phone = intent.getStringExtra(EXTRA_CALL_PHONE);
            final PendingResult pending = goAsync();
            new Thread(
                    () -> {
                        if (ackToken != null && ackUrl != null) {
                            String key = seenKey(tag);
                            if (markSent(key)) {
                                postSync(ackUrl, ackToken, "seen", title, body);
                            }
                        }
                        if (phone != null && !phone.isEmpty()) {
                            try {
                                Intent dial =
                                    new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + phone))
                                        .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                context.startActivity(dial);
                            } catch (Throwable t) {
                                Log.w(TAG, "Dial failed", t);
                            }
                        }
                        pending.finish();
                    })
                .start();
            return;
        }

        if (!ACTION_OPEN.equals(action)) return;

        final PendingResult pending = goAsync();
        final String jobId = intent.getStringExtra(EXTRA_JOB_ID);
        new Thread(
                () -> {
                    if (ackToken != null && ackUrl != null) {
                        String key = seenKey(tag);
                        if (markSent(key)) {
                            postSync(ackUrl, ackToken, "seen", title, body);
                        }
                        // Direct Message tap → normal sound alert as well.
                        if ("direct_message".equals(source)) {
                            String openKey = (tag != null ? tag : "_") + "|opened";
                            if (markSent(openKey)) {
                                postSync(ackUrl, ackToken, "opened", title, body);
                            }
                        }
                    }
                    try {
                        Intent openIntent =
                            new Intent(context, MainActivity.class)
                                .setFlags(
                                    Intent.FLAG_ACTIVITY_NEW_TASK
                                        | Intent.FLAG_ACTIVITY_SINGLE_TOP
                                        | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                        if (jobId != null && !jobId.isEmpty()) {
                            openIntent.putExtra(JobAlertOverlay.EXTRA_JOB_ID, jobId);
                        }
                        context.startActivity(openIntent);
                    } catch (Throwable t) {
                        Log.w(TAG, "Open app failed", t);
                    }
                    pending.finish();
                })
            .start();
    }
}

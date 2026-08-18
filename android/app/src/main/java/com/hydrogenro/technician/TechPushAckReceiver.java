package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Acknowledgments for technician pushes. Any interaction (swipe, Dismiss,
 * Open, Reply, Yes/No, Call) posts a silent "saw the notification" ack to
 * admins. Direct Message open also posts a normal "opened" alert.
 *
 * Reliability: pending acks are written to SharedPreferences before the HTTP
 * attempt; failed posts stay queued and retry via AlarmManager + app start /
 * next FCM. Dedup is per ackToken+action (not tag), so a resend still pings.
 */
public class TechPushAckReceiver extends BroadcastReceiver {

    private static final String TAG = "HroTechAck";

    public static final String ACTION_DISMISS = "com.hydrogenro.technician.PUSH_ACK_DISMISS";
    public static final String ACTION_OPEN = "com.hydrogenro.technician.PUSH_ACK_OPEN";
    public static final String ACTION_CALL = "com.hydrogenro.technician.PUSH_ACK_CALL";
    public static final String ACTION_FLUSH = "com.hydrogenro.technician.PUSH_ACK_FLUSH";

    public static final String EXTRA_ACK_TOKEN = "ackToken";
    public static final String EXTRA_ACK_URL = "ackUrl";
    public static final String EXTRA_SOURCE = "source";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_TAG = "tag";
    public static final String EXTRA_NOTIFICATION_ID = "notificationId";
    public static final String EXTRA_JOB_ID = "jobId";
    public static final String EXTRA_CALL_PHONE = "callPhone";

    private static final String PREFS = "hro_tech_push_ack";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_DONE = "done";
    private static final int MAX_PENDING = 40;
    private static final int MAX_DONE = 80;
    /** Cap durable retries so a permanent server failure cannot burn Netlify invocations forever. */
    private static final int MAX_DURABLE_ATTEMPTS = 12;
    private static final int FLUSH_REQ = 0x0ACF01;
    private static final long[] RETRY_DELAYS_MS = {15_000L, 60_000L, 5 * 60_000L, 20 * 60_000L};

    /** In-memory success cache (also mirrored in prefs KEY_DONE). */
    private static final Set<String> DONE_KEYS =
        Collections.synchronizedSet(new HashSet<>());
    /** Prevent concurrent duplicate POSTs for the same key. */
    private static final Set<String> IN_FLIGHT =
        Collections.synchronizedSet(new HashSet<>());

    /**
     * Silent "saw the notification" — call from any button (Reply, Yes, Open,
     * Dismiss, Call). Deduped once per ackToken.
     */
    public static void postSeen(
        Context context,
        String ackToken,
        String ackUrl,
        String title,
        String body,
        String tag
    ) {
        enqueueAndSend(context, ackToken, ackUrl, "seen", title, body);
    }

    /** @deprecated use {@link #postSeen} — same silent admin ack. */
    @Deprecated
    public static void postDismiss(
        Context context,
        String ackToken,
        String ackUrl,
        String source,
        String title,
        String body,
        String tag
    ) {
        postSeen(context, ackToken, ackUrl, title, body, tag);
    }

    /** Flush any queued acks (app start / FCM / alarm). Safe to call often. */
    public static void flushPendingAsync(Context context) {
        if (context == null) return;
        final Context app = context.getApplicationContext();
        new Thread(() -> flushPending(app)).start();
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

    private static String ackKey(String ackToken, String action) {
        return String.valueOf(ackToken) + "|" + String.valueOf(action);
    }

    private static void enqueueAndSend(
        Context context,
        String ackToken,
        String ackUrl,
        String action,
        String title,
        String body
    ) {
        if (context == null
            || ackToken == null
            || ackToken.isEmpty()
            || ackUrl == null
            || ackUrl.isEmpty()
            || action == null
            || action.isEmpty()) {
            return;
        }
        final Context app = context.getApplicationContext();
        final String key = ackKey(ackToken, action);
        if (isDone(app, key)) return;

        persistPending(app, ackToken, ackUrl, action, title, body);
        new Thread(
                () -> {
                    boolean ok = sendOne(app, key, ackUrl, ackToken, action, title, body);
                    if (!ok) {
                        scheduleFlush(app, RETRY_DELAYS_MS[0]);
                    } else {
                        flushPending(app);
                    }
                })
            .start();
    }

    private static boolean isDone(Context app, String key) {
        if (DONE_KEYS.contains(key)) return true;
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_DONE, "[]");
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                if (key.equals(arr.optString(i))) {
                    DONE_KEYS.add(key);
                    return true;
                }
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    private static void markDone(Context app, String key) {
        DONE_KEYS.add(key);
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_DONE, "[]"));
            JSONArray next = new JSONArray();
            next.put(key);
            for (int i = 0; i < arr.length() && next.length() < MAX_DONE; i++) {
                String existing = arr.optString(i);
                if (!key.equals(existing) && !existing.isEmpty()) next.put(existing);
            }
            prefs.edit().putString(KEY_DONE, next.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "markDone failed", e);
        }
        removePending(app, key);
    }

    private static void persistPending(
        Context app,
        String ackToken,
        String ackUrl,
        String action,
        String title,
        String body
    ) {
        String key = ackKey(ackToken, action);
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            JSONArray next = new JSONArray();
            JSONObject item = new JSONObject();
            item.put("key", key);
            item.put("ackToken", ackToken);
            item.put("ackUrl", ackUrl);
            item.put("action", action);
            item.put("title", title != null ? title : "");
            item.put("body", body != null ? body : "");
            item.put("attempts", 0);
            item.put("queuedAt", System.currentTimeMillis());
            next.put(item);
            for (int i = 0; i < arr.length() && next.length() < MAX_PENDING; i++) {
                JSONObject existing = arr.optJSONObject(i);
                if (existing == null) continue;
                if (key.equals(existing.optString("key"))) continue;
                next.put(existing);
            }
            // commit so a process kill mid-POST still keeps the ack
            prefs.edit().putString(KEY_PENDING, next.toString()).commit();
        } catch (Exception e) {
            Log.w(TAG, "persistPending failed", e);
        }
    }

    private static void removePending(Context app, String key) {
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            JSONArray next = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject existing = arr.optJSONObject(i);
                if (existing == null) continue;
                if (key.equals(existing.optString("key"))) continue;
                next.put(existing);
            }
            prefs.edit().putString(KEY_PENDING, next.toString()).apply();
        } catch (Exception e) {
            Log.w(TAG, "removePending failed", e);
        }
    }

    private static void bumpAttempt(Context app, String key) {
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray arr = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            for (int i = 0; i < arr.length(); i++) {
                JSONObject existing = arr.optJSONObject(i);
                if (existing == null) continue;
                if (!key.equals(existing.optString("key"))) continue;
                existing.put("attempts", existing.optInt("attempts", 0) + 1);
                break;
            }
            prefs.edit().putString(KEY_PENDING, arr.toString()).apply();
        } catch (Exception ignored) {
        }
    }

    private static boolean sendOne(
        Context app,
        String key,
        String ackUrl,
        String ackToken,
        String action,
        String title,
        String body
    ) {
        if (isDone(app, key)) return true;
        if (!IN_FLIGHT.add(key)) return false;
        try {
            boolean ok = postSync(ackUrl, ackToken, action, title, body);
            if (ok) {
                markDone(app, key);
                Log.i(TAG, "Ack delivered action=" + action);
                return true;
            }
            bumpAttempt(app, key);
            return false;
        } finally {
            IN_FLIGHT.remove(key);
        }
    }

    private static void flushPending(Context app) {
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray arr;
        try {
            arr = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
        } catch (Exception e) {
            return;
        }
        if (arr.length() == 0) return;

        boolean anyLeft = false;
        int maxAttempts = 0;
        for (int i = 0; i < arr.length(); i++) {
            JSONObject item = arr.optJSONObject(i);
            if (item == null) continue;
            String key = item.optString("key");
            String ackToken = item.optString("ackToken");
            String ackUrl = item.optString("ackUrl");
            String action = item.optString("action");
            String title = item.optString("title");
            String body = item.optString("body");
            int attempts = item.optInt("attempts", 0);
            if (key.isEmpty() || ackToken.isEmpty() || ackUrl.isEmpty()) continue;
            if (isDone(app, key)) {
                removePending(app, key);
                continue;
            }
            if (attempts >= MAX_DURABLE_ATTEMPTS) {
                Log.w(TAG, "Dropping ack after max retries action=" + action + " attempts=" + attempts);
                markDone(app, key);
                removePending(app, key);
                continue;
            }
            boolean ok = sendOne(app, key, ackUrl, ackToken, action, title, body);
            if (!ok) {
                anyLeft = true;
                maxAttempts = Math.max(maxAttempts, attempts + 1);
            }
        }
        if (anyLeft) {
            int idx = Math.min(maxAttempts, RETRY_DELAYS_MS.length - 1);
            scheduleFlush(app, RETRY_DELAYS_MS[idx]);
        }
    }

    private static void scheduleFlush(Context context, long delayMs) {
        try {
            Context app = context.getApplicationContext();
            AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            Intent intent = new Intent(app, TechPushAckReceiver.class).setAction(ACTION_FLUSH);
            PendingIntent pi =
                PendingIntent.getBroadcast(
                    app,
                    FLUSH_REQ,
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long at = SystemClock.elapsedRealtime() + Math.max(5_000L, delayMs);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            }
            Log.i(TAG, "Scheduled ack flush in " + delayMs + "ms");
        } catch (Throwable t) {
            Log.w(TAG, "scheduleFlush failed", t);
        }
    }

    /** Immediate attempts with short backoff; durable retries use the queue. */
    private static boolean postSync(
        String ackUrl, String ackToken, String action, String title, String body
    ) {
        for (int attempt = 0; attempt < 3; attempt++) {
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
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(15_000);
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bytes);
                }
                int code = conn.getResponseCode();
                // 200 includes skipped/expired — drop from queue either way.
                if (code == 200) return true;
                Log.w(TAG, "Ack rejected: HTTP " + code + " action=" + action);
                // Permanent client errors will never succeed — stop retrying.
                if (code == 400 || code == 401 || code == 403 || code == 404
                        || code == 410 || code == 422) {
                    return true;
                }
                // 408/429/5xx stay false so the durable queue can retry.            } catch (Exception e) {
                Log.w(TAG, "Ack failed action=" + action + " attempt=" + attempt, e);
            } finally {
                if (conn != null) conn.disconnect();
            }
            try {
                Thread.sleep(500L * (attempt + 1));
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
        final Context app = context.getApplicationContext();

        if (ACTION_FLUSH.equals(action)) {
            final PendingResult pending = goAsync();
            new Thread(
                    () -> {
                        flushPending(app);
                        pending.finish();
                    })
                .start();
            return;
        }

        String ackToken = intent.getStringExtra(EXTRA_ACK_TOKEN);
        String ackUrl = intent.getStringExtra(EXTRA_ACK_URL);
        String source = intent.getStringExtra(EXTRA_SOURCE);
        String title = intent.getStringExtra(EXTRA_TITLE);
        String body = intent.getStringExtra(EXTRA_BODY);

        if (ACTION_DISMISS.equals(action)) {
            if (ackToken == null || ackUrl == null) return;
            final PendingResult pending = goAsync();
            new Thread(
                    () -> {
                        persistPending(app, ackToken, ackUrl, "seen", title, body);
                        boolean ok =
                            sendOne(
                                app,
                                ackKey(ackToken, "seen"),
                                ackUrl,
                                ackToken,
                                "seen",
                                title,
                                body);
                        if (!ok) scheduleFlush(app, RETRY_DELAYS_MS[0]);
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
                            persistPending(app, ackToken, ackUrl, "seen", title, body);
                            boolean ok =
                                sendOne(
                                    app,
                                    ackKey(ackToken, "seen"),
                                    ackUrl,
                                    ackToken,
                                    "seen",
                                    title,
                                    body);
                            if (!ok) scheduleFlush(app, RETRY_DELAYS_MS[0]);
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
                        persistPending(app, ackToken, ackUrl, "seen", title, body);
                        boolean okSeen =
                            sendOne(
                                app,
                                ackKey(ackToken, "seen"),
                                ackUrl,
                                ackToken,
                                "seen",
                                title,
                                body);
                        if (!okSeen) scheduleFlush(app, RETRY_DELAYS_MS[0]);
                        // Direct Message tap → normal sound alert as well.
                        if ("direct_message".equals(source)) {
                            persistPending(app, ackToken, ackUrl, "opened", title, body);
                            boolean okOpen =
                                sendOne(
                                    app,
                                    ackKey(ackToken, "opened"),
                                    ackUrl,
                                    ackToken,
                                    "opened",
                                    title,
                                    body);
                            if (!okOpen) scheduleFlush(app, RETRY_DELAYS_MS[0]);
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

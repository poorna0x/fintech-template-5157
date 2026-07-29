package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.util.Log;
import java.io.OutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Sends crashes — and handled-but-important failures — to the office instead of
 * losing them on the technician's phone.
 *
 * A crashing process cannot reliably do network I/O, so the trace is written to
 * SharedPreferences synchronously and uploaded the next time ANY app process
 * starts (activity, FCM service or a broadcast receiver — installed from
 * {@link HroApplication}, which covers all of them).
 *
 * {@link #reportWarning} covers the other half: the background paths swallow
 * failures on purpose so the app survives, which would otherwise make a phone
 * that silently never answers a location request look identical to a healthy
 * one. Warnings upload immediately (the process is alive) and are throttled per
 * kind so a repeating condition costs one report every few hours.
 */
final class CrashReporter {

    private static final String TAG = "HroCrashReporter";
    private static final String PREFS = "hro_crash";
    private static final String KEY_PENDING = "pending";
    private static final String KEY_WARN_PREFIX = "warn_at_";

    private static final String REPORT_URL =
        "https://hydrogenro.com/.netlify/functions/report-app-crash";

    /** Keep the newest few only — old traces are rarely the one you need. */
    private static final int MAX_PENDING = 8;
    private static final int MAX_STACK_CHARS = 6000;
    /** A repeating condition reports at most this often per phone. */
    private static final long WARN_THROTTLE_MS = 6 * 3600_000L;

    private static boolean installed = false;

    private CrashReporter() {}

    static void install(final Context context) {
        if (installed) return;
        installed = true;
        final Context app = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();

        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                saveCrash(app, thread, throwable);
            } catch (Throwable ignored) {
                /* never interfere with the real crash */
            }
            // Let Android finish the crash normally (system dialog, process death).
            if (previous != null) {
                previous.uncaughtException(thread, throwable);
            } else {
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        });
    }

    /**
     * A failure the app handled and kept running through. {@code title} is what
     * the admin reads, so write it for a person, and keep it stable — it is
     * both the throttle key and how repeats are folded together.
     */
    static void reportWarning(Context context, String title, String detail, Throwable cause) {
        try {
            if (context == null || title == null || title.isEmpty()) return;
            Context app = context.getApplicationContext();
            SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

            long now = System.currentTimeMillis();
            String throttleKey = KEY_WARN_PREFIX + Integer.toHexString(title.hashCode());
            if (now - prefs.getLong(throttleKey, 0L) < WARN_THROTTLE_MS) return;

            JSONObject report = baseReport(app, "warning", now);
            report.put("exception", title);
            if (detail != null && !detail.isEmpty()) report.put("message", detail);
            // No cause: the synthetic throwable records where this was reported from.
            report.put("stack", stackOf(cause != null ? cause : new Throwable(title)));

            prefs.edit().putLong(throttleKey, now).apply();
            enqueue(prefs, report, false);
            Log.w(TAG, "Warning queued: " + title);
            uploadPendingAsync(app);
        } catch (Throwable ignored) {
            /* reporting must never break the caller */
        }
    }

    /** Runs on the dying thread: build the report and commit() it synchronously. */
    private static void saveCrash(Context context, Thread thread, Throwable throwable) throws Exception {
        JSONObject report = baseReport(context, "crash", System.currentTimeMillis());
        report.put("exception", throwable.getClass().getName());
        if (throwable.getMessage() != null) report.put("message", throwable.getMessage());
        report.put("thread", thread != null ? thread.getName() : "unknown");
        report.put("stack", stackOf(throwable));

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        enqueue(prefs, report, true);
        Log.w(TAG, "Crash saved for upload: " + throwable.getClass().getSimpleName());
    }

    private static JSONObject baseReport(Context context, String kind, long occurredAt) throws Exception {
        JSONObject report = new JSONObject();
        report.put("app", "technician");
        report.put("kind", kind);
        report.put("occurredAt", occurredAt);
        report.put("device", DevicePrefsPlugin.buildDeviceLabel());
        report.put("androidVersion", "Android " + Build.VERSION.RELEASE + " (SDK " + Build.VERSION.SDK_INT + ")");
        report.put("appVersion", appVersion(context));
        return report;
    }

    private static String stackOf(Throwable throwable) {
        StringWriter sw = new StringWriter();
        throwable.printStackTrace(new PrintWriter(sw));
        String stack = sw.toString();
        return stack.length() > MAX_STACK_CHARS ? stack.substring(0, MAX_STACK_CHARS) : stack;
    }

    /** @param sync true while the process is dying — must not use apply(). */
    private static void enqueue(SharedPreferences prefs, JSONObject report, boolean sync) {
        JSONArray next = trimmed(readPending(prefs));
        next.put(report);
        SharedPreferences.Editor editor = prefs.edit().putString(KEY_PENDING, next.toString());
        if (sync) {
            editor.commit();
        } else {
            editor.apply();
        }
    }

    /** Make room for one more, dropping warnings before crashes. */
    private static JSONArray trimmed(JSONArray pending) {
        if (pending.length() < MAX_PENDING) return pending;

        JSONArray kept = new JSONArray();
        int toDrop = pending.length() - MAX_PENDING + 1;
        for (int pass = 0; pass < 2 && toDrop > 0; pass++) {
            boolean dropWarnings = pass == 0;
            JSONArray survivors = new JSONArray();
            JSONArray source = pass == 0 ? pending : kept;
            for (int i = 0; i < source.length(); i++) {
                JSONObject item = source.optJSONObject(i);
                if (item == null) continue;
                boolean isWarning = "warning".equals(item.optString("kind"));
                if (toDrop > 0 && (isWarning == dropWarnings)) {
                    toDrop--;
                    continue;
                }
                survivors.put(item);
            }
            kept = survivors;
        }
        return kept;
    }

    /** Cheap when there is nothing to send: one SharedPreferences read. */
    static void uploadPendingAsync(final Context context) {
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_PENDING, "");
        if (raw == null || raw.length() < 3) return;

        new Thread(() -> {
            try {
                uploadPending(app);
            } catch (Throwable t) {
                Log.w(TAG, "Crash upload failed", t);
            }
        }, "hro-crash-upload").start();
    }

    private static synchronized void uploadPending(Context context) throws Exception {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray pending = readPending(prefs);
        if (pending.length() == 0) return;

        String token = DevicePrefsPlugin.readFcmToken(context);
        if (token == null) {
            // Not logged in / token not registered yet — keep the reports and
            // retry on a later app start.
            Log.i(TAG, "No FCM token yet; keeping " + pending.length() + " report(s)");
            return;
        }

        JSONArray remaining = new JSONArray();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject report = pending.optJSONObject(i);
            if (report == null) continue;
            report.put("token", token);
            int code = post(report);
            Log.i(TAG, "Report POST code=" + code);
            // Keep it only when the server might still accept it later.
            // 4xx means it will never be accepted — drop it.
            if (code < 200 || code >= 500) {
                remaining.put(report);
            }
        }

        prefs.edit().putString(KEY_PENDING, remaining.length() == 0 ? "" : remaining.toString()).apply();
    }

    private static JSONArray readPending(SharedPreferences prefs) {
        String raw = prefs.getString(KEY_PENDING, "");
        if (raw == null || raw.isEmpty()) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static int post(JSONObject report) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(REPORT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(report.toString().getBytes(StandardCharsets.UTF_8));
            }
            return conn.getResponseCode();
        } catch (Exception e) {
            Log.w(TAG, "POST failed: " + e.getMessage());
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String appVersion(Context context) {
        try {
            PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? info.getLongVersionCode()
                : info.versionCode;
            return info.versionName + " (" + code + ")";
        } catch (Throwable t) {
            return "unknown";
        }
    }
}

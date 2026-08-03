package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;
import java.util.Map;
import org.json.JSONObject;

/**
 * Schedules a wake-up after on-site OTP dwell so Ask OTP can fire even when
 * the WebView is dead (home / killed). Uses RTC wall-clock so reboot can
 * reschedule; prefers exact alarms when the OS allows.
 */
public final class AutoAskOtpAlarmScheduler {

    private static final String TAG = "HroAutoAskOtp";
    static final String PREFS = "hro_auto_ask_otp";
    static final String ACTION_FIRE = "com.hydrogenro.technician.AUTO_ASK_OTP_FIRE";
    static final String EXTRA_JOB_ID = "jobId";
    static final String KEY_PAYLOAD_PREFIX = "payload:";

    private AutoAskOtpAlarmScheduler() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String keyPayload(String jobId) {
        return KEY_PAYLOAD_PREFIX + jobId;
    }

    private static int requestCode(String jobId) {
        return 0xA07_0000 | (Math.abs(jobId.hashCode()) & 0xFFFF);
    }

    /**
     * @param delayMs how long until dwell elapses (from server remainingMs)
     * @param accessToken technician JWT for auto-ask-otp-on-site
     * @param endpointUrl full https URL to auto-ask-otp-on-site
     */
    public static boolean schedule(
        Context context,
        String jobId,
        long delayMs,
        String accessToken,
        String endpointUrl,
        String customerName
    ) {
        if (jobId == null || jobId.isEmpty()) return false;
        if (accessToken == null || accessToken.isEmpty()) return false;
        if (endpointUrl == null || endpointUrl.isEmpty()) return false;
        if (!endpointUrl.startsWith("https://")) {
            Log.w(TAG, "refusing non-https endpoint: " + endpointUrl);
            return false;
        }

        Context app = context.getApplicationContext();
        long wait = Math.max(5_000L, delayMs);
        long fireAtWallMs = System.currentTimeMillis() + wait;

        JSONObject payload = new JSONObject();
        try {
            payload.put("jobId", jobId);
            payload.put("accessToken", accessToken);
            payload.put("endpointUrl", endpointUrl);
            if (customerName != null && !customerName.isEmpty()) {
                payload.put("customerName", customerName);
            }
            payload.put("fireAtWallMs", fireAtWallMs);
        } catch (Throwable t) {
            Log.w(TAG, "payload build failed", t);
            return false;
        }

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;

        Intent intent = new Intent(app, AutoAskOtpAlarmReceiver.class)
            .setAction(ACTION_FIRE)
            .putExtra(EXTRA_JOB_ID, jobId);
        PendingIntent pi =
            PendingIntent.getBroadcast(
                app,
                requestCode(jobId),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        try {
            setWakeupAlarm(am, fireAtWallMs, pi);
            // Persist only after alarm accepted so we never have orphan payloads.
            prefs(app).edit().putString(keyPayload(jobId), payload.toString()).apply();
            Log.i(TAG, "Scheduled auto-ask OTP for job " + jobId + " in " + wait + "ms");
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "schedule failed", t);
            return false;
        }
    }

    private static void setWakeupAlarm(AlarmManager am, long fireAtWallMs, PendingIntent pi) {
        // Prefer exact + idle so Doze does not delay past the 7‑minute dwell.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            boolean exactOk = true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    exactOk = am.canScheduleExactAlarms();
                } catch (Throwable ignored) {
                    exactOk = false;
                }
            }
            if (exactOk) {
                try {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtWallMs, pi);
                    return;
                } catch (SecurityException se) {
                    Log.w(TAG, "exact alarm denied, falling back", se);
                }
            }
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtWallMs, pi);
            return;
        }
        am.set(AlarmManager.RTC_WAKEUP, fireAtWallMs, pi);
    }

    public static void cancel(Context context, String jobId) {
        if (jobId == null || jobId.isEmpty()) return;
        Context app = context.getApplicationContext();
        prefs(app).edit().remove(keyPayload(jobId)).apply();

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent intent = new Intent(app, AutoAskOtpAlarmReceiver.class)
            .setAction(ACTION_FIRE)
            .putExtra(EXTRA_JOB_ID, jobId);
        PendingIntent pi =
            PendingIntent.getBroadcast(
                app,
                requestCode(jobId),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            am.cancel(pi);
            pi.cancel();
        } catch (Throwable ignored) {
            /* */
        }
    }

    /** After reboot: restore alarms that still have a future fire time. */
    public static void rescheduleAllPending(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences sp = prefs(app);
        Map<String, ?> all = sp.getAll();
        if (all == null || all.isEmpty()) return;

        long now = System.currentTimeMillis();
        for (Map.Entry<String, ?> e : all.entrySet()) {
            String key = e.getKey();
            if (key == null || !key.startsWith(KEY_PAYLOAD_PREFIX)) continue;
            Object val = e.getValue();
            if (!(val instanceof String)) continue;
            try {
                JSONObject payload = new JSONObject((String) val);
                String jobId = payload.optString("jobId", "");
                String accessToken = payload.optString("accessToken", "");
                String endpointUrl = payload.optString("endpointUrl", "");
                String customerName = payload.optString("customerName", "");
                long fireAt = payload.optLong("fireAtWallMs", 0L);
                if (jobId.isEmpty() || accessToken.isEmpty() || endpointUrl.isEmpty()) {
                    sp.edit().remove(key).apply();
                    continue;
                }
                long delay = fireAt > 0 ? (fireAt - now) : 5_000L;
                if (delay < 5_000L) delay = 5_000L; // fire soon if overdue
                schedule(app, jobId, delay, accessToken, endpointUrl, customerName);
                Log.i(TAG, "Boot-rescheduled auto-ask for " + jobId + " delay=" + delay);
            } catch (Throwable t) {
                Log.w(TAG, "boot reschedule failed for " + key, t);
            }
        }
    }
}

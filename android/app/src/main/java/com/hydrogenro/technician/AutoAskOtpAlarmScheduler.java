package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;
import org.json.JSONObject;

/**
 * Schedules a wake-up after on-site OTP dwell so Ask OTP can fire even when
 * the WebView is dead (home / killed). JS arms this when the server clock starts.
 */
public final class AutoAskOtpAlarmScheduler {

    private static final String TAG = "HroAutoAskOtp";
    static final String PREFS = "hro_auto_ask_otp";
    static final String ACTION_FIRE = "com.hydrogenro.technician.AUTO_ASK_OTP_FIRE";
    static final String EXTRA_JOB_ID = "jobId";

    private AutoAskOtpAlarmScheduler() {}

    static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static String keyPayload(String jobId) {
        return "payload:" + jobId;
    }

    private static int requestCode(String jobId) {
        return 0xA07_0000 | (Math.abs(jobId.hashCode()) & 0xFFFF);
    }

    /**
     * @param delayMs how long until dwell elapses (from server remainingMs)
     * @param accessToken technician JWT for auto-ask-otp-on-site
     * @param endpointUrl full URL to auto-ask-otp-on-site
     */
    public static void schedule(
        Context context,
        String jobId,
        long delayMs,
        String accessToken,
        String endpointUrl,
        String customerName
    ) {
        if (jobId == null || jobId.isEmpty()) return;
        if (accessToken == null || accessToken.isEmpty()) return;
        if (endpointUrl == null || endpointUrl.isEmpty()) return;

        Context app = context.getApplicationContext();
        long wait = Math.max(5_000L, delayMs);

        try {
            JSONObject payload = new JSONObject();
            payload.put("jobId", jobId);
            payload.put("accessToken", accessToken);
            payload.put("endpointUrl", endpointUrl);
            if (customerName != null && !customerName.isEmpty()) {
                payload.put("customerName", customerName);
            }
            payload.put("fireAtElapsed", SystemClock.elapsedRealtime() + wait);
            prefs(app).edit().putString(keyPayload(jobId), payload.toString()).apply();
        } catch (Throwable t) {
            Log.w(TAG, "save payload failed", t);
            return;
        }

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

        long at = SystemClock.elapsedRealtime() + wait;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pi);
            }
            Log.i(TAG, "Scheduled auto-ask OTP for job " + jobId + " in " + wait + "ms");
        } catch (Throwable t) {
            Log.w(TAG, "schedule failed", t);
        }
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
}

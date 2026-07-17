package com.hydrogenro.admin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Notification channels with custom sounds. Created natively, NOT from JS:
 * the web app is loaded from the live site, so JS also runs inside older APKs
 * that don't have the sound file — if they created a channel it would be locked
 * forever without the sound. Older APKs simply never create these and their
 * pushes fall back to the system default channel until the app is updated.
 */
public final class NotificationChannels {

    /** General technician job updates (on the way, OTP, etc.). */
    public static final String JOB_ALERTS = "job_alerts_v2";

    /** Job completed by technician — uses complete_job.wav. */
    public static final String JOB_COMPLETE = "job_complete_v1";

    private NotificationChannels() {}

    public static void ensureAll(Context context) {
        ensureJobAlerts(context);
        ensureJobComplete(context);
    }

    public static void ensureJobAlerts(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(JOB_ALERTS) != null) return;

        Uri sound = Uri.parse(
            "android.resource://" + context.getPackageName() + "/raw/admin_chime");
        AudioAttributes attrs = notificationAttrs();

        NotificationChannel channel = new NotificationChannel(
            JOB_ALERTS, "Job alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Technician job updates");
        channel.setSound(sound, attrs);
        channel.enableVibration(true);
        channel.enableLights(true);
        nm.createNotificationChannel(channel);
    }

    public static void ensureJobComplete(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(JOB_COMPLETE) != null) return;

        Uri sound = Uri.parse(
            "android.resource://" + context.getPackageName() + "/raw/complete_job");
        AudioAttributes attrs = notificationAttrs();

        NotificationChannel channel = new NotificationChannel(
            JOB_COMPLETE, "Job completed", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("When a technician completes a job");
        channel.setSound(sound, attrs);
        channel.enableVibration(true);
        channel.enableLights(true);
        nm.createNotificationChannel(channel);
    }

    /** Channel for a given FCM data payload (job completed vs other alerts). */
    public static String channelForPushData(String event) {
        if ("completed".equals(event)) return JOB_COMPLETE;
        return JOB_ALERTS;
    }

    private static AudioAttributes notificationAttrs() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
    }
}

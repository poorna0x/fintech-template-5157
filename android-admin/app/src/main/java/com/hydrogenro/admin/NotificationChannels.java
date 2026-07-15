package com.hydrogenro.admin;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * The app's notification channel with the custom HydrogenRO admin chime
 * (res/raw/admin_chime.wav). Created natively, NOT from JS: the web app is
 * loaded from the live site, so JS also runs inside older APKs that don't
 * have the sound file — if they created this channel it would be locked
 * forever without the sound. Older APKs simply never create it and their
 * pushes fall back to the system default channel until the app is updated.
 */
public final class NotificationChannels {

    /** Channel id referenced by server pushes and locally built notifications. */
    public static final String JOB_ALERTS = "job_alerts_v2";

    private NotificationChannels() {}

    public static void ensureJobAlerts(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(JOB_ALERTS) != null) return;

        Uri sound = Uri.parse(
            "android.resource://" + context.getPackageName() + "/raw/admin_chime");
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel channel = new NotificationChannel(
            JOB_ALERTS, "Job alerts", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("Technician job updates");
        channel.setSound(sound, attrs);
        channel.enableVibration(true);
        channel.enableLights(true);
        nm.createNotificationChannel(channel);
    }
}

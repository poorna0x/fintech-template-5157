package com.hydrogenro.technician;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Opens Android's own location-settings dialog when an admin live-location
 * check finds the phone location switch off. A nudge from the office skips
 * the short quiet period so it can ask again.
 */
final class LocationEnablePrompt {

    private static final String TAG = "HroLocationEnable";
    static final int NOTIFICATION_ID = 7402;
    /** Tray item only. Sound is played separately so cancelling this does not cut it off. */
    private static final String TRAY_CHANNEL = "location_enable_v1";
    private static final long QUIET_MS = 90_000L;
    private static long lastShownAt;
    private static Ringtone playing;

    private LocationEnablePrompt() {}

    static void show(
        Context context,
        String uploadUrl,
        String technicianId,
        String nonce,
        boolean force
    ) {
        long now = SystemClock.elapsedRealtime();
        if (!force && now - lastShownAt < QUIET_MS) return;
        lastShownAt = now;
        playNudgeSound(context);

        Intent activity = new Intent(context, LocationEnableActivity.class);
        activity.putExtra(LocationEnableActivity.EXTRA_UPLOAD_URL, uploadUrl);
        activity.putExtra(LocationEnableActivity.EXTRA_TECHNICIAN_ID, technicianId);
        activity.putExtra(LocationEnableActivity.EXTRA_NONCE, nonce);
        activity.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS);

        boolean overlay = false;
        try {
            overlay = Settings.canDrawOverlays(context);
        } catch (Throwable ignored) {
            /* older builds */
        }

        if (!overlay) {
            postFallbackNotification(context, activity);
        }
        try {
            context.startActivity(activity);
        } catch (Throwable t) {
            Log.w(TAG, "Could not open the system location dialog", t);
            if (overlay) postFallbackNotification(context, activity);
        }
    }

    /** Same nudgetech.wav the office "Play nudge sound" button uses. */
    private static void playNudgeSound(Context context) {
        try {
            Uri uri = Uri.parse(
                "android.resource://" + context.getPackageName() + "/" + R.raw.nudgetech
            );
            Ringtone next = RingtoneManager.getRingtone(context.getApplicationContext(), uri);
            if (next == null) return;
            next.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            );
            Ringtone previous = playing;
            playing = next;
            if (previous != null && previous.isPlaying()) previous.stop();
            next.play();
        } catch (Throwable t) {
            Log.w(TAG, "Nudge sound failed", t);
        }
    }

    private static void postFallbackNotification(Context context, Intent activity) {
        ensureTrayChannel(context);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            activity,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            TRAY_CHANNEL
        )
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("Turn on location")
            .setContentText("The office needs this phone's location for the current job.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setSound(null)
            .setAutoCancel(true)
            .setContentIntent(pending);
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }

    private static void ensureTrayChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(TRAY_CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(
            TRAY_CHANNEL,
            "Turn on location",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Shown when the office asks this phone to turn location on");
        channel.setSound(null, null);
        channel.enableVibration(true);
        nm.createNotificationChannel(channel);
    }
}

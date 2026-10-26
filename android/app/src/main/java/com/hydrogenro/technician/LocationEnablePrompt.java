package com.hydrogenro.technician;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
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
    private static final long QUIET_MS = 90_000L;
    private static long lastShownAt;

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

    private static void postFallbackNotification(Context context, Intent activity) {
        NotificationChannels.ensureAll(context);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            activity,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannels.GENERAL_ALERTS
        )
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("Turn on location")
            .setContentText("The office needs this phone's location for the current job.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setAutoCancel(true)
            .setContentIntent(pending);
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "Notifications not permitted", e);
        }
    }
}

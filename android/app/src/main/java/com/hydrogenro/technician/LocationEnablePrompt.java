package com.hydrogenro.technician;

import android.app.ActivityOptions;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

/**
 * Opens Android's own location-settings dialog when an admin live-location
 * check finds the phone location switch off. No sound. "Keep asking" repeats
 * the same dialog until location is on, the office turns it off, or 3 hours pass.
 */
final class LocationEnablePrompt {

    private static final String TAG = "HroLocationEnable";
    static final int NOTIFICATION_ID = 7402;
    private static final int ALARM_REQUEST = 7403;
    /** Tray item only. Silent so a repeat does not ding. */
    private static final String TRAY_CHANNEL = "location_enable_v2";
    private static final String PREFS = "hro_location_keep";
    private static final long QUIET_MS = 90_000L;
    private static final long REPEAT_MS = 45_000L;
    private static final long REPEAT_MAX_MS = 3L * 60L * 60L * 1000L;
    private static long lastShownAt;

    private LocationEnablePrompt() {}

    /** Work-hours nag. Skips the quiet gap so a dismissed dialog comes straight back. */
    static void showImmediate(Context context) {
        if (LocationNag.isDialogUp()) return;
        if (SystemClock.elapsedRealtime() - lastShownAt < 800L) return;
        show(context, null, null, null, true, true);
    }

    static void show(
        Context context,
        String uploadUrl,
        String technicianId,
        String nonce,
        boolean force
    ) {
        show(context, uploadUrl, technicianId, nonce, force, false);
    }

    private static void show(
        Context context,
        String uploadUrl,
        String technicianId,
        String nonce,
        boolean force,
        boolean immediate
    ) {
        long now = SystemClock.elapsedRealtime();
        if (!immediate && !force && now - lastShownAt < QUIET_MS) return;
        if (!immediate && force && now - lastShownAt < 20_000L) return;
        lastShownAt = now;

        Intent activity = new Intent(context, LocationEnableActivity.class);
        activity.putExtra(LocationEnableActivity.EXTRA_UPLOAD_URL, uploadUrl);
        activity.putExtra(LocationEnableActivity.EXTRA_TECHNICIAN_ID, technicianId);
        activity.putExtra(LocationEnableActivity.EXTRA_NONCE, nonce);
        activity.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
        );

        boolean overlay = false;
        try {
            overlay = Settings.canDrawOverlays(context);
        } catch (Throwable ignored) {
            /* older builds */
        }

        postFallbackNotification(context, activity, true);
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                ActivityOptions options = ActivityOptions.makeBasic();
                options.setPendingIntentBackgroundActivityStartMode(
                    ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                );
                context.startActivity(activity, options.toBundle());
            } else {
                context.startActivity(activity);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not open the system location dialog", t);
            if (!overlay) postFallbackNotification(context, activity, true);
        }
    }

    /** Repeat the system dialog until location is on. */
    static void startKeepAsking(Context context, String uploadUrl, String technicianId, String nonce) {
        Context app = context.getApplicationContext();
        prefs(app).edit()
            .putString("uploadUrl", uploadUrl)
            .putString("technicianId", technicianId)
            .putString("nonce", nonce)
            .putLong("deadline", System.currentTimeMillis() + REPEAT_MAX_MS)
            .apply();
        scheduleNext(app);
    }

    static void stopKeepAsking(Context context) {
        Context app = context.getApplicationContext();
        prefs(app).edit().clear().apply();
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(alarmIntent(app));
    }

    static void onAlarm(Context context) {
        Context app = context.getApplicationContext();
        SharedPreferences saved = prefs(app);
        String uploadUrl = saved.getString("uploadUrl", null);
        String technicianId = saved.getString("technicianId", null);
        String nonce = saved.getString("nonce", null);
        long deadline = saved.getLong("deadline", 0L);
        if (uploadUrl == null || technicianId == null || nonce == null || deadline <= 0L) {
            stopKeepAsking(app);
            return;
        }
        if (System.currentTimeMillis() > deadline) {
            stopKeepAsking(app);
            return;
        }
        if (LocationServicesStatus.isEnabled(app)) {
            try {
                LocationFixService.start(app, uploadUrl, technicianId, nonce);
            } catch (Throwable t) {
                Log.w(TAG, "Fix after location came back failed", t);
            }
            stopKeepAsking(app);
            return;
        }
        show(app, uploadUrl, technicianId, nonce, true);
        scheduleNext(app);
    }

    private static void scheduleNext(Context app) {
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        long at = SystemClock.elapsedRealtime() + REPEAT_MS;
        PendingIntent pending = alarmIntent(app);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
                if (exact) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
                }
            } else {
                alarms.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not schedule the next location nudge", t);
        }
    }

    private static PendingIntent alarmIntent(Context app) {
        Intent intent = new Intent(app, LocationNudgeRepeatReceiver.class);
        return PendingIntent.getBroadcast(
            app,
            ALARM_REQUEST,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static SharedPreferences prefs(Context app) {
        return app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void postFallbackNotification(Context context, Intent activity, boolean fullScreen) {
        ensureTrayChannel(context);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending;
        if (Build.VERSION.SDK_INT >= 34) {
            ActivityOptions options = ActivityOptions.makeBasic();
            options.setPendingIntentBackgroundActivityStartMode(
                ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
            );
            options.setPendingIntentCreatorBackgroundActivityStartMode(
                ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
            );
            pending = PendingIntent.getActivity(context, NOTIFICATION_ID, activity, flags, options.toBundle());
        } else {
            pending = PendingIntent.getActivity(context, NOTIFICATION_ID, activity, flags);
        }
        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            TRAY_CHANNEL
        )
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("Turn on location")
            .setContentText("Location is off. Turn it on to keep working.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setSound(null)
            .setVibrate(null)
            .setAutoCancel(true)
            .setContentIntent(pending);
        if (fullScreen) {
            builder.setFullScreenIntent(pending, true);
        }
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(context);
            if (fullScreen) nm.cancel(NOTIFICATION_ID);
            nm.notify(NOTIFICATION_ID, builder.build());
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
        channel.enableVibration(false);
        nm.createNotificationChannel(channel);
    }
}

package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.Calendar;
import java.util.TimeZone;

/** Work-hours location prompt. The phone decides; no office nudge and no network. */
final class LocationNag {

    private static final String TAG = "HroLocationNag";
    private static final String PREFS = "hro_location_nag";
    private static final int START_HOUR = 8;
    private static final int END_HOUR = 20;
    private static final Handler HANDLER = new Handler(Looper.getMainLooper());
    private static boolean dialogUp;
    private static Runnable retry;

    private LocationNag() {}

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean("enabled", false);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean("enabled", enabled).apply();
        sync(context);
    }

    static boolean inWindow() {
        Calendar cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        int hour = cal.get(Calendar.HOUR_OF_DAY);
        return hour >= START_HOUR && hour < END_HOUR;
    }

    static boolean shouldNag(Context context) {
        return isEnabled(context) && inWindow() && !LocationServicesStatus.isEnabled(context);
    }

    static boolean isDialogUp() {
        return dialogUp;
    }

    static void markDialogUp() {
        dialogUp = true;
        if (retry != null) HANDLER.removeCallbacks(retry);
    }

    static void onDialogClosed(Context context) {
        dialogUp = false;
        Context app = context.getApplicationContext();
        if (retry != null) HANDLER.removeCallbacks(retry);
        if (!shouldNag(app)) return;
        retry = () -> LocationEnablePrompt.showImmediate(app);
        HANDLER.postDelayed(retry, 1000L);
    }

    /** Bring the watcher back shortly after the app is swiped away. */
    static void kickSoon(Context context) {
        Context app = context.getApplicationContext();
        if (!isEnabled(app) || !inWindow()) return;
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Intent intent = new Intent(app, LocationNagService.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? PendingIntent.getForegroundService(app, 7411, intent, flags)
            : PendingIntent.getService(app, 7411, intent, flags);
        long at = android.os.SystemClock.elapsedRealtime() + 1000L;
        try {
            boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && exact) {
                alarms.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
            } else {
                alarms.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not restart the location watch", t);
        }
    }

    /** Exact alarms are what let the prompt start again after the app is closed. */
    static void requestExactAlarmsIfNeeded(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null || alarms.canScheduleExactAlarms()) return;
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
            intent.setData(android.net.Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "Exact alarm permission screen failed", t);
        }
    }

    static void sync(Context context) {
        Context app = context.getApplicationContext();
        if (!isEnabled(app)) {
            PlaybackPause.resume(app);
            stopService(app);
            cancelStartAlarm(app);
            return;
        }
        if (inWindow()) {
            startService(app);
            return;
        }
        stopService(app);
        scheduleNextStart(app);
    }

    private static void startService(Context app) {
        try {
            Intent intent = new Intent(app, LocationNagService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                app.startForegroundService(intent);
            } else {
                app.startService(intent);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not start the location watch", t);
        }
    }

    private static void stopService(Context app) {
        try {
            app.stopService(new Intent(app, LocationNagService.class));
        } catch (Throwable ignored) {
            /* not running */
        }
    }

    private static void scheduleNextStart(Context app) {
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Calendar when = Calendar.getInstance(TimeZone.getTimeZone("Asia/Kolkata"));
        if (when.get(Calendar.HOUR_OF_DAY) >= START_HOUR) {
            when.add(Calendar.DATE, 1);
        }
        when.set(Calendar.HOUR_OF_DAY, START_HOUR);
        when.set(Calendar.MINUTE, 0);
        when.set(Calendar.SECOND, 0);
        when.set(Calendar.MILLISECOND, 0);
        PendingIntent pending = startIntent(app);
        long at = when.getTimeInMillis();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                boolean exact = Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms();
                if (exact) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
                }
            } else {
                alarms.setExact(AlarmManager.RTC_WAKEUP, at, pending);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not schedule the 8 AM start", t);
        }
    }

    private static void cancelStartAlarm(Context app) {
        AlarmManager alarms = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(startIntent(app));
    }

    private static PendingIntent startIntent(Context app) {
        Intent intent = new Intent(app, LocationNagAlarmReceiver.class);
        return PendingIntent.getBroadcast(
            app,
            7410,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

}

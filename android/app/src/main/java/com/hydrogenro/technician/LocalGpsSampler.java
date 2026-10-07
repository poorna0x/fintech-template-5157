package com.hydrogenro.technician;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * One GPS sample about every 5 minutes, 7:00–21:00 IST, saved on the phone.
 * Nothing is uploaded on this timer. An admin live-location click sends the
 * newest sample first, then takes a fresh fix.
 */
final class LocalGpsSampler {

    private static final String TAG = "HroLocalGps";
    static final String ACTION_SAMPLE = "com.hydrogenro.technician.LOCAL_GPS_SAMPLE";
    private static final long INTERVAL_MS = 5 * 60 * 1000L;
    private static final TimeZone ZONE = TimeZone.getTimeZone("Asia/Kolkata");
    private static final int REQUEST_CODE = 7402;

    private LocalGpsSampler() {}

    static boolean inWindow(long nowMillis) {
        Calendar cal = Calendar.getInstance(ZONE);
        cal.setTimeInMillis(nowMillis);
        int minutes = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        return minutes >= 7 * 60 && minutes < 21 * 60;
    }

    static void ensureScheduled(Context context) {
        if (context == null) return;
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long triggerAt = nextTriggerMillis(System.currentTimeMillis());
        PendingIntent op = pending(context);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, op);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, op);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, op);
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not schedule local GPS sample", t);
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, op);
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAt, op);
                }
            } catch (Throwable ignored) {
                /* OEM blocked alarms */
            }
        }
    }

    static void onAlarm(Context context) {
        ensureScheduled(context);
        if (context == null || !inWindow(System.currentTimeMillis())) return;
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) return;
        try {
            LocalGpsSampleService.start(context.getApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "Local GPS sample service refused", t);
        }
    }

    private static long nextTriggerMillis(long nowMillis) {
        long start = atHour(nowMillis, 7);
        long end = atHour(nowMillis, 21);
        if (nowMillis < start) return start;
        if (nowMillis >= end) return start + 24 * 60 * 60 * 1000L;
        long plus = nowMillis + INTERVAL_MS;
        if (plus >= end) return start + 24 * 60 * 60 * 1000L;
        return plus;
    }

    /** 7:00 or 21:00 IST on the same civil day as nowMillis. */
    private static long atHour(long nowMillis, int hour) {
        Calendar cal = Calendar.getInstance(ZONE);
        cal.setTimeInMillis(nowMillis);
        cal.set(Calendar.HOUR_OF_DAY, hour);
        cal.set(Calendar.MINUTE, 0);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    private static PendingIntent pending(Context context) {
        Intent intent = new Intent(context, LocalGpsSampleReceiver.class);
        intent.setAction(ACTION_SAMPLE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }
}

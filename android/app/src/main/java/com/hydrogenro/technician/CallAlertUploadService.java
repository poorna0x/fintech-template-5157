package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * Call-alert upload after hangup — works with the app closed.
 *
 * Android 12+ often blocks startForegroundService from PHONE_STATE, and
 * inexact alarms are deferred in Doze. We therefore schedule
 * {@link AlarmManager#setAlarmClock} (exact, Doze-proof). The kick receiver
 * POSTs with goAsync; FGS is only a backup.
 */
public class CallAlertUploadService extends Service {

    private static final String TAG = "HroCallUpload";
    private static final String CHANNEL_ID = "call_alert_upload";
    private static final int NOTIF_ID = 47101;

    public static final String EXTRA_RING_AT = "ring_at";
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_ONCE = "once";

    /** First try after hangup (CallLog / Truecaller lag). */
    private static final long DEFER_MS = 45_000L;
    /** Second try if CallLog still empty. */
    private static final long LATE_RETRY_MS = 90_000L;
    static final String KEY_LATE_RETRY_RING = "late_retry_ring";

    /**
     * Hangup entry: schedule exact alarm-clock wakes (closed-app reliable).
     * Also tries an immediate FGS (may fail on Android 12+ from PHONE_STATE).
     */
    public static void startHangupPipeline(Context context, long ringAt) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        persistPending(app, ringAt);
        // Exact AlarmClock wakes — works with app closed / Doze. Do NOT start
        // FGS from PHONE_STATE (blocked on many Android 12+ devices).
        scheduleAlarmClock(app, ringAt, DEFER_MS, 0);
        scheduleAlarmClock(app, ringAt, LATE_RETRY_MS, 1);
        Log.i(TAG, "Hangup pipeline — alarm clocks @ " + DEFER_MS + "ms + " + LATE_RETRY_MS + "ms");
    }

    /** @deprecated use {@link #startHangupPipeline} */
    public static void scheduleDeferredUpload(Context context, long ringAt) {
        startHangupPipeline(context, ringAt);
    }

    public static void scheduleDeferredUpload(Context context, long ringAt, long delayMs) {
        scheduleAlarmClock(context, ringAt, delayMs, 0);
    }

    public static void scheduleLateRetryIfNeeded(Context context, long ringAt) {
        // Late alarm already scheduled at hangup (index 1). If CallLog empty on
        // first kick, second alarm still fires — mark so we don't loop forever.
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        SharedPreferences prefs =
            app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
        if (prefs.getLong(CallAlertReceiver.KEY_ALERTED_RING_AT, 0L) == ringAt) return;
        if (prefs.getLong(CallAlertReceiver.KEY_POST_ATTEMPTED_RING, 0L) == ringAt) return;
        if (prefs.getLong(KEY_LATE_RETRY_RING, 0L) == ringAt) {
            Log.i(TAG, "Late retry already consumed — giving up ring " + ringAt);
            CallAlertReceiver.markGaveUp(app, ringAt);
            return;
        }
        prefs.edit().putLong(KEY_LATE_RETRY_RING, ringAt).commit();
        Log.i(TAG, "First try empty — waiting for late alarm clock for ring " + ringAt);
    }

    private static void scheduleAlarmClock(Context context, long ringAt, long delayMs, int index) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        PendingIntent op = kickPending(app, ringAt, index);
        long triggerAt = System.currentTimeMillis() + Math.max(1_000L, delayMs);
        try {
            // setAlarmClock is exact + survives Doze (shows a brief alarm icon).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                PendingIntent show = openAppPending(app);
                AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAt, show);
                am.setAlarmClock(info, op);
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAt,
                    op
                );
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, op);
            }
            Log.i(TAG, "AlarmClock index=" + index + " in " + delayMs + "ms ring=" + ringAt);
        } catch (Exception e) {
            Log.w(TAG, "AlarmClock failed: " + e.getMessage());
            try {
                long elapsed = SystemClock.elapsedRealtime() + delayMs;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, elapsed, op);
                } else {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, elapsed, op);
                }
            } catch (Exception ignored) {
                /* best effort */
            }
        }
    }

    public static void startOneShot(Context context, long ringAt) {
        if (ringAt <= 0) return;
        persistPending(context, ringAt);
        Intent i = new Intent(context.getApplicationContext(), CallAlertUploadService.class);
        i.putExtra(EXTRA_MODE, MODE_ONCE);
        i.putExtra(EXTRA_RING_AT, ringAt);
        startFg(context, i);
    }

    private static void persistPending(Context context, long ringAt) {
        context
            .getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(CallAlertReceiver.KEY_PENDING_RING_AT, ringAt)
            .apply();
    }

    static void cancelKicks(Context context, long ringAt) {
        cancelKicks(context, ringAt, true);
    }

    private static void cancelKicks(Context context, long ringAt, boolean clearPending) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            for (int index = 0; index < 2; index++) {
                try {
                    am.cancel(kickPending(app, ringAt, index));
                } catch (Exception ignored) {
                    /* best effort */
                }
            }
        }
        if (clearPending) {
            SharedPreferences prefs =
                app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
            if (prefs.getLong(CallAlertReceiver.KEY_PENDING_RING_AT, 0L) == ringAt) {
                prefs
                    .edit()
                    .remove(CallAlertReceiver.KEY_PENDING_RING_AT)
                    .remove(CallAlertReceiver.KEY_PENDING_NUMBER)
                    .apply();
            }
        }
    }

    private static PendingIntent kickPending(Context app, long ringAt, int index) {
        Intent i = new Intent(app, CallAlertKickReceiver.class);
        i.setAction(CallAlertKickReceiver.ACTION_KICK);
        i.putExtra(CallAlertKickReceiver.EXTRA_RING_AT, ringAt);
        i.putExtra(CallAlertKickReceiver.EXTRA_ATTEMPT, index);
        int req = (int) ((ringAt & 0xfffffffL) ^ (index * 0x9e3779b9L));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(app, req, i, flags);
    }

    private static PendingIntent openAppPending(Context app) {
        Intent i = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
        if (i == null) {
            i = new Intent(app, MainActivity.class);
        }
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(app, 47099, i, flags);
    }

    private static void startFg(Context context, Intent i) {
        Context app = context.getApplicationContext();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                app.startForegroundService(i);
            } else {
                app.startService(i);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForegroundService failed: " + e.getMessage());
            long ringAt = i.getLongExtra(EXTRA_RING_AT, 0L);
            CallAlertReceiver.finalizeAndUpload(app, ringAt, true);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannel();
        Notification notification = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(
                    NOTIF_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SHORT_SERVICE
                );
            } else {
                startForeground(NOTIF_ID, notification);
            }
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed: " + e.getMessage());
            long ringAt = intent != null ? intent.getLongExtra(EXTRA_RING_AT, 0L) : 0L;
            if (ringAt > 0) {
                CallAlertReceiver.finalizeAndUpload(getApplicationContext(), ringAt, true);
            }
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (intent == null) {
            stopClean(startId);
            return START_NOT_STICKY;
        }

        final long ringAt = intent.getLongExtra(EXTRA_RING_AT, 0L);
        final int id = startId;
        final Context app = getApplicationContext();

        new Thread(
            () -> {
                try {
                    Log.i(TAG, "One-shot finalize for ring " + ringAt);
                    if (!CallAlertReceiver.finalizeAndUpload(app, ringAt, true)) {
                        scheduleLateRetryIfNeeded(app, ringAt);
                    }
                } finally {
                    stopClean(id);
                }
            },
            "hro-call-upload"
        )
            .start();

        return START_NOT_STICKY;
    }

    @Override
    public void onTimeout(int startId) {
        Log.w(TAG, "shortService timed out; stopping");
        stopClean(startId);
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "shortService timed out; stopping");
        stopClean(startId);
    }

    private void stopClean(int startId) {
        try {
            stopForeground(true);
        } catch (Exception ignored) {
            /* older APIs */
        }
        try {
            stopSelf(startId);
        } catch (Exception ignored) {
            /* already destroyed */
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch =
            new NotificationChannel(
                CHANNEL_ID,
                "Background sync",
                NotificationManager.IMPORTANCE_LOW
            );
        ch.setDescription("Brief sync when a customer call is detected");
        ch.setSound(null, null);
        ch.enableVibration(false);
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private Notification buildNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("HydrogenRO")
            .setContentText("Syncing…")
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

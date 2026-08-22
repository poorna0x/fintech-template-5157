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
 * One-shot call-alert upload after hangup.
 *
 * Design (latency OK): IDLE schedules a single AlarmManager delay (~20s) so
 * Truecaller / OEM CallLog can flush. The alarm starts this short FGS once —
 * read CallLog (or RINGING cache) → one POST → stop. No watch loop, no kick
 * storms (those burned Netlify invocations).
 */
public class CallAlertUploadService extends Service {

    private static final String TAG = "HroCallUpload";
    private static final String CHANNEL_ID = "call_alert_upload";
    private static final int NOTIF_ID = 47101;

    public static final String EXTRA_RING_AT = "ring_at";
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_ONCE = "once";

    /**
     * First try after hangup. Truecaller / OEM CallLog often needs 15–40s;
     * 20s was too short → empty → give up → only open-app catch-up worked.
     */
    private static final long DEFER_MS = 45_000L;
    /** Second try from hangup if the first still had no number (still ≤1 POST). */
    private static final long LATE_RETRY_MS = 90_000L;
    /** Prefs: ringAt already got its late CallLog retry scheduled. */
    static final String KEY_LATE_RETRY_RING = "late_retry_ring";

    /**
     * Schedule the deferred upload for this ring session (first try @ 45s).
     * Replaces any prior alarm for the same ring.
     */
    public static void scheduleDeferredUpload(Context context, long ringAt) {
        scheduleDeferredUpload(context, ringAt, DEFER_MS);
    }

    public static void scheduleDeferredUpload(Context context, long ringAt, long delayMs) {
        if (ringAt <= 0) return;
        if (delayMs < 1_000L) delayMs = DEFER_MS;
        Context app = context.getApplicationContext();
        persistPending(app, ringAt);
        cancelKicks(app, ringAt, false);

        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) {
            startOneShot(app, ringAt);
            return;
        }

        PendingIntent pi = kickPending(app, ringAt);
        long trigger = SystemClock.elapsedRealtime() + delayMs;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                    am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } else {
                    am.setExactAndAllowWhileIdle(
                        AlarmManager.ELAPSED_REALTIME_WAKEUP,
                        trigger,
                        pi
                    );
                }
            } else {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            }
            Log.i(TAG, "Deferred upload in " + delayMs + "ms for ring " + ringAt);
        } catch (Exception e) {
            Log.w(TAG, "scheduleDeferred failed: " + e.getMessage());
            try {
                am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
            } catch (Exception ignored) {
                startOneShot(app, ringAt);
            }
        }
    }

    /**
     * CallLog still empty after first try — one more alarm (~90s after hangup).
     * Does not POST until a number exists (no extra Netlify burn).
     */
    public static void scheduleLateRetryIfNeeded(Context context, long ringAt) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        SharedPreferences prefs =
            app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
        if (prefs.getLong(CallAlertReceiver.KEY_ALERTED_RING_AT, 0L) == ringAt) return;
        if (prefs.getLong(CallAlertReceiver.KEY_POST_ATTEMPTED_RING, 0L) == ringAt) return;
        if (prefs.getLong(KEY_LATE_RETRY_RING, 0L) == ringAt) {
            Log.i(TAG, "Late retry already used — giving up ring " + ringAt);
            CallAlertReceiver.markGaveUp(app, ringAt);
            return;
        }
        prefs.edit().putLong(KEY_LATE_RETRY_RING, ringAt).commit();
        // Another ~45s from now (hangup+45 + 45 ≈ hangup+90).
        long delay = Math.max(30_000L, LATE_RETRY_MS - DEFER_MS);
        Log.i(TAG, "CallLog empty — late retry in " + delay + "ms for ring " + ringAt);
        scheduleDeferredUpload(app, ringAt, delay);
    }

    /** Alarm / fallback entry: run CallLog + POST once via short FGS. */
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
            try {
                am.cancel(kickPending(app, ringAt));
            } catch (Exception ignored) {
                /* best effort */
            }
        }
        if (clearPending) {
            SharedPreferences prefs =
                app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
            // Only clear pending fields if they still belong to this ring (don't
            // wipe a newer call's cached number).
            if (prefs.getLong(CallAlertReceiver.KEY_PENDING_RING_AT, 0L) == ringAt) {
                prefs
                    .edit()
                    .remove(CallAlertReceiver.KEY_PENDING_RING_AT)
                    .remove(CallAlertReceiver.KEY_PENDING_NUMBER)
                    .apply();
            }
        }
    }

    private static PendingIntent kickPending(Context app, long ringAt) {
        Intent i = new Intent(app, CallAlertKickReceiver.class);
        i.setAction(CallAlertKickReceiver.ACTION_KICK);
        i.putExtra(CallAlertKickReceiver.EXTRA_RING_AT, ringAt);
        int req = (int) (ringAt & 0xfffffffL);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(app, req, i, flags);
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
            // Last chance without FGS (may fail if process is background-restricted).
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
            long ringAt =
                intent != null ? intent.getLongExtra(EXTRA_RING_AT, 0L) : 0L;
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
                    // Prefer CallLog; allow session-cached number if CallLog still empty.
                    if (!CallAlertReceiver.finalizeAndUpload(app, ringAt, true)) {
                        // Don't give up on first empty — Truecaller often writes later.
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

    /**
     * Android 14+ shortService hard budget — stop before the OS kills the app.
     */
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
            .setContentText("Updating…")
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

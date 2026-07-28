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
 * Foreground short-service that finishes call-alert upload while the tech app
 * is killed/backgrounded.
 *
 * Why: Android blocks normal background {@code startService} when the app is
 * not visible, and BroadcastReceiver {@code goAsync} is too short for CallLog
 * delays — so closed-app alerts only worked after opening the APK (JS backup).
 * A short FGS is allowed from PHONE_STATE / AlarmManager and can run long
 * enough to poll CallLog + POST.
 */
public class CallAlertUploadService extends Service {

    private static final String TAG = "HroCallUpload";
    private static final String CHANNEL_ID = "call_alert_upload";
    private static final int NOTIF_ID = 47101;

    public static final String EXTRA_NUMBER = "number";
    public static final String EXTRA_RING_AT = "ring_at";
    public static final String EXTRA_MODE = "mode";
    public static final String MODE_UPLOAD = "upload";
    public static final String MODE_WATCH = "watch";

    private static final long POLL_MS = 400L;
    private static final int WATCH_MAX_TRIES = 150; // ~60s

    /** Retry offsets so we keep trying even if the first FGS start is blocked. */
    private static final long[] KICK_DELAYS_MS = { 2_000L, 8_000L, 20_000L, 40_000L, 70_000L };

    public static void startUpload(Context context, String number, long ringAt) {
        startUpload(context, number, ringAt, true);
    }

    public static void startUpload(
        Context context,
        String number,
        long ringAt,
        boolean scheduleRetries
    ) {
        persistPending(context, ringAt, number);
        Intent i = new Intent(context, CallAlertUploadService.class);
        i.putExtra(EXTRA_MODE, MODE_UPLOAD);
        i.putExtra(EXTRA_NUMBER, number);
        i.putExtra(EXTRA_RING_AT, ringAt);
        startFg(context, i);
        if (scheduleRetries) scheduleKicks(context, ringAt);
    }

    /** Poll CallLog then upload — for Truecaller / delayed CallLog. */
    public static void startWatch(Context context, long ringAt) {
        startWatch(context, ringAt, true);
    }

    public static void startWatch(Context context, long ringAt, boolean scheduleRetries) {
        persistPending(context, ringAt, null);
        Intent i = new Intent(context, CallAlertUploadService.class);
        i.putExtra(EXTRA_MODE, MODE_WATCH);
        i.putExtra(EXTRA_RING_AT, ringAt);
        startFg(context, i);
        if (scheduleRetries) scheduleKicks(context, ringAt);
    }

    private static void persistPending(Context context, long ringAt, @Nullable String number) {
        SharedPreferences.Editor ed =
            context
                .getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(CallAlertReceiver.KEY_PENDING_RING_AT, ringAt);
        if (number != null && !number.trim().isEmpty()) {
            ed.putString(CallAlertReceiver.KEY_PENDING_NUMBER, number.trim());
        }
        ed.apply();
    }

    static void scheduleKicks(Context context, long ringAt) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < KICK_DELAYS_MS.length; i++) {
            PendingIntent pi = kickPending(app, ringAt, i);
            long trigger = SystemClock.elapsedRealtime() + KICK_DELAYS_MS[i];
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
            } catch (Exception e) {
                Log.w(TAG, "scheduleKick failed: " + e.getMessage());
                try {
                    am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, trigger, pi);
                } catch (Exception ignored) {
                    /* best effort */
                }
            }
        }
        Log.i(TAG, "Scheduled " + KICK_DELAYS_MS.length + " upload kicks for ring " + ringAt);
    }

    static void cancelKicks(Context context, long ringAt) {
        if (ringAt <= 0) return;
        Context app = context.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        for (int i = 0; i < KICK_DELAYS_MS.length; i++) {
            try {
                am.cancel(kickPending(app, ringAt, i));
            } catch (Exception ignored) {
                /* best effort */
            }
        }
        app
            .getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(CallAlertReceiver.KEY_PENDING_RING_AT)
            .remove(CallAlertReceiver.KEY_PENDING_NUMBER)
            .apply();
    }

    private static PendingIntent kickPending(Context app, long ringAt, int index) {
        Intent i = new Intent(app, CallAlertKickReceiver.class);
        i.setAction(CallAlertKickReceiver.ACTION_KICK);
        i.putExtra(CallAlertKickReceiver.EXTRA_RING_AT, ringAt);
        int req = (int) ((ringAt & 0xfffffffL) ^ (index * 31L));
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
            // Alarm kicks will retry. Also try sync upload if we already have a number.
            String mode = i.getStringExtra(EXTRA_MODE);
            long ringAt = i.getLongExtra(EXTRA_RING_AT, 0L);
            String number = i.getStringExtra(EXTRA_NUMBER);
            if (MODE_UPLOAD.equals(mode) && number != null) {
                CallAlertReceiver.uploadCallerNow(app, number, ringAt);
            }
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
            stopSelf(startId);
            return START_NOT_STICKY;
        }

        if (intent == null) {
            stopClean(startId);
            return START_NOT_STICKY;
        }

        final String mode = intent.getStringExtra(EXTRA_MODE);
        final String number = intent.getStringExtra(EXTRA_NUMBER);
        final long ringAt = intent.getLongExtra(EXTRA_RING_AT, 0L);
        final int id = startId;
        final Context app = getApplicationContext();

        new Thread(
            () -> {
                try {
                    if (MODE_WATCH.equals(mode)) {
                        watchThenUpload(app, ringAt);
                    } else {
                        if (number != null && !number.isEmpty()) {
                            CallAlertReceiver.uploadCallerNow(app, number, ringAt);
                        }
                    }
                } finally {
                    stopClean(id);
                }
            },
            "hro-call-upload"
        )
            .start();

        return START_REDELIVER_INTENT;
    }

    private void watchThenUpload(Context app, long ringAt) {
        SharedPreferences prefs =
            app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
        if (ringAt <= 0) {
            ringAt = prefs.getLong(CallAlertReceiver.KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) {
                ringAt = prefs.getLong(CallAlertReceiver.KEY_PENDING_RING_AT, System.currentTimeMillis());
            }
        }
        final long session = ringAt;
        Log.i(TAG, "Watch CallLog for ring " + session);
        for (int i = 0; i < WATCH_MAX_TRIES; i++) {
            if (prefs.getLong(CallAlertReceiver.KEY_ALERTED_RING_AT, 0L) == session) {
                Log.i(TAG, "Watch stop — already alerted");
                cancelKicks(app, session);
                return;
            }
            if (CallAlertReceiver.finalizeAndUpload(app, session)) {
                Log.i(TAG, "Watch finalize done");
                return;
            }
            try {
                Thread.sleep(POLL_MS);
            } catch (InterruptedException e) {
                return;
            }
        }
        Log.w(TAG, "Watch timed out without number");
    }

    private void stopClean(int startId) {
        try {
            stopForeground(true);
        } catch (Exception ignored) {
            /* older APIs */
        }
        stopSelf(startId);
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

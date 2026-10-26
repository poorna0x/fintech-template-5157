package com.hydrogenro.technician;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.location.LocationManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Stays awake from 8 AM to 8 PM when this technician is opted in, so turning
 * location off shows Android's prompt immediately. Silent ongoing notification.
 */
public class LocationNagService extends Service {

    private static final String TAG = "HroLocationNag";
    private static final String CHANNEL_ID = "location_nag_v1";
    private static final int NOTIFICATION_ID = 7404;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean receiverRegistered;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            handler.removeCallbacks(this);
            if (!LocationNag.isEnabled(LocationNagService.this) || !LocationNag.inWindow()) {
                LocationNag.sync(LocationNagService.this);
                stopSelf();
                return;
            }
            if (LocationNag.shouldNag(LocationNagService.this) && !LocationNag.isDialogUp()) {
                LocationEnablePrompt.showImmediate(LocationNagService.this);
            }
            handler.postDelayed(this, LocationNag.shouldNag(LocationNagService.this) ? 2000L : 5000L);
        }
    };
    private final BroadcastReceiver modeReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            handler.removeCallbacks(tick);
            handler.post(tick);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        if (!startAsForeground()) {
            stopSelf();
            return;
        }
        IntentFilter filter = new IntentFilter(LocationManager.PROVIDERS_CHANGED_ACTION);
        filter.addAction(LocationManager.MODE_CHANGED_ACTION);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                registerReceiver(modeReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(modeReceiver, filter);
            }
            receiverRegistered = true;
        } catch (Throwable t) {
            Log.w(TAG, "Location switch listener failed", t);
        }
        handler.post(tick);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!LocationNag.isEnabled(this) || !LocationNag.inWindow()) {
            LocationNag.sync(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        if (receiverRegistered) {
            try {
                unregisterReceiver(modeReceiver);
            } catch (Throwable ignored) {
                /* already gone */
            }
            receiverRegistered = false;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean startAsForeground() {
        ensureChannel();
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("Location stays on until 8 PM")
            .setContentText("Turning location off asks you to switch it back on.")
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                try {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                    );
                } catch (Throwable specialUseFailed) {
                    Log.w(TAG, "Special-use foreground denied; using location type", specialUseFailed);
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                    );
                }
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "Foreground start failed", t);
            return false;
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Location stays on",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Shown from 8 AM to 8 PM when this phone must keep location on");
        channel.setSound(null, null);
        channel.enableVibration(false);
        nm.createNotificationChannel(channel);
    }
}

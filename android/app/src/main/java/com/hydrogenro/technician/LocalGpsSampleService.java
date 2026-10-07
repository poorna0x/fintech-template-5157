package com.hydrogenro.technician;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * One short GPS read for {@link LocalGpsStore}. Does not upload. Stops itself
 * as soon as the point is saved (or GPS gives up).
 */
public class LocalGpsSampleService extends Service {

    private static final String TAG = "HroLocalGpsSample";
    private static final String CHANNEL_ID = "local_gps_sample";
    private static final int NOTIFICATION_ID = 7403;
    private static final long MAX_RUNTIME_MS = 20_000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean finished = false;

    public static void start(Context context) {
        Intent intent = new Intent(context, LocalGpsSampleService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!startAsForeground()) {
            stopEverything();
            return START_NOT_STICKY;
        }
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            finish();
            return START_NOT_STICKY;
        }
        FusedLocationProviderClient fused;
        try {
            fused = LocationServices.getFusedLocationProviderClient(this);
        } catch (Throwable t) {
            Log.w(TAG, "Play Services location unavailable", t);
            finish();
            return START_NOT_STICKY;
        }
        handler.postDelayed(this::finish, MAX_RUNTIME_MS);
        requestSample(fused, fine);
        return START_NOT_STICKY;
    }

    @Override
    public void onTimeout(int startId) {
        finish();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        finish();
    }

    private void requestSample(FusedLocationProviderClient fused, boolean fine) {
        try {
            CurrentLocationRequest request = new CurrentLocationRequest.Builder()
                .setPriority(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(90_000L)
                .setDurationMillis(12_000L)
                .build();
            fused.getCurrentLocation(request, null).addOnCompleteListener(task -> {
                Location location = task.isSuccessful() ? task.getResult() : null;
                if (location != null) {
                    LocalGpsStore.save(this, location);
                    finish();
                    return;
                }
                if (!fine) {
                    finish();
                    return;
                }
                try {
                    CurrentLocationRequest fallback = new CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                        .setMaxUpdateAgeMillis(90_000L)
                        .setDurationMillis(8_000L)
                        .build();
                    fused.getCurrentLocation(fallback, null).addOnCompleteListener(t2 -> {
                        Location loc = t2.isSuccessful() ? t2.getResult() : null;
                        if (loc != null) LocalGpsStore.save(this, loc);
                        finish();
                    });
                } catch (Throwable t) {
                    Log.w(TAG, "Balanced sample failed", t);
                    finish();
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "GPS sample failed", t);
            finish();
        }
    }

    private boolean startAsForeground() {
        Notification notification;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Syncing", NotificationManager.IMPORTANCE_MIN);
                    channel.setDescription("Shown briefly while updating");
                    channel.setShowBadge(false);
                    channel.setSound(null, null);
                    nm.createNotificationChannel(channel);
                }
            }
            notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("Syncing…")
                .setContentText("Updating…")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setSilent(true)
                .setOngoing(false)
                .setAutoCancel(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_DEFERRED)
                .build();
        } catch (Throwable t) {
            Log.w(TAG, "Could not build sample notification", t);
            return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                return true;
            } catch (Throwable t) {
                Log.w(TAG, "Typed sample foreground refused", t);
            }
        }
        try {
            startForeground(NOTIFICATION_ID, notification);
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "Sample foreground refused", t);
            return false;
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        stopEverything();
    }

    private void stopEverything() {
        finished = true;
        handler.removeCallbacksAndMessages(null);
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {
            /* never was foreground */
        }
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.cancel(NOTIFICATION_ID);
        } catch (Throwable ignored) {
            /* already gone */
        }
        try {
            stopSelf();
        } catch (Throwable ignored) {
            /* already destroyed */
        }
    }

    @Override
    public void onDestroy() {
        stopEverything();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

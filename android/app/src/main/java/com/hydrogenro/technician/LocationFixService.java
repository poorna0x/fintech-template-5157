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
 * Short-lived foreground service that measures ONE fresh location fix and
 * uploads it. Needed because Android throttles fresh-location computation for
 * backgrounded apps (getCurrentLocation then "succeeds" with null — Google's
 * docs recommend a foreground location service for reliable background
 * access, which is exactly this). The high-priority FCM push that triggers a
 * location request grants a brief window in which this service may start.
 *
 * Shows a quiet, low-importance notification for the few seconds it runs
 * (an Android requirement for foreground services), then stops itself.
 */
public class LocationFixService extends Service {

    private static final String TAG = "HroLocationFix";
    private static final String CHANNEL_ID = "location_fix";
    private static final int NOTIFICATION_ID = 7401;
    /** Hard stop: never linger longer than this, whatever GPS does. */
    private static final long MAX_RUNTIME_MS = 55_000;

    public static final String EXTRA_UPLOAD_URL = "uploadUrl";
    public static final String EXTRA_TECHNICIAN_ID = "technicianId";
    public static final String EXTRA_NONCE = "nonce";

    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean finished = false;

    public static void start(Context context, String uploadUrl, String technicianId, String nonce) {
        Intent intent = new Intent(context, LocationFixService.class);
        intent.putExtra(EXTRA_UPLOAD_URL, uploadUrl);
        intent.putExtra(EXTRA_TECHNICIAN_ID, technicianId);
        intent.putExtra(EXTRA_NONCE, nonce);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.startForegroundService(intent);
        } else {
            context.startService(intent);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startAsForeground();

        String uploadUrl = intent != null ? intent.getStringExtra(EXTRA_UPLOAD_URL) : null;
        String technicianId = intent != null ? intent.getStringExtra(EXTRA_TECHNICIAN_ID) : null;
        String nonce = intent != null ? intent.getStringExtra(EXTRA_NONCE) : null;
        if (uploadUrl == null || technicianId == null || nonce == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        handler.postDelayed(this::finish, MAX_RUNTIME_MS);

        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            finish();
            return START_NOT_STICKY;
        }

        FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(this);
        requestFix(fused, fine, uploadUrl, technicianId, nonce);
        return START_NOT_STICKY;
    }

    /**
     * High accuracy first; when GPS can't lock (indoors it "succeeds" with
     * null), retry in balanced mode which uses Wi-Fi/cell and works indoors.
     */
    private void requestFix(FusedLocationProviderClient fused, boolean fine,
                            String uploadUrl, String technicianId, String nonce) {
        try {
            CurrentLocationRequest request = new CurrentLocationRequest.Builder()
                .setPriority(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(0)
                .setDurationMillis(25_000)
                .build();
            fused.getCurrentLocation(request, null).addOnCompleteListener(task -> {
                Location location = task.isSuccessful() ? task.getResult() : null;
                if (location != null) {
                    LocationUploader.upload(uploadUrl, technicianId, nonce, location);
                    finish();
                    return;
                }
                if (!fine) {
                    finish();
                    return;
                }
                Log.w(TAG, "High-accuracy fix failed (likely indoors); trying balanced");
                try {
                    CurrentLocationRequest fallback = new CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                        .setMaxUpdateAgeMillis(0)
                        .setDurationMillis(15_000)
                        .build();
                    fused.getCurrentLocation(fallback, null).addOnCompleteListener(t2 -> {
                        Location loc = t2.isSuccessful() ? t2.getResult() : null;
                        if (loc != null) LocationUploader.upload(uploadUrl, technicianId, nonce, loc);
                        finish();
                    });
                } catch (SecurityException e) {
                    finish();
                }
            });
        } catch (SecurityException e) {
            finish();
        }
    }

    private void startAsForeground() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null && nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Location sharing", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Shown briefly while sending your location to the office");
                channel.setShowBadge(false);
                nm.createNotificationChannel(channel);
            }
        }
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("Sending location to office…")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        // Small delay so an in-flight upload thread can finish its POST.
        handler.postDelayed(() -> {
            stopForeground(true);
            stopSelf();
        }, 3_000);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

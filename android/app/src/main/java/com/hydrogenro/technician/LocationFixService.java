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
 *
 * Crash rules this must obey:
 * - After {@code startForegroundService}, {@code startForeground} must be
 *   called promptly or Android kills the app.
 * - On Android 14+, a location-typed foreground service without location
 *   permission throws {@link SecurityException}.
 * - OEM battery managers may refuse the foreground start entirely — that
 *   must not take the process down; the push handler has an inline fallback.
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
        // MUST call startForeground promptly after startForegroundService, or
        // Android throws ForegroundServiceDidNotStartInTimeException and kills
        // the app. Permission is checked inside startAsForeground (typed start
        // requires it on Android 14+).
        boolean foreground = startAsForeground();
        if (!foreground) {
            Log.w(TAG, "Could not enter foreground; stopping for inline fallback");
            CrashReporter.reportWarning(this, "Location service blocked by phone",
                "Android refused the background location service, so only a cached position may reach the office. "
                    + "Check battery/background restrictions for the app on this phone.",
                null);
            stopEverything();
            return START_NOT_STICKY;
        }

        String uploadUrl = intent != null ? intent.getStringExtra(EXTRA_UPLOAD_URL) : null;
        String technicianId = intent != null ? intent.getStringExtra(EXTRA_TECHNICIAN_ID) : null;
        String nonce = intent != null ? intent.getStringExtra(EXTRA_NONCE) : null;

        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (uploadUrl == null || technicianId == null || nonce == null || (!fine && !coarse)) {
            Log.w(TAG, "Missing extras or location permission; stopping");
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
        requestFix(fused, fine, uploadUrl, technicianId, nonce);
        return START_NOT_STICKY;
    }

    /**
     * Android 14+ can time out a foreground service; not stopping on demand is
     * itself a crash. Both signatures exist across 14/15+, so honour either.
     */
    @Override
    public void onTimeout(int startId) {
        Log.w(TAG, "Foreground service timed out; stopping");
        finish();
    }

    @Override
    public void onTimeout(int startId, int fgsType) {
        Log.w(TAG, "Foreground service timed out; stopping");
        finish();
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
                try {
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
                    CurrentLocationRequest fallback = new CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                        .setMaxUpdateAgeMillis(0)
                        .setDurationMillis(15_000)
                        .build();
                    fused.getCurrentLocation(fallback, null).addOnCompleteListener(t2 -> {
                        try {
                            Location loc = t2.isSuccessful() ? t2.getResult() : null;
                            if (loc != null) {
                                LocationUploader.upload(uploadUrl, technicianId, nonce, loc);
                            }
                        } catch (Throwable t) {
                            Log.w(TAG, "Balanced fix callback failed", t);
                        } finally {
                            finish();
                        }
                    });
                } catch (Throwable t) {
                    Log.w(TAG, "Location fix callback failed", t);
                    finish();
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "Location request failed", t);
            finish();
        }
    }

    /**
     * @return true only if we really are a foreground service now. Every start
     * path here can legitimately fail on a real phone — background-start rules
     * (Android 12+), missing runtime permission (Android 14+), OEM battery
     * managers — and an unhandled failure crashes the app the moment the admin
     * requests a location. Failing softly just costs us this one FGS attempt;
     * {@link HroMessagingService} still has last-known + inline fallbacks.
     */
    private boolean startAsForeground() {
        Notification notification;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                if (nm != null) {
                    NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID, "Syncing", NotificationManager.IMPORTANCE_LOW);
                    channel.setDescription("Shown briefly while updating");
                    channel.setShowBadge(false);
                    nm.createNotificationChannel(channel);
                }
            }
            notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("Syncing…")
                .setContentText("Updating…")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build();
        } catch (Throwable t) {
            Log.w(TAG, "Could not build foreground notification", t);
            return false;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                return true;
            } catch (Throwable t) {
                Log.w(TAG, "Typed foreground start refused; retrying untyped", t);
            }
        }
        try {
            startForeground(NOTIFICATION_ID, notification);
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "Foreground start refused", t);
            return false;
        }
    }

    private void finish() {
        if (finished) return;
        finished = true;
        handler.removeCallbacksAndMessages(null);
        // Small delay so an in-flight upload thread can finish its POST.
        handler.postDelayed(this::stopEverything, 3_000);
    }

    private void stopEverything() {
        finished = true;
        handler.removeCallbacksAndMessages(null);
        try {
            stopForeground(true);
        } catch (Throwable ignored) {
            /* never was foreground, or already gone */
        }
        try {
            stopSelf();
        } catch (Throwable ignored) {
            /* already destroyed */
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

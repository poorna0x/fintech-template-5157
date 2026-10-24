package com.hydrogenro.technician;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import com.google.android.gms.location.LocationServices;

/**
 * Cancels the old 5-minute background GPS alarm. Live location is taken only
 * when an admin clicks Get live location.
 */
final class LocalGpsSampler {

    private static final String TAG = "HroLocalGps";
    static final String ACTION_SAMPLE = "com.hydrogenro.technician.LOCAL_GPS_SAMPLE";
    static final String ACTION_FIX = "com.hydrogenro.technician.LOCAL_GPS_FIX";
    private static final int REQUEST_CODE = 7402;
    private static final int FIX_REQUEST_CODE = 7404;

    private LocalGpsSampler() {}

    static void cancel(Context context) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        AlarmManager am = (AlarmManager) app.getSystemService(Context.ALARM_SERVICE);
        if (am != null) {
            try {
                am.cancel(samplePending(app));
            } catch (Throwable t) {
                Log.w(TAG, "Could not cancel local GPS alarm", t);
            }
        }
        try {
            LocationServices.getFusedLocationProviderClient(app)
                .removeLocationUpdates(fixPending(app));
        } catch (Throwable ignored) {
            /* no sample was waiting */
        }
    }

    private static PendingIntent samplePending(Context context) {
        Intent intent = new Intent(context, LocalGpsSampleReceiver.class);
        intent.setAction(ACTION_SAMPLE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }

    private static PendingIntent fixPending(Context context) {
        Intent intent = new Intent(context, LocalGpsSampleReceiver.class);
        intent.setAction(ACTION_FIX);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        return PendingIntent.getBroadcast(context, FIX_REQUEST_CODE, intent, flags);
    }
}

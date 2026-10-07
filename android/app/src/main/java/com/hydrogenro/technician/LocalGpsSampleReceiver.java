package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;

/** Restarts the 7:00–21:00 local GPS sampler after boot, update, or each alarm. */
public class LocalGpsSampleReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            LocalGpsSampler.ensureScheduled(app);
            return;
        }
        if (LocalGpsSampler.ACTION_FIX.equals(action)) {
            saveDeliveredFix(app, intent);
            return;
        }
        LocalGpsSampler.onAlarm(app);
    }

    private static void saveDeliveredFix(Context context, Intent intent) {
        Location location = null;
        if (intent != null) {
            LocationResult result = LocationResult.extractResult(intent);
            if (result != null) location = result.getLastLocation();
        }
        if (location != null) LocalGpsStore.save(context, location);
        try {
            LocationServices.getFusedLocationProviderClient(context)
                .removeLocationUpdates(LocalGpsSampler.fixPending(context));
        } catch (Throwable ignored) {
            /* already removed */
        }
    }
}

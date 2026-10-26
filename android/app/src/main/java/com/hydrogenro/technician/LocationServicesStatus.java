package com.hydrogenro.technician;

import android.content.Context;
import android.location.LocationManager;
import android.os.Build;
import android.provider.Settings;

/** Phone location master switch (quick settings), not the app permission. */
final class LocationServicesStatus {

    private LocationServicesStatus() {}

    static boolean isEnabled(Context context) {
        try {
            LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (manager == null) return true;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return manager.isLocationEnabled();
            }
            int mode = Settings.Secure.getInt(
                context.getContentResolver(),
                Settings.Secure.LOCATION_MODE,
                Settings.Secure.LOCATION_MODE_OFF
            );
            return mode != Settings.Secure.LOCATION_MODE_OFF;
        } catch (Throwable t) {
            return true;
        }
    }
}

package com.hydrogenro.admin;

import android.location.Location;
import android.os.Build;

/** Reads Android's per-fix mock flag without treating a missing fix as spoofing. */
final class MockLocationSignals {

    private MockLocationSignals() {}

    @SuppressWarnings("deprecation")
    static boolean isMock(Location location) {
        if (location == null) return false;
        try {
            // API 31+ replaced isFromMockProvider(). Older phones still use it.
            if (Build.VERSION.SDK_INT >= 31) return location.isMock();
            return location.isFromMockProvider();
        } catch (Throwable ignored) {
            return false;
        }
    }

    static LocationFix fromLocation(Location location) {
        if (location == null) return null;
        Double accuracy = location.hasAccuracy() ? (double) location.getAccuracy() : null;
        Long time = location.getTime() > 0L ? location.getTime() : null;
        Double speed = location.hasSpeed() ? (double) location.getSpeed() : null;
        return new LocationFix(
            location.getLatitude(),
            location.getLongitude(),
            accuracy,
            time,
            speed,
            isMock(location),
            location.getProvider()
        );
    }
}

package com.hydrogenro.technician;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;

/**
 * Newest background GPS sample, kept on this phone only. Live-location clicks
 * upload it immediately, then a fresh measurement replaces it.
 */
final class LocalGpsStore {

    private static final String PREFS = "hro_local_gps";
    private static final String LAT = "lat";
    private static final String LNG = "lng";
    private static final String ACC = "acc";
    private static final String TIME = "time";

    private LocalGpsStore() {}

    static void save(Context context, Location location) {
        if (context == null || location == null) return;
        long time = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong(LAT, Double.doubleToRawLongBits(location.getLatitude()))
            .putLong(LNG, Double.doubleToRawLongBits(location.getLongitude()))
            .putFloat(ACC, location.hasAccuracy() ? location.getAccuracy() : -1f)
            .putLong(TIME, time)
            .apply();
    }

    /** Null when nothing has been saved yet. */
    static Location load(Context context) {
        if (context == null) return null;
        SharedPreferences prefs = context.getApplicationContext()
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains(LAT) || !prefs.contains(TIME)) return null;
        long time = prefs.getLong(TIME, 0L);
        if (time <= 0L) return null;
        Location location = new Location("hro_local_gps");
        location.setLatitude(Double.longBitsToDouble(prefs.getLong(LAT, 0L)));
        location.setLongitude(Double.longBitsToDouble(prefs.getLong(LNG, 0L)));
        float acc = prefs.getFloat(ACC, -1f);
        if (acc >= 0f) location.setAccuracy(acc);
        location.setTime(time);
        return location;
    }
}

package com.hydrogenro.admin;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.LocationServices;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Mock-location check for the admin app's distance and "use my location"
 * actions. A missing fix resolves as unavailable, which is not spoofing.
 * The web layer shows the warning; this does not post a notification.
 */
@CapacitorPlugin(name = "LocationRisk")
public class LocationRiskPlugin extends Plugin {

    private static final String TAG = "HroAdminLocationRisk";
    private static final String PREFS = "hro_admin_location_risk";

    @PluginMethod
    public void assessCurrent(PluginCall call) {
        Context context = getContext();
        long now = System.currentTimeMillis();
        if (context == null) {
            call.resolve(toJs(LocationRiskEvaluator.unavailable(now)));
            return;
        }
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            call.resolve(toJs(LocationRiskEvaluator.unavailable(now)));
            return;
        }
        try {
            LocationServices.getFusedLocationProviderClient(context)
                .getLastLocation()
                .addOnCompleteListener(task -> {
                    Location loc = task.isSuccessful() ? task.getResult() : null;
                    call.resolve(toJs(assess(context, loc, now)));
                });
        } catch (Throwable ignored) {
            call.resolve(toJs(LocationRiskEvaluator.unavailable(now)));
        }
    }

    private static LocationRiskResult assess(Context context, Location location, long now) {
        if (location == null) return LocationRiskEvaluator.unavailable(now);
        LocationRiskResult result = LocationRiskEvaluator.assess(
            MockLocationSignals.fromLocation(location),
            loadPrevious(context),
            null,
            now,
            0
        );
        if (!result.locationUsable) {
            Log.w(TAG, "reading not used " + result.diagnostic());
            return result;
        }
        savePrevious(context, location);
        return result;
    }

    private static LocationFix loadPrevious(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (!prefs.contains("lat") || !prefs.contains("time")) return null;
        long time = prefs.getLong("time", 0L);
        if (time <= 0L) return null;
        float acc = prefs.getFloat("acc", -1f);
        return new LocationFix(
            Double.longBitsToDouble(prefs.getLong("lat", 0L)),
            Double.longBitsToDouble(prefs.getLong("lng", 0L)),
            acc >= 0f ? (double) acc : null,
            time,
            null,
            false,
            null
        );
    }

    private static void savePrevious(Context context, Location location) {
        long time = location.getTime() > 0L ? location.getTime() : System.currentTimeMillis();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("lat", Double.doubleToRawLongBits(location.getLatitude()))
            .putLong("lng", Double.doubleToRawLongBits(location.getLongitude()))
            .putFloat("acc", location.hasAccuracy() ? location.getAccuracy() : -1f)
            .putLong("time", time)
            .apply();
    }

    static JSObject toJs(LocationRiskResult result) {
        JSObject out = new JSObject();
        out.put("isMockLocation", result.isMockLocation);
        out.put("riskScore", result.riskScore);
        out.put("riskLevel", result.riskLevel);
        JSArray reasons = new JSArray();
        for (int i = 0; i < result.reasons.size(); i++) {
            reasons.put(result.reasons.get(i));
        }
        out.put("reasons", reasons);
        out.put("locationUsable", result.locationUsable);
        SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        fmt.setTimeZone(TimeZone.getTimeZone("UTC"));
        out.put("checkedAt", fmt.format(result.checkedAt));
        return out;
    }
}

package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
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
 * Lets the web layer ask whether the latest fused fix is mock before it
 * writes a pin. Failure and a missing fix resolve as unavailable, not as spoofing.
 */
@CapacitorPlugin(name = "LocationRisk")
public class LocationRiskPlugin extends Plugin {

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
                    call.resolve(toJs(LocationRiskGate.evaluate(context, loc, false)));
                });
        } catch (Throwable ignored) {
            call.resolve(toJs(LocationRiskEvaluator.unavailable(now)));
        }
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

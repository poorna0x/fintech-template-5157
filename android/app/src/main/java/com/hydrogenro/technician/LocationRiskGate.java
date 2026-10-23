package com.hydrogenro.technician;

import android.content.Context;
import android.location.Location;
import android.util.Log;

/**
 * Checks one fix against the last sample kept on this phone. Does not upload
 * and does not ban. A missing fix stays "unavailable", which is not spoofing.
 */
final class LocationRiskGate {

    private static final String TAG = "HroLocationRisk";

    private LocationRiskGate() {}

    static LocationRiskResult evaluate(Context context, Location location, boolean notify) {
        long now = System.currentTimeMillis();
        if (location == null) return LocationRiskEvaluator.unavailable(now);
        LocationFix previous = null;
        try {
            Location stored = LocalGpsStore.load(context);
            if (stored != null) previous = MockLocationSignals.fromLocation(stored);
        } catch (Throwable t) {
            Log.w(TAG, "previous fix unavailable");
        }
        LocationRiskResult result = LocationRiskEvaluator.assess(
            MockLocationSignals.fromLocation(location),
            previous,
            null,
            now,
            0
        );
        if (!result.locationUsable) {
            Log.w(TAG, "reading not used " + result.diagnostic());
        }
        if (notify && result.isMockLocation && context != null) {
            LocationRiskNotice.show(context);
        }
        return result;
    }
}

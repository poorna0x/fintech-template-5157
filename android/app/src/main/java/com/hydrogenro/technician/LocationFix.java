package com.hydrogenro.technician;

/** One location reading passed into {@link LocationRiskEvaluator}. Null fields mean "not known". */
final class LocationFix {

    final double latitude;
    final double longitude;
    final Double accuracyMeters;
    final Long fixTimeMs;
    final Double reportedSpeedMps;
    final boolean mock;
    final String provider;

    LocationFix(double latitude, double longitude, Double accuracyMeters, Long fixTimeMs,
                Double reportedSpeedMps, boolean mock, String provider) {
        this.latitude = latitude;
        this.longitude = longitude;
        this.accuracyMeters = accuracyMeters;
        this.fixTimeMs = fixTimeMs;
        this.reportedSpeedMps = reportedSpeedMps;
        this.mock = mock;
        this.provider = provider;
    }

    static LocationFix at(double latitude, double longitude, double accuracyMeters, long fixTimeMs) {
        return new LocationFix(latitude, longitude, accuracyMeters, fixTimeMs, null, false, null);
    }
}

package com.hydrogenro.admin;

import java.util.ArrayList;
import java.util.List;

/**
 * Same rules as {@code netlify/functions/location-risk.js}. Pure Java so unit
 * tests run without a device.
 *
 * <p>Confirmed mock comes only from Android's per-fix mock flag
 * ({@code Location.isMock()} on API 31+, {@code isFromMockProvider()} before
 * that). A missing fix, poor accuracy, or a VPN is not spoofing. Impossible
 * travel rejects that reading. It does not ban anyone. Admin and technician
 * apps share these thresholds with {@code location-risk.js}.
 *
 * <p>Play Integrity is not used. It does not prove a GPS fix is real, and
 * root or a patched app can hide the mock flag and feed realistic movement.
 * The server recomputes the decision and does not trust a score from the phone.
 */
final class LocationRiskEvaluator {

    static final int REJECT_SCORE = 70;
    static final int ELEVATED_SCORE = 40;
    static final int HIGH_SCORE = 55;
    static final int CONFIRMED_SCORE = 80;
    static final double MAX_SPEED_MPS = 55.0;
    static final double MIN_JUMP_METERS = 1500.0;
    static final long SHORT_WINDOW_MS = 15_000L;
    static final double SHORT_WINDOW_JUMP_METERS = 3000.0;
    static final double ACCURACY_PADDING_FACTOR = 3.0;
    static final double MISSING_ACCURACY_METERS = 100.0;
    static final long FUTURE_SOFT_MS = 2L * 60L * 1000L;
    static final int FUTURE_SOFT_SCORE = 40;
    static final int MOCK_SCORE = 80;
    static final int IMPOSSIBLE_SPEED_SCORE = 70;
    static final int ZERO_ACCURACY_SCORE = 10;
    static final double REPORTED_SPEED_MPS = 70.0;
    static final double REPORTED_SPEED_MAX_ACCURACY_M = 40.0;
    static final int REPORTED_SPEED_SCORE = 25;
    static final int TIMESTAMP_CONFLICT_SCORE = 40;
    static final int ACCURACY_SWING_SCORE = 10;
    static final double ACCURACY_SWING_TIGHT_M = 25.0;
    static final double ACCURACY_SWING_LOOSE_M = 3000.0;
    static final double PROVIDER_DISAGREE_METERS = 2000.0;
    static final long PROVIDER_DISAGREE_WINDOW_MS = 2L * 60L * 1000L;
    static final int PROVIDER_DISAGREE_SCORE = 20;
    static final int INTEGRITY_SCORE_CAP = 25;

    private LocationRiskEvaluator() {}

    /**
     * API 31+ uses {@code Location.isMock()}. Older versions only have the
     * deprecated {@code isFromMockProvider()} flag. Pass the two booleans in;
     * this picks the one that exists on that SDK.
     */
    static boolean mockFlagForSdk(int sdkInt, boolean isMock, boolean isFromMockProvider) {
        if (sdkInt >= 31) return isMock;
        return isFromMockProvider;
    }

    static LocationRiskResult unavailable(long nowMs) {
        List<String> reasons = new ArrayList<>();
        reasons.add("location_unavailable");
        return new LocationRiskResult(false, 0, "none", reasons, false, nowMs);
    }

    static LocationRiskResult assess(LocationFix location, LocationFix previous, LocationFix other,
                                     long nowMs, int integrityRisk) {
        if (location == null) return unavailable(nowMs);

        List<String> reasons = new ArrayList<>();
        int score = 0;
        boolean mock = location.mock;
        if (mock) {
            reasons.add("mock_provider");
            score += MOCK_SCORE;
        }
        if (!isValidCoord(location.latitude, location.longitude)) {
            reasons.add("invalid_coordinates");
            return finish(mock, score, reasons, false, nowMs);
        }
        if (hasTime(location) && location.fixTimeMs - nowMs > FUTURE_SOFT_MS) {
            reasons.add("future_timestamp");
            score += FUTURE_SOFT_SCORE;
        }
        if (location.reportedSpeedMps != null
            && location.reportedSpeedMps > REPORTED_SPEED_MPS
            && location.accuracyMeters != null
            && location.accuracyMeters >= 0
            && location.accuracyMeters <= REPORTED_SPEED_MAX_ACCURACY_M) {
            reasons.add("reported_speed");
            score += REPORTED_SPEED_SCORE;
        }
        if (location.accuracyMeters != null && location.accuracyMeters == 0d) {
            reasons.add("zero_accuracy");
            score += ZERO_ACCURACY_SCORE;
        }

        if (previous != null && isValidCoord(previous.latitude, previous.longitude)) {
            double dist = distanceMeters(
                location.latitude, location.longitude, previous.latitude, previous.longitude);
            double floor = paddingMeters(location, previous);
            boolean bothTimes = hasTime(location) && hasTime(previous);
            if (bothTimes
                && location.fixTimeMs == previous.fixTimeMs
                && dist > Math.max(MIN_JUMP_METERS, floor)) {
                reasons.add("timestamp_conflict");
                score += TIMESTAMP_CONFLICT_SCORE;
            } else if (bothTimes && location.fixTimeMs != previous.fixTimeMs) {
                long dt = Math.abs(location.fixTimeMs - previous.fixTimeMs);
                boolean shortJump = dt < SHORT_WINDOW_MS
                    && dist > Math.max(SHORT_WINDOW_JUMP_METERS, floor);
                boolean pacedJump = dt >= SHORT_WINDOW_MS
                    && dt > 0
                    && dist > Math.max(MIN_JUMP_METERS, floor)
                    && dist / (dt / 1000.0) > MAX_SPEED_MPS;
                if (shortJump || pacedJump) {
                    reasons.add("impossible_speed");
                    score += IMPOSSIBLE_SPEED_SCORE;
                }
            }
            if (!reasons.contains("impossible_speed") && !reasons.contains("timestamp_conflict")) {
                boolean moved = dist > Math.max(MIN_JUMP_METERS, floor);
                if (moved
                    && previous.accuracyMeters != null
                    && location.accuracyMeters != null
                    && previous.accuracyMeters > 0
                    && previous.accuracyMeters < ACCURACY_SWING_TIGHT_M
                    && location.accuracyMeters > ACCURACY_SWING_LOOSE_M) {
                    reasons.add("accuracy_swing");
                    score += ACCURACY_SWING_SCORE;
                }
            }
        }

        if (other != null
            && other.provider != null
            && location.provider != null
            && !other.provider.equals(location.provider)
            && isValidCoord(other.latitude, other.longitude)) {
            double dist = distanceMeters(
                location.latitude, location.longitude, other.latitude, other.longitude);
            double floor = paddingMeters(location, other);
            boolean timesClose = true;
            if (hasTime(location) && hasTime(other)) {
                timesClose = Math.abs(location.fixTimeMs - other.fixTimeMs) <= PROVIDER_DISAGREE_WINDOW_MS;
            }
            if (timesClose && dist > Math.max(PROVIDER_DISAGREE_METERS, floor)) {
                reasons.add("provider_disagreement");
                score += PROVIDER_DISAGREE_SCORE;
            }
        }

        if (integrityRisk > 0) {
            reasons.add("device_integrity");
            score += Math.min(INTEGRITY_SCORE_CAP, integrityRisk);
        }

        boolean usable = score < REJECT_SCORE;
        return finish(mock, score, reasons, usable, nowMs);
    }

    private static LocationRiskResult finish(boolean mock, int score, List<String> reasons,
                                             boolean usable, long nowMs) {
        int capped = Math.max(0, Math.min(100, score));
        String level;
        if (mock || capped >= CONFIRMED_SCORE) level = "confirmed";
        else if (capped >= HIGH_SCORE) level = "high";
        else if (capped >= ELEVATED_SCORE) level = "elevated";
        else level = "none";
        boolean locationUsable = usable && !mock && capped < REJECT_SCORE;
        return new LocationRiskResult(mock, capped, level, reasons, locationUsable, nowMs);
    }

    static boolean isValidCoord(double latitude, double longitude) {
        return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
            && !Double.isNaN(latitude) && !Double.isNaN(longitude);
    }

    static double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double radius = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * radius * Math.asin(Math.min(1.0, Math.sqrt(a)));
    }

    private static boolean hasTime(LocationFix sample) {
        return sample.fixTimeMs != null && sample.fixTimeMs > 0;
    }

    private static double accuracyMetersOf(LocationFix sample) {
        if (sample.accuracyMeters == null || sample.accuracyMeters < 0) return MISSING_ACCURACY_METERS;
        return sample.accuracyMeters;
    }

    private static double paddingMeters(LocationFix a, LocationFix b) {
        return ACCURACY_PADDING_FACTOR * (accuracyMetersOf(a) + accuracyMetersOf(b));
    }
}

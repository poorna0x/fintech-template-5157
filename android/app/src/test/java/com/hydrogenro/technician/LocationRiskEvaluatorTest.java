package com.hydrogenro.technician;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class LocationRiskEvaluatorTest {

    private static final long NOW = 1_761_220_800_000L;

    private static LocationFix here(long fixTimeMs) {
        return LocationFix.at(12.9716, 77.5946, 15, fixTimeMs);
    }

    @Test
    public void genuineNearbyFixIsUsable() {
        LocationRiskResult result = LocationRiskEvaluator.assess(
            LocationFix.at(12.98, 77.6, 15, NOW),
            here(NOW - 60_000L),
            null,
            NOW,
            0
        );
        assertFalse(result.isMockLocation);
        assertTrue(result.locationUsable);
        assertEquals(0, result.riskScore);
        assertEquals("none", result.riskLevel);
        assertEquals(NOW, result.checkedAt);
    }

    @Test
    public void mockFlagRejectsEvenWhenThePinDoesNotMove() {
        LocationFix mock = new LocationFix(12.9716, 77.5946, 15d, NOW, null, true, "gps");
        LocationRiskResult result = LocationRiskEvaluator.assess(mock, here(NOW - 60_000L), null, NOW, 0);
        assertTrue(result.isMockLocation);
        assertFalse(result.locationUsable);
        assertEquals("confirmed", result.riskLevel);
        assertTrue(result.reasons.contains("mock_provider"));
    }

    @Test
    public void poorAccuracyAloneIsNotSpoofing() {
        LocationFix poor = new LocationFix(12.9716, 77.5946, 8000d, NOW, null, false, null);
        LocationRiskResult result = LocationRiskEvaluator.assess(poor, here(NOW - 60_000L), null, NOW, 0);
        assertTrue(result.locationUsable);
        assertEquals(0, result.riskScore);
    }

    @Test
    public void missingFixIsNotMock() {
        LocationRiskResult result = LocationRiskEvaluator.unavailable(NOW);
        assertFalse(result.isMockLocation);
        assertFalse(result.locationUsable);
        assertEquals(0, result.riskScore);
        assertTrue(result.reasons.contains("location_unavailable"));
    }

    @Test
    public void staleRepeatIsUsable() {
        LocationRiskResult result = LocationRiskEvaluator.assess(
            here(NOW - 6 * 60 * 60 * 1000L),
            here(NOW - 6 * 60 * 60 * 1000L - 60_000L),
            null,
            NOW,
            0
        );
        assertTrue(result.locationUsable);
        assertFalse(result.reasons.contains("impossible_speed"));
    }

    @Test
    public void impossibleJumpIsRejectedWithoutCallingItMock() {
        LocationFix far = LocationFix.at(13.15, 77.5946, 15, NOW);
        LocationRiskResult result = LocationRiskEvaluator.assess(far, here(NOW - 60_000L), null, NOW, 0);
        assertFalse(result.locationUsable);
        assertFalse(result.isMockLocation);
        assertTrue(result.reasons.contains("impossible_speed"));
    }

    @Test
    public void halfHourCommuteIsKept() {
        LocationFix far = LocationFix.at(13.15, 77.5946, 15, NOW);
        LocationRiskResult result = LocationRiskEvaluator.assess(
            far, here(NOW - 30 * 60 * 1000L), null, NOW, 0);
        assertTrue(result.locationUsable);
    }

    @Test
    public void shortGpsSnapIsKept() {
        LocationFix jitter = LocationFix.at(12.9788, 77.5946, 80, NOW);
        LocationRiskResult result = LocationRiskEvaluator.assess(
            jitter, here(NOW - 3_000L), null, NOW, 0);
        assertTrue(result.locationUsable);
    }

    @Test
    public void olderSdkUsesDeprecatedFlagOnly() {
        assertFalse(LocationRiskEvaluator.mockFlagForSdk(24, true, false));
        assertTrue(LocationRiskEvaluator.mockFlagForSdk(30, false, true));
        assertTrue(LocationRiskEvaluator.mockFlagForSdk(31, true, false));
        assertFalse(LocationRiskEvaluator.mockFlagForSdk(36, false, true));
    }

    @Test
    public void realisticMovementWithoutMockFlagIsNotRejected() {
        LocationFix moved = LocationFix.at(12.99, 77.61, 20, NOW);
        LocationRiskResult result = LocationRiskEvaluator.assess(
            moved, here(NOW - 10 * 60 * 1000L), null, NOW, 0);
        assertTrue(result.locationUsable);
        assertFalse(result.isMockLocation);
    }

    @Test
    public void integritySignalAloneDoesNotReject() {
        LocationRiskResult result = LocationRiskEvaluator.assess(here(NOW), null, null, NOW, 100);
        assertTrue(result.locationUsable);
        assertTrue(result.reasons.contains("device_integrity"));
        assertTrue(result.riskScore <= 25);
    }
}

package com.hydrogenro.admin;

import java.util.Collections;
import java.util.List;

/** Structured result of one location check. {@code checkedAt} is epoch milliseconds. */
final class LocationRiskResult {

    final boolean isMockLocation;
    final int riskScore;
    final String riskLevel;
    final List<String> reasons;
    final boolean locationUsable;
    final long checkedAt;

    LocationRiskResult(boolean isMockLocation, int riskScore, String riskLevel, List<String> reasons,
                       boolean locationUsable, long checkedAt) {
        this.isMockLocation = isMockLocation;
        this.riskScore = riskScore;
        this.riskLevel = riskLevel;
        this.reasons = Collections.unmodifiableList(reasons);
        this.locationUsable = locationUsable;
        this.checkedAt = checkedAt;
    }

    /** Log line without coordinates. */
    String diagnostic() {
        return "level=" + riskLevel + " score=" + riskScore + " mock=" + isMockLocation
            + " usable=" + locationUsable + " reasons=" + reasons;
    }
}

package com.hydrogenro.technician;

import android.content.Context;
import android.location.Location;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Uploads a location fix to the upload-tech-location function. Shared by
 * HroMessagingService (instant cached fix) and LocationFixService (fresh fix).
 * The one-time nonce from the push authenticates the upload; the server
 * ignores older measurements when a newer one is already stored.
 */
final class LocationUploader {

    private static final String TAG = "HroLocationUpload";

    private LocationUploader() {}

    /** Phone location switch is off. No coordinates — the admin live-location screen reads this. */
    static void reportServicesOff(String uploadUrl, String technicianId, String nonce, boolean off) {
        if (uploadUrl == null || technicianId == null || nonce == null) return;
        new Thread(() -> post(uploadUrl, "{\"technicianId\":\"" + technicianId + "\"," +
            "\"nonce\":\"" + nonce + "\"," +
            "\"locationServicesOff\":" + (off ? "true" : "false") + "}"), "hro-loc-off").start();
    }

    static void upload(Context context, String uploadUrl, String technicianId, String nonce, Location location) {
        if (location == null || uploadUrl == null || technicianId == null || nonce == null) return;
        boolean mockReported = false;
        try {
            LocationRiskResult risk = LocationRiskGate.evaluate(context, location);
            mockReported = risk.isMockLocation;
            if (risk.reasons.contains("invalid_coordinates") || risk.reasons.contains("location_unavailable")) {
                return;
            }
        } catch (Throwable t) {
            Log.w(TAG, "risk check failed; uploading for the server to judge");
        }
        final boolean mockFlag = mockReported;
        new Thread(() -> {
            try {
                String payload = "{\"technicianId\":\"" + technicianId + "\"," +
                    "\"nonce\":\"" + nonce + "\"," +
                    "\"latitude\":" + location.getLatitude() + "," +
                    "\"longitude\":" + location.getLongitude() + "," +
                    "\"accuracy\":" + (location.hasAccuracy() ? location.getAccuracy() : "null") + "," +
                    "\"speed\":" + (location.hasSpeed() ? location.getSpeed() : "null") + "," +
                    // OS mock bit. The server recomputes; a patched app can omit this.
                    "\"mockReported\":" + (mockFlag ? "true" : "false") + "," +
                    // When the fix was measured — lets the admin view tell a cached
                    // last-known position apart from a genuinely fresh one.
                    "\"fixTime\":" + location.getTime() + "}";

                post(uploadUrl, payload);
            } catch (Exception e) {
                Log.w(TAG, "Upload failed", e);
            }
        }).start();
    }

    private static void post(String uploadUrl, String payload) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(uploadUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(10_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            if (code != 200) Log.w(TAG, "Upload rejected: HTTP " + code);
        } catch (Exception e) {
            Log.w(TAG, "Upload failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

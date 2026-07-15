package com.hydrogenro.technician;

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

    static void upload(String uploadUrl, String technicianId, String nonce, Location location) {
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                String payload = "{\"technicianId\":\"" + technicianId + "\"," +
                    "\"nonce\":\"" + nonce + "\"," +
                    "\"latitude\":" + location.getLatitude() + "," +
                    "\"longitude\":" + location.getLongitude() + "," +
                    "\"accuracy\":" + (location.hasAccuracy() ? location.getAccuracy() : "null") + "," +
                    // When the fix was measured — lets the admin view tell a cached
                    // last-known position apart from a genuinely fresh one.
                    "\"fixTime\":" + location.getTime() + "}";

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
        }).start();
    }
}

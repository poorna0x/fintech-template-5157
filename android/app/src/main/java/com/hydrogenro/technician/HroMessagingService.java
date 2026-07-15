package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.location.Location;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.CurrentLocationRequest;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.messaging.RemoteMessage;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Replaces the Capacitor push service (declared in AndroidManifest.xml) so
 * location-request pushes are handled NATIVELY. The JS handler only runs while
 * the webview is alive; this service runs even when Android has killed the
 * app, which is why job notifications always worked but location requests
 * didn't. Extending the Capacitor service keeps all JS push behavior intact.
 *
 * Also handles OTP-request pushes: shows a notification with an inline
 * "Enter OTP" reply field (like WhatsApp's reply), so the technician can
 * type the 4-digit code straight into the notification without opening
 * the app. The typed code is delivered to OtpReplyReceiver.
 */
public class HroMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    private static final String TAG = "HroLocationPush";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if ("otp_request".equals(data.get("type"))) {
            showOtpNotification(data);
            return;
        }
        if ("clear_notifications".equals(data.get("type"))) {
            clearNotifications(data.get("tag"));
            return;
        }
        if (!"location_request".equals(data.get("type"))) return;

        String technicianId = data.get("technicianId");
        String nonce = data.get("nonce");
        String uploadUrl = data.get("uploadUrl");
        if (technicianId == null || nonce == null || uploadUrl == null) return;

        Context context = getApplicationContext();
        boolean fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        if (!fine && !coarse) {
            Log.w(TAG, "No location permission; skipping upload");
            return;
        }

        FusedLocationProviderClient fused = LocationServices.getFusedLocationProviderClient(context);

        // Last known fix first: instant, so the admin sees something right away
        // even if the fresh fix below takes a while or the process dies.
        try {
            fused.getLastLocation().addOnSuccessListener(location -> {
                if (location != null) upload(uploadUrl, technicianId, nonce, location);
            });
        } catch (SecurityException e) {
            Log.w(TAG, "getLastLocation not permitted", e);
        }

        // Then a fresh fix (up to ~30s). onMessageReceived's process usually
        // stays alive long enough; if not, the last-known upload already landed.
        requestFreshFix(fused, fine, uploadUrl, technicianId, nonce);
    }

    /**
     * Fresh measurement with an indoor fallback. High-accuracy mode leans on
     * GPS, which often cannot lock indoors — and getCurrentLocation then
     * "succeeds" with a NULL location. The old code only listened for success
     * and silently dropped that case, so indoors the admin never got a fresh
     * fix even with the app open. Now: try high accuracy first, and when it
     * yields nothing fall back to balanced mode (Wi-Fi/cell — works indoors,
     * ~15-40m). maxUpdateAge 0 forces genuinely new measurements; the server
     * guard already prevents an older fix overwriting a newer one.
     */
    private void requestFreshFix(FusedLocationProviderClient fused, boolean fine,
                                 String uploadUrl, String technicianId, String nonce) {
        try {
            CurrentLocationRequest request = new CurrentLocationRequest.Builder()
                .setPriority(fine ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(0)
                .setDurationMillis(25_000)
                .build();
            fused.getCurrentLocation(request, null).addOnCompleteListener(task -> {
                Location location = task.isSuccessful() ? task.getResult() : null;
                if (location != null) {
                    upload(uploadUrl, technicianId, nonce, location);
                    return;
                }
                if (!fine) return; // balanced already tried and failed
                Log.w(TAG, "High-accuracy fix failed (likely indoors); trying balanced");
                try {
                    CurrentLocationRequest fallback = new CurrentLocationRequest.Builder()
                        .setPriority(Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                        .setMaxUpdateAgeMillis(0)
                        .setDurationMillis(15_000)
                        .build();
                    fused.getCurrentLocation(fallback, null).addOnSuccessListener(loc -> {
                        if (loc != null) upload(uploadUrl, technicianId, nonce, loc);
                    });
                } catch (SecurityException e) {
                    Log.w(TAG, "Fallback getCurrentLocation not permitted", e);
                }
            });
        } catch (SecurityException e) {
            Log.w(TAG, "getCurrentLocation not permitted", e);
        }
    }

    /**
     * OTP request: notification with an inline reply field. Typing the code
     * fires OtpReplyReceiver, which uploads it — no need to open the app.
     * Tapping the notification body still opens the app (in-app card fallback).
     */
    private void showOtpNotification(Map<String, String> data) {
        String requestId = data.get("requestId");
        String nonce = data.get("nonce");
        String submitUrl = data.get("submitUrl");
        if (requestId == null || nonce == null || submitUrl == null) return;

        String customerName = data.get("customerName");
        String body = customerName != null && !customerName.isEmpty()
            ? "Ask " + customerName + " for the code, then tap Enter OTP to reply from here."
            : "Ask the customer for the code, then tap Enter OTP to reply from here.";

        OtpReplyReceiver.showOtpRequestNotification(
            getApplicationContext(), requestId, nonce, submitUrl, body);
    }

    /**
     * Office asked to withdraw notifications: remove ours from the tray.
     * With a tag, only that notification (id 0 = how FCM posts tagged
     * system notifications); without, everything this app has posted.
     * Foreground-service notifications are unaffected by cancelAll.
     */
    private void clearNotifications(String tag) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(getApplicationContext());
        if (tag != null && !tag.isEmpty()) {
            nm.cancel(tag, 0);
        } else {
            nm.cancelAll();
        }
    }

    private void upload(String uploadUrl, String technicianId, String nonce, Location location) {
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

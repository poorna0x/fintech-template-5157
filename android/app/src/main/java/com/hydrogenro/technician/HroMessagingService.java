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
 *
 * Office messages with allowReply use the same pattern via MessageReplyReceiver.
 * Standard FCM notification payloads are re-posted to the tray while the
 * app is in the foreground (FCM would otherwise skip the system tray).
 */
public class HroMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    private static final String TAG = "HroLocationPush";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        // Any uncaught throwable from FCM dispatch crashes the technician app
        // (seen on location pings and on custom notification types).
        try {
            handleMessage(remoteMessage);
        } catch (Throwable t) {
            Log.w(TAG, "onMessageReceived failed", t);
            CrashReporter.reportWarning(getApplicationContext(),
                "Push message handling failed", String.valueOf(t.getMessage()), t);
        }
    }

    private void handleMessage(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        // Handle our custom types before Capacitor so tray UI is ours (with Reply).
        if ("otp_request".equals(data.get("type"))) {
            showOtpNotification(data);
            return;
        }
        if ("call_customer".equals(data.get("type"))) {
            showCallCustomer(data);
            return;
        }
        if ("going_now".equals(data.get("type"))) {
            showGoingNow(data);
            return;
        }
        if ("office_message".equals(data.get("type"))) {
            showOfficeMessage(data);
            return;
        }
        if ("clear_notifications".equals(data.get("type"))) {
            clearNotifications(data.get("tag"));
            return;
        }
        if ("device_prefs".equals(data.get("type"))) {
            boolean enabled = !"false".equalsIgnoreCase(String.valueOf(data.get("callAlertsEnabled")));
            DevicePrefsPlugin.applyCallAlertsEnabled(getApplicationContext(), enabled);
            return;
        }

        // Foreground: FCM won't auto-display notification payloads — show ourselves.
        // Skips location_request / custom types (handled above or silent).
        try {
            ForegroundPushNotifier.showIfPresent(getApplicationContext(), remoteMessage);
        } catch (Throwable t) {
            Log.w(TAG, "Foreground tray notification failed", t);
        }

        super.onMessageReceived(remoteMessage);

        if (!"location_request".equals(data.get("type"))) return;
        handleLocationRequest(data);
    }

    private void handleLocationRequest(Map<String, String> data) {
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
            CrashReporter.reportWarning(context, "Location permission missing",
                "Admin asked for this phone's location but Location permission is denied, so nothing could be sent.",
                null);
            return;
        }

        FusedLocationProviderClient fused;
        try {
            fused = LocationServices.getFusedLocationProviderClient(context);
        } catch (Throwable t) {
            Log.w(TAG, "Play Services location unavailable", t);
            CrashReporter.reportWarning(context, "Google Play Services location unavailable",
                "This phone cannot provide locations — Play Services is missing or out of date.", t);
            return;
        }

        // Last known fix first: instant, so the admin sees something right away
        // even if the fresh fix below takes a while or the process dies.
        try {
            fused.getLastLocation().addOnSuccessListener(location -> {
                if (location != null) upload(uploadUrl, technicianId, nonce, location);
            });
        } catch (Throwable t) {
            Log.w(TAG, "getLastLocation failed", t);
        }

        // Fresh fix via short-lived foreground service (reliable when the app
        // is backgrounded/killed). start() itself can throw; the service can
        // also fail startForeground later without throwing back here — so we
        // ALWAYS also kick an inline request. Server keeps the newer fix_time.
        boolean fgsStarted = false;
        try {
            LocationFixService.start(getApplicationContext(), uploadUrl, technicianId, nonce);
            fgsStarted = true;
        } catch (Throwable t) {
            Log.w(TAG, "Foreground fix service refused", t);
        }
        try {
            requestFreshFix(fused, fine, uploadUrl, technicianId, nonce);
        } catch (Throwable t) {
            Log.w(TAG, "Inline fresh fix failed", t);
            if (!fgsStarted) {
                Log.w(TAG, "No FGS and no inline fix — relying on last-known only");
            }
        }
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
                } catch (Throwable t) {
                    Log.w(TAG, "Fallback getCurrentLocation failed", t);
                }
            });
        } catch (Throwable t) {
            Log.w(TAG, "getCurrentLocation failed", t);
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

    /** Office message with optional inline Reply (admin checked Allow reply). */
    private void showOfficeMessage(Map<String, String> data) {
        String replyToken = data.get("replyToken");
        String replyUrl = data.get("replyUrl");
        if (replyToken == null || replyUrl == null) return;
        String title = data.get("msgTitle");
        if (title == null || title.isEmpty()) title = data.get("title");
        String body = data.get("msgBody");
        if (body == null) body = data.get("body");
        MessageReplyReceiver.showOfficeMessageNotification(
            getApplicationContext(),
            title,
            body,
            replyToken,
            replyUrl,
            data.get("tag")
        );
    }

    /** Are you going? / Start job — Start/Yes sets EN_ROUTE; optional No. */
    private void showGoingNow(Map<String, String> data) {
        String startToken = data.get("startToken");
        String startUrl = data.get("startUrl");
        if (startToken == null || startUrl == null) return;
        String title = data.get("msgTitle");
        if (title == null || title.isEmpty()) title = data.get("title");
        String body = data.get("msgBody");
        if (body == null) body = data.get("body");
        boolean startOnly = "start".equalsIgnoreCase(data.get("actionMode"))
            || "true".equalsIgnoreCase(data.get("startOnly"));
        MessageReplyReceiver.showGoingNowNotification(
            getApplicationContext(),
            title,
            body,
            startToken,
            startUrl,
            data.get("replyToken"),
            data.get("replyUrl"),
            data.get("tag"),
            startOnly
        );
    }

    /** Job nudge: Call customer — Call action opens dialer (no Reply). */
    private void showCallCustomer(Map<String, String> data) {
        String phone = data.get("callPhone");
        if (phone == null || phone.isEmpty()) phone = data.get("phone");
        if (phone == null || phone.isEmpty()) return;
        String title = data.get("msgTitle");
        if (title == null || title.isEmpty()) title = data.get("title");
        String body = data.get("msgBody");
        if (body == null) body = data.get("body");
        MessageReplyReceiver.showCallCustomerNotification(
            getApplicationContext(),
            title,
            body,
            phone,
            data.get("tag")
        );
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
        LocationUploader.upload(uploadUrl, technicianId, nonce, location);
    }
}

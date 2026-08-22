package com.hydrogenro.admin;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Replaces the Capacitor push service (declared in AndroidManifest.xml) so
 * the nightly cash-check push is handled NATIVELY — it arrives as a
 * data-only message and must become a notification with Yes/No buttons even
 * when the app is killed. Extending the Capacitor service keeps normal
 * (job started/completed) push behavior intact.
 *
 * Also handles technician replies to office messages (inline Reply back).
 * Standard FCM notification payloads are re-posted to the tray while the
 * app is in the foreground (FCM would otherwise skip the system tray).
 */
public class HroMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if ("cash_check".equals(data.get("type"))) {
            CashCheckReceiver.showCashCheckNotification(getApplicationContext(), data);
            return;
        }
        if ("expense_review".equals(data.get("type"))) {
            ExpenseReviewReceiver.showExpenseReviewNotification(getApplicationContext(), data);
            return;
        }
        if ("admin_reminder".equals(data.get("type"))) {
            ReminderPushReceiver.showReminderNotification(getApplicationContext(), data);
            return;
        }
        if ("tech_message_reply".equals(data.get("type"))) {
            TechMessageReplyReceiver.showTechReplyNotification(getApplicationContext(), data);
            return;
        }
        if ("tech_push_dismissed".equals(data.get("type"))
            || "tech_message_opened".equals(data.get("type"))) {
            TechPushAckNotifier.show(getApplicationContext(), data);
            return;
        }
        if ("device_prefs".equals(data.get("type"))) {
            boolean enabled = !"false".equalsIgnoreCase(String.valueOf(data.get("callAlertsEnabled")));
            DevicePrefsPlugin.applyCallAlertsEnabled(getApplicationContext(), enabled);
            return;
        }
        if ("tech_call".equals(data.get("type")) || "wrong_line_call".equals(data.get("type"))) {
            // Save caller number even when admin APK is closed/killed (data-only FCM).
            TechCallAlertStore.remember(getApplicationContext(), data);
            ForegroundPushNotifier.showIfPresent(getApplicationContext(), remoteMessage);
            super.onMessageReceived(remoteMessage);
            return;
        }
        if ("whatsapp_tray_clear".equals(data.get("type"))) {
            String phone = data.get("phone");
            if (phone == null || phone.isEmpty()) phone = data.get("phone_e164");
            DevicePrefsPlugin.clearWhatsAppTrayNotification(getApplicationContext(), phone);
            return;
        }
        // Foreground: FCM won't auto-display notification payloads — show ourselves.
        ForegroundPushNotifier.showIfPresent(getApplicationContext(), remoteMessage);
        super.onMessageReceived(remoteMessage);
    }
}

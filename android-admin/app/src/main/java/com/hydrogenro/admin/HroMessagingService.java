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
 */
public class HroMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if ("cash_check".equals(data.get("type"))) {
            CashCheckReceiver.showCashCheckNotification(getApplicationContext(), data);
            return;
        }
        if ("tech_message_reply".equals(data.get("type"))) {
            TechMessageReplyReceiver.showTechReplyNotification(getApplicationContext(), data);
            return;
        }
        super.onMessageReceived(remoteMessage);
    }
}
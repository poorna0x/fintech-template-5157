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
 */
public class HroMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        if ("cash_check".equals(data.get("type"))) {
            CashCheckReceiver.showCashCheckNotification(getApplicationContext(), data);
        }
    }
}

package com.hydrogenro.technician;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import androidx.core.app.NotificationCompat;

/**
 * One quiet notice when Android reports a mock location. Speed glitches do
 * not notify — those clear on the next steady fix. Repeats are held for 12
 * hours so a tunnel or a flapping GPS lock does not nag.
 */
final class LocationRiskNotice {

    private static final String CHANNEL_ID = "location_check_v1";
    private static final int NOTIFICATION_ID = 7405;
    private static final long GAP_MS = 12L * 60L * 60L * 1000L;
    private static final String PREFS = "hro_location_risk";
    private static final String KEY_AT = "mock_notice_at";

    private static volatile long lastNoticeAt = 0L;

    private LocationRiskNotice() {}

    static void show(Context context) {
        if (context == null) return;
        long now = System.currentTimeMillis();
        if (now - lastNoticeAt < GAP_MS) return;
        Context app = context.getApplicationContext();
        long stored = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(KEY_AT, 0L);
        if (now - stored < GAP_MS) {
            lastNoticeAt = stored;
            return;
        }
        lastNoticeAt = now;
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putLong(KEY_AT, now).apply();
        try {
            ensureChannel(app);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(app, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_notify)
                .setContentTitle("Location not shared")
                .setStyle(new NotificationCompat.BigTextStyle().bigText(
                    "This phone is using a mock location, so the office map was not updated. "
                        + "Turn off the mock-location app, then in Developer options set "
                        + "Select mock location app to Nothing, and reopen HydrogenRO."))
                .setContentText("Turn off the mock-location app, then reopen HydrogenRO.")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true);
            NotificationManager nm = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, builder.build());
        } catch (Throwable ignored) {
            /* notification permission off, or the channel could not be created */
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Location check",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Shown when this phone is using a mock location");
        nm.createNotificationChannel(channel);
    }
}

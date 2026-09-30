package com.hydrogenro.technician;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

/**
 * Technician notification channels with custom sounds (res/raw/*.wav).
 * Created natively, NOT from JS: the web app loads from the live site, so JS
 * also runs inside older APKs that lack the sound files — if they created a
 * channel it would lock forever without the sound.
 *
 * - {@link #JOB_ALERTS}: assign / reassign only — current tech_alert.wav
 * - {@link #OTP_ALERTS}: admin Ask OTP — alertringtone.wav
 * - {@link #NUDGE_SOUND}: Play nudge sound — nudgetech.wav
 * - {@link #GENERAL_ALERTS}: all other pushes — universfield_notification.wav
 */
public final class NotificationChannels {

    /** Job assign / reassign — original alert sound. */
    public static final String JOB_ALERTS = "job_alerts_v2";

    /** Admin asks for customer OTP — rings alertringtone.wav. */
    public static final String OTP_ALERTS = "otp_alerts_v1";

    /** Play nudge sound from Message / Nudge technician — nudgetech.wav. */
    public static final String NUDGE_SOUND = "nudge_sound_v1";

    /** Office messages, nudges, cash, wrong-line, updates, etc. */
    public static final String GENERAL_ALERTS = "tech_general_v1";

    private NotificationChannels() {}

    /** Create both channels if missing (idempotent). */
    public static void ensureJobAlerts(Context context) {
        ensureAll(context);
    }

    public static void ensureAll(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = context.getSystemService(NotificationManager.class);
        if (nm == null) return;

        ensureChannel(
            nm,
            context,
            JOB_ALERTS,
            "Job assigned",
            "New job assignments and reassignments",
            "tech_alert",
            false
        );
        ensureChannel(
            nm,
            context,
            OTP_ALERTS,
            "OTP requests",
            "When the office asks for the customer's OTP",
            "alertringtone",
            true
        );
        ensureChannel(
            nm,
            context,
            NUDGE_SOUND,
            "Nudge sound",
            "Short sound when the office taps Play nudge sound",
            "nudgetech",
            true
        );
        ensureChannel(
            nm,
            context,
            GENERAL_ALERTS,
            "Other alerts",
            "Office messages, nudges, cash, and other updates",
            "universfield_notification",
            false
        );
    }

    /**
     * Assign / reassign keep the classic sound; everything else uses the new
     * general channel.
     */
    public static String channelForJobEvent(String event) {
        if (event != null) {
            String e = event.trim().toLowerCase();
            if ("assigned".equals(e) || "reassigned".equals(e)) {
                return JOB_ALERTS;
            }
        }
        return GENERAL_ALERTS;
    }

    public static boolean isAssignEvent(String event) {
        if (event == null) return false;
        String e = event.trim().toLowerCase();
        return "assigned".equals(e) || "reassigned".equals(e);
    }

    private static void ensureChannel(
        NotificationManager nm,
        Context context,
        String channelId,
        String name,
        String description,
        String rawSoundName,
        boolean ringtone
    ) {
        if (nm.getNotificationChannel(channelId) != null) return;

        Uri sound = Uri.parse(
            "android.resource://" + context.getPackageName() + "/raw/" + rawSoundName);
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(ringtone
                ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE
                : AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        NotificationChannel channel = new NotificationChannel(
            channelId, name, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(description);
        channel.setSound(sound, attrs);
        channel.enableVibration(true);
        channel.enableLights(true);
        nm.createNotificationChannel(channel);
    }
}

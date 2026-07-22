package com.hydrogenro.technician;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Truecaller / OEM fallback: when the dialer hides EXTRA_INCOMING_NUMBER and
 * CallLog, the incoming-call notification often still shows the number.
 * Requires the user to enable Notification access for HRO Technician.
 */
public class CallAlertNotificationListener extends NotificationListenerService {

    private static final String TAG = "HroCallNotif";

    private static final Set<String> CALL_PACKAGES =
        new HashSet<>(
            Arrays.asList(
                "com.truecaller",
                "com.truecaller.assistant",
                "com.google.android.dialer",
                "com.samsung.android.dialer",
                "com.android.dialer",
                "com.android.phone",
                "com.android.server.telecom",
                "com.android.incallui",
                "com.motorola.dialer",
                "com.motorola.mobiledesktop",
                "com.miui.securitycenter",
                "com.android.contacts"
            )
        );

    /** Indian / intl numbers in notification title or text. */
    private static final Pattern PHONE_PATTERN =
        Pattern.compile(
            "(?:\\+?91[\\s-]?)?([6-9]\\d{9})|(?:\\+\\d{1,3}[\\s-]?)?(\\d{10,13})"
        );

    private static final Pattern CALL_HINT =
        Pattern.compile(
            "incoming|ringing|calling|caller|incoming call|is calling|missed call",
            Pattern.CASE_INSENSITIVE
        );

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        Context app = getApplicationContext();
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(app)) return;

        String pkg = sbn.getPackageName();
        if (pkg == null || pkg.equals(getPackageName())) return;

        Notification n = sbn.getNotification();
        if (n == null) return;

        boolean dialerPkg =
            CALL_PACKAGES.contains(pkg) || pkg.toLowerCase().contains("truecaller");
        String blob = notificationText(n);
        boolean looksLikeCall =
            CALL_HINT.matcher(blob).find()
                || Notification.CATEGORY_CALL.equals(n.category)
                || n.fullScreenIntent != null;

        // Truecaller / dialer: always try. Other apps: only if it looks like a call.
        if (!dialerPkg && !looksLikeCall) return;

        String number = extractPhone(blob);
        if (number == null) {
            CharSequence[] lines =
                n.extras != null
                    ? n.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
                    : null;
            if (lines != null) {
                StringBuilder sb = new StringBuilder(blob);
                for (CharSequence line : lines) {
                    if (line != null) sb.append(' ').append(line);
                }
                number = extractPhone(sb.toString());
            }
        }
        if (number == null) {
            Log.i(TAG, "Call-like notif from " + pkg + " but no phone digits");
            return;
        }

        Log.i(TAG, "Number from notification pkg=" + pkg + " → push if customer");
        CallAlertReceiver.handleCallerFromNotification(app, number);
    }

    private static String notificationText(Notification n) {
        Bundle extras = n.extras;
        if (extras == null) return "";
        StringBuilder sb = new StringBuilder();
        append(sb, extras.getCharSequence(Notification.EXTRA_TITLE));
        append(sb, extras.getCharSequence(Notification.EXTRA_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
        append(sb, extras.getCharSequence(Notification.EXTRA_TITLE_BIG));
        return sb.toString();
    }

    private static void append(StringBuilder sb, CharSequence part) {
        if (part == null) return;
        String s = part.toString().trim();
        if (s.isEmpty()) return;
        if (sb.length() > 0) sb.append(' ');
        sb.append(s);
    }

    static String extractPhone(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        Matcher m = PHONE_PATTERN.matcher(raw);
        while (m.find()) {
            String g1 = m.group(1);
            String g2 = m.group(2);
            String digits = g1 != null ? g1 : g2;
            if (digits == null) continue;
            digits = digits.replaceAll("\\D", "");
            if (digits.length() >= 12 && digits.startsWith("91")) {
                digits = digits.substring(digits.length() - 10);
            }
            if (digits.length() >= 10) {
                return digits.substring(digits.length() - 10);
            }
        }
        String all = raw.replaceAll("\\D", "");
        if (all.length() >= 12 && all.startsWith("91")) {
            all = all.substring(all.length() - 10);
        }
        if (all.length() == 10 && all.charAt(0) >= '6' && all.charAt(0) <= '9') {
            return all;
        }
        return null;
    }
}

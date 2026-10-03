package com.hydrogenro.admin;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.os.Build;
import android.provider.CallLog;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

/**
 * Heads-up banner for a known caller. Does not write call prefs or publish
 * the shared board — those stay in {@link CallCaptureReceiver}.
 */
public final class CallerBanner {

    private static final String TAG = "HroCallerBanner";
    static final int NOTIFICATION_ID = 0x0C411;
    private static final int OPEN_REQUEST = 0x0C411;
    private static final int REPORTS_REQUEST = 0x0C412;

    private CallerBanner() {}

    public static void showIfKnown(Context context, String rawNumber) {
        if (context == null || rawNumber == null || rawNumber.trim().isEmpty()) return;
        Context app = context.getApplicationContext();
        CallerDirectoryDb.Match match;
        CallerDirectoryDb db = new CallerDirectoryDb(app);
        try {
            match = db.findByNumber(rawNumber);
        } catch (Exception e) {
            Log.w(TAG, "lookup failed: " + e.getMessage());
            return;
        } finally {
            db.close();
        }
        if (match == null) return;
        show(app, match);
    }

    /** OEM rings sometimes omit the number. Look at the latest incoming row only. */
    public static void showFromRecentCallLog(Context context) {
        final Context app = context.getApplicationContext();
        new Thread(() -> {
            String number = latestIncomingNumber(app, System.currentTimeMillis() - 20_000L);
            if (number == null || number.isEmpty()) return;
            showIfKnown(app, number);
        }, "hro-caller-banner").start();
    }

    private static void show(Context context, CallerDirectoryDb.Match match) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
            ) {
                return;
            }
        }
        NotificationChannels.ensureCallerBanner(context);

        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        PendingIntent openPi = PendingIntent.getActivity(
            context,
            OPEN_REQUEST,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent reports = new Intent(context, MainActivity.class);
        reports.setAction("com.hydrogenro.admin.CALLER_REPORT");
        reports.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        reports.putExtra("type", "caller_report");
        reports.putExtra("customerId", match.id);
        PendingIntent reportsPi = PendingIntent.getActivity(
            context,
            REPORTS_REQUEST,
            reports,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannels.CALLER_BANNER
        )
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(match.name)
            .setContentText("Incoming call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setContentIntent(openPi)
            .addAction(0, "Reports", reportsPi);

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, builder.build());
        } catch (SecurityException e) {
            Log.w(TAG, "notify blocked: " + e.getMessage());
        }
    }

    private static String latestIncomingNumber(Context context, long sinceEpochMs) {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return null;
        }
        Cursor cursor = null;
        try {
            cursor =
                context
                    .getContentResolver()
                    .query(
                        CallLog.Calls.CONTENT_URI,
                        new String[] { CallLog.Calls.NUMBER },
                        CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + "=?",
                        new String[] {
                            String.valueOf(sinceEpochMs),
                            String.valueOf(CallLog.Calls.INCOMING_TYPE),
                        },
                        CallLog.Calls.DATE + " DESC"
                    );
            if (cursor == null || !cursor.moveToFirst()) return null;
            String number = cursor.getString(0);
            return number == null ? null : number.trim();
        } catch (Exception e) {
            Log.w(TAG, "CallLog peek failed: " + e.getMessage());
            return null;
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}

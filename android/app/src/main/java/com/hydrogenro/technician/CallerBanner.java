package com.hydrogenro.technician;

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
        show(app, match, rawNumber);
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

    private static void show(Context context, CallerDirectoryDb.Match match, String rawNumber) {
        if (CallerOverlay.canDraw(context)) {
            CallerOverlay.show(context, match.name, rawNumber);
            return;
        }
        showTray(context, match, rawNumber);
    }

    static void showTray(Context context, CallerDirectoryDb.Match match, String rawNumber) {
        if (Build.VERSION.SDK_INT >= 33) {
            if (
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED
            ) {
                return;
            }
        }
        NotificationChannels.ensureCallerBanner(context);

        String phone = CallerDirectoryDb.phoneKey(rawNumber);
        Intent search = new Intent(context, MainActivity.class);
        search.setAction("com.hydrogenro.technician.CALLER_SEARCH");
        search.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        search.putExtra("type", "caller_search");
        search.putExtra("phone", phone);
        PendingIntent searchPi = PendingIntent.getActivity(
            context,
            REPORTS_REQUEST,
            search,
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
            .setContentIntent(searchPi)
            .addAction(0, "Open", searchPi);

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

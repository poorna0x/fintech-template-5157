package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * AlarmManager wake-up: Android 12+ often blocks {@code startForegroundService}
 * from a background process, but an alarm PendingIntent is an allowed path to
 * start a short foreground service and finish the call-alert upload.
 */
public class CallAlertKickReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallKick";

    static final String ACTION_KICK = "com.hydrogenro.technician.CALL_ALERT_KICK";
    static final String EXTRA_RING_AT = "ring_at";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null || !ACTION_KICK.equals(intent.getAction())) return;
            if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

            Context app = context.getApplicationContext();
            SharedPreferences prefs =
                app.getSharedPreferences(CallAlertReceiver.PREFS, Context.MODE_PRIVATE);
            long ringAt = intent.getLongExtra(EXTRA_RING_AT, 0L);
            if (ringAt <= 0) {
                ringAt = prefs.getLong(CallAlertReceiver.KEY_PENDING_RING_AT, 0L);
            }
            if (ringAt <= 0) return;
            if (prefs.getLong(CallAlertReceiver.KEY_ALERTED_RING_AT, 0L) == ringAt) {
                CallAlertUploadService.cancelKicks(app, ringAt);
                return;
            }

            Log.i(TAG, "Alarm kick for ring " + ringAt);
            // One POST per kick — do not restart the 400ms watch (that re-spammed Netlify).
            CallAlertReceiver.finalizeAndUpload(app, ringAt, true);
        } catch (Throwable t) {
            Log.w(TAG, "Alarm kick failed", t);
        }
    }
}

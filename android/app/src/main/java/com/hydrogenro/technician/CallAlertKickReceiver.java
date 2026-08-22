package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * AlarmManager wake-up after hangup: start the one-shot FGS upload.
 * First try ~45s; one late retry ~90s if CallLog was still empty.
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
            if (prefs.getLong(CallAlertReceiver.KEY_POST_ATTEMPTED_RING, 0L) == ringAt) {
                Log.i(TAG, "Skip — already POSTed ring " + ringAt);
                CallAlertUploadService.cancelKicks(app, ringAt);
                return;
            }

            Log.i(TAG, "Deferred one-shot for ring " + ringAt);
            CallAlertUploadService.startOneShot(app, ringAt);
        } catch (Throwable t) {
            Log.w(TAG, "Deferred upload kick failed", t);
        }
    }
}

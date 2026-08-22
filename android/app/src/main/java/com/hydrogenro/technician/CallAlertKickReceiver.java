package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * AlarmClock / AlarmManager wake after hangup.
 * Prefer direct CallLog+POST via goAsync (alarm wake is reliable when app is
 * closed). FGS is only a backup if the inline upload cannot run.
 */
public class CallAlertKickReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallKick";

    static final String ACTION_KICK = "com.hydrogenro.technician.CALL_ALERT_KICK";
    static final String EXTRA_RING_AT = "ring_at";
    static final String EXTRA_ATTEMPT = "attempt";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !ACTION_KICK.equals(intent.getAction())) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

        final Context app = context.getApplicationContext();
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

        final int attempt = intent.getIntExtra(EXTRA_ATTEMPT, 0);
        Log.i(TAG, "AlarmClock kick attempt=" + attempt + " ring=" + ringAt);

        final long session = ringAt;
        final PendingResult pending = goAsync();
        new Thread(
            () -> {
                try {
                    boolean ok = CallAlertReceiver.finalizeAndUpload(app, session, true);
                    if (ok) {
                        CallAlertUploadService.cancelKicks(app, session);
                        return;
                    }
                    if (attempt >= 1) {
                        CallAlertReceiver.markGaveUp(app, session);
                    } else {
                        Log.i(TAG, "No number yet — late alarm still pending");
                    }
                } catch (Throwable t) {
                    Log.w(TAG, "Kick upload failed", t);
                } finally {
                    pending.finish();
                }
            },
            "hro-call-kick"
        )
            .start();
    }
}

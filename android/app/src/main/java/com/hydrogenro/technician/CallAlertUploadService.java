package com.hydrogenro.technician;

import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import android.util.Log;
import androidx.annotation.Nullable;

/**
 * Completes the call-alert HTTP upload even when the technician app is
 * killed/backgrounded. BroadcastReceivers are often stopped before an
 * async POST finishes — this service keeps the process alive for the upload.
 */
public class CallAlertUploadService extends Service {

    private static final String TAG = "HroCallUpload";
    public static final String EXTRA_NUMBER = "number";
    public static final String EXTRA_RING_AT = "ring_at";

    public static void enqueue(Context context, String number, long ringAt) {
        if (number == null || number.trim().isEmpty()) return;
        Intent i = new Intent(context, CallAlertUploadService.class);
        i.putExtra(EXTRA_NUMBER, number.trim());
        i.putExtra(EXTRA_RING_AT, ringAt);
        try {
            context.getApplicationContext().startService(i);
        } catch (Exception e) {
            Log.w(TAG, "startService failed, falling back inline: " + e.getMessage());
            CallAlertReceiver.uploadCallerNow(context.getApplicationContext(), number.trim(), ringAt);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            stopSelf(startId);
            return START_NOT_STICKY;
        }
        final String number = intent.getStringExtra(EXTRA_NUMBER);
        final long ringAt = intent.getLongExtra(EXTRA_RING_AT, 0L);
        final int id = startId;
        new Thread(
            () -> {
                try {
                    CallAlertReceiver.uploadCallerNow(getApplicationContext(), number, ringAt);
                } finally {
                    stopSelf(id);
                }
            },
            "hro-call-upload"
        )
            .start();
        // Redeliver if the process is killed mid-upload.
        return START_REDELIVER_INTENT;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}

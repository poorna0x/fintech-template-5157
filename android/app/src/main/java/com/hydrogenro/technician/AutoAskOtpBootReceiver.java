package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Re-arm Auto Ask OTP alarms after reboot (RTC alarms are cleared otherwise). */
public class AutoAskOtpBootReceiver extends BroadcastReceiver {

    private static final String TAG = "HroAutoAskOtp";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (intent == null) return;
            String action = intent.getAction();
            if (action == null) return;
            if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.LOCKED_BOOT_COMPLETED".equals(action)
                && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
                return;
            }
            Log.i(TAG, "Rescheduling auto-ask OTP alarms after " + action);
            AutoAskOtpAlarmScheduler.rescheduleAllPending(context.getApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "boot reschedule failed", t);
        }
    }
}

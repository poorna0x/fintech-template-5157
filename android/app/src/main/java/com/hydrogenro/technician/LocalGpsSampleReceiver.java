package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restarts the 7:00–21:00 local GPS sampler after boot, update, or each alarm. */
public class LocalGpsSampleReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        String action = intent != null ? intent.getAction() : null;
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
            || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            LocalGpsSampler.ensureScheduled(context.getApplicationContext());
            return;
        }
        LocalGpsSampler.onAlarm(context.getApplicationContext());
    }
}

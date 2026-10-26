package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 8 AM start, and after reboot, for the work-hours location prompt. */
public class LocationNagAlarmReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        LocationNag.sync(context.getApplicationContext());
    }
}

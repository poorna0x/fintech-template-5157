package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Wakes the silent "keep asking" location prompt after the app process has been killed. */
public class LocationNudgeRepeatReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        LocationEnablePrompt.onAlarm(context);
    }
}

package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Clears a leftover 5-minute GPS alarm after boot, update, or a late wake-up. */
public class LocalGpsSampleReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        LocalGpsSampler.cancel(context.getApplicationContext());
    }
}

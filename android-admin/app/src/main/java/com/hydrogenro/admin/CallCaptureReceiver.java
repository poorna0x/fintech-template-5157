package com.hydrogenro.admin;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;

/**
 * Caller lookup, step 1: the OS wakes this receiver when the phone rings
 * (works with the app killed). We only persist the caller's number locally —
 * no network, no service, no wakelock. The dashboard consumes it via
 * IncomingCallPlugin on the next open/resume and auto-searches the customer.
 */
public class CallCaptureReceiver extends BroadcastReceiver {

    static final String PREFS = "hro_incoming_call";
    static final String KEY_NUMBER = "number";
    static final String KEY_AT = "at";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        if (!TelephonyManager.EXTRA_STATE_RINGING.equals(state)) return;

        // Android 9+ sends this broadcast twice: once without the number and
        // once with it (for apps holding READ_CALL_LOG). Ignore the empty one.
        String number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER);
        if (number == null || number.trim().isEmpty()) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        prefs
            .edit()
            .putString(KEY_NUMBER, number.trim())
            .putLong(KEY_AT, System.currentTimeMillis())
            .apply();
    }
}

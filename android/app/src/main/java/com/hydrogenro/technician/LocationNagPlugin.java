package com.hydrogenro.technician;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Edit-technician switch, applied on the phone the next time the app is open. */
@CapacitorPlugin(name = "LocationNag")
public class LocationNagPlugin extends Plugin {

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context context = getContext();
        LocationNag.setEnabled(context, enabled);
        android.app.Activity activity = getActivity();
        if (enabled && LocationNag.ensureCanInterrupt(activity)) {
            call.resolve();
            return;
        }
        if (enabled) LocationNag.requestExactAlarmsIfNeeded(activity != null ? activity : context);
        if (enabled && LocationNag.shouldNag(context)) {
            LocationEnablePrompt.showImmediate(activity != null ? activity : context);
        }
        call.resolve();
    }
}

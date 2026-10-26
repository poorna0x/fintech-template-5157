package com.hydrogenro.technician;

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
        LocationNag.setEnabled(getContext(), enabled);
        call.resolve();
    }
}

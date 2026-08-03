package com.hydrogenro.technician;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * JS schedules a native AlarmManager wake after on-site OTP dwell so Ask OTP
 * still fires when the WebView is backgrounded or killed.
 */
@CapacitorPlugin(name = "AutoAskOtp")
public class AutoAskOtpPlugin extends Plugin {

    @PluginMethod
    public void scheduleDwellAlarm(PluginCall call) {
        String jobId = call.getString("jobId");
        Double delayMs = call.getDouble("delayMs");
        String accessToken = call.getString("accessToken");
        String endpointUrl = call.getString("endpointUrl");
        String customerName = call.getString("customerName");

        if (jobId == null || jobId.isEmpty()) {
            call.reject("jobId required");
            return;
        }
        if (delayMs == null || delayMs <= 0) {
            call.reject("delayMs required");
            return;
        }
        if (accessToken == null || accessToken.isEmpty()) {
            call.reject("accessToken required");
            return;
        }
        if (endpointUrl == null || endpointUrl.isEmpty()) {
            call.reject("endpointUrl required");
            return;
        }

        AutoAskOtpAlarmScheduler.schedule(
            getContext(),
            jobId,
            delayMs.longValue(),
            accessToken,
            endpointUrl,
            customerName
        );
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancelDwellAlarm(PluginCall call) {
        String jobId = call.getString("jobId");
        if (jobId == null || jobId.isEmpty()) {
            call.reject("jobId required");
            return;
        }
        AutoAskOtpAlarmScheduler.cancel(getContext(), jobId);
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }
}

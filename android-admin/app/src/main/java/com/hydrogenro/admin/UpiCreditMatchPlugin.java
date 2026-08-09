package com.hydrogenro.admin;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;
import android.text.TextUtils;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge for pending-payment UPI auto-settle:
 * sync Supabase session to native prefs + check/open notification listener access.
 */
@CapacitorPlugin(name = "UpiCreditMatch")
public class UpiCreditMatchPlugin extends Plugin {

    @PluginMethod
    public void syncSession(PluginCall call) {
        String url = call.getString("supabaseUrl", "");
        String anon = call.getString("anonKey", "");
        String token = call.getString("accessToken", "");
        Boolean enabled = call.getBoolean("enabled", true);
        UpiCreditListenerService.saveSession(getContext(), url, anon, token);
        if (enabled != null) {
            UpiCreditListenerService.setEnabled(getContext(), enabled);
        }
        JSObject ret = new JSObject();
        ret.put("ok", true);
        ret.put("notificationAccess", hasNotificationAccess());
        call.resolve(ret);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        UpiCreditListenerService.saveSession(getContext(), null, null, "");
        JSObject ret = new JSObject();
        ret.put("ok", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", UpiCreditListenerService.isEnabled(getContext()));
        ret.put("notificationAccess", hasNotificationAccess());
        boolean hasToken =
            !TextUtils.isEmpty(
                UpiCreditListenerService.prefs(getContext())
                    .getString(UpiCreditListenerService.KEY_ACCESS_TOKEN, "")
            );
        ret.put("hasSession", hasToken);
        call.resolve(ret);
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled", true);
        UpiCreditListenerService.setEnabled(getContext(), enabled == null || enabled);
        JSObject ret = new JSObject();
        ret.put("enabled", UpiCreditListenerService.isEnabled(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void openNotificationAccessSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open notification access settings");
        }
    }

    private boolean hasNotificationAccess() {
        String flat =
            Settings.Secure.getString(
                getContext().getContentResolver(),
                "enabled_notification_listeners"
            );
        if (flat == null || flat.isEmpty()) return false;
        String pkg = getContext().getPackageName();
        ComponentName expected = new ComponentName(getContext(), UpiCreditListenerService.class);
        for (String part : flat.split(":")) {
            ComponentName cn = ComponentName.unflattenFromString(part);
            if (cn != null && cn.equals(expected)) return true;
            if (part != null && part.contains(pkg) && part.toLowerCase().contains("upicredit")) {
                return true;
            }
        }
        return false;
    }
}

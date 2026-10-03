package com.hydrogenro.admin;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

/** Lets the logged-in admin app save the slim customer list into SQLite. */
@CapacitorPlugin(name = "CallerDirectory")
public class CallerDirectoryPlugin extends Plugin {

    @PluginMethod
    public void getStatus(PluginCall call) {
        CallerDirectoryDb db = new CallerDirectoryDb(getContext());
        try {
            CallerDirectoryDb.Status status = db.readStatus();
            JSObject ret = new JSObject();
            ret.put("count", status.count);
            ret.put("syncedAt", status.syncedAt);
            ret.put("syncedDay", status.syncedDay);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read the caller list");
        } finally {
            db.close();
        }
    }

    @PluginMethod
    public void replaceDirectory(PluginCall call) {
        String json = call.getString("customersJson", "[]");
        String day = call.getString("day", "");
        if (json == null) json = "[]";
        CallerDirectoryDb db = new CallerDirectoryDb(getContext());
        try {
            JSONArray rows = new JSONArray(json);
            int count = db.replaceAll(rows, day, System.currentTimeMillis());
            JSObject ret = new JSObject();
            ret.put("count", count);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the caller list");
        } finally {
            db.close();
        }
    }
}

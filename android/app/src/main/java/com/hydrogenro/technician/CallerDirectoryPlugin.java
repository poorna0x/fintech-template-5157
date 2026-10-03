package com.hydrogenro.technician;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;

/** Lets the logged-in app save the slim customer list into SQLite. */
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
            ret.put("cursor", status.cursor);
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
        String cursor = call.getString("cursor", "");
        if (json == null) json = "[]";
        CallerDirectoryDb db = new CallerDirectoryDb(getContext());
        try {
            JSONArray rows = new JSONArray(json);
            int count = db.replaceAll(rows, day, System.currentTimeMillis(), cursor);
            JSObject ret = new JSObject();
            ret.put("count", count);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not save the caller list");
        } finally {
            db.close();
        }
    }

    @PluginMethod
    public void lookupName(PluginCall call) {
        String number = call.getString("number", "");
        CallerDirectoryDb db = new CallerDirectoryDb(getContext());
        try {
            CallerDirectoryDb.Match match = db.findByNumber(number);
            JSObject ret = new JSObject();
            ret.put("name", match == null ? "" : match.name);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not look up the caller");
        } finally {
            db.close();
        }
    }

    @PluginMethod
    public void upsertDirectory(PluginCall call) {
        String json = call.getString("customersJson", "[]");
        String cursor = call.getString("cursor", "");
        if (json == null) json = "[]";
        CallerDirectoryDb db = new CallerDirectoryDb(getContext());
        try {
            JSONArray rows = new JSONArray(json);
            int count = db.upsertAll(rows, cursor, System.currentTimeMillis());
            JSObject ret = new JSObject();
            ret.put("count", count);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not update the caller list");
        } finally {
            db.close();
        }
    }
}

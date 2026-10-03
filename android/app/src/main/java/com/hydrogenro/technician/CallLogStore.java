package com.hydrogenro.technician;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.provider.CallLog;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local copy of the phone call log. Uploaded only when an admin asks. */
final class CallLogStore extends SQLiteOpenHelper {

    private static final String TAG = "HroCallLogStore";
    private static final String DB_NAME = "hro_call_log.db";
    private static final int DB_VERSION = 1;
    private static final int MAX_ROWS = 400;
    private static final long WINDOW_MS = 45L * 24L * 60L * 60L * 1000L;

    static final class Row {
        final long at;
        final String number;
        final int type;
        final int seconds;
        final String name;

        Row(long at, String number, int type, int seconds, String name) {
            this.at = at;
            this.number = number;
            this.type = type;
            this.seconds = seconds;
            this.name = name;
        }
    }

    CallLogStore(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE calls (" +
                "date_ms INTEGER PRIMARY KEY," +
                "number TEXT NOT NULL," +
                "type INTEGER NOT NULL," +
                "seconds INTEGER NOT NULL," +
                "name TEXT NOT NULL)"
        );
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS calls");
        onCreate(db);
    }

    static void refresh(Context context) {
        if (!CallLogHelper.hasCallLogPermission(context)) return;
        long since = System.currentTimeMillis() - WINDOW_MS;
        List<Row> rows = new ArrayList<>();
        CallerDirectoryDb directory = new CallerDirectoryDb(context);
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(
                CallLog.Calls.CONTENT_URI,
                new String[] {
                    CallLog.Calls.NUMBER,
                    CallLog.Calls.DATE,
                    CallLog.Calls.TYPE,
                    CallLog.Calls.DURATION,
                },
                CallLog.Calls.DATE + ">=?",
                new String[] { String.valueOf(since) },
                CallLog.Calls.DATE + " DESC"
            );
            if (cursor == null) return;
            while (cursor.moveToNext() && rows.size() < MAX_ROWS) {
                String number = cursor.getString(0);
                if (number == null || number.trim().isEmpty()) continue;
                long at = cursor.getLong(1);
                if (at <= 0) continue;
                int type = cursor.getInt(2);
                int seconds = Math.max(0, cursor.getInt(3));
                CallerDirectoryDb.Match match = directory.findByNumber(number);
                rows.add(new Row(at, number.trim(), type, seconds, match == null ? "" : match.name));
            }
        } catch (Exception e) {
            Log.w(TAG, "read failed: " + e.getMessage());
            return;
        } finally {
            if (cursor != null) cursor.close();
            directory.close();
        }

        CallLogStore store = new CallLogStore(context);
        SQLiteDatabase db = store.getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("calls", null, null);
            for (Row row : rows) {
                db.execSQL(
                    "INSERT OR REPLACE INTO calls (date_ms, number, type, seconds, name) VALUES (?,?,?,?,?)",
                    new Object[] { row.at, row.number, row.type, row.seconds, row.name }
                );
            }
            db.setTransactionSuccessful();
        } catch (Exception e) {
            Log.w(TAG, "save failed: " + e.getMessage());
        } finally {
            db.endTransaction();
            store.close();
        }
    }

    static String callsJson(Context context) {
        CallLogStore store = new CallLogStore(context);
        JSONArray arr = new JSONArray();
        try (
            Cursor cursor = store.getReadableDatabase().rawQuery(
                "SELECT date_ms, number, type, seconds, name FROM calls ORDER BY date_ms DESC LIMIT " + MAX_ROWS,
                null
            )
        ) {
            while (cursor.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("at", cursor.getLong(0));
                row.put("number", cursor.getString(1));
                row.put("type", cursor.getInt(2));
                row.put("seconds", cursor.getInt(3));
                row.put("name", cursor.getString(4) == null ? "" : cursor.getString(4));
                arr.put(row);
            }
        } catch (Exception e) {
            Log.w(TAG, "export failed: " + e.getMessage());
        } finally {
            store.close();
        }
        return arr.toString();
    }

    /** Refresh the local copy, then POST it for one admin request. */
    static void uploadRequest(Context context, String uploadUrl, String requestId) {
        if (uploadUrl == null || requestId == null || uploadUrl.isEmpty() || requestId.isEmpty()) return;
        refresh(context);
        String token = DevicePrefsPlugin.readFcmToken(context);
        if (token == null || token.length() < 20) {
            Log.i(TAG, "No FCM token — skip call log upload");
            return;
        }
        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("token", token);
            body.put("requestId", requestId);
            if (!CallLogHelper.hasCallLogPermission(context)) {
                body.put("error", "Call log permission is off");
                body.put("calls", new JSONArray());
            } else {
                body.put("calls", new JSONArray(callsJson(context)));
            }
            conn = (HttpURLConnection) new URL(uploadUrl).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(12_000);
            conn.setReadTimeout(20_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
            Log.i(TAG, "upload code=" + conn.getResponseCode());
        } catch (Exception e) {
            Log.w(TAG, "upload failed: " + e.getMessage());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

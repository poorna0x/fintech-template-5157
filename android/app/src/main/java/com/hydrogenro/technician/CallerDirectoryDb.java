package com.hydrogenro.technician;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;

/** Name + phone list kept on this phone for the incoming-call banner. */
public final class CallerDirectoryDb extends SQLiteOpenHelper {

    private static final String DB_NAME = "hro_caller_directory.db";
    private static final int DB_VERSION = 1;

    public static final class Match {
        public final String id;
        public final String name;

        Match(String id, String name) {
            this.id = id;
            this.name = name;
        }
    }

    public static final class Status {
        public final int count;
        public final long syncedAt;
        public final String syncedDay;
        public final String cursor;

        Status(int count, long syncedAt, String syncedDay) {
            this(count, syncedAt, syncedDay, "");
        }

        Status(int count, long syncedAt, String syncedDay, String cursor) {
            this.count = count;
            this.syncedAt = syncedAt;
            this.syncedDay = syncedDay == null ? "" : syncedDay;
            this.cursor = cursor == null ? "" : cursor;
        }
    }

    public CallerDirectoryDb(Context context) {
        super(context.getApplicationContext(), DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
            "CREATE TABLE callers ("
                + "id TEXT PRIMARY KEY,"
                + "name TEXT NOT NULL,"
                + "phone_key TEXT,"
                + "alt_key TEXT)"
        );
        db.execSQL("CREATE INDEX idx_callers_phone ON callers(phone_key)");
        db.execSQL("CREATE INDEX idx_callers_alt ON callers(alt_key)");
        db.execSQL("CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS callers");
        db.execSQL("DROP TABLE IF EXISTS meta");
        onCreate(db);
    }

    /** Last 10 digits. Shorter numbers are ignored so blanks never match a call. */
    public static String phoneKey(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        StringBuilder digits = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            if (c >= '0' && c <= '9') digits.append(c);
        }
        if (digits.length() < 10) return "";
        return digits.substring(digits.length() - 10);
    }

    public Status readStatus() {
        SQLiteDatabase db = getReadableDatabase();
        int count = 0;
        try (Cursor cursor = db.rawQuery("SELECT COUNT(*) FROM callers", null)) {
            if (cursor.moveToFirst()) count = cursor.getInt(0);
        }
        long syncedAt = 0L;
        String syncedDay = "";
        String cursorIso = "";
        try (Cursor cursor = db.rawQuery("SELECT k, v FROM meta", null)) {
            while (cursor.moveToNext()) {
                String key = cursor.getString(0);
                String value = cursor.getString(1);
                if ("synced_at".equals(key)) {
                    try {
                        syncedAt = Long.parseLong(value);
                    } catch (NumberFormatException ignored) {
                        syncedAt = 0L;
                    }
                } else if ("synced_day".equals(key)) {
                    syncedDay = value == null ? "" : value;
                } else if ("synced_cursor".equals(key)) {
                    cursorIso = value == null ? "" : value;
                }
            }
        }
        return new Status(count, syncedAt, syncedDay, cursorIso);
    }

    public Match findByNumber(String rawNumber) {
        String key = phoneKey(rawNumber);
        if (key.isEmpty()) return null;
        SQLiteDatabase db = getReadableDatabase();
        try (
            Cursor cursor = db.rawQuery(
                "SELECT id, name FROM callers WHERE phone_key = ? OR alt_key = ? LIMIT 1",
                new String[] { key, key }
            )
        ) {
            if (!cursor.moveToFirst()) return null;
            String id = cursor.getString(0);
            String name = cursor.getString(1);
            if (id == null || id.isEmpty()) return null;
            if (name == null || name.trim().isEmpty()) name = "Customer";
            return new Match(id, name.trim());
        }
    }

    /** Replace the whole list. Called only after a full download succeeds. */
    public int replaceAll(JSONArray rows, String syncedDay, long syncedAt, String cursorIso) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("callers", null, null);
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                String id = row.optString("id", "").trim();
                if (id.isEmpty()) continue;
                String name = row.optString("name", "").trim();
                if (name.isEmpty()) name = "Customer";
                if (name.length() > 80) name = name.substring(0, 80);
                ContentValues values = new ContentValues();
                values.put("id", id);
                values.put("name", name);
                putKey(values, "phone_key", phoneKey(row.optString("phone", "")));
                putKey(values, "alt_key", phoneKey(row.optString("alt", "")));
                db.insertWithOnConflict("callers", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            }
            writeMeta(db, "synced_at", String.valueOf(syncedAt));
            writeMeta(db, "synced_day", syncedDay == null ? "" : syncedDay);
            if (cursorIso != null && !cursorIso.isEmpty()) {
                writeMeta(db, "synced_cursor", cursorIso);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return readStatus().count;
    }

    /**
     * Insert or replace only the rows that changed. A customer with no phone
     * number is removed so an old number cannot keep matching.
     */
    public int upsertAll(JSONArray rows, String cursorIso, long syncedAt) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (int i = 0; i < rows.length(); i++) {
                JSONObject row = rows.optJSONObject(i);
                if (row == null) continue;
                String id = row.optString("id", "").trim();
                if (id.isEmpty()) continue;
                String phone = phoneKey(row.optString("phone", ""));
                String alt = phoneKey(row.optString("alt", ""));
                if (phone.isEmpty() && alt.isEmpty()) {
                    db.delete("callers", "id = ?", new String[] { id });
                    continue;
                }
                String name = row.optString("name", "").trim();
                if (name.isEmpty()) name = "Customer";
                if (name.length() > 80) name = name.substring(0, 80);
                ContentValues values = new ContentValues();
                values.put("id", id);
                values.put("name", name);
                putKey(values, "phone_key", phone);
                putKey(values, "alt_key", alt);
                db.insertWithOnConflict("callers", null, values, SQLiteDatabase.CONFLICT_REPLACE);
            }
            writeMeta(db, "synced_at", String.valueOf(syncedAt));
            if (cursorIso != null && !cursorIso.isEmpty()) {
                writeMeta(db, "synced_cursor", cursorIso);
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
        return readStatus().count;
    }

    private static void putKey(ContentValues values, String column, String key) {
        if (key == null || key.isEmpty()) values.putNull(column);
        else values.put(column, key);
    }

    private static void writeMeta(SQLiteDatabase db, String key, String value) {
        ContentValues values = new ContentValues();
        values.put("k", key);
        values.put("v", value);
        db.insertWithOnConflict("meta", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }
}

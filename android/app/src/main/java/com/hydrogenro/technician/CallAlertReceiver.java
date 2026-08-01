package com.hydrogenro.technician;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.telephony.TelephonyManager;
import android.util.Log;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;

/**
 * Customer called the technician → notify admins after the call ends (IDLE).
 *
 * Why hangup-first:
 * - Dialers (Truecaller / Samsung / Google) often hide EXTRA_INCOMING_NUMBER
 *   mid-ring, but always write CallLog when the call finishes.
 * - Waiting until IDLE avoids racing RINGING + OFFHOOK + FGS + JS backup
 *   (the usual source of duplicate admin pushes).
 *
 * Re-call: new RINGING after IDLE → new session + new CallLog DATE → new push.
 * Same call: client claim lock + server (technician_id, call_id) PK.
 */
public class CallAlertReceiver extends BroadcastReceiver {

    private static final String TAG = "HroCallAlert";
    private static final Object UPLOAD_LOCK = new Object();

    static final String PREFS = "hro_call_alert";
    static final String KEY_LAST_NUMBER = "last_number";
    static final String KEY_LAST_AT = "last_at";
    static final String KEY_CONSUMED_AT = "consumed_at";
    static final String KEY_RING_SEEN_AT = "ring_seen_at";
    static final String KEY_ALERTED_RING_AT = "alerted_ring_at";
    static final String KEY_PENDING_RING_AT = "pending_ring_at";
    static final String KEY_PENDING_NUMBER = "pending_number";
    static final String KEY_ALERTED_CALL_ID = "alerted_call_id";
    static final String KEY_CLAIMED_CALL_ID = "claimed_call_id";
    private static final String KEY_IN_CALL = "in_call";
    private static final String KEY_HAD_INCOMING_RING = "had_incoming_ring";

    private static final String ALERT_URL =
        "https://hydrogenro.com/.netlify/functions/tech-call-customer-alert";

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            handlePhoneState(context, intent);
        } catch (Throwable t) {
            Log.w(TAG, "PHONE_STATE handling failed", t);
            CrashReporter.reportWarning(context, "Call detection failed",
                String.valueOf(t.getMessage()), t);
        }
    }

    private void handlePhoneState(Context context, Intent intent) {
        if (!TelephonyManager.ACTION_PHONE_STATE_CHANGED.equals(intent.getAction())) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;

        String state = intent.getStringExtra(TelephonyManager.EXTRA_STATE);
        final Context app = context.getApplicationContext();
        SharedPreferences prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        try {
            WrongLineCallReceiver.onPhoneState(app, state);
        } catch (Throwable t) {
            Log.w(TAG, "Wrong-line hook failed", t);
        }

        if (TelephonyManager.EXTRA_STATE_RINGING.equals(state)) {
            long now = System.currentTimeMillis();
            boolean wasInCall = prefs.getBoolean(KEY_IN_CALL, false);
            long existingRing = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            long ringAt;
            // Same ringing episode can fire RINGING multiple times — reuse id.
            if (
                wasInCall &&
                existingRing > 0 &&
                prefs.getLong(KEY_ALERTED_RING_AT, 0L) != existingRing &&
                now - existingRing < 10 * 60_000L
            ) {
                ringAt = existingRing;
            } else {
                ringAt = now;
            }

            SharedPreferences.Editor ed =
                prefs
                    .edit()
                    .putLong(KEY_RING_SEEN_AT, ringAt)
                    .putBoolean(KEY_IN_CALL, true)
                    .putBoolean(KEY_HAD_INCOMING_RING, true)
                    .putLong(KEY_PENDING_RING_AT, ringAt);

            String number = extractIncomingNumber(intent);
            if (number == null || number.isEmpty()) {
                // Truecaller often blanks EXTRA — try CallLog mid-ring (rare but cheap).
                CallLogHelper.Entry early =
                    CallLogHelper.bestIncomingForSession(app, ringAt, ringAt - 30_000L);
                if (early != null) number = early.number;
            }
            if (number != null && !number.trim().isEmpty()) {
                String cleaned = number.trim();
                ed.putString(KEY_PENDING_NUMBER, cleaned)
                    .putString(KEY_LAST_NUMBER, cleaned)
                    .putLong(KEY_LAST_AT, now)
                    .remove(KEY_CONSUMED_AT);
                Log.i(TAG, "RINGING — cached number, wait for hangup");
            } else {
                Log.i(TAG, "RINGING — no EXTRA yet, will use CallLog after hangup");
            }
            ed.apply();
            // Do NOT upload / start FGS here — hangup path is the single sender.
            return;
        }

        if (TelephonyManager.EXTRA_STATE_OFFHOOK.equals(state)) {
            prefs.edit().putBoolean(KEY_IN_CALL, true).apply();
            // While connected, keep trying to learn the number (Truecaller lag).
            if (prefs.getBoolean(KEY_HAD_INCOMING_RING, false)) {
                long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
                String existing = prefs.getString(KEY_PENDING_NUMBER, null);
                if ((existing == null || existing.isEmpty()) && ringAt > 0) {
                    CallLogHelper.Entry early =
                        CallLogHelper.bestIncomingForSession(app, ringAt, ringAt - 30_000L);
                    if (early != null && early.number != null && !early.number.isEmpty()) {
                        prefs
                            .edit()
                            .putString(KEY_PENDING_NUMBER, early.number)
                            .putString(KEY_LAST_NUMBER, early.number)
                            .putLong(KEY_LAST_AT, System.currentTimeMillis())
                            .putLong(RecentCallPlugin.KEY_LAST_CALLLOG_DATE, early.dateMs)
                            .apply();
                        Log.i(TAG, "OFFHOOK — cached number from CallLog");
                    }
                }
            }
            return;
        }

        if (!TelephonyManager.EXTRA_STATE_IDLE.equals(state)) return;

        boolean hadIncoming = prefs.getBoolean(KEY_HAD_INCOMING_RING, false);
        long ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
        if (ringAt <= 0) ringAt = prefs.getLong(KEY_PENDING_RING_AT, 0L);

        prefs
            .edit()
            .putBoolean(KEY_IN_CALL, false)
            .putBoolean(KEY_HAD_INCOMING_RING, false)
            .apply();

        // Outgoing-only IDLE (no prior RINGING) — ignore for admin inbound alerts.
        if (!hadIncoming || ringAt <= 0) return;
        if (System.currentTimeMillis() - ringAt > 45 * 60_000L) {
            prefs.edit().remove(KEY_RING_SEEN_AT).apply();
            return;
        }
        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
            CallAlertUploadService.cancelKicks(app, ringAt);
            prefs.edit().remove(KEY_RING_SEEN_AT).apply();
            return;
        }

        Log.i(TAG, "IDLE after inbound — finalize alert for ring " + ringAt);
        final long session = ringAt;
        final PendingResult pending = goAsync();
        new Thread(() -> {
            try {
                // Brief pause so OEMs / Truecaller flush CallLog after hangup.
                try {
                    Thread.sleep(1_200);
                } catch (InterruptedException ignored) {
                    /* continue */
                }
                if (!finalizeAndUpload(app, session)) {
                    // CallLog not ready yet — FGS + kicks will finish once.
                    CallAlertUploadService.startWatch(app, session);
                }
            } catch (Throwable t) {
                Log.w(TAG, "IDLE finalize failed", t);
            } finally {
                pending.finish();
            }
        }).start();
    }

    /**
     * Resolve number from CallLog (preferred) or RINGING cache, then upload once.
     * @return true if handled (alerted, claimed, or nothing to do); false if still waiting on CallLog
     */
    static boolean finalizeAndUpload(Context context, long ringAt) {
        return finalizeAndUpload(context, ringAt, false);
    }

    static boolean finalizeAndUpload(Context context, long ringAt, boolean allowPendingFallback) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        if (ringAt <= 0) {
            ringAt = prefs.getLong(KEY_RING_SEEN_AT, 0L);
            if (ringAt <= 0) ringAt = prefs.getLong(KEY_PENDING_RING_AT, 0L);
        }
        if (ringAt <= 0) return true;
        if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
            CallAlertUploadService.cancelKicks(context, ringAt);
            return true;
        }

        // Prefer CallLog DATE so callId = phone:dateMs (matches JS backup).
        // Truecaller often blanks EXTRA and writes CallLog late — keep waiting
        // unless allowPendingFallback (RINGING cache / last resort).
        CallLogHelper.Entry log =
            CallLogHelper.bestIncomingForSession(context, ringAt, ringAt - 3 * 60_000L);
        String number = null;
        long callAt = ringAt;
        if (log != null && log.number != null && !log.number.trim().isEmpty()) {
            number = log.number.trim();
            callAt = log.dateMs > 0 ? log.dateMs : ringAt;
        } else if (allowPendingFallback) {
            number = prefs.getString(KEY_PENDING_NUMBER, null);
            if (number == null || number.trim().isEmpty()) {
                // Only reuse LAST_NUMBER if it was cached during this ring session.
                long lastAt = prefs.getLong(KEY_LAST_AT, 0L);
                if (lastAt >= ringAt - 5_000L && lastAt <= System.currentTimeMillis() + 5_000L) {
                    number = prefs.getString(KEY_LAST_NUMBER, null);
                }
            }
            if (number != null) number = number.trim();
            callAt = ringAt;
            if (number != null && !number.isEmpty()) {
                Log.w(TAG, "Finalize — using RINGING/pending number (no CallLog yet)");
            }
        } else {
            Log.i(TAG, "Finalize — waiting CallLog for stable callId");
            return false;
        }
        if (number == null || number.isEmpty()) {
            Log.i(TAG, "Finalize — no number yet");
            return false;
        }

        prefs
            .edit()
            .putString(KEY_PENDING_NUMBER, number)
            .putString(KEY_LAST_NUMBER, number)
            .putLong(KEY_LAST_AT, System.currentTimeMillis())
            .putLong(RecentCallPlugin.KEY_LAST_CALLLOG_DATE, callAt)
            .apply();

        uploadCallerNow(context, number, ringAt, callAt);
        return prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt;
    }

    /**
     * Last resort when CallLog never appears (OEM / privacy / Truecaller).
     * Uses RINGING-cached number with ring session as callAt.
     */
    static void uploadPendingFallback(Context context, long ringAt) {
        finalizeAndUpload(context, ringAt, true);
    }

    /** Legacy 3-arg entry — callAt defaults to ringAt. */
    @Deprecated
    static void uploadCallerNow(Context context, String cleaned, long ringAt) {
        uploadCallerNow(context, cleaned, ringAt, ringAt);
    }

    static void uploadCallerNow(Context context, String cleaned, long ringAt, long callAt) {
        if (cleaned == null || cleaned.trim().isEmpty()) return;
        if (!DevicePrefsPlugin.shouldProcessIncomingCall(context)) return;
        cleaned = cleaned.trim();
        if (callAt <= 0) callAt = ringAt > 0 ? ringAt : System.currentTimeMillis();
        if (ringAt <= 0) ringAt = callAt;

        String phone10 = normalize10(cleaned);
        String callId = phone10.isEmpty()
            ? ("ring:" + ringAt)
            : (phone10 + ":" + callAt);

        synchronized (UPLOAD_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (prefs.getLong(KEY_ALERTED_RING_AT, 0L) == ringAt) {
                Log.i(TAG, "Upload skip — ring already alerted");
                CallAlertUploadService.cancelKicks(context, ringAt);
                return;
            }
            String alertedId = prefs.getString(KEY_ALERTED_CALL_ID, "");
            if (callId.equals(alertedId)) {
                Log.i(TAG, "Upload skip — callId already alerted");
                markAlerted(context, ringAt, callId);
                return;
            }
            String claimed = prefs.getString(KEY_CLAIMED_CALL_ID, "");
            if (callId.equals(claimed)) {
                Log.i(TAG, "Upload skip — callId already claimed");
                return;
            }
            // Claim BEFORE network so concurrent FGS / kick / JS can't race.
            prefs
                .edit()
                .putString(KEY_CLAIMED_CALL_ID, callId)
                .putLong(KEY_PENDING_RING_AT, ringAt)
                .putString(KEY_PENDING_NUMBER, cleaned)
                .putString(KEY_LAST_NUMBER, cleaned)
                .putLong(KEY_LAST_AT, System.currentTimeMillis())
                .remove(KEY_CONSUMED_AT)
                .commit();
        }

        String token = DevicePrefsPlugin.readFcmToken(context);
        if (token == null || token.length() < 20) {
            try {
                token =
                    Tasks.await(
                        FirebaseMessaging.getInstance().getToken(),
                        8,
                        TimeUnit.SECONDS
                    );
                if (token != null && token.length() >= 20) {
                    DevicePrefsPlugin.saveFcmToken(context, token.trim());
                    token = token.trim();
                }
            } catch (Exception e) {
                Log.w(TAG, "getToken failed: " + e.getMessage());
                token = null;
            }
        }

        if (token == null || token.length() < 20) {
            Log.w(TAG, "No FCM token — upload aborted");
            clearClaim(context, callId);
            return;
        }

        int code = postOnce(token, cleaned, callId, callAt);
        Log.i(TAG, "Alert POST code=" + code + " callId=" + callId);
        if (code == 401) {
            try {
                String fresh =
                    Tasks.await(
                        FirebaseMessaging.getInstance().getToken(),
                        8,
                        TimeUnit.SECONDS
                    );
                if (fresh != null && fresh.length() >= 20) {
                    code = postOnce(fresh.trim(), cleaned, callId, callAt);
                    Log.i(TAG, "Alert POST retry fresh code=" + code);
                    if (code >= 200 && code < 300) {
                        DevicePrefsPlugin.saveFcmToken(context, fresh.trim());
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Fresh token retry failed: " + e.getMessage());
            }
        }

        if (code >= 200 && code < 300) {
            markAlerted(context, ringAt, callId);
            Log.i(TAG, "Alert upload OK");
        } else {
            clearClaim(context, callId);
            Log.w(TAG, "Alert upload failed");
        }
    }

    private static void clearClaim(Context context, String callId) {
        synchronized (UPLOAD_LOCK) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            if (callId.equals(prefs.getString(KEY_CLAIMED_CALL_ID, ""))) {
                prefs.edit().remove(KEY_CLAIMED_CALL_ID).commit();
            }
        }
    }

    private static void markAlerted(Context context, long ringAt, String callId) {
        synchronized (UPLOAD_LOCK) {
            context
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putLong(KEY_ALERTED_RING_AT, ringAt)
                .putString(KEY_ALERTED_CALL_ID, callId != null ? callId : "")
                .remove(KEY_CLAIMED_CALL_ID)
                .remove(KEY_RING_SEEN_AT)
                .commit();
        }
        CallAlertUploadService.cancelKicks(context, ringAt);
    }

    private static String normalize10(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() >= 12 && digits.startsWith("91")) digits = digits.substring(2);
        digits = digits.replaceFirst("^0+", "");
        return digits.length() >= 10 ? digits.substring(digits.length() - 10) : "";
    }

    /**
     * OEMs / dialers disagree on the EXTRA key. Try every common one.
     * Truecaller often returns null for all of these — CallLog is then required.
     */
    private static String extractIncomingNumber(Intent intent) {
        if (intent == null) return null;
        String[] keys = {
            TelephonyManager.EXTRA_INCOMING_NUMBER,
            "incoming_number",
            "incomingNumber",
            "number",
            "android.intent.extra.PHONE_NUMBER",
        };
        for (String key : keys) {
            try {
                String v = intent.getStringExtra(key);
                if (v != null && !v.trim().isEmpty() && !CallLogHelper.isUselessNumber(v)) {
                    return v.trim();
                }
            } catch (Exception ignored) {
                /* ignore */
            }
        }
        return null;
    }

    private static String jsonEscape(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private static int postOnce(String token, String number, String callId, long callAt) {
        HttpURLConnection conn = null;
        try {
            String payload =
                "{\"token\":\"" + jsonEscape(token) + "\"," +
                "\"number\":\"" + jsonEscape(number) + "\"," +
                "\"callId\":\"" + jsonEscape(callId) + "\"," +
                "\"callAt\":" + callAt + "}";
            conn = (HttpURLConnection) new URL(ALERT_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(8_000);
            conn.setReadTimeout(8_000);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }
            int code = conn.getResponseCode();
            InputStream stream =
                code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (stream != null) {
                try (BufferedReader br =
                    new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                    Log.i(TAG, "Alert body: " + sb);
                }
            }
            return code;
        } catch (Exception e) {
            Log.w(TAG, "postOnce failed: " + e.getMessage());
            return -1;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}

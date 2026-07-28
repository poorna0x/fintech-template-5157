package com.hydrogenro.technician;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.provider.CallLog;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.telephony.TelephonyManager;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Resolve which SIM / line placed an outgoing call, and compare to the
 * company phone cached from the technician profile (synced once on login).
 */
final class SimLineHelper {

    private static final String TAG = "HroSimLine";

    static final class OutgoingCall {
        final String dialedNumber;
        final String fromNumber;
        final long dateMs;

        OutgoingCall(String dialedNumber, String fromNumber, long dateMs) {
            this.dialedNumber = dialedNumber;
            this.fromNumber = fromNumber;
            this.dateMs = dateMs;
        }
    }

    private SimLineHelper() {}

    /** Last-10 Indian digits, or "" if unusable. */
    static String normalize10(String raw) {
        if (raw == null) return "";
        String digits = raw.replaceAll("\\D", "");
        if (digits.length() >= 12 && digits.startsWith("91")) {
            digits = digits.substring(2);
        }
        digits = digits.replaceFirst("^0+", "");
        return digits.length() >= 10 ? digits.substring(digits.length() - 10) : "";
    }

    /**
     * Refresh cached SIM MSISDNs into SharedPreferences. Called when company
     * phone is synced — not on every call.
     */
    static void refreshSimCache(Context context) {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        Map<String, String> bySub = new HashMap<>();
        List<String> numbers = new ArrayList<>();
        try {
            SubscriptionManager sm =
                (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) return;
            List<SubscriptionInfo> infos = sm.getActiveSubscriptionInfoList();
            if (infos == null) return;
            for (SubscriptionInfo info : infos) {
                String num = normalize10(info.getNumber());
                if (num.isEmpty() && android.os.Build.VERSION.SDK_INT >= 24) {
                    try {
                        TelephonyManager tm =
                            ((TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE))
                                .createForSubscriptionId(info.getSubscriptionId());
                        if (tm != null) num = normalize10(tm.getLine1Number());
                    } catch (Exception ignored) {
                    }
                }
                if (!num.isEmpty()) {
                    bySub.put(String.valueOf(info.getSubscriptionId()), num);
                    if (!numbers.contains(num)) numbers.add(num);
                }
            }
        } catch (SecurityException e) {
            Log.w(TAG, "SIM read denied: " + e.getMessage());
            return;
        } catch (Exception e) {
            Log.w(TAG, "SIM refresh failed: " + e.getMessage());
            return;
        }

        StringBuilder csv = new StringBuilder();
        for (int i = 0; i < numbers.size(); i++) {
            if (i > 0) csv.append(',');
            csv.append(numbers.get(i));
        }
        StringBuilder map = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, String> e : bySub.entrySet()) {
            if (!first) map.append(';');
            first = false;
            map.append(e.getKey()).append('=').append(e.getValue());
        }
        DevicePrefsPlugin.saveSimCache(context, csv.toString(), map.toString());
        Log.i(TAG, "SIM cache refreshed: " + numbers.size() + " number(s)");
    }

    /**
     * Latest outgoing CallLog row since {@code sinceEpochMs}.
     * fromNumber may be empty when the OEM hides SIM MSISDN.
     */
    static OutgoingCall latestOutgoing(Context context, long sinceEpochMs) {
        if (!CallLogHelper.hasCallLogPermission(context)) return null;
        Cursor cursor = null;
        try {
            cursor =
                context
                    .getContentResolver()
                    .query(
                        CallLog.Calls.CONTENT_URI,
                        new String[] {
                            CallLog.Calls.NUMBER,
                            CallLog.Calls.DATE,
                            CallLog.Calls.PHONE_ACCOUNT_ID,
                        },
                        CallLog.Calls.DATE + ">=? AND " + CallLog.Calls.TYPE + "=?",
                        new String[] {
                            String.valueOf(sinceEpochMs),
                            String.valueOf(CallLog.Calls.OUTGOING_TYPE),
                        },
                        CallLog.Calls.DATE + " DESC"
                    );
            if (cursor == null || !cursor.moveToFirst()) return null;
            String dialed = cursor.getString(0);
            long dateMs = cursor.getLong(1);
            String accountId = cursor.getString(2);
            if (dialed == null || dialed.trim().isEmpty()) return null;
            String from = resolveFromForAccount(context, accountId);
            return new OutgoingCall(dialed.trim(), from, dateMs);
        } catch (Exception e) {
            Log.w(TAG, "Outgoing CallLog failed: " + e.getMessage());
            return null;
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private static String resolveFromForAccount(Context context, String accountId) {
        Map<String, String> bySub = DevicePrefsPlugin.readSimSubMap(context);
        if (accountId != null && !accountId.isEmpty()) {
            // PHONE_ACCOUNT_ID is often the subscription id as a string.
            String direct = bySub.get(accountId.trim());
            if (direct != null && !direct.isEmpty()) return direct;
            for (Map.Entry<String, String> e : bySub.entrySet()) {
                if (accountId.contains(e.getKey()) || e.getKey().equals(accountId)) {
                    return e.getValue();
                }
            }
        }
        // Single-SIM fallback: only one known line on device.
        List<String> all = DevicePrefsPlugin.readSimNumbers(context);
        if (all.size() == 1) return all.get(0);
        return "";
    }

    /**
     * True when this outgoing call used a line other than the company phone.
     * Uses cached company phone + SIM list — no network.
     */
    static boolean isWrongCompanyLine(Context context, String fromNumber) {
        String company = DevicePrefsPlugin.readCompanyPhone(context);
        if (company.isEmpty()) {
            Log.i(TAG, "No company phone cached — skip wrong-line check");
            return false;
        }
        String from = normalize10(fromNumber);
        if (!from.isEmpty()) {
            return !from.equals(company);
        }
        // Can't see which SIM dialed — if company number isn't on any SIM in
        // this phone, treat as wrong line (personal phone / different SIM).
        List<String> sims = DevicePrefsPlugin.readSimNumbers(context);
        if (sims.isEmpty()) {
            Log.i(TAG, "No SIM numbers readable — skip wrong-line check");
            return false;
        }
        return !sims.contains(company);
    }
}

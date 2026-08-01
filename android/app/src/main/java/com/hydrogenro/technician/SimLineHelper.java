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
 * company phone cached from the technician profile.
 *
 * Indian SIMs often expose a blank MSISDN. Fallback: company line is SIM 2
 * (slot index 1) unless overridden — if the call used another slot → wrong line.
 */
final class SimLineHelper {

    private static final String TAG = "HroSimLine";

    /** 1-based SIM slot for the company calling SIM when numbers are unreadable. */
    static final int DEFAULT_COMPANY_SIM_SLOT = 2;

    static final class OutgoingCall {
        final String dialedNumber;
        final String fromNumber;
        /** 1-based SIM slot that placed the call, or 0 if unknown. */
        final int fromSimSlot;
        final long dateMs;

        OutgoingCall(String dialedNumber, String fromNumber, int fromSimSlot, long dateMs) {
            this.dialedNumber = dialedNumber;
            this.fromNumber = fromNumber;
            this.fromSimSlot = fromSimSlot;
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
     * Refresh cached SIM MSISDNs + subId→slot map. Called when company phone
     * is synced — not on every call.
     */
    static void refreshSimCache(Context context) {
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }
        Map<String, String> bySub = new HashMap<>();
        Map<String, Integer> slotBySub = new HashMap<>();
        List<String> numbers = new ArrayList<>();
        try {
            SubscriptionManager sm =
                (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
            if (sm == null) return;
            List<SubscriptionInfo> infos = sm.getActiveSubscriptionInfoList();
            if (infos == null) return;
            for (SubscriptionInfo info : infos) {
                String subKey = String.valueOf(info.getSubscriptionId());
                // getSimSlotIndex is 0-based → store 1-based for humans ("SIM 2").
                int slot1 = info.getSimSlotIndex() + 1;
                if (slot1 > 0) slotBySub.put(subKey, slot1);

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
                    bySub.put(subKey, num);
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
        StringBuilder slots = new StringBuilder();
        first = true;
        for (Map.Entry<String, Integer> e : slotBySub.entrySet()) {
            if (!first) slots.append(';');
            first = false;
            slots.append(e.getKey()).append('=').append(e.getValue());
        }
        DevicePrefsPlugin.saveSimCache(context, csv.toString(), map.toString(), slots.toString());
        Log.i(
            TAG,
            "SIM cache refreshed: " + numbers.size() + " number(s), " + slotBySub.size() + " slot(s)"
        );
        resolveAndSaveCompanySimSlot(context);
    }

    /**
     * If the company phone matches a readable SIM MSISDN, pin that slot as office.
     * If numbers can't be fetched / don't match → office defaults to SIM 2.
     */
    static void resolveAndSaveCompanySimSlot(Context context) {
        String company = DevicePrefsPlugin.readCompanyPhone(context);
        if (company.isEmpty()) {
            DevicePrefsPlugin.saveCompanySimSlot(context, DEFAULT_COMPANY_SIM_SLOT);
            return;
        }

        Map<String, String> bySub = DevicePrefsPlugin.readSimSubMap(context);
        Map<String, Integer> slots = DevicePrefsPlugin.readSimSlotMap(context);
        for (Map.Entry<String, String> e : bySub.entrySet()) {
            if (!company.equals(e.getValue())) continue;
            Integer slot = slots.get(e.getKey());
            if (slot != null && slot >= 1) {
                DevicePrefsPlugin.saveCompanySimSlot(context, slot);
                Log.i(TAG, "Company phone matched on SIM " + slot);
                return;
            }
        }

        // Live pass in case cache maps are empty but SubscriptionInfo is readable now.
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                == PackageManager.PERMISSION_GRANTED
        ) {
            try {
                SubscriptionManager sm =
                    (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
                if (sm != null) {
                    List<SubscriptionInfo> infos = sm.getActiveSubscriptionInfoList();
                    if (infos != null) {
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
                            if (company.equals(num)) {
                                int slot1 = info.getSimSlotIndex() + 1;
                                if (slot1 >= 1) {
                                    DevicePrefsPlugin.saveCompanySimSlot(context, slot1);
                                    Log.i(TAG, "Company phone live-matched on SIM " + slot1);
                                    return;
                                }
                            }
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Company SIM resolve failed: " + e.getMessage());
            }
        }

        DevicePrefsPlugin.saveCompanySimSlot(context, DEFAULT_COMPANY_SIM_SLOT);
        Log.i(
            TAG,
            "Company phone not readable on any SIM — default office SIM " + DEFAULT_COMPANY_SIM_SLOT
        );
    }

    /**
     * Latest outgoing CallLog row since {@code sinceEpochMs}.
     * fromNumber / fromSimSlot may be empty/0 when the OEM hides them.
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
            int slot = resolveSlotForAccount(context, accountId);
            return new OutgoingCall(dialed.trim(), from, slot, dateMs);
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
            String direct = bySub.get(accountId.trim());
            if (direct != null && !direct.isEmpty()) return direct;
            for (Map.Entry<String, String> e : bySub.entrySet()) {
                if (accountId.contains(e.getKey()) || e.getKey().equals(accountId)) {
                    return e.getValue();
                }
            }
        }
        List<String> all = DevicePrefsPlugin.readSimNumbers(context);
        if (all.size() == 1) return all.get(0);
        return "";
    }

    /** 1-based SIM slot for this CallLog phone account, or 0. */
    private static int resolveSlotForAccount(Context context, String accountId) {
        Map<String, Integer> slots = DevicePrefsPlugin.readSimSlotMap(context);
        if (accountId != null && !accountId.isEmpty()) {
            Integer direct = slots.get(accountId.trim());
            if (direct != null && direct > 0) return direct;
            for (Map.Entry<String, Integer> e : slots.entrySet()) {
                if (accountId.contains(e.getKey()) || e.getKey().equals(accountId)) {
                    return e.getValue() != null ? e.getValue() : 0;
                }
            }
        }
        // Live lookup if cache empty (first call before refresh).
        if (
            ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
                == PackageManager.PERMISSION_GRANTED
        ) {
            try {
                SubscriptionManager sm =
                    (SubscriptionManager) context.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE);
                if (sm != null) {
                    List<SubscriptionInfo> infos = sm.getActiveSubscriptionInfoList();
                    if (infos != null && accountId != null) {
                        for (SubscriptionInfo info : infos) {
                            String sub = String.valueOf(info.getSubscriptionId());
                            if (accountId.equals(sub) || accountId.contains(sub)) {
                                return info.getSimSlotIndex() + 1;
                            }
                        }
                    }
                }
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    /**
     * True when this outgoing call used a line other than the company phone/SIM.
     * Prefer MSISDN match; if blank, compare SIM slot (default company = SIM 2).
     */
    static boolean isWrongCompanyLine(Context context, OutgoingCall call) {
        if (call == null) return false;
        String company = DevicePrefsPlugin.readCompanyPhone(context);
        if (company.isEmpty()) {
            Log.i(TAG, "No company phone cached — skip wrong-line check");
            return false;
        }
        String from = normalize10(call.fromNumber);
        if (!from.isEmpty()) {
            boolean wrong = !from.equals(company);
            Log.i(TAG, "Wrong-line by number: from=" + from + " company=" + company + " → " + wrong);
            return wrong;
        }

        int companySlot = DevicePrefsPlugin.readCompanySimSlot(context);
        if (call.fromSimSlot > 0 && companySlot > 0) {
            boolean wrong = call.fromSimSlot != companySlot;
            Log.i(
                TAG,
                "Wrong-line by SIM slot: used=SIM"
                    + call.fromSimSlot
                    + " company=SIM"
                    + companySlot
                    + " → "
                    + wrong
            );
            return wrong;
        }

        // Numbers blank and slot unknown — if company digits aren't on any
        // readable SIM list, treat as wrong (personal-only handset).
        List<String> sims = DevicePrefsPlugin.readSimNumbers(context);
        if (sims.isEmpty()) {
            Log.i(TAG, "No SIM number/slot for call — skip wrong-line check");
            return false;
        }
        return !sims.contains(company);
    }
}

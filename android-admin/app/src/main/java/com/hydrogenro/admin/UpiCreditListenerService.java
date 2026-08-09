package com.hydrogenro.admin;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.text.TextUtils;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Reads PhonePe (and GPay) credit notifications and auto-settles open
 * pending-payment UPI short links by exact amount.
 */
public class UpiCreditListenerService extends NotificationListenerService {
    private static final String TAG = "UpiCreditListener";
    static final String PREFS = "hro_upi_credit_prefs";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_SUPABASE_URL = "supabase_url";
    static final String KEY_ANON_KEY = "anon_key";
    static final String KEY_ACCESS_TOKEN = "access_token";

    /** ₹ / Rs / INR optional — PhonePe often uses "₹500.00" or "Rs.500". */
    private static final Pattern AMOUNT_PATTERN =
        Pattern.compile(
            "(?:₹|rs\\.?|inr)?\\s*([0-9]{1,3}(?:,[0-9]{2,3})+(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        );
    private static final Pattern FROM_PATTERN =
        Pattern.compile(
            "(?:from|by|paid by)\\s+([A-Za-z0-9 .'_-]{2,60})",
            Pattern.CASE_INSENSITIVE
        );

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile long lastSettleAtMs = 0L;
    private volatile double lastSettleAmount = -1;

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static boolean isEnabled(Context context) {
        return prefs(context).getBoolean(KEY_ENABLED, true);
    }

    static void setEnabled(Context context, boolean enabled) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    static void saveSession(
        Context context,
        String supabaseUrl,
        String anonKey,
        String accessToken
    ) {
        SharedPreferences.Editor ed = prefs(context).edit();
        if (supabaseUrl != null && !supabaseUrl.trim().isEmpty()) {
            ed.putString(KEY_SUPABASE_URL, supabaseUrl.trim().replaceAll("/$", ""));
        }
        if (anonKey != null && !anonKey.trim().isEmpty()) {
            ed.putString(KEY_ANON_KEY, anonKey.trim());
        }
        if (accessToken != null && !accessToken.trim().isEmpty()) {
            ed.putString(KEY_ACCESS_TOKEN, accessToken.trim());
        } else if (accessToken != null && accessToken.isEmpty()) {
            ed.remove(KEY_ACCESS_TOKEN);
        }
        ed.apply();
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        Log.i(TAG, "Notification listener connected");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !isEnabled(this)) return;
        String pkg = sbn.getPackageName() == null ? "" : sbn.getPackageName();
        if (!isUpiPackage(pkg)) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;

        String combined = collectNotificationText(notification);
        if (combined.isEmpty()) {
            Log.i(TAG, "UPI pkg notif with empty text pkg=" + pkg);
            return;
        }
        Log.i(TAG, "UPI notif pkg=" + pkg + " text=" + combined.replace("\n", " | "));

        if (!looksLikeCredit(combined)) {
            Log.i(TAG, "Skipped — not a credit-looking alert");
            return;
        }

        Double amount = extractAmount(combined);
        if (amount == null || amount <= 0) {
            notifyResult(
                "PhonePe / UPI alert",
                "Saw a payment alert but could not read the amount — mark collected in CRM if needed",
                false
            );
            return;
        }

        // Debounce duplicate posts for the same amount within 8s.
        long now = System.currentTimeMillis();
        if (Math.abs(amount - lastSettleAmount) < 0.001 && now - lastSettleAtMs < 8000) {
            Log.i(TAG, "Debounced duplicate amount " + amount);
            return;
        }

        String payer = extractPayer(combined);
        final double amt = amount;
        final String payerName = payer == null ? "" : payer;
        final String raw = combined.length() > 500 ? combined.substring(0, 500) : combined;
        executor.execute(() -> settleCredit(amt, payerName, raw));
    }

    private static String collectNotificationText(Notification notification) {
        Bundle extras = notification.extras;
        if (extras == null) return "";
        List<String> parts = new ArrayList<>();
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_TITLE));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_TITLE_BIG));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_TEXT));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        appendCs(parts, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));

        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) {
            for (CharSequence line : lines) appendCs(parts, line);
        }

        // MessagingStyle (some UPI apps)
        try {
            Object msgs = extras.get(Notification.EXTRA_MESSAGES);
            if (msgs instanceof Object[]) {
                for (Object o : (Object[]) msgs) {
                    if (o instanceof Bundle) {
                        appendCs(parts, ((Bundle) o).getCharSequence("text"));
                    }
                }
            } else if (msgs instanceof android.os.Parcelable[]) {
                for (android.os.Parcelable p : (android.os.Parcelable[]) msgs) {
                    if (p instanceof Bundle) {
                        appendCs(parts, ((Bundle) p).getCharSequence("text"));
                    }
                }
            }
        } catch (Exception ignored) {
            /* older OEMs */
        }

        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(p);
        }
        return sb.toString().trim();
    }

    private static void appendCs(List<String> parts, CharSequence cs) {
        if (cs == null) return;
        String s = cs.toString().trim();
        if (!s.isEmpty()) parts.add(s);
    }

    private static boolean isUpiPackage(String pkg) {
        String p = pkg.toLowerCase(Locale.US);
        return p.equals("com.phonepe.app")
            || p.startsWith("com.phonepe.")
            || p.contains("phonepe")
            || p.contains("com.google.android.apps.nbu.paisa")
            || p.equals("com.google.android.apps.nbu.paisa.user")
            || p.contains("paytm")
            || p.contains("bhim")
            || p.contains("upi");
    }

    private static boolean looksLikeCredit(String text) {
        String t = text.toLowerCase(Locale.US);

        boolean debitOnly =
            (t.contains("debited") || t.contains("sent to") || t.contains("paid to") || t.contains("you paid"))
                && !(t.contains("received")
                    || t.contains("credited")
                    || t.contains("paid you")
                    || t.contains("has paid"));
        if (debitOnly) return false;

        return t.contains("received")
            || t.contains("credited")
            || t.contains("credit of")
            || t.contains("payment received")
            || t.contains("money received")
            || t.contains("paid you")
            || t.contains("has paid")
            || t.contains("you got")
            || t.contains("money added")
            || t.contains("successful")
            || (t.contains("₹") || t.contains("rs") || t.contains("inr"));
    }

    static Double extractAmount(String text) {
        Matcher m = AMOUNT_PATTERN.matcher(text);
        Double best = null;
        while (m.find()) {
            try {
                String raw = m.group(1).replace(",", "");
                double v = Double.parseDouble(raw);
                if (v <= 0) continue;
                // Prefer amounts that look like rupees (skip tiny ids like "2" from "v2")
                if (v < 1 && !raw.contains(".")) continue;
                if (best == null || v > best) best = v;
            } catch (Exception ignored) {
                /* next */
            }
        }
        if (best == null) return null;
        return Math.round(best * 100.0) / 100.0;
    }

    static String extractPayer(String text) {
        Matcher m = FROM_PATTERN.matcher(text);
        if (!m.find()) return "";
        return m.group(1).trim();
    }

    private void settleCredit(double amount, String payerName, String rawText) {
        SharedPreferences p = prefs(this);
        String base = p.getString(KEY_SUPABASE_URL, "");
        String anon = p.getString(KEY_ANON_KEY, "");
        String token = p.getString(KEY_ACCESS_TOKEN, "");
        if (TextUtils.isEmpty(base) || TextUtils.isEmpty(anon) || TextUtils.isEmpty(token)) {
            Log.w(TAG, "Missing session — open Admin app once after login");
            notifyResult(
                "Payment ₹" + formatAmount(amount) + " seen",
                "Open HRO Admin (logged in) once so auto-settle can run",
                false
            );
            return;
        }

        HttpURLConnection conn = null;
        try {
            URL url = new URL(base + "/rest/v1/rpc/try_settle_upi_pay_link_by_credit");
            conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestMethod("POST");
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("apikey", anon);
            conn.setRequestProperty("Authorization", "Bearer " + token);

            JSONObject body = new JSONObject();
            body.put("p_amount", amount);
            body.put("p_payer_name", payerName == null ? "" : payerName);
            body.put("p_raw_text", rawText == null ? "" : rawText);

            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(bytes);
            }

            int code = conn.getResponseCode();
            InputStream stream =
                (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
            String resp = readFully(stream);
            Log.i(TAG, "settle HTTP " + code + " " + resp);

            if (code < 200 || code >= 300) {
                notifyResult(
                    "UPI ₹" + formatAmount(amount),
                    "Auto-settle failed (" + code + ") — mark collected in CRM",
                    false
                );
                return;
            }

            JSONObject json = parseRpcJson(resp);
            boolean matched = json.optBoolean("matched", false);
            boolean settled = json.optBoolean("settled", false);
            String reason = json.optString("reason", "");
            lastSettleAmount = amount;
            lastSettleAtMs = System.currentTimeMillis();

            if (matched && settled) {
                notifyResult(
                    "Payment received ₹" + formatAmount(amount),
                    "Pending payment marked collected",
                    true
                );
            } else if ("ambiguous".equals(reason)) {
                notifyResult(
                    "UPI ₹" + formatAmount(amount),
                    "Multiple open links — confirm in Pending payments",
                    false
                );
            } else {
                notifyResult(
                    "UPI ₹" + formatAmount(amount) + " received",
                    "No open pending pay link matched — mark collected in CRM if needed",
                    false
                );
                Log.i(TAG, "No pending link match for amount " + amount + " reason=" + reason);
            }
        } catch (Exception e) {
            Log.e(TAG, "settle failed", e);
            notifyResult(
                "UPI ₹" + formatAmount(amount),
                "Auto-settle error — mark collected in CRM",
                false
            );
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static JSONObject parseRpcJson(String resp) throws Exception {
        String trimmed = resp == null ? "" : resp.trim();
        if (trimmed.startsWith("[")) {
            JSONArray arr = new JSONArray(trimmed);
            if (arr.length() > 0 && arr.get(0) instanceof JSONObject) {
                return arr.getJSONObject(0);
            }
            return new JSONObject();
        }
        if (trimmed.startsWith("{")) return new JSONObject(trimmed);
        return new JSONObject();
    }

    private static String readFully(InputStream stream) throws Exception {
        if (stream == null) return "";
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = stream.read(buf)) != -1) {
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String formatAmount(double amount) {
        if (Math.abs(amount - Math.rint(amount)) < 0.001) {
            return String.valueOf((long) Math.rint(amount));
        }
        return String.format(Locale.US, "%.2f", amount);
    }

    private void notifyResult(String title, String body, boolean success) {
        try {
            NotificationChannels.ensureAll(this);
            NotificationCompat.Builder b =
                new NotificationCompat.Builder(this, NotificationChannels.JOB_ALERTS)
                    .setSmallIcon(R.drawable.ic_stat_notify)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH);
            if (success) {
                b.setColor(getResources().getColor(R.color.notification_accent, getTheme()));
            }
            NotificationManagerCompat.from(this)
                .notify((int) (System.currentTimeMillis() & 0xfffffff), b.build());
        } catch (Exception e) {
            Log.w(TAG, "notifyResult failed", e);
        }
    }
}

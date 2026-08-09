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
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONObject;

/**
 * Reads PhonePe / Google Pay credit notifications and tries to auto-settle
 * an open pending-payment UPI short link (amount match, 30‑min window).
 */
public class UpiCreditListenerService extends NotificationListenerService {
    private static final String TAG = "UpiCreditListener";
    static final String PREFS = "hro_upi_credit_prefs";
    static final String KEY_ENABLED = "enabled";
    static final String KEY_SUPABASE_URL = "supabase_url";
    static final String KEY_ANON_KEY = "anon_key";
    static final String KEY_ACCESS_TOKEN = "access_token";

    private static final Pattern AMOUNT_PATTERN =
        Pattern.compile(
            "(?:₹|rs\\.?|inr)\\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\\.[0-9]{1,2})?|[0-9]+(?:\\.[0-9]{1,2})?)",
            Pattern.CASE_INSENSITIVE
        );
    private static final Pattern FROM_PATTERN =
        Pattern.compile(
            "(?:from|by)\\s+([A-Za-z0-9 .'_-]{2,60})",
            Pattern.CASE_INSENSITIVE
        );

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

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
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null || !isEnabled(this)) return;
        String pkg = sbn.getPackageName() == null ? "" : sbn.getPackageName();
        if (!isUpiPackage(pkg)) return;

        Notification notification = sbn.getNotification();
        if (notification == null) return;
        Bundle extras = notification.extras;
        if (extras == null) return;

        CharSequence titleCs = extras.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence textCs = extras.getCharSequence(Notification.EXTRA_TEXT);
        CharSequence bigCs = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
        String title = titleCs == null ? "" : titleCs.toString();
        String text = textCs == null ? "" : textCs.toString();
        String big = bigCs == null ? "" : bigCs.toString();
        String combined = (title + "\n" + text + "\n" + big).trim();
        if (combined.isEmpty()) return;
        if (!looksLikeCredit(combined)) return;

        Double amount = extractAmount(combined);
        if (amount == null || amount <= 0) return;
        String payer = extractPayer(combined);

        final double amt = amount;
        final String payerName = payer == null ? "" : payer;
        final String raw = combined.length() > 500 ? combined.substring(0, 500) : combined;
        executor.execute(() -> settleCredit(amt, payerName, raw));
    }

    private static boolean isUpiPackage(String pkg) {
        String p = pkg.toLowerCase(Locale.US);
        return p.contains("phonepe")
            || p.contains("com.google.android.apps.nbu.paisa")
            || p.equals("com.google.android.apps.nbu.paisa.user")
            || p.contains("paytm")
            || p.contains("bhim");
    }

    private static boolean looksLikeCredit(String text) {
        String t = text.toLowerCase(Locale.US);
        if (t.contains("debited") || t.contains("sent to") || t.contains("paid to")) {
            // Still allow if clearly received
            if (!(t.contains("received") || t.contains("credited") || t.contains("credit of"))) {
                return false;
            }
        }
        return t.contains("received")
            || t.contains("credited")
            || t.contains("credit of")
            || t.contains("payment received")
            || t.contains("money received")
            || (t.contains("₹") && (t.contains("from") || t.contains("received")));
    }

    static Double extractAmount(String text) {
        Matcher m = AMOUNT_PATTERN.matcher(text);
        if (!m.find()) return null;
        try {
            String raw = m.group(1).replace(",", "");
            double v = Double.parseDouble(raw);
            return Math.round(v * 100.0) / 100.0;
        } catch (Exception e) {
            return null;
        }
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
            notifyResult("UPI credit seen", "Open Admin app (logged in) to enable auto-settle", false);
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
            conn.setRequestProperty("apikey", anon);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Prefer", "return=representation");

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
                    "Auto-settle failed — mark collected in CRM",
                    false
                );
                return;
            }

            JSONObject json = new JSONObject(resp);
            boolean matched = json.optBoolean("matched", false);
            boolean settled = json.optBoolean("settled", false);
            String reason = json.optString("reason", "");
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
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
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

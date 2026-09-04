package com.hydrogenro.admin;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Robust clipboard read for Fetch Address / Add Customer autofill.
 * Stock @capacitor/clipboard often returns empty for Google Maps shares
 * (HTML / URI clips). Coerce every item on the main thread.
 * Also returns ClipDescription timestamp (API 26+) so JS can enforce a
 * short freshness window (e.g. 15s) when Add Customer opens or resumes.
 */
@CapacitorPlugin(name = "AdminClipboard")
public class AdminClipboardPlugin extends Plugin {

    @PluginMethod
    public void readText(PluginCall call) {
        final Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> {
            try {
                ClipboardManager cm =
                    (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm == null || !cm.hasPrimaryClip()) {
                    resolveEmpty(call);
                    return;
                }

                ClipData clip = cm.getPrimaryClip();
                if (clip == null || clip.getItemCount() == 0) {
                    resolveEmpty(call);
                    return;
                }

                StringBuilder out = new StringBuilder();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    ClipData.Item item = clip.getItemAt(i);
                    if (item == null) continue;

                    CharSequence coerced = item.coerceToText(getContext());
                    if (coerced != null) {
                        String s = coerced.toString().trim();
                        if (!s.isEmpty()) appendLine(out, s);
                    }

                    CharSequence raw = item.getText();
                    if (raw != null) {
                        String s = raw.toString().trim();
                        if (!s.isEmpty() && out.indexOf(s) < 0) appendLine(out, s);
                    }

                    Uri uri = item.getUri();
                    if (uri != null) {
                        String s = uri.toString().trim();
                        if (!s.isEmpty() && out.indexOf(s) < 0) appendLine(out, s);
                    }
                }

                long copiedAt = 0L;
                if (android.os.Build.VERSION.SDK_INT >= 26) {
                    android.content.ClipDescription desc = clip.getDescription();
                    if (desc != null) {
                        copiedAt = desc.getTimestamp();
                    }
                }

                JSObject result = new JSObject();
                result.put("value", out.toString());
                result.put("timestampMs", copiedAt);
                call.resolve(result);
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "clipboard_read_failed");
            }
        });
    }

    private static void appendLine(StringBuilder out, String line) {
        if (out.length() > 0) out.append('\n');
        out.append(line);
    }

    private static void resolveEmpty(PluginCall call) {
        JSObject result = new JSObject();
        result.put("value", "");
        result.put("timestampMs", 0L);
        call.resolve(result);
    }
}

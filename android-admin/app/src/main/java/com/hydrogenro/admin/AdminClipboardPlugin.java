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
 * Robust clipboard read for Fetch Address. The stock @capacitor/clipboard
 * plugin often returns empty for Google Maps shares (HTML / URI clips, or
 * plain-text mime with a null getText()). Always coerce every item on the
 * main thread and concatenate — Maps shares are usually "Place\nhttps://…".
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

                JSObject result = new JSObject();
                result.put("value", out.toString());
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
        call.resolve(result);
    }
}

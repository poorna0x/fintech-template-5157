package com.hydrogenro.technician;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Truecaller-style draw-over-apps card for job assign / reassign.
 * Requires SYSTEM_ALERT_WINDOW. If not granted, callers should fall back to tray.
 */
public final class JobAlertOverlay {

    private static final String TAG = "HroJobOverlay";
    private static final long AUTO_DISMISS_MS = 45_000L;
    public static final String EXTRA_JOB_ID = "hro_job_id";

    private static View currentView;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final Runnable autoDismiss = JobAlertOverlay::dismiss;

    private JobAlertOverlay() {}

    public static boolean canDraw(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(context);
    }

    public static void show(Context context, String title, String body, String jobId, String colorHex) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        if (!canDraw(app)) {
            Log.i(TAG, "Overlay permission missing — skip card");
            return;
        }
        mainHandler.post(() -> showOnMain(app, title, body, jobId, colorHex));
    }

    public static void dismiss() {
        mainHandler.post(() -> {
            mainHandler.removeCallbacks(autoDismiss);
            if (currentView == null) return;
            try {
                WindowManager wm =
                    (WindowManager) currentView.getContext().getSystemService(Context.WINDOW_SERVICE);
                if (wm != null) wm.removeView(currentView);
            } catch (Throwable t) {
                Log.w(TAG, "Dismiss overlay failed", t);
            }
            currentView = null;
        });
    }

    private static void showOnMain(
        Context context, String title, String body, String jobId, String colorHex
    ) {
        dismissImmediate(context);

        int headerColor = Color.parseColor("#16A34A");
        if (colorHex != null && colorHex.matches("#[0-9a-fA-F]{6}")) {
            try {
                headerColor = Color.parseColor(colorHex);
            } catch (IllegalArgumentException ignored) {
                /* keep green */
            }
        }

        float density = context.getResources().getDisplayMetrics().density;
        int pad = dp(density, 16);
        int gap = dp(density, 10);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setElevation(dp(density, 12));
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(Color.WHITE);
        cardBg.setCornerRadius(dp(density, 16));
        card.setBackground(cardBg);
        card.setClipToOutline(true);

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(pad, pad, pad, pad);
        GradientDrawable headerBg = new GradientDrawable();
        headerBg.setColor(headerColor);
        header.setBackground(headerBg);

        TextView titleView = new TextView(context);
        titleView.setText(safe(title, "New job assigned"));
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        titleView.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        header.addView(titleView);

        TextView subtitle = new TextView(context);
        subtitle.setText("HydrogenRO · Job alert");
        subtitle.setTextColor(Color.argb(220, 255, 255, 255));
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
        LinearLayout.LayoutParams subLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(density, 4);
        header.addView(subtitle, subLp);
        card.addView(
            header,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout bodyWrap = new LinearLayout(context);
        bodyWrap.setOrientation(LinearLayout.VERTICAL);
        bodyWrap.setPadding(pad, pad, pad, pad);

        TextView bodyView = new TextView(context);
        bodyView.setText(safe(body, "Open the app for details."));
        bodyView.setTextColor(Color.parseColor("#111827"));
        bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        bodyView.setLineSpacing(dp(density, 2), 1f);
        bodyWrap.addView(bodyView);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setGravity(Gravity.END);
        LinearLayout.LayoutParams actionsLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsLp.topMargin = dp(density, 16);

        TextView dismissBtn = makeButton(context, density, "Dismiss", false, headerColor);
        LinearLayout.LayoutParams dismissLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dismissLp.rightMargin = gap;
        actions.addView(dismissBtn, dismissLp);

        TextView openBtn = makeButton(context, density, "Open", true, headerColor);
        actions.addView(
            openBtn,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        bodyWrap.addView(actions, actionsLp);
        card.addView(
            bodyWrap,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        dismissBtn.setOnClickListener(v -> dismiss());
        openBtn.setOnClickListener(
            v -> {
                dismiss();
                openApp(context, jobId);
            });

        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        int width = Math.min(metrics.widthPixels - dp(density, 24), dp(density, 420));

        int type =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams lp =
            new WindowManager.LayoutParams(
                width,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;
        lp.x = 0;
        lp.y = 0;

        try {
            wm.addView(card, lp);
            currentView = card;
            mainHandler.removeCallbacks(autoDismiss);
            mainHandler.postDelayed(autoDismiss, AUTO_DISMISS_MS);
            Log.i(TAG, "Overlay shown");
        } catch (Throwable t) {
            Log.w(TAG, "Failed to add overlay", t);
            currentView = null;
        }
    }

    private static void dismissImmediate(Context context) {
        mainHandler.removeCallbacks(autoDismiss);
        if (currentView == null) return;
        try {
            WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) wm.removeView(currentView);
        } catch (Throwable ignored) {
            /* already gone */
        }
        currentView = null;
    }

    private static void openApp(Context context, String jobId) {
        try {
            Intent intent =
                new Intent(context, MainActivity.class)
                    .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (jobId != null && !jobId.isEmpty()) {
                intent.putExtra(EXTRA_JOB_ID, jobId);
            }
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "Open app failed", t);
        }
    }

    private static TextView makeButton(
        Context context, float density, String label, boolean filled, int accent
    ) {
        TextView btn = new TextView(context);
        btn.setText(label);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        btn.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(density, 18), dp(density, 10), dp(density, 18), dp(density, 10));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(density, 22));
        if (filled) {
            bg.setColor(accent);
            btn.setTextColor(Color.WHITE);
        } else {
            bg.setColor(Color.TRANSPARENT);
            bg.setStroke(dp(density, 1), Color.parseColor("#D1D5DB"));
            btn.setTextColor(Color.parseColor("#374151"));
        }
        btn.setBackground(bg);
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    private static int dp(float density, int value) {
        return Math.round(value * density);
    }

    private static String safe(String value, String fallback) {
        if (value == null) return fallback;
        String t = value.trim();
        return t.isEmpty() ? fallback : t;
    }
}

package com.hydrogenro.technician;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
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
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Truecaller-style draw-over-apps card for job assign / reassign / unassign / edit.
 * Requires SYSTEM_ALERT_WINDOW. If not granted, callers should fall back to tray.
 *
 * Color system (matches adminTechPushNotify):
 *   assigned   → green  #16A34A
 *   reassigned → blue   #2563EB
 *   unassigned → red    #DC2626
 *   removed    → red    #DC2626
 *   updated    → amber  #D97706
 */
public final class JobAlertOverlay {

    private static final String TAG = "HroJobOverlay";
    private static final long AUTO_DISMISS_MS = 45_000L;
    public static final String EXTRA_JOB_ID = "hro_job_id";

    // Shared neutrals
    private static final int INK = 0xFF0F172A;
    private static final int MUTED = 0xFF64748B;
    private static final int BODY = 0xFF334155;
    private static final int WHITE = 0xFFFFFFFF;

    // Event accents — keep in sync with TECH_PUSH_COLOR_* in adminTechPushNotify.ts
    private static final int GREEN = 0xFF16A34A;
    private static final int BLUE = 0xFF2563EB;
    private static final int RED = 0xFFDC2626;
    private static final int AMBER = 0xFFD97706;

    private static View currentView;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final Runnable autoDismiss = JobAlertOverlay::dismiss;

    /** Per-event palette: accent + soft wash surfaces. */
    private static final class Theme {
        final String event;
        final int accent;
        final int wash; // very light tint for card wash / body panel
        final int border;
        final int pillBg;
        final String pill;
        final String mono;
        final String defaultTitle;
        final boolean deepLinkJob;

        Theme(
            String event,
            int accent,
            String pill,
            String mono,
            String defaultTitle,
            boolean deepLinkJob
        ) {
            this.event = event;
            this.accent = accent;
            this.wash = mix(accent, WHITE, 0.92f);
            this.border = mix(accent, WHITE, 0.72f);
            this.pillBg = mix(accent, WHITE, 0.82f);
            this.pill = pill;
            this.mono = mono;
            this.defaultTitle = defaultTitle;
            this.deepLinkJob = deepLinkJob;
        }
    }

    private JobAlertOverlay() {}

    public static boolean canDraw(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(context);
    }

    public static void show(
        Context context, String title, String body, String jobId, String colorHex
    ) {
        show(context, title, body, jobId, colorHex, null);
    }

    public static void show(
        Context context,
        String title,
        String body,
        String jobId,
        String colorHex,
        String event
    ) {
        if (context == null) return;
        Context app = context.getApplicationContext();
        if (!canDraw(app)) {
            Log.i(TAG, "Overlay permission missing — skip card");
            return;
        }
        mainHandler.post(() -> showOnMain(app, title, body, jobId, colorHex, event));
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
        Context context,
        String title,
        String body,
        String jobId,
        String colorHex,
        String eventRaw
    ) {
        dismissImmediate(context);

        Theme theme = themeFor(normalizeEvent(eventRaw, title), colorHex);
        String safeTitle = safe(title, theme.defaultTitle);
        String safeBody = safe(body, "Open the app for details.");

        float density = context.getResources().getDisplayMetrics().density;
        int pad = dp(density, 20);
        int gap = dp(density, 10);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setElevation(dp(density, 18));
        card.setClipToOutline(true);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(WHITE);
        cardBg.setCornerRadius(dp(density, 22));
        cardBg.setStroke(dp(density, 1), theme.border);
        card.setBackground(cardBg);

        // Full-width accent header (Truecaller-like, color-coded)
        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(pad, dp(density, 16), pad, dp(density, 16));
        GradientDrawable headerBg =
            new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[] { theme.accent, darken(theme.accent, 0.12f) });
        header.setBackground(headerBg);

        LinearLayout brandRow = new LinearLayout(context);
        brandRow.setOrientation(LinearLayout.HORIZONTAL);
        brandRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView mono = new TextView(context);
        mono.setText(theme.mono);
        mono.setGravity(Gravity.CENTER);
        mono.setTextColor(theme.accent);
        mono.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        mono.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        GradientDrawable monoBg = new GradientDrawable();
        monoBg.setShape(GradientDrawable.OVAL);
        monoBg.setColor(WHITE);
        mono.setBackground(monoBg);
        int monoSize = dp(density, 36);
        brandRow.addView(mono, new LinearLayout.LayoutParams(monoSize, monoSize));

        LinearLayout brandCol = new LinearLayout(context);
        brandCol.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams brandColLp =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        brandColLp.leftMargin = dp(density, 12);

        TextView brand = new TextView(context);
        brand.setText("HydrogenRO");
        brand.setTextColor(WHITE);
        brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        brand.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        brand.setLetterSpacing(0.02f);
        brandCol.addView(brand);

        TextView brandSub = new TextView(context);
        brandSub.setText("Technician alert");
        brandSub.setTextColor(Color.argb(220, 255, 255, 255));
        brandSub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        LinearLayout.LayoutParams brandSubLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        brandSubLp.topMargin = dp(density, 1);
        brandCol.addView(brandSub, brandSubLp);
        brandRow.addView(brandCol, brandColLp);

        TextView pill = new TextView(context);
        pill.setText(theme.pill);
        pill.setTextColor(theme.accent);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        pill.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        pill.setLetterSpacing(0.06f);
        pill.setPadding(dp(density, 10), dp(density, 5), dp(density, 10), dp(density, 5));
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(dp(density, 20));
        pillBg.setColor(WHITE);
        pill.setBackground(pillBg);
        brandRow.addView(
            pill,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        header.addView(
            brandRow,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        card.addView(
            header,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        // Body on soft wash matching the accent
        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(pad, pad, pad, pad);
        GradientDrawable contentBg = new GradientDrawable();
        contentBg.setColor(theme.wash);
        content.setBackground(contentBg);

        TextView titleView = new TextView(context);
        titleView.setText(safeTitle);
        titleView.setTextColor(INK);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        titleView.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        titleView.setLineSpacing(dp(density, 2), 1f);
        content.addView(
            titleView,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout bodyPanel = new LinearLayout(context);
        bodyPanel.setOrientation(LinearLayout.VERTICAL);
        bodyPanel.setPadding(dp(density, 14), dp(density, 12), dp(density, 14), dp(density, 12));
        GradientDrawable bodyBg = new GradientDrawable();
        bodyBg.setColor(WHITE);
        bodyBg.setCornerRadius(dp(density, 14));
        bodyBg.setStroke(dp(density, 1), theme.border);
        bodyPanel.setBackground(bodyBg);
        LinearLayout.LayoutParams bodyPanelLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bodyPanelLp.topMargin = dp(density, 12);

        TextView bodyView = new TextView(context);
        bodyView.setText(safeBody);
        bodyView.setTextColor(BODY);
        bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        bodyView.setLineSpacing(dp(density, 3), 1f);
        bodyPanel.addView(bodyView);
        content.addView(bodyPanel, bodyPanelLp);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setWeightSum(2f);
        LinearLayout.LayoutParams actionsLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsLp.topMargin = dp(density, 16);

        TextView dismissBtn = makeButton(context, density, "Dismiss", false, theme);
        LinearLayout.LayoutParams dismissLp =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        dismissLp.rightMargin = gap;
        actions.addView(dismissBtn, dismissLp);

        TextView openBtn =
            makeButton(
                context,
                density,
                theme.deepLinkJob ? "Open job" : "Open app",
                true,
                theme);
        actions.addView(
            openBtn,
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        content.addView(actions, actionsLp);

        card.addView(
            content,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        dismissBtn.setOnClickListener(v -> dismiss());
        openBtn.setOnClickListener(
            v -> {
                dismiss();
                openApp(context, theme.deepLinkJob ? jobId : null);
            });

        FrameLayout root = new FrameLayout(context);
        root.setPadding(dp(density, 12), dp(density, 12), dp(density, 12), dp(density, 12));
        FrameLayout.LayoutParams cardLp =
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        cardLp.gravity = Gravity.CENTER;
        root.addView(card, cardLp);

        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        int width = Math.min(metrics.widthPixels - dp(density, 20), dp(density, 400));

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

        try {
            card.setAlpha(0f);
            card.setScaleX(0.94f);
            card.setScaleY(0.94f);
            wm.addView(root, lp);
            currentView = root;
            AnimatorSet enter = new AnimatorSet();
            enter.playTogether(
                ObjectAnimator.ofFloat(card, View.ALPHA, 0f, 1f),
                ObjectAnimator.ofFloat(card, View.SCALE_X, 0.94f, 1f),
                ObjectAnimator.ofFloat(card, View.SCALE_Y, 0.94f, 1f));
            enter.setDuration(220);
            enter.setInterpolator(new DecelerateInterpolator());
            enter.start();
            mainHandler.removeCallbacks(autoDismiss);
            mainHandler.postDelayed(autoDismiss, AUTO_DISMISS_MS);
            Log.i(TAG, "Overlay shown event=" + theme.event);
        } catch (Throwable t) {
            Log.w(TAG, "Failed to add overlay", t);
            currentView = null;
        }
    }

    private static Theme themeFor(String event, String colorHex) {
        Theme base;
        switch (event) {
            case "reassigned":
                base =
                    new Theme(
                        "reassigned",
                        BLUE,
                        "REASSIGNED",
                        "R",
                        "Job reassigned to you",
                        true);
                break;
            case "unassigned":
                base =
                    new Theme(
                        "unassigned",
                        RED,
                        "UNASSIGNED",
                        "!",
                        "Job unassigned from you",
                        false);
                break;
            case "removed":
                base =
                    new Theme(
                        "removed",
                        RED,
                        "REMOVED",
                        "!",
                        "Job moved to another technician",
                        false);
                break;
            case "updated":
                base =
                    new Theme(
                        "updated",
                        AMBER,
                        "UPDATED",
                        "U",
                        "Job updated",
                        true);
                break;
            default:
                base =
                    new Theme(
                        "assigned",
                        GREEN,
                        "NEW JOB",
                        "H",
                        "New job assigned",
                        true);
                break;
        }
        // Prefer server color when it matches the event family; otherwise keep theme accent.
        if (colorHex != null && colorHex.matches("#[0-9a-fA-F]{6}")) {
            try {
                int parsed = Color.parseColor(colorHex);
                if (sameFamily(parsed, base.accent)) {
                    return new Theme(
                        base.event,
                        parsed,
                        base.pill,
                        base.mono,
                        base.defaultTitle,
                        base.deepLinkJob);
                }
            } catch (IllegalArgumentException ignored) {
                /* keep base */
            }
        }
        return base;
    }

    private static boolean sameFamily(int a, int b) {
        float[] ha = new float[3];
        float[] hb = new float[3];
        Color.colorToHSV(a, ha);
        Color.colorToHSV(b, hb);
        float diff = Math.abs(ha[0] - hb[0]);
        if (diff > 180f) diff = 360f - diff;
        return diff <= 40f;
    }

    private static String normalizeEvent(String eventRaw, String title) {
        if (eventRaw != null) {
            String e = eventRaw.trim().toLowerCase();
            if (e.equals("assigned")
                || e.equals("reassigned")
                || e.equals("unassigned")
                || e.equals("removed")
                || e.equals("updated")) {
                return e;
            }
        }
        String t = title == null ? "" : title.toLowerCase();
        if (t.contains("reassign")) return "reassigned";
        if (t.contains("unassign")) return "unassigned";
        if (t.contains("moved to another")) return "removed";
        if (t.contains("updated")
            || t.contains("reschedul")
            || t.contains("description")
            || t.contains("agreed cost")
            || t.contains("service type")
            || t.contains("date updated")
            || t.contains("time updated")) {
            return "updated";
        }
        return "assigned";
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
                    .setFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK
                            | Intent.FLAG_ACTIVITY_SINGLE_TOP
                            | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            if (jobId != null && !jobId.isEmpty()) {
                intent.putExtra(EXTRA_JOB_ID, jobId);
            }
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "Open app failed", t);
        }
    }

    private static TextView makeButton(
        Context context, float density, String label, boolean filled, Theme theme
    ) {
        TextView btn = new TextView(context);
        btn.setText(label);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        btn.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(density, 12), dp(density, 14), dp(density, 12), dp(density, 14));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(density, 14));
        if (filled) {
            bg.setColor(theme.accent);
            btn.setTextColor(WHITE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                btn.setElevation(dp(density, 2));
            }
        } else {
            bg.setColor(WHITE);
            bg.setStroke(dp(density, 1), theme.border);
            btn.setTextColor(BODY);
        }
        btn.setBackground(bg);
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    /** Mix accent toward white (amount 0 = accent, 1 = white). */
    private static int mix(int color, int toward, float amount) {
        amount = Math.max(0f, Math.min(1f, amount));
        int r = Math.round(Color.red(color) + (Color.red(toward) - Color.red(color)) * amount);
        int g = Math.round(Color.green(color) + (Color.green(toward) - Color.green(color)) * amount);
        int b = Math.round(Color.blue(color) + (Color.blue(toward) - Color.blue(color)) * amount);
        return Color.rgb(clamp(r), clamp(g), clamp(b));
    }

    private static int darken(int color, float amount) {
        amount = Math.max(0f, Math.min(1f, amount));
        int r = Math.round(Color.red(color) * (1f - amount));
        int g = Math.round(Color.green(color) * (1f - amount));
        int b = Math.round(Color.blue(color) * (1f - amount));
        return Color.rgb(clamp(r), clamp(g), clamp(b));
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
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

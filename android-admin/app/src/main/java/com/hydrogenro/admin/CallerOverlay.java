package com.hydrogenro.admin;

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
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Same draw-over-apps card as the technician job-assign alert.
 * Shown only when the ringing number is already in the local customer list.
 */
public final class CallerOverlay {

    private static final String TAG = "HroCallerOverlay";
    private static final long AUTO_DISMISS_MS = 60_000L;

    private static final int INK = 0xFF0F172A;
    private static final int BODY = 0xFF334155;
    private static final int WHITE = 0xFFFFFFFF;
    private static final int GREEN = 0xFF16A34A;

    private static View currentView;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final Runnable autoDismiss = CallerOverlay::dismiss;

    private CallerOverlay() {}

    public static boolean canDraw(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(context);
    }

    public static void show(Context context, String name, String rawNumber) {
        if (context == null) return;
        String phone = CallerDirectoryDb.phoneKey(rawNumber);
        if (phone.isEmpty()) return;
        Context app = context.getApplicationContext();
        if (!canDraw(app)) return;
        String safeName = name == null || name.trim().isEmpty() ? "Customer" : name.trim();
        mainHandler.post(() -> showOnMain(app, safeName, phone));
    }

    public static void dismiss() {
        mainHandler.post(CallerOverlay::dismissOnMain);
    }

    private static void dismissOnMain() {
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
    }

    private static void showOnMain(Context context, String name, String phone) {
        dismissOnMain();

        float density = context.getResources().getDisplayMetrics().density;
        int pad = dp(density, 20);
        int gap = dp(density, 10);
        int accent = GREEN;
        int wash = mix(accent, WHITE, 0.92f);
        int border = mix(accent, WHITE, 0.72f);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setElevation(dp(density, 18));
        card.setClipToOutline(true);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(WHITE);
        cardBg.setCornerRadius(dp(density, 22));
        cardBg.setStroke(dp(density, 1), border);
        card.setBackground(cardBg);

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(pad, dp(density, 16), pad, dp(density, 16));
        GradientDrawable headerBg =
            new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[] { accent, darken(accent, 0.12f) });
        header.setBackground(headerBg);

        LinearLayout brandRow = new LinearLayout(context);
        brandRow.setOrientation(LinearLayout.HORIZONTAL);
        brandRow.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout logoWrap = new FrameLayout(context);
        GradientDrawable logoBg = new GradientDrawable();
        logoBg.setColor(0xFF111111);
        logoBg.setCornerRadius(dp(density, 11));
        logoWrap.setBackground(logoBg);
        ImageView logo = new ImageView(context);
        logo.setImageResource(R.drawable.ic_droplets);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setContentDescription("HydrogenRO");
        int logoInner = dp(density, 22);
        FrameLayout.LayoutParams logoInnerLp = new FrameLayout.LayoutParams(logoInner, logoInner);
        logoInnerLp.gravity = Gravity.CENTER;
        logoWrap.addView(logo, logoInnerLp);
        brandRow.addView(
            logoWrap, new LinearLayout.LayoutParams(dp(density, 40), dp(density, 40)));

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
        brandCol.addView(brand);

        TextView brandSub = new TextView(context);
        brandSub.setText("Incoming call");
        brandSub.setTextColor(Color.argb(220, 255, 255, 255));
        brandSub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
        LinearLayout.LayoutParams brandSubLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        brandSubLp.topMargin = dp(density, 1);
        brandCol.addView(brandSub, brandSubLp);
        brandRow.addView(brandCol, brandColLp);

        TextView pill = new TextView(context);
        pill.setText("CALL");
        pill.setTextColor(accent);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        pill.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        pill.setLetterSpacing(0.06f);
        pill.setPadding(dp(density, 10), dp(density, 5), dp(density, 10), dp(density, 5));
        GradientDrawable pillBg = new GradientDrawable();
        pillBg.setCornerRadius(dp(density, 20));
        pillBg.setColor(WHITE);
        pill.setBackground(pillBg);
        brandRow.addView(pill);
        header.addView(brandRow);
        card.addView(header);

        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(pad, pad, pad, pad);
        GradientDrawable contentBg = new GradientDrawable();
        contentBg.setColor(wash);
        content.setBackground(contentBg);

        TextView titleView = new TextView(context);
        titleView.setText(name);
        titleView.setTextColor(INK);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        titleView.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        content.addView(titleView);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams actionsLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsLp.topMargin = dp(density, 16);

        TextView dismissBtn = makeButton(context, density, "Dismiss", false, accent, border);
        LinearLayout.LayoutParams dismissLp =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        dismissLp.rightMargin = gap;
        actions.addView(dismissBtn, dismissLp);

        TextView openBtn = makeButton(context, density, "Open", true, accent, border);
        actions.addView(
            openBtn, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        content.addView(actions, actionsLp);
        card.addView(content);

        dismissBtn.setOnClickListener(v -> dismiss());
        openBtn.setOnClickListener(
            v -> {
                dismiss();
                openSearch(context, phone);
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
                    | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
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
            mainHandler.postDelayed(autoDismiss, AUTO_DISMISS_MS);
            Log.i(TAG, "Caller card shown");
        } catch (Throwable t) {
            Log.w(TAG, "Failed to add overlay", t);
            currentView = null;
            CallerBanner.showTray(context, new CallerDirectoryDb.Match("", name), phone);
        }
    }

    private static void openSearch(Context context, String phone) {
        try {
            Intent open = new Intent(context, MainActivity.class);
            open.setAction("com.hydrogenro.admin.CALLER_SEARCH");
            open.setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
            );
            open.putExtra("type", "caller_search");
            open.putExtra("phone", phone);
            context.startActivity(open);
        } catch (Throwable t) {
            Log.w(TAG, "Open search failed", t);
        }
    }

    private static TextView makeButton(
        Context context, float density, String label, boolean filled, int accent, int border
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
            bg.setColor(accent);
            btn.setTextColor(WHITE);
        } else {
            bg.setColor(WHITE);
            bg.setStroke(dp(density, 1), border);
            btn.setTextColor(BODY);
        }
        btn.setBackground(bg);
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    private static int mix(int color, int toward, float amount) {
        amount = Math.max(0f, Math.min(1f, amount));
        int r = Math.round(Color.red(color) + (Color.red(toward) - Color.red(color)) * amount);
        int g = Math.round(Color.green(color) + (Color.green(toward) - Color.green(color)) * amount);
        int b = Math.round(Color.blue(color) + (Color.blue(toward) - Color.blue(color)) * amount);
        return Color.rgb(clamp(r), clamp(g), clamp(b));
    }

    private static int darken(int color, float amount) {
        amount = Math.max(0f, Math.min(1f, amount));
        return Color.rgb(
            clamp(Math.round(Color.red(color) * (1f - amount))),
            clamp(Math.round(Color.green(color) * (1f - amount))),
            clamp(Math.round(Color.blue(color) * (1f - amount)))
        );
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private static int dp(float density, int value) {
        return Math.round(value * density);
    }
}

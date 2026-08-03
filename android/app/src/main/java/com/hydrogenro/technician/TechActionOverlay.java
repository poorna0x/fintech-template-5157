package com.hydrogenro.technician;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.InputFilter;
import android.text.InputType;
import android.util.DisplayMetrics;
import android.util.Log;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.core.app.NotificationManagerCompat;
import java.util.Map;

/**
 * Interactive draw-over-apps card for office nudges / OTP — same actions as the
 * tray notification (Reply, Enter OTP, Call, Yes/No, Start). Tray is always
 * posted separately; this is optional when FCM includes showOverlay=1.
 */
public final class TechActionOverlay {

    private static final String TAG = "HroTechActionOverlay";
    private static final long AUTO_DISMISS_MS = 90_000L;
    private static final long OTP_AUTO_DISMISS_MS = 180_000L;
    private static final long WRONG_LINE_AUTO_DISMISS_MS = 180_000L;

    private static final int WHITE = 0xFFFFFFFF;
    private static final int INK = 0xFF0F172A;
    private static final int BODY = 0xFF334155;
    private static final int MUTED = 0xFF64748B;
    private static final int VIOLET = 0xFF7C3AED;
    private static final int AMBER = 0xFFD97706;
    private static final int BLUE = 0xFF2563EB;
    private static final int GREEN = 0xFF16A34A;
    private static final int WRONG_LINE_RED = 0xFFB45309;

    public enum Mode {
        REPLY,
        OTP,
        CALL,
        GOING,
        START,
        INFO,
        /** Full-screen warning when tech dialed a customer from a non-company SIM. */
        WRONG_LINE
    }

    private static View currentView;
    private static String currentTrayTag;
    private static int currentTrayId;
    private static boolean currentTrayTagged;
    private static Context currentAppContext;
    private static String currentAckToken;
    private static String currentAckUrl;
    private static String currentAckSource;
    private static String currentAckTitle;
    private static String currentAckBody;
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());
    /** Auto-timeout: close locally only — do not notify admins. */
    private static final Runnable autoDismiss = () -> dismiss(true, false);

    private TechActionOverlay() {}

    public static boolean canDraw(Context context) {
        if (context == null) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true;
        return Settings.canDrawOverlays(context);
    }

    public static boolean wantsOverlay(Map<String, String> data) {
        if (data == null) return false;
        String v = data.get("showOverlay");
        return "1".equals(v) || "true".equalsIgnoreCase(v);
    }

    public static void maybeShowFromPush(Context context, Mode mode, Map<String, String> data) {
        if (context == null || data == null || !wantsOverlay(data)) return;
        if (!canDraw(context)) {
            Log.i(TAG, "Overlay permission missing — tray only");
            return;
        }
        String title = first(data.get("msgTitle"), data.get("title"), defaultTitle(mode));
        String body = first(data.get("msgBody"), data.get("body"), "");
        String color = data.get("color");
        mainHandler.post(
            () ->
                showOnMain(
                    context.getApplicationContext(),
                    mode,
                    title,
                    body,
                    color,
                    data.get("replyToken"),
                    data.get("replyUrl"),
                    data.get("tag"),
                    data.get("callPhone"),
                    data.get("startToken"),
                    data.get("startUrl"),
                    data.get("requestId"),
                    data.get("nonce"),
                    data.get("submitUrl"),
                    data.get("jobId"),
                    data.get("ackToken"),
                    data.get("ackUrl"),
                    data.get("source")));
    }

    /** Immediate full-screen wrong-line warning (detecting handset — no FCM wait). */
    public static void showWrongLineWarning(
        Context context, String title, String body, String tag
    ) {
        if (context == null) return;
        if (!canDraw(context)) {
            Log.i(TAG, "Overlay permission missing — wrong-line warning skipped");
            return;
        }
        final Context app = context.getApplicationContext();
        final String t =
            title != null && !title.trim().isEmpty()
                ? title.trim()
                : defaultTitle(Mode.WRONG_LINE);
        final String b = body != null ? body.trim() : "";
        final String trayTag =
            tag != null && !tag.isEmpty() ? tag : "wrong_line_self";
        mainHandler.post(
            () ->
                showOnMain(
                    app,
                    Mode.WRONG_LINE,
                    t,
                    b,
                    "#B45309",
                    null,
                    null,
                    trayTag,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null));
    }

    /** User Dismiss — notify admins (silent) and clear tray. */
    public static void dismiss() {
        dismiss(true, true);
    }

    /**
     * @param cancelTray when true, remove the push notification that paired with this card.
     *                   Pass false after a successful Reply/OTP/Yes (tray already updated).
     */
    public static void dismiss(boolean cancelTray) {
        dismiss(cancelTray, false);
    }

    /**
     * @param notifyAdmin when true, POST dismiss ack (user tapped Dismiss only).
     */
    public static void dismiss(boolean cancelTray, boolean notifyAdmin) {
        mainHandler.post(
            () -> {
                mainHandler.removeCallbacks(autoDismiss);
                if (notifyAdmin) {
                    TechPushAckReceiver.postDismiss(
                        currentAppContext,
                        currentAckToken,
                        currentAckUrl,
                        currentAckSource,
                        currentAckTitle,
                        currentAckBody,
                        currentTrayTag);
                }
                if (cancelTray) cancelPairedTray();
                removeCurrent();
                clearAckState();
            });
    }

    private static void clearAckState() {
        currentAckToken = null;
        currentAckUrl = null;
        currentAckSource = null;
        currentAckTitle = null;
        currentAckBody = null;
    }

    private static void rememberTray(Mode mode, String tag, String requestId) {
        currentTrayTagged = true;
        String t = (tag != null && !tag.isEmpty()) ? tag : null;
        switch (mode) {
            case REPLY:
                currentTrayTag = t != null ? t : "office_message";
                currentTrayId = MessageReplyReceiver.TRAY_OFFICE_ID;
                break;
            case CALL:
                currentTrayTag = t != null ? t : "call_customer";
                currentTrayId = MessageReplyReceiver.TRAY_CALL_ID;
                break;
            case GOING:
                currentTrayTag = t != null ? t : "going_now";
                currentTrayId = MessageReplyReceiver.TRAY_GOING_ID;
                break;
            case START:
                currentTrayTag = t != null ? t : "start_job";
                currentTrayId = MessageReplyReceiver.TRAY_START_ID;
                break;
            case INFO:
                currentTrayTag = t != null ? t : "tech_nudge";
                currentTrayId = Math.abs(currentTrayTag.hashCode());
                break;
            case WRONG_LINE:
                currentTrayTag = t != null ? t : "wrong_line_self";
                currentTrayId = Math.abs(currentTrayTag.hashCode());
                break;
            case OTP:
                currentTrayTagged = false;
                currentTrayTag = null;
                currentTrayId =
                    requestId != null ? OtpReplyReceiver.notificationIdFor(requestId) : 0;
                break;
            default:
                currentTrayTag = t;
                currentTrayId = 0;
                break;
        }
    }

    private static void cancelPairedTray() {
        if (currentAppContext == null) return;
        if (!currentTrayTagged && currentTrayId == 0) return;
        try {
            NotificationManagerCompat nm = NotificationManagerCompat.from(currentAppContext);
            if (currentTrayTagged && currentTrayTag != null) {
                nm.cancel(currentTrayTag, currentTrayId);
            } else if (currentTrayId != 0) {
                nm.cancel(currentTrayId);
            }
            Log.i(TAG, "Cancelled paired tray tag=" + currentTrayTag + " id=" + currentTrayId);
        } catch (Throwable t) {
            Log.w(TAG, "Cancel tray failed", t);
        }
    }

    private static void showOnMain(
        Context context,
        Mode mode,
        String title,
        String body,
        String colorHex,
        String replyToken,
        String replyUrl,
        String tag,
        String callPhone,
        String startToken,
        String startUrl,
        String requestId,
        String nonce,
        String submitUrl,
        String jobId,
        String ackToken,
        String ackUrl,
        String source
    ) {
        removeCurrent();
        currentAppContext = context.getApplicationContext();
        currentAckToken = ackToken;
        currentAckUrl = ackUrl;
        currentAckSource = source;
        currentAckTitle = title;
        currentAckBody = body;
        rememberTray(mode, tag, requestId);

        int accent = accentFor(mode, colorHex);
        float density = context.getResources().getDisplayMetrics().density;
        int pad = dp(density, 18);

        LinearLayout card = new LinearLayout(context);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setElevation(dp(density, 18));
        card.setClipToOutline(true);
        GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(WHITE);
        cardBg.setCornerRadius(dp(density, 22));
        cardBg.setStroke(dp(density, 1), mix(accent, WHITE, 0.7f));
        card.setBackground(cardBg);

        LinearLayout header = new LinearLayout(context);
        header.setOrientation(LinearLayout.VERTICAL);
        header.setPadding(pad, dp(density, 14), pad, dp(density, 14));
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
        logoBg.setCornerRadius(dp(density, 10));
        logoWrap.setBackground(logoBg);
        ImageView logo = new ImageView(context);
        logo.setImageResource(R.drawable.ic_droplets);
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        FrameLayout.LayoutParams logoInnerLp =
            new FrameLayout.LayoutParams(dp(density, 20), dp(density, 20));
        logoInnerLp.gravity = Gravity.CENTER;
        logoWrap.addView(logo, logoInnerLp);
        int logoSize = dp(density, 36);
        brandRow.addView(logoWrap, new LinearLayout.LayoutParams(logoSize, logoSize));

        TextView brand = new TextView(context);
        brand.setText("HydrogenRO");
        brand.setTextColor(WHITE);
        brand.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        brand.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        LinearLayout.LayoutParams brandLp =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        brandLp.leftMargin = dp(density, 10);
        brandRow.addView(brand, brandLp);

        TextView pill = new TextView(context);
        pill.setText(pillFor(mode));
        pill.setTextColor(accent);
        pill.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        pill.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
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

        LinearLayout content = new LinearLayout(context);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(pad, pad, pad, pad);
        GradientDrawable wash = new GradientDrawable();
        wash.setColor(mix(accent, WHITE, 0.92f));
        content.setBackground(wash);

        TextView titleView = new TextView(context);
        titleView.setText(safe(title, defaultTitle(mode)));
        titleView.setTextColor(INK);
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, mode == Mode.WRONG_LINE ? 22 : 18);
        titleView.setTypeface(Typeface.create("sans-serif", Typeface.BOLD));
        content.addView(titleView);

        if (body != null && !body.trim().isEmpty()) {
            TextView bodyView = new TextView(context);
            bodyView.setText(body.trim());
            bodyView.setTextColor(BODY);
            bodyView.setTextSize(TypedValue.COMPLEX_UNIT_SP, mode == Mode.WRONG_LINE ? 16 : 14);
            bodyView.setLineSpacing(dp(density, mode == Mode.WRONG_LINE ? 4 : 2), 1f);
            LinearLayout.LayoutParams bodyLp =
                new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            bodyLp.topMargin = dp(density, mode == Mode.WRONG_LINE ? 14 : 10);
            content.addView(bodyView, bodyLp);
        }

        EditText input = null;
        if (mode == Mode.REPLY || mode == Mode.OTP) {
            input = new EditText(context);
            input.setHint(mode == Mode.OTP ? "••••" : "Type your reply…");
            input.setTextColor(INK);
            input.setHintTextColor(MUTED);
            input.setTextSize(TypedValue.COMPLEX_UNIT_SP, mode == Mode.OTP ? 28 : 15);
            input.setPadding(
                dp(density, 12),
                dp(density, mode == Mode.OTP ? 16 : 12),
                dp(density, 12),
                dp(density, mode == Mode.OTP ? 16 : 12));
            GradientDrawable inputBg = new GradientDrawable();
            inputBg.setColor(WHITE);
            inputBg.setCornerRadius(dp(density, 12));
            inputBg.setStroke(dp(density, 1), mix(accent, WHITE, 0.65f));
            input.setBackground(inputBg);
            if (mode == Mode.OTP) {
                input.setInputType(InputType.TYPE_CLASS_NUMBER);
                input.setFilters(new InputFilter[] { new InputFilter.LengthFilter(4) });
                input.setImeOptions(EditorInfo.IME_ACTION_DONE);
                input.setGravity(Gravity.CENTER);
                input.setLetterSpacing(0.45f);
                input.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
            } else {
                input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
                input.setMaxLines(4);
                input.setFilters(new InputFilter[] { new InputFilter.LengthFilter(300) });
            }
            LinearLayout.LayoutParams inputLp =
                new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
            inputLp.topMargin = dp(density, 12);
            content.addView(input, inputLp);
        }

        ProgressBar spinner = new ProgressBar(context);
        spinner.setVisibility(View.GONE);
        LinearLayout.LayoutParams spinLp =
            new LinearLayout.LayoutParams(dp(density, 28), dp(density, 28));
        spinLp.gravity = Gravity.CENTER_HORIZONTAL;
        spinLp.topMargin = dp(density, 8);
        content.addView(spinner, spinLp);

        LinearLayout actions = new LinearLayout(context);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.setWeightSum(2f);
        LinearLayout.LayoutParams actionsLp =
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        actionsLp.topMargin = dp(density, 14);

        TextView secondary = makeBtn(context, density, "Dismiss", false, accent);
        LinearLayout.LayoutParams secLp =
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        secLp.rightMargin = dp(density, 8);
        actions.addView(secondary, secLp);

        String primaryLabel = primaryLabel(mode);
        TextView primary = makeBtn(context, density, primaryLabel, true, accent);
        actions.addView(
            primary, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        content.addView(actions, actionsLp);

        // Going mode: Yes + No
        if (mode == Mode.GOING) {
            secondary.setText("No");
            primary.setText("Yes");
        }
        if (mode == Mode.WRONG_LINE) {
            // Single big acknowledge — warning should not be easy to miss.
            secondary.setVisibility(View.GONE);
            secLp.rightMargin = 0;
            primary.setText("Got it");
            actions.setWeightSum(1f);
        }

        card.addView(
            content,
            new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        final EditText inputFinal = input;
        final TextView primaryFinal = primary;
        final TextView secondaryFinal = secondary;
        final ProgressBar spinnerFinal = spinner;
        final boolean[] otpSubmitting = { false };

        if (mode != Mode.GOING) {
            secondary.setOnClickListener(v -> dismiss());
        } else {
            secondary.setOnClickListener(
                v -> {
                    setBusy(true, primaryFinal, secondaryFinal, spinnerFinal);
                    MessageReplyReceiver.submitGoingNo(
                        context,
                        replyToken,
                        replyUrl,
                        title,
                        body,
                        tag,
                        ok -> {
                            mainHandler.post(
                                () -> {
                                    setBusy(false, primaryFinal, secondaryFinal, spinnerFinal);
                                    if (ok) {
                                        toast(context, "Told office — not going");
                                        dismiss(true);
                                    } else {
                                        toast(context, "Couldn't send — try again");
                                    }
                                });
                        });
                });
        }

        Runnable doPrimary =
            () ->
                onPrimary(
                    context,
                    mode,
                    inputFinal,
                    primaryFinal,
                    secondaryFinal,
                    spinnerFinal,
                    replyToken,
                    replyUrl,
                    title,
                    body,
                    tag,
                    callPhone,
                    startToken,
                    startUrl,
                    requestId,
                    nonce,
                    submitUrl,
                    jobId,
                    otpSubmitting);

        primary.setOnClickListener(v -> doPrimary.run());

        if (mode == Mode.OTP && input != null) {
            input.setOnEditorActionListener(
                (v, actionId, event) -> {
                    if (actionId == EditorInfo.IME_ACTION_DONE) {
                        doPrimary.run();
                        return true;
                    }
                    return false;
                });
        }

        FrameLayout root = new FrameLayout(context);
        int rootPad = mode == Mode.WRONG_LINE ? dp(density, 20) : dp(density, 12);
        root.setPadding(rootPad, rootPad, rootPad, rootPad);
        if (mode == Mode.WRONG_LINE) {
            root.setBackgroundColor(0xE6111111);
        }
        FrameLayout.LayoutParams cardLp =
            new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        cardLp.gravity = Gravity.CENTER;
        root.addView(card, cardLp);

        WindowManager wm = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
        if (wm == null) return;

        DisplayMetrics metrics = new DisplayMetrics();
        wm.getDefaultDisplay().getMetrics(metrics);
        int width =
            mode == Mode.WRONG_LINE
                ? WindowManager.LayoutParams.MATCH_PARENT
                : Math.min(metrics.widthPixels - dp(density, 20), dp(density, 400));
        int height =
            mode == Mode.WRONG_LINE
                ? WindowManager.LayoutParams.MATCH_PARENT
                : WindowManager.LayoutParams.WRAP_CONTENT;

        int type =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        int flags =
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN;
        if (mode == Mode.WRONG_LINE) {
            // Full-screen: consume touches so the WebView underneath doesn't
            // get stray taps / focus fights (looked like a "page error").
            flags |= WindowManager.LayoutParams.FLAG_DIM_BEHIND;
        } else {
            flags |= WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL;
        }

        WindowManager.LayoutParams lp =
            new WindowManager.LayoutParams(
                width,
                height,
                type,
                flags,
                PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.CENTER;
        if (mode == Mode.WRONG_LINE) {
            lp.dimAmount = 0.72f;
            lp.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_HIDDEN;
        } else {
            lp.softInputMode =
                WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
                    | WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE;
        }

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
            enter.setDuration(200);
            enter.setInterpolator(new DecelerateInterpolator());
            enter.start();
            mainHandler.removeCallbacks(autoDismiss);
            long dismissMs = AUTO_DISMISS_MS;
            if (mode == Mode.OTP) dismissMs = OTP_AUTO_DISMISS_MS;
            else if (mode == Mode.WRONG_LINE) dismissMs = WRONG_LINE_AUTO_DISMISS_MS;
            mainHandler.postDelayed(autoDismiss, dismissMs);
            if (input != null) input.requestFocus();
            Log.i(TAG, "Overlay shown mode=" + mode);
        } catch (Throwable t) {
            Log.w(TAG, "Failed to add overlay", t);
            currentView = null;
        }
    }

    private static void onPrimary(
        Context context,
        Mode mode,
        EditText input,
        TextView primary,
        TextView secondary,
        ProgressBar spinner,
        String replyToken,
        String replyUrl,
        String title,
        String body,
        String tag,
        String callPhone,
        String startToken,
        String startUrl,
        String requestId,
        String nonce,
        String submitUrl,
        String jobId,
        boolean[] otpSubmitting
    ) {
        switch (mode) {
            case CALL: {
                String digits = callPhone != null ? callPhone.replaceAll("[^0-9+]", "") : "";
                dismiss(true);
                if (!digits.isEmpty()) {
                    try {
                        context.startActivity(
                            new Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + digits))
                                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    } catch (Throwable t) {
                        Log.w(TAG, "Dial failed", t);
                    }
                }
                break;
            }
            case INFO: {
                dismiss(true);
                openApp(context, jobId);
                break;
            }
            case WRONG_LINE: {
                dismiss(true);
                break;
            }
            case START:
            case GOING: {
                setBusy(true, primary, secondary, spinner);
                MessageReplyReceiver.submitGoingYes(
                    context,
                    startToken,
                    startUrl,
                    tag,
                    ok -> {
                        mainHandler.post(
                            () -> {
                                setBusy(false, primary, secondary, spinner);
                                if (ok) {
                                    toast(context, mode == Mode.START ? "Job started" : "You're on the way");
                                    dismiss(true);
                                } else {
                                    toast(context, "Couldn't start — open the app");
                                }
                            });
                    });
                break;
            }
            case REPLY: {
                String text = input != null ? input.getText().toString().trim() : "";
                if (text.isEmpty()) {
                    toast(context, "Type a reply first");
                    return;
                }
                setBusy(true, primary, secondary, spinner);
                MessageReplyReceiver.submitReply(
                    context,
                    replyToken,
                    replyUrl,
                    text,
                    title,
                    body,
                    tag,
                    ok -> {
                        mainHandler.post(
                            () -> {
                                setBusy(false, primary, secondary, spinner);
                                if (ok) {
                                    toast(context, "Reply sent to office");
                                    dismiss(false);
                                } else {
                                    toast(context, "Couldn't send — try again");
                                }
                            });
                    });
                break;
            }
            case OTP: {
                if (otpSubmitting != null && otpSubmitting[0]) return;
                String otp = input != null ? input.getText().toString().trim() : "";
                if (!otp.matches("\\d{4}")) {
                    toast(context, "Enter exactly 4 digits");
                    return;
                }
                if (otpSubmitting != null) otpSubmitting[0] = true;
                setBusy(true, primary, secondary, spinner);
                OtpReplyReceiver.submitOtp(
                    context,
                    requestId,
                    nonce,
                    submitUrl,
                    otp,
                    ok -> {
                        mainHandler.post(
                            () -> {
                                if (otpSubmitting != null) otpSubmitting[0] = false;
                                setBusy(false, primary, secondary, spinner);
                                if (ok) {
                                    toast(context, "OTP sent to office");
                                    dismiss(false);
                                } else {
                                    toast(context, "Couldn't send — try again");
                                }
                            });
                    });
                break;
            }
            default:
                dismiss(true);
        }
    }

    private static void setBusy(boolean busy, TextView a, TextView b, ProgressBar spinner) {
        if (a != null) a.setEnabled(!busy);
        if (b != null) b.setEnabled(!busy);
        if (spinner != null) spinner.setVisibility(busy ? View.VISIBLE : View.GONE);
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
                intent.putExtra(JobAlertOverlay.EXTRA_JOB_ID, jobId);
            }
            context.startActivity(intent);
        } catch (Throwable t) {
            Log.w(TAG, "Open app failed", t);
        }
    }

    private static void removeCurrent() {
        if (currentView == null) return;
        try {
            WindowManager wm =
                (WindowManager) currentView.getContext().getSystemService(Context.WINDOW_SERVICE);
            if (wm != null) wm.removeView(currentView);
        } catch (Throwable ignored) {
            /* already gone */
        }
        currentView = null;
    }

    private static TextView makeBtn(
        Context context, float density, String label, boolean filled, int accent
    ) {
        TextView btn = new TextView(context);
        btn.setText(label);
        btn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        btn.setTypeface(Typeface.create("sans-serif-medium", Typeface.BOLD));
        btn.setGravity(Gravity.CENTER);
        btn.setPadding(dp(density, 10), dp(density, 13), dp(density, 10), dp(density, 13));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(density, 12));
        if (filled) {
            bg.setColor(accent);
            btn.setTextColor(WHITE);
        } else {
            bg.setColor(WHITE);
            bg.setStroke(dp(density, 1), mix(accent, WHITE, 0.65f));
            btn.setTextColor(BODY);
        }
        btn.setBackground(bg);
        btn.setClickable(true);
        return btn;
    }

    private static int accentFor(Mode mode, String colorHex) {
        int fallback;
        switch (mode) {
            case OTP:
                fallback = AMBER;
                break;
            case CALL:
                fallback = BLUE;
                break;
            case START:
            case GOING:
                fallback = GREEN;
                break;
            case WRONG_LINE:
                fallback = WRONG_LINE_RED;
                break;
            default:
                fallback = VIOLET;
                break;
        }
        if (colorHex != null && colorHex.matches("#[0-9a-fA-F]{6}")) {
            try {
                return Color.parseColor(colorHex);
            } catch (IllegalArgumentException ignored) {
                /* keep fallback */
            }
        }
        return fallback;
    }

    private static String pillFor(Mode mode) {
        switch (mode) {
            case OTP:
                return "OTP";
            case CALL:
                return "CALL";
            case GOING:
                return "GOING?";
            case START:
                return "START";
            case REPLY:
                return "MESSAGE";
            case WRONG_LINE:
                return "WRONG LINE";
            default:
                return "NUDGE";
        }
    }

    private static String primaryLabel(Mode mode) {
        switch (mode) {
            case OTP:
                return "Send OTP";
            case CALL:
                return "Call";
            case START:
                return "Start";
            case GOING:
                return "Yes";
            case REPLY:
                return "Send reply";
            case WRONG_LINE:
                return "Got it";
            default:
                return "Open app";
        }
    }

    private static String defaultTitle(Mode mode) {
        switch (mode) {
            case OTP:
                return "Office needs the customer's OTP";
            case CALL:
                return "Call customer now";
            case START:
                return "Start this job?";
            case GOING:
                return "Are you going now?";
            case REPLY:
                return "Message from office";
            case WRONG_LINE:
                return "Please call from company number";
            default:
                return "Message from office";
        }
    }

    private static void toast(Context context, String msg) {
        try {
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show();
        } catch (Throwable ignored) {
            /* */
        }
    }

    private static String first(String a, String b, String fallback) {
        if (a != null && !a.trim().isEmpty()) return a.trim();
        if (b != null && !b.trim().isEmpty()) return b.trim();
        return fallback;
    }

    private static String safe(String v, String fallback) {
        if (v == null || v.trim().isEmpty()) return fallback;
        return v.trim();
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
            clamp(Math.round(Color.blue(color) * (1f - amount))));
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(255, v));
    }

    private static int dp(float density, int value) {
        return Math.round(value * density);
    }
}

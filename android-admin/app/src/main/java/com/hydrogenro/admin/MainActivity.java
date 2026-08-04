package com.hydrogenro.admin;

import android.os.Bundle;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cold open: splash logo → same-size boot overlay + bounce → login/dashboard.
 */
public class MainActivity extends BridgeActivity {
    private static final long BOOT_LOADER_MAX_MS = 20_000L;
    private static final long READY_POLL_MS = 200L;
    private static final int READY_POLL_MAX = 80;

    private View bootLoader;
    private final AtomicBoolean pageReady = new AtomicBoolean(false);
    private final AtomicBoolean watchingReady = new AtomicBoolean(false);
    private final AtomicBoolean bootUiReady = new AtomicBoolean(false);

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingCallPlugin.class);
        registerPlugin(AdminClipboardPlugin.class);
        registerPlugin(PdfSavePlugin.class);
        registerPlugin(DevicePrefsPlugin.class);
        registerPlugin(BiometricAuthPlugin.class);
        final SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !bootUiReady.get() && !pageReady.get());
        splash.setOnExitAnimationListener(SplashScreenViewProvider::remove);

        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    beginReadyWatch();
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    beginReadyWatch();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    dismissBootLoader();
                }
            }
        );

        super.onCreate(savedInstanceState);
        NotificationChannels.ensureAll(this);

        attachBootLoader();
        releaseSplashWhenBootDrawn();
        deliverExpenseReviewIfNeeded(getIntent());

        getWindow()
            .getDecorView()
            .postDelayed(this::dismissBootLoader, BOOT_LOADER_MAX_MS);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deliverExpenseReviewIfNeeded(intent);
    }

    /**
     * Expense-review "No" opens Payments → Add expense. Persist + navigate even
     * when Capacitor's push tap listener has not attached yet (cold start).
     * Single-shot: avoid location.assign / custom-event loops that refresh the page.
     */
    private void deliverExpenseReviewIfNeeded(Intent intent) {
        if (intent == null) return;
        if (!"expense_review".equals(intent.getStringExtra("type"))) return;
        String kind = intent.getStringExtra("addExpense");
        if (kind == null) kind = intent.getStringExtra("kind");
        if (!"technician".equals(kind) && !"business".equals(kind)) return;

        final String addExpense = kind;
        final String expenseDate = intent.getStringExtra("date");
        final String safeDate =
            expenseDate != null && expenseDate.matches("\\d{4}-\\d{2}-\\d{2}")
                ? expenseDate
                : "";
        final String deliveryKey = addExpense + "|" + safeDate;

        // Dismiss the tray notification when opened via No / body tap.
        int notificationId = intent.getIntExtra("notificationId", 0);
        if (notificationId == 0) {
            notificationId = ExpenseReviewReceiver.notificationIdFor(addExpense, safeDate);
        }
        try {
            NotificationManagerCompat.from(this).cancel(notificationId);
        } catch (Throwable ignored) {
            /* */
        }

        getSharedPreferences("hro_admin_deeplink", MODE_PRIVATE)
            .edit()
            .putString("addExpense", addExpense)
            .putString("expenseDate", safeDate)
            .apply();

        // Consume extras so rotation / onNewIntent does not re-deliver.
        intent.removeExtra("type");
        intent.removeExtra("addExpense");
        intent.removeExtra("kind");
        intent.removeExtra("date");
        setIntent(intent);

        final int[] attempts = { 0 };
        final Runnable[] injectHolder = new Runnable[1];
        injectHolder[0] = () -> {
            attempts[0] += 1;
            WebView webView = webViewOrNull();
            if (webView == null) {
                if (attempts[0] < 6) {
                    getWindow().getDecorView().postDelayed(injectHolder[0], 500);
                }
                return;
            }
            String js =
                "(function(){try{"
                    + "var key="
                    + jsonString(deliveryKey)
                    + ";"
                    + "if(sessionStorage.getItem('hro_er_delivered')===key)return;"
                    + "sessionStorage.setItem('hro_er_delivered',key);"
                    + "localStorage.setItem('hro_admin_add_expense',"
                    + jsonString(addExpense)
                    + ");"
                    + (safeDate.isEmpty()
                        ? "localStorage.removeItem('hro_admin_add_expense_date');"
                        : "localStorage.setItem('hro_admin_add_expense_date',"
                            + jsonString(safeDate)
                            + ");")
                    + "var need='/admin?view=payments&addExpense="
                    + addExpense
                    + (safeDate.isEmpty() ? "" : "&expenseDate=" + safeDate)
                    + "';"
                    + "var onPayments=location.pathname.indexOf('/admin')===0"
                    + "&&location.search.indexOf('view=payments')>=0;"
                    + "var hasParam=location.search.indexOf('addExpense="
                    + addExpense
                    + "')>=0;"
                    + "if(hasParam){return;}"
                    + "if(onPayments){"
                    + "window.dispatchEvent(new CustomEvent('hro-admin-add-expense',{detail:{addExpense:"
                    + jsonString(addExpense)
                    + (safeDate.isEmpty() ? "" : ",expenseDate:" + jsonString(safeDate))
                    + "}}));"
                    + "return;"
                    + "}"
                    + "location.replace(need);"
                    + "}catch(e){}})();";
            webView.evaluateJavascript(js, null);
        };

        getWindow().getDecorView().post(injectHolder[0]);
    }

    private static String jsonString(String raw) {
        if (raw == null) return "''";
        return "'"
            + raw.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n").replace("\r", "")
            + "'";
    }

    /** Keep system splash until boot overlay has actually drawn (no blank gap). */
    private void releaseSplashWhenBootDrawn() {
        if (bootLoader == null) {
            bootUiReady.set(true);
            return;
        }
        bootLoader
            .getViewTreeObserver()
            .addOnPreDrawListener(
                new ViewTreeObserver.OnPreDrawListener() {
                    @Override
                    public boolean onPreDraw() {
                        bootLoader.getViewTreeObserver().removeOnPreDrawListener(this);
                        bootUiReady.set(true);
                        return true;
                    }
                }
            );
    }

    private void attachBootLoader() {
        ViewGroup content = findViewById(android.R.id.content);
        if (content == null || bootLoader != null) return;

        bootLoader = getLayoutInflater().inflate(R.layout.boot_loader, content, false);
        content.addView(
            bootLoader,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        startBounceDots(bootLoader);
    }

    private void startBounceDots(View root) {
        int[] ids = { R.id.boot_dot_1, R.id.boot_dot_2, R.id.boot_dot_3 };
        for (int i = 0; i < ids.length; i++) {
            View dot = root.findViewById(ids[i]);
            if (dot == null) continue;
            Animation bounce = AnimationUtils.loadAnimation(this, R.anim.boot_dot_bounce);
            bounce.setStartOffset(i * 150L);
            dot.startAnimation(bounce);
        }
    }

    private void beginReadyWatch() {
        if (pageReady.get() || !watchingReady.compareAndSet(false, true)) return;
        pollUntilPageReady(0);
    }

    private WebView webViewOrNull() {
        try {
            return getBridge() != null ? getBridge().getWebView() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private void pollUntilPageReady(int attempt) {
        if (pageReady.get()) return;
        if (attempt >= READY_POLL_MAX) {
            dismissBootLoader();
            return;
        }

        WebView webView = webViewOrNull();
        if (webView == null) {
            getWindow()
                .getDecorView()
                .postDelayed(() -> pollUntilPageReady(attempt + 1), READY_POLL_MS);
            return;
        }

        // Dismiss only when login/dashboard is ready (not when web loader paints —
        // swapping to the web logo caused a size jump).
        webView.evaluateJavascript(
            "(function(){"
                + "if(window.__hroBootReady===true)return 'ready';"
                + "if(document.documentElement.getAttribute('data-hro-boot-ready')==='1')return 'ready';"
                + "return 'wait';"
                + "})();",
            new ValueCallback<String>() {
                @Override
                public void onReceiveValue(String value) {
                    if (pageReady.get()) return;
                    if ("\"ready\"".equals(value)) {
                        dismissBootLoader();
                    } else {
                        webView.postDelayed(
                            () -> pollUntilPageReady(attempt + 1),
                            READY_POLL_MS
                        );
                    }
                }
            }
        );
    }

    private void dismissBootLoader() {
        if (pageReady.getAndSet(true)) return;
        bootUiReady.set(true);
        runOnUiThread(() -> {
            if (bootLoader == null) return;
            clearBounceDots(bootLoader);
            ViewGroup parent = (ViewGroup) bootLoader.getParent();
            if (parent != null) parent.removeView(bootLoader);
            bootLoader = null;
        });
    }

    private void clearBounceDots(View root) {
        int[] ids = { R.id.boot_dot_1, R.id.boot_dot_2, R.id.boot_dot_3 };
        for (int id : ids) {
            View dot = root.findViewById(id);
            if (dot != null) dot.clearAnimation();
        }
    }
}

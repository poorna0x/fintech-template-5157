package com.hydrogenro.admin;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.os.SystemClock;
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
 * If the phone is offline, show the saved-customer search instead of the
 * browser error page, and ask before opening the live admin.
 */
public class MainActivity extends BridgeActivity {
    private static final String TAG = "HroAdminMain";
    private static final long BOOT_LOADER_MAX_MS = 20_000L;
    private static final long READY_POLL_MS = 200L;
    private static final int READY_POLL_MAX = 80;
    private static final long AUTO_RELOAD_COOLDOWN_MS = 2_500L;

    private View bootLoader;
    private final AtomicBoolean pageReady = new AtomicBoolean(false);
    private final AtomicBoolean watchingReady = new AtomicBoolean(false);
    private final AtomicBoolean bootUiReady = new AtomicBoolean(false);
    private final AtomicBoolean needsReloadWhenOnline = new AtomicBoolean(false);
    private final AtomicBoolean showingOffline = new AtomicBoolean(false);
    private volatile long lastAutoReloadAtMs = 0L;
    private int offlineAttempts = 0;
    private String offlineHtml;
    private ConnectivityManager.NetworkCallback networkCallback;
    private static volatile boolean inForeground = false;

    static boolean isInForeground() {
        return inForeground;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IncomingCallPlugin.class);
        registerPlugin(CallerDirectoryPlugin.class);
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
                    markAppPageLoadedIfHttps(view);
                    beginReadyWatch();
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    markAppPageLoadedIfHttps(webView);
                    beginReadyWatch();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    if (showingOffline.get()) return;
                    dismissBootLoader();
                    webView.post(() -> {
                        if (showingOffline.get()) return;
                        if (!isNetworkUsable() || looksLikeOfflineErrorPage(webView)) {
                            showOfflineView();
                        }
                    });
                }
            }
        );

        super.onCreate(savedInstanceState);
        NotificationChannels.ensureAll(this);
        registerNetworkReloadWatcher();

        attachBootLoader();
        releaseSplashWhenBootDrawn();
        deliverExpenseReviewIfNeeded(getIntent());
        deliverCallerSearchIfNeeded(getIntent());

        getWindow()
            .getDecorView()
            .postDelayed(this::dismissBootLoader, BOOT_LOADER_MAX_MS);
        getWindow().getDecorView().post(() -> {
            if (!isNetworkUsable()) showOfflineView();
        });
        getWindow().getDecorView().postDelayed(this::maybePromptCallerOverlay, 3_500L);
    }

    /**
     * One-time prompt so the incoming-customer card can sit on the call screen
     * the same way a technician job assign does.
     */
    private void maybePromptCallerOverlay() {
        try {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) {
                maybePromptBatteryUnrestricted();
                return;
            }
            if (CallerOverlay.canDraw(this)) {
                maybePromptBatteryUnrestricted();
                return;
            }
            android.content.SharedPreferences prefs =
                getSharedPreferences("hro_admin_prefs", MODE_PRIVATE);
            if (prefs.getBoolean("caller_overlay_prompted", false)) {
                maybePromptBatteryUnrestricted();
                return;
            }
            prefs.edit().putBoolean("caller_overlay_prompted", true).apply();

            android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this)
                .setTitle("Show customers on incoming calls")
                .setMessage(
                    "Allow HydrogenRO to display over other apps so a saved customer "
                        + "pops up on the call screen, the same way a job assign does for technicians."
                )
                .setPositiveButton(
                    "Allow",
                    (d, w) -> {
                        try {
                            startActivity(
                                new Intent(
                                    android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    android.net.Uri.parse("package:" + getPackageName())
                                )
                            );
                        } catch (Exception e) {
                            android.util.Log.w(TAG, "Open overlay settings failed: " + e.getMessage());
                        }
                    }
                )
                .setNegativeButton("Not now", null)
                .setCancelable(true)
                .create();
            dialog.setOnDismissListener(d -> maybePromptBatteryUnrestricted());
            dialog.show();
        } catch (Exception e) {
            android.util.Log.w(TAG, "Caller overlay prompt failed: " + e.getMessage());
            maybePromptBatteryUnrestricted();
        }
    }

    /**
     * POCO / Xiaomi HyperOS holds FCM until the screen wakes when the app is
     * battery-restricted. Ask once, same as the technician app.
     */
    private void maybePromptBatteryUnrestricted() {
        try {
            if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.M) return;
            android.content.SharedPreferences prefs =
                getSharedPreferences("hro_admin_prefs", MODE_PRIVATE);
            if (prefs.getBoolean("battery_unrestricted_prompted", false)) return;
            android.os.PowerManager pm =
                (android.os.PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(getPackageName())) {
                prefs.edit().putBoolean("battery_unrestricted_prompted", true).apply();
                return;
            }
            prefs.edit().putBoolean("battery_unrestricted_prompted", true).apply();

            String mfr = android.os.Build.MANUFACTURER == null
                ? ""
                : android.os.Build.MANUFACTURER.toLowerCase();
            String brand = android.os.Build.BRAND == null
                ? ""
                : android.os.Build.BRAND.toLowerCase();
            boolean xiaomi =
                mfr.contains("xiaomi")
                    || mfr.contains("poco")
                    || mfr.contains("redmi")
                    || brand.contains("xiaomi")
                    || brand.contains("poco")
                    || brand.contains("redmi");
            String message = xiaomi
                ? "POCO and Xiaomi hold alerts until the phone wakes. Tap Allow, then set "
                    + "Battery saver to No restrictions and turn Autostart on for HydrogenRO."
                : "Allow unrestricted battery so admin alerts arrive immediately even when the phone is idle.";

            new android.app.AlertDialog.Builder(this)
                .setTitle("Alerts may arrive late")
                .setMessage(message)
                .setPositiveButton(
                    "Allow",
                    (d, w) -> {
                        try {
                            startActivity(
                                new android.content.Intent(
                                    android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                                    android.net.Uri.parse("package:" + getPackageName())
                                )
                            );
                        } catch (Exception e) {
                            try {
                                startActivity(
                                    new android.content.Intent(
                                        android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS
                                    )
                                );
                            } catch (Exception e2) {
                                android.util.Log.w(TAG, "Open battery settings failed: " + e2.getMessage());
                            }
                        }
                    }
                )
                .setNegativeButton("Not now", null)
                .setCancelable(true)
                .show();
        } catch (Exception e) {
            android.util.Log.w(TAG, "Battery prompt failed: " + e.getMessage());
        }
    }

    @Override
    public void onResume() {
        inForeground = true;
        super.onResume();
        tryReloadIfOnline();
    }

    @Override
    public void onPause() {
        inForeground = false;
        DevicePrefsPlugin.clearViewingWhatsAppPhone(this);
        super.onPause();
    }

    @Override
    public void onDestroy() {
        unregisterNetworkReloadWatcher();
        super.onDestroy();
    }

    private void registerNetworkReloadWatcher() {
        if (networkCallback != null) return;
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        networkCallback =
            new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    getWindow().getDecorView().post(MainActivity.this::tryReloadIfOnline);
                    getWindow()
                        .getDecorView()
                        .postDelayed(MainActivity.this::tryReloadIfOnline, 1_200L);
                }

                @Override
                public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    if (caps != null
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                        tryReloadIfOnline();
                    }
                }
            };
        try {
            NetworkRequest req =
                new NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build();
            cm.registerNetworkCallback(req, networkCallback);
        } catch (Exception e) {
            android.util.Log.w(TAG, "Network reload watcher failed: " + e.getMessage());
            networkCallback = null;
        }
    }

    private void unregisterNetworkReloadWatcher() {
        if (networkCallback == null) return;
        try {
            ConnectivityManager cm =
                (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) cm.unregisterNetworkCallback(networkCallback);
        } catch (Exception ignored) {
            /* already unregistered */
        }
        networkCallback = null;
    }

    private void maybeArmOfflineReload(WebView webView) {
        if (webView == null) return;
        if (looksLikeOfflineErrorPage(webView)) {
            needsReloadWhenOnline.set(true);
            tryReloadIfOnline();
        }
    }

    private static boolean looksLikeOfflineErrorPage(WebView webView) {
        String url = webView.getUrl();
        if (url != null) {
            String lower = url.toLowerCase();
            if (lower.startsWith("chrome-error://")
                || lower.startsWith("data:")
                || lower.equals("about:blank")) {
                return true;
            }
        }
        String title = webView.getTitle();
        if (title == null) return false;
        String t = title.toLowerCase();
        return t.contains("webpage not available")
            || t.contains("web page not available")
            || t.contains("err_internet")
            || t.contains("err_name_not_resolved")
            || t.contains("err_connection")
            || t.contains("no internet");
    }

    private void markAppPageLoadedIfHttps(WebView webView) {
        if (webView == null) return;
        String url = webView.getUrl();
        if (url != null && url.startsWith("https://")) {
            needsReloadWhenOnline.set(false);
        }
    }

    private boolean isNetworkUsable() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        Network net = cm.getActiveNetwork();
        if (net == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(net);
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void tryReloadIfOnline() {
        if (showingOffline.get()) {
            if (!isNetworkUsable()) return;
            runOnUiThread(() -> {
                WebView wv = webViewOrNull();
                if (wv != null) {
                    wv.evaluateJavascript("window.__hroNet&&window.__hroNet(true)", null);
                }
            });
            return;
        }
        if (!needsReloadWhenOnline.get()) return;
        if (!isNetworkUsable()) return;
        long now = SystemClock.elapsedRealtime();
        if (now - lastAutoReloadAtMs < AUTO_RELOAD_COOLDOWN_MS) return;
        lastAutoReloadAtMs = now;

        runOnUiThread(
            () -> {
                if (!needsReloadWhenOnline.get()) return;
                WebView wv = webViewOrNull();
                if (wv == null) return;
                String appUrl = null;
                try {
                    if (getBridge() != null) appUrl = getBridge().getAppUrl();
                } catch (Exception ignored) {
                    /* bridge not ready */
                }
                android.util.Log.i(TAG, "Network restored — reloading app WebView");
                if (appUrl != null && !appUrl.isEmpty()) {
                    wv.loadUrl(appUrl);
                } else {
                    wv.reload();
                }
            }
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deliverExpenseReviewIfNeeded(intent);
        deliverCallerSearchIfNeeded(intent);
    }

    /** Open on the caller card searches that phone on the dashboard. */
    private void deliverCallerSearchIfNeeded(Intent intent) {
        if (intent == null) return;
        if (!"caller_search".equals(intent.getStringExtra("type"))) return;
        String phone = CallerDirectoryDb.phoneKey(intent.getStringExtra("phone"));
        if (phone.isEmpty()) return;

        try {
            NotificationManagerCompat.from(this).cancel(CallerBanner.NOTIFICATION_ID);
        } catch (Throwable ignored) {
            /* */
        }

        intent.removeExtra("type");
        intent.removeExtra("phone");
        setIntent(intent);

        final String safePhone = phone;
        final int[] attempts = { 0 };
        final Runnable[] injectHolder = new Runnable[1];
        injectHolder[0] = () -> {
            attempts[0] += 1;
            WebView webView = webViewOrNull();
            if (webView == null) {
                if (attempts[0] < 40) {
                    getWindow().getDecorView().postDelayed(injectHolder[0], 250);
                }
                return;
            }
            // Ask the loaded admin page to search. location.replace reloaded the
            // whole CRM, which is why Open felt slow and then the search vanished.
            String js =
                "(function(){try{"
                    + "var phone="
                    + jsonString(safePhone)
                    + ";"
                    + "if(typeof window.__hroOpenCallerSearch==='function'){"
                    + "window.__hroOpenCallerSearch(phone);return 'ok';}"
                    + "return 'wait';"
                    + "}catch(e){return 'wait';}})();";
            webView.evaluateJavascript(js, value -> {
                if ("\"ok\"".equals(value)) return;
                if (attempts[0] < 40) {
                    getWindow().getDecorView().postDelayed(injectHolder[0], 250);
                    return;
                }
                // Older site build has no helper. One navigation still opens the search.
                webView.loadUrl(
                    "https://hydrogenro.com/admin?search=" + android.net.Uri.encode(safePhone)
                );
            });
        };
        getWindow().getDecorView().post(injectHolder[0]);
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
        if (showingOffline.get()) return;
        if (pageReady.get() || !watchingReady.compareAndSet(false, true)) return;
        pollUntilPageReady(0);
    }

    private String offlineHtml() {
        if (offlineHtml != null) return offlineHtml;
        try (java.io.InputStream in = getAssets().open("offline-admin.html")) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) >= 0) out.write(buf, 0, n);
            offlineHtml = out.toString("UTF-8");
        } catch (Exception e) {
            android.util.Log.w(TAG, "Offline page missing: " + e.getMessage());
            offlineHtml = "<html><body><p>Offline search is unavailable.</p></body></html>";
        }
        return offlineHtml;
    }

    /** Saved-customer search. Does not open the live site until the admin confirms. */
    private void showOfflineView() {
        WebView wv = webViewOrNull();
        if (wv == null) {
            if (offlineAttempts++ < 20) {
                getWindow().getDecorView().postDelayed(this::showOfflineView, 200);
            }
            return;
        }
        String url = wv.getUrl();
        if (showingOffline.get() && url != null && url.startsWith("https://offline.local")) return;
        showingOffline.set(true);
        needsReloadWhenOnline.set(false);
        wv.post(() -> {
            try {
                wv.stopLoading();
                wv.setFocusable(true);
                wv.setFocusableInTouchMode(true);
                wv.requestFocus();
                wv.getSettings().setJavaScriptEnabled(true);
                wv.addJavascriptInterface(new OfflineBridge(), "HroOffline");
                wv.loadDataWithBaseURL(
                    "https://offline.local/",
                    offlineHtml(),
                    "text/html",
                    "utf-8",
                    null
                );
            } catch (Exception e) {
                android.util.Log.w(TAG, "Offline view failed: " + e.getMessage());
            }
            dismissBootLoader();
        });
    }

    public final class OfflineBridge {
        @android.webkit.JavascriptInterface
        public String search(String query) {
            CallerDirectoryDb db = new CallerDirectoryDb(MainActivity.this);
            try {
                return db.searchJson(query);
            } finally {
                db.close();
            }
        }

        @android.webkit.JavascriptInterface
        public boolean online() {
            return isNetworkUsable();
        }

        @android.webkit.JavascriptInterface
        public void openLive() {
            runOnUiThread(() -> {
                showingOffline.set(false);
                needsReloadWhenOnline.set(false);
                WebView webView = webViewOrNull();
                if (webView == null) return;
                String appUrl = "https://hydrogenro.com/admin";
                try {
                    if (getBridge() != null && getBridge().getAppUrl() != null && !getBridge().getAppUrl().isEmpty()) {
                        appUrl = getBridge().getAppUrl();
                    }
                } catch (Exception ignored) {
                    /* keep the default admin url */
                }
                webView.loadUrl(appUrl);
            });
        }
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

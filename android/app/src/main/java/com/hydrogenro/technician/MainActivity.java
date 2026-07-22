package com.hydrogenro.technician;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewTreeObserver;
import android.view.animation.Animation;
import android.view.animation.AnimationUtils;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cold open: splash logo → same-size boot overlay + bounce → login/dashboard.
 * Also tunes the Capacitor WebView so Cloudflare Turnstile can complete
 * (third-party cookies + DOM storage per Cloudflare mobile docs), and injects
 * a native FCM token fallback when the Capacitor push plugin event is missed.
 */
public class MainActivity extends BridgeActivity {
    private static final long BOOT_LOADER_MAX_MS = 20_000L;
    private static final long READY_POLL_MS = 200L;
    private static final int READY_POLL_MAX = 80;

    private View bootLoader;
    private final AtomicBoolean pageReady = new AtomicBoolean(false);
    private final AtomicBoolean watchingReady = new AtomicBoolean(false);
    private final AtomicBoolean bootUiReady = new AtomicBoolean(false);
    private volatile String cachedFcmToken = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RecentCallPlugin.class);
        registerPlugin(PdfSavePlugin.class);
        final SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !bootUiReady.get() && !pageReady.get());
        // No fade-out — cut straight to our boot overlay (logo already on splash).
        splash.setOnExitAnimationListener(SplashScreenViewProvider::remove);

        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    hardenWebViewForTurnstile(view);
                    injectNativeFcmToken(view);
                    beginReadyWatch();
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    hardenWebViewForTurnstile(webView);
                    injectNativeFcmToken(webView);
                    beginReadyWatch();
                }

                @Override
                public void onReceivedError(WebView webView) {
                    dismissBootLoader();
                }
            }
        );

        super.onCreate(savedInstanceState);
        NotificationChannels.ensureJobAlerts(this);

        // Bridge WebView exists after super.onCreate — configure as early as possible.
        hardenWebViewForTurnstile(webViewOrNull());
        fetchNativeFcmToken();
        requestCallAlertPermissions();

        attachBootLoader();
        releaseSplashWhenBootDrawn();

        getWindow()
            .getDecorView()
            .postDelayed(this::dismissBootLoader, BOOT_LOADER_MAX_MS);
    }

    /**
     * CallAlertReceiver needs READ_PHONE_STATE + READ_CALL_LOG to get the
     * incoming number. One system prompt; Android suppresses repeats after a
     * permanent denial.
     */
    private void requestCallAlertPermissions() {
        try {
            String[] perms = {
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.READ_CALL_LOG,
            };
            java.util.List<String> missing = new java.util.ArrayList<>();
            for (String p : perms) {
                if (
                    androidx.core.content.ContextCompat.checkSelfPermission(this, p) !=
                    android.content.pm.PackageManager.PERMISSION_GRANTED
                ) {
                    missing.add(p);
                }
            }
            if (!missing.isEmpty()) {
                androidx.core.app.ActivityCompat.requestPermissions(
                    this,
                    missing.toArray(new String[0]),
                    9451
                );
            }
        } catch (Exception e) {
            android.util.Log.w("HRO-Main", "Call permission request failed: " + e.getMessage());
        }
    }

    /**
     * Capacitor PushNotifications.register() can miss the JS "registration"
     * event (plugin instance race). Fetch the token natively and expose it on
     * window.__HRO_NATIVE_FCM_TOKEN for the web app to save.
     */
    private void fetchNativeFcmToken() {
        try {
            FirebaseMessaging.getInstance()
                .getToken()
                .addOnSuccessListener(
                    token -> {
                        if (token == null || token.length() < 20) return;
                        cachedFcmToken = token;
                        android.util.Log.i("HRO-Main", "Native FCM token ready (len=" + token.length() + ")");
                        injectNativeFcmToken(webViewOrNull());
                    }
                )
                .addOnFailureListener(
                    e -> android.util.Log.w("HRO-Main", "Native FCM getToken failed: " + e.getMessage())
                );
        } catch (Exception e) {
            android.util.Log.w("HRO-Main", "Native FCM fetch threw: " + e.getMessage());
        }
    }

    private void injectNativeFcmToken(WebView webView) {
        final String token = cachedFcmToken;
        if (webView == null || token == null || token.length() < 20) return;
        final String escaped =
            token
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "")
                .replace("\r", "");
        webView.post(
            () ->
                webView.evaluateJavascript(
                    "(function(){"
                        + "window.__HRO_NATIVE_FCM_TOKEN='"
                        + escaped
                        + "';"
                        + "try{window.dispatchEvent(new CustomEvent('hro-native-fcm',"
                        + "{detail:{token:window.__HRO_NATIVE_FCM_TOKEN}}));}catch(e){}"
                        + "})();",
                    null
                )
        );
    }

    /**
     * Cloudflare Turnstile in Android WebView needs third-party cookies + DOM
     * storage. Apps targeting Lollipop+ disable third-party cookies by default,
     * which makes the checkbox challenge fail to verify.
     * @see https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/
     */
    private void hardenWebViewForTurnstile(WebView webView) {
        if (webView == null) return;
        try {
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            cookies.setAcceptThirdPartyCookies(webView, true);
            // Persist cookie store so Cloudflare challenge state survives brief pauses.
            cookies.flush();

            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setLoadWithOverviewMode(true);
            settings.setUseWideViewPort(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            // Keep the default UA — changing mid-session breaks Turnstile.
        } catch (Exception e) {
            android.util.Log.w("HRO-Main", "Turnstile WebView harden failed: " + e.getMessage());
        }
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

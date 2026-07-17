package com.hydrogenro.admin;

import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.splashscreen.SplashScreenViewProvider;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Cold open: logo + "Hydrogen RO" until the website loader (or page) is ready.
 * No native spinner — website bounce takes over after handoff.
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
        if (bootLoader != null) {
            bootLoader.post(() -> bootUiReady.set(true));
        } else {
            bootUiReady.set(true);
        }

        getWindow()
            .getDecorView()
            .postDelayed(this::dismissBootLoader, BOOT_LOADER_MAX_MS);
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

        // Dismiss when website loader paints, or when login/dashboard is ready.
        webView.evaluateJavascript(
            "(function(){"
                + "if(window.__hroWebLoaderReady===true)return 'ready';"
                + "if(window.__hroBootReady===true)return 'ready';"
                + "if(document.documentElement.getAttribute('data-hro-web-loader-ready')==='1')return 'ready';"
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
            ViewGroup parent = (ViewGroup) bootLoader.getParent();
            if (parent != null) parent.removeView(bootLoader);
            bootLoader = null;
        });
    }
}

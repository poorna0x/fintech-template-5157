package com.hydrogenro.admin;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayDeque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Cold start serves the portal HTML/JS/CSS from disk (APK seed, then the last
 * background refresh) while the WebView stays on https://hydrogenro.com.
 * API calls are not intercepted, so login and live data still hit the network.
 * A web deploy is picked up on the next cold start — this open stays instant.
 */
public final class AppShellCache {
    private static final String TAG = "HRO-Shell";
    private static final String ORIGIN = "https://hydrogenro.com";
    private static final String DIR_NAME = "appshell";
    private static final String NEXT_NAME = "appshell-next";
    private static final String PREV_NAME = "appshell-prev";
    private static final long UPDATE_DELAY_MS = 8_000L;
    private static final int MAX_FILES = 500;
    private static final int MAX_HTML_BYTES = 2_000_000;
    private static final int MAX_FILE_BYTES = 8_000_000;
    private static final long MAX_TOTAL_BYTES = 60L * 1024L * 1024L;
    private static final String UA =
        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    /** Vite emits both "/assets/…" and bare "assets/…" inside the preload map. */
    private static final Pattern ASSET_REF = Pattern.compile(
        "(?:^|[^A-Za-z0-9_])(assets/[A-Za-z0-9._~-]+)"
    );
    /** Dynamic import("./Chunk-hash.js") resolved against the file that mentioned it. */
    private static final Pattern REL_REF = Pattern.compile(
        "(?:^|[^A-Za-z0-9_])(\\./[A-Za-z0-9._~-]+\\.(?:js|mjs|css|woff2|woff|ttf|svg|png|webp|json|wasm))"
    );
    private static final Pattern HEAD_REF = Pattern.compile("/head-[a-z0-9-]+\\.js");
    private static final AtomicBoolean updateStarted = new AtomicBoolean(false);
    private static final AtomicBoolean loggedDocumentHit = new AtomicBoolean(false);

    private final Context appContext;

    private AppShellCache(Context appContext) {
        this.appContext = appContext;
    }

    public static void install(BridgeActivity activity) {
        try {
            Bridge bridge = activity.getBridge();
            if (bridge == null || bridge.getWebView() == null) return;
            AppShellCache cache = new AppShellCache(activity.getApplicationContext());
            bridge.setWebViewClient(new ShellCachingWebViewClient(bridge, cache));
            ServiceWorkerController.getInstance()
                .setServiceWorkerClient(
                    new ServiceWorkerClient() {
                        @Override
                        public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) {
                            WebResourceResponse hit = cache.serve(request);
                            if (hit != null) return hit;
                            try {
                                return bridge.getLocalServer().shouldInterceptRequest(request);
                            } catch (Throwable t) {
                                return null;
                            }
                        }
                    }
                );
            cache.scheduleUpdate();
        } catch (Throwable t) {
            Log.w(TAG, "appshell install failed", t);
        }
    }

    private void scheduleUpdate() {
        if (!updateStarted.compareAndSet(false, true)) return;
        new Handler(Looper.getMainLooper())
            .postDelayed(
                () ->
                    new Thread(
                            () -> {
                                try {
                                    refreshFromNetwork();
                                } catch (Throwable t) {
                                    updateStarted.set(false);
                                    Log.w(TAG, "appshell update failed", t);
                                }
                            },
                            "appshell-update"
                        )
                        .start(),
                UPDATE_DELAY_MS
            );
    }

    WebResourceResponse serve(WebResourceRequest request) {
        if (request == null || request.getUrl() == null) return null;
        if (!"GET".equalsIgnoreCase(request.getMethod())) return null;
        Uri uri = request.getUrl();
        String host = uri.getHost();
        if (host == null) return null;
        host = host.toLowerCase();
        if (!host.equals("hydrogenro.com") && !host.equals("www.hydrogenro.com")) return null;

        String path = uri.getPath();
        if (path == null || path.contains("..")) return null;
        if (path.startsWith("/.netlify/") || path.startsWith("/api/")) return null;

        String rel;
        boolean document = false;
        if (isPortalDocument(path)) {
            rel = "app.html";
            document = true;
        } else if (path.startsWith("/")) {
            rel = path.substring(1);
            if (!isShellFile(rel)) return null;
        } else {
            return null;
        }

        InputStream body = open(rel);
        if (body == null) return null;
        if (document && loggedDocumentHit.compareAndSet(false, true)) {
            Log.i(TAG, "cold start serving portal shell from disk");
        }

        String mime = mimeFor(rel);
        boolean text = isText(rel);
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-store");
        // Module scripts use CORS mode. A synthetic response without this header
        // is rejected even though the file came from disk.
        headers.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse(mime, text ? "utf-8" : null, 200, "OK", headers, body);
    }

    private InputStream open(String rel) {
        File live = new File(new File(appContext.getFilesDir(), DIR_NAME), rel);
        if (live.isFile()) {
            try {
                return new FileInputStream(live);
            } catch (IOException ignored) {
                /* fall through to the APK seed */
            }
        }
        try {
            return appContext.getAssets().open(DIR_NAME + "/" + rel);
        } catch (IOException ignored) {
            return null;
        }
    }

    private void refreshFromNetwork() throws Exception {
        byte[] remoteHtml = httpGet("/app.html", MAX_HTML_BYTES);
        String remoteText = new String(remoteHtml, StandardCharsets.UTF_8);
        if (!remoteText.contains("/assets/") || !remoteText.contains("id=\"root\"")) {
            Log.w(TAG, "appshell update skipped — /app.html did not look like the portal shell");
            updateStarted.set(false);
            return;
        }
        String remoteHash = sha256(remoteHtml);
        byte[] localHtml = readActiveHtml();
        if (localHtml != null && remoteHash.equals(sha256(localHtml))) {
            Log.i(TAG, "appshell already matches the live site");
            return;
        }

        File next = new File(appContext.getFilesDir(), NEXT_NAME);
        deleteRecursive(next);
        if (!next.mkdirs() && !next.isDirectory()) {
            throw new IOException("could not create appshell staging dir");
        }

        Set<String> saved = new HashSet<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        writeRel(next, "app.html", remoteHtml);
        saved.add("app.html");
        enqueueRefs("app.html", remoteText, queue, saved);

        long total = remoteHtml.length;
        int guard = 0;
        while (!queue.isEmpty()) {
            if (saved.size() > MAX_FILES || total > MAX_TOTAL_BYTES) {
                throw new IOException("appshell update exceeded size cap");
            }
            String rel = queue.removeFirst();
            if (!saved.add(rel)) continue;
            if (++guard > MAX_FILES) break;
            byte[] bytes = httpGet("/" + rel, MAX_FILE_BYTES);
            total += bytes.length;
            writeRel(next, rel, bytes);
            if (isText(rel)) {
                enqueueRefs(rel, new String(bytes, StandardCharsets.UTF_8), queue, saved);
            }
        }

        swapIn(next);
        Log.i(TAG, "appshell updated " + saved.size() + " files (" + total + " bytes) for the next cold start");
    }

    private byte[] readActiveHtml() {
        File live = new File(new File(appContext.getFilesDir(), DIR_NAME), "app.html");
        if (live.isFile() && live.length() > 0 && live.length() <= MAX_HTML_BYTES) {
            try (InputStream in = new FileInputStream(live)) {
                return readFully(in, MAX_HTML_BYTES);
            } catch (IOException ignored) {
                /* try the APK seed */
            }
        }
        try (InputStream in = appContext.getAssets().open(DIR_NAME + "/app.html")) {
            return readFully(in, MAX_HTML_BYTES);
        } catch (IOException ignored) {
            return null;
        }
    }

    private void enqueueRefs(String fromRel, String text, ArrayDeque<String> queue, Set<String> saved) {
        Matcher assets = ASSET_REF.matcher(text);
        while (assets.find()) offer(assets.group(1), queue, saved);
        Matcher rels = REL_REF.matcher(text);
        while (rels.find()) {
            String resolved = resolveRel(fromRel, rels.group(1));
            if (resolved != null) offer(resolved, queue, saved);
        }
        Matcher heads = HEAD_REF.matcher(text);
        while (heads.find()) offer(heads.group().substring(1), queue, saved);
    }

    private static void offer(String rel, ArrayDeque<String> queue, Set<String> saved) {
        if (rel.endsWith(".map") || !isShellFile(rel) || saved.contains(rel)) return;
        queue.add(rel);
    }

    /** "./Chunk.js" next to a file in assets/ becomes "assets/Chunk.js". */
    private static String resolveRel(String fromRel, String spec) {
        if (spec == null || !spec.startsWith("./") || spec.contains("..")) return null;
        int slash = fromRel.lastIndexOf('/');
        String dir = slash >= 0 ? fromRel.substring(0, slash + 1) : "";
        return dir + spec.substring(2);
    }

    private void swapIn(File next) throws IOException {
        File root = appContext.getFilesDir();
        File current = new File(root, DIR_NAME);
        File prev = new File(root, PREV_NAME);
        deleteRecursive(prev);
        if (current.exists() && !current.renameTo(prev)) {
            throw new IOException("could not move current appshell aside");
        }
        if (!next.renameTo(current)) {
            if (prev.exists() && !prev.renameTo(current)) {
                Log.w(TAG, "appshell rollback rename failed");
            }
            throw new IOException("could not activate new appshell");
        }
        deleteRecursive(prev);
    }

    private static void writeRel(File root, String rel, byte[] bytes) throws IOException {
        File out = new File(root, rel);
        File parent = out.getParentFile();
        if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
            throw new IOException("could not create " + parent);
        }
        try (FileOutputStream fos = new FileOutputStream(out)) {
            fos.write(bytes);
        }
    }

    private static byte[] httpGet(String path, int maxBytes) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(ORIGIN + path).openConnection();
        conn.setConnectTimeout(8_000);
        conn.setReadTimeout(20_000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", UA);
        conn.setRequestProperty("Accept", "*/*");
        int code = conn.getResponseCode();
        try {
            if (code != 200) throw new IOException("HTTP " + code + " for " + path);
            try (InputStream in = conn.getInputStream()) {
                return readFully(in, maxBytes);
            }
        } finally {
            conn.disconnect();
        }
    }

    private static byte[] readFully(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16_384];
        int n;
        int total = 0;
        while ((n = in.read(buf)) >= 0) {
            total += n;
            if (total > maxBytes) throw new IOException("response larger than " + maxBytes);
            out.write(buf, 0, n);
        }
        return out.toByteArray();
    }

    private static String sha256(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder sb = new StringBuilder(digest.length * 2);
        for (byte b : digest) {
            sb.append(Character.forDigit((b >> 4) & 0xF, 16));
            sb.append(Character.forDigit(b & 0xF, 16));
        }
        return sb.toString();
    }

    private static boolean isPortalDocument(String path) {
        String p = path;
        if (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        if (p.equals("/app.html")) return true;
        int dot = p.lastIndexOf('.');
        int slash = p.lastIndexOf('/');
        if (dot > slash) return false;
        return p.equals("/technician")
            || p.startsWith("/technician/")
            || p.equals("/admin")
            || p.startsWith("/admin/")
            || p.equals("/settings")
            || p.startsWith("/settings/");
    }

    private static boolean isShellFile(String rel) {
        if (rel.equals("app.html")) return true;
        if (rel.startsWith("assets/") && rel.matches("assets/[A-Za-z0-9._~-]+") && !rel.endsWith(".map")) {
            return true;
        }
        return rel.matches("head-[a-z0-9-]+\\.js");
    }

    private static boolean isText(String rel) {
        return rel.endsWith(".html")
            || rel.endsWith(".js")
            || rel.endsWith(".mjs")
            || rel.endsWith(".css")
            || rel.endsWith(".json")
            || rel.endsWith(".svg");
    }

    private static String mimeFor(String rel) {
        if (rel.endsWith(".js") || rel.endsWith(".mjs")) return "application/javascript";
        if (rel.endsWith(".css")) return "text/css";
        if (rel.endsWith(".html")) return "text/html";
        if (rel.endsWith(".json")) return "application/json";
        if (rel.endsWith(".svg")) return "image/svg+xml";
        if (rel.endsWith(".png")) return "image/png";
        if (rel.endsWith(".jpg") || rel.endsWith(".jpeg")) return "image/jpeg";
        if (rel.endsWith(".webp")) return "image/webp";
        if (rel.endsWith(".gif")) return "image/gif";
        if (rel.endsWith(".woff2")) return "font/woff2";
        if (rel.endsWith(".woff")) return "font/woff";
        if (rel.endsWith(".ttf")) return "font/ttf";
        if (rel.endsWith(".wasm")) return "application/wasm";
        if (rel.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] kids = file.listFiles();
            if (kids != null) {
                for (File kid : kids) deleteRecursive(kid);
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }
}

final class ShellCachingWebViewClient extends BridgeWebViewClient {
    private final AppShellCache cache;

    ShellCachingWebViewClient(Bridge bridge, AppShellCache cache) {
        super(bridge);
        this.cache = cache;
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
            WebResourceResponse hit = cache.serve(request);
            if (hit != null) return hit;
        } catch (Throwable t) {
            Log.w("HRO-Shell", "appshell serve failed", t);
        }
        return super.shouldInterceptRequest(view, request);
    }
}

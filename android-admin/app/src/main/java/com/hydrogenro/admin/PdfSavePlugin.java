package com.hydrogenro.admin;

import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Write a file into the public Downloads folder (PDF, images, etc.).
 * Android 10+ uses MediaStore (no storage permission). Older APIs write the
 * legacy public Downloads directory.
 */
@CapacitorPlugin(name = "PdfSave")
public class PdfSavePlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType");
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("filename_required");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("data_required");
            return;
        }

        String resolvedMime = (mimeType != null && !mimeType.trim().isEmpty())
            ? mimeType.trim()
            : "application/octet-stream";
        String safeName = sanitizeFilename(filename.trim(), resolvedMime);
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("invalid_base64");
            return;
        }
        if (bytes.length == 0) {
            call.reject("empty_file");
            return;
        }

        try {
            String savedPath;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                savedPath = saveViaMediaStore(safeName, bytes, resolvedMime);
            } else {
                savedPath = saveViaLegacyDownloads(safeName, bytes, resolvedMime);
            }

            JSObject result = new JSObject();
            result.put("path", savedPath != null ? savedPath : safeName);
            result.put("filename", safeName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "save_failed");
        }
    }

    /**
     * Hand the file to a real viewer app. The WebView cannot render PDFs, so
     * `window.open` there leaves the user staring at a stuck "Opening…".
     */
    @PluginMethod
    public void openFile(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        String mimeType = call.getString("mimeType");
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("filename_required");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("data_required");
            return;
        }

        String resolvedMime = (mimeType != null && !mimeType.trim().isEmpty())
            ? mimeType.trim()
            : "application/octet-stream";
        String safeName = sanitizeFilename(filename.trim(), resolvedMime);
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("invalid_base64");
            return;
        }
        if (bytes.length == 0) {
            call.reject("empty_file");
            return;
        }

        try {
            File dir = new File(getContext().getCacheDir(), "shared");
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("cache_dir_failed");
                return;
            }
            File file = new File(dir, safeName);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(bytes);
                out.flush();
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );

            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(uri, resolvedMime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(view, "Open with");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            try {
                getContext().startActivity(chooser);
            } catch (ActivityNotFoundException e) {
                call.reject("no_viewer_app");
                return;
            }

            JSObject result = new JSObject();
            result.put("opened", true);
            result.put("filename", safeName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "open_failed");
        }
    }

    private String saveViaMediaStore(String safeName, byte[] bytes, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri collection = MediaStore.Downloads.EXTERNAL_CONTENT_URI;
        Uri item = resolver.insert(collection, values);
        if (item == null) {
            throw new Exception("downloads_insert_failed");
        }

        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) {
                throw new Exception("downloads_open_failed");
            }
            out.write(bytes);
            out.flush();
        }

        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(item, values, null, null);
        return Environment.DIRECTORY_DOWNLOADS + "/" + safeName;
    }

    private String saveViaLegacyDownloads(String safeName, byte[] bytes, String mimeType) throws Exception {
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (dir == null) {
            throw new Exception("downloads_dir_missing");
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new Exception("downloads_dir_create_failed");
        }

        File file = new File(dir, safeName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
            out.flush();
        }

        MediaScannerConnection.scanFile(
            getContext(),
            new String[] { file.getAbsolutePath() },
            new String[] { mimeType },
            null
        );
        return file.getAbsolutePath();
    }

    private static String sanitizeFilename(String raw, String mimeType) {
        String base = raw.replaceAll("[/\\\\?%*:|\"<>]", "_").replaceAll("\\s+", "_");
        if (base.length() > 180) base = base.substring(0, 180);
        if (!hasFileExtension(base)) {
            String ext = extensionFromMime(mimeType);
            if (ext != null) base = base + "." + ext;
        }
        return base;
    }

    private static boolean hasFileExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 && dot < name.length() - 1;
    }

    private static String extensionFromMime(String mimeType) {
        if (mimeType == null) return null;
        switch (mimeType.toLowerCase()) {
            case "application/pdf":
                return "pdf";
            case "image/jpeg":
            case "image/jpg":
                return "jpg";
            case "image/png":
                return "png";
            case "image/webp":
                return "webp";
            case "image/gif":
                return "gif";
            default:
                if (mimeType.startsWith("image/")) {
                    String sub = mimeType.substring("image/".length());
                    if (!sub.isEmpty()) return sub.split("[+;]")[0];
                }
                return null;
        }
    }
}

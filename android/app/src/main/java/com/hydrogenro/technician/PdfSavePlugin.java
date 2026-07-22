package com.hydrogenro.technician;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * Write a PDF into the public Downloads folder so it appears in Files → Downloads.
 * Android 10+ uses MediaStore (no storage permission). Older APIs write the
 * legacy public Downloads directory.
 */
@CapacitorPlugin(name = "PdfSave")
public class PdfSavePlugin extends Plugin {

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String filename = call.getString("filename");
        String data = call.getString("data");
        if (filename == null || filename.trim().isEmpty()) {
            call.reject("filename_required");
            return;
        }
        if (data == null || data.isEmpty()) {
            call.reject("data_required");
            return;
        }

        String safeName = sanitizeFilename(filename.trim());
        byte[] bytes;
        try {
            bytes = Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            call.reject("invalid_base64");
            return;
        }
        if (bytes.length < 4) {
            call.reject("empty_file");
            return;
        }

        try {
            String savedPath;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                savedPath = saveViaMediaStore(safeName, bytes);
            } else {
                savedPath = saveViaLegacyDownloads(safeName, bytes);
            }

            JSObject result = new JSObject();
            result.put("path", savedPath != null ? savedPath : safeName);
            result.put("filename", safeName);
            call.resolve(result);
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "pdf_save_failed");
        }
    }

    private String saveViaMediaStore(String safeName, byte[] bytes) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, "application/pdf");
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

    private String saveViaLegacyDownloads(String safeName, byte[] bytes) throws Exception {
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
            new String[] { "application/pdf" },
            null
        );
        return file.getAbsolutePath();
    }

    private static String sanitizeFilename(String raw) {
        String base = raw.replaceAll("[/\\\\?%*:|\"<>]", "_").replaceAll("\\s+", "_");
        if (base.length() > 180) base = base.substring(0, 180);
        if (!base.toLowerCase().endsWith(".pdf")) base = base + ".pdf";
        return base;
    }
}

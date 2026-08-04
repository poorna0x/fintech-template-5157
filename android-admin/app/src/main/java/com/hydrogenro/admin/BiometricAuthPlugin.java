package com.hydrogenro.admin;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.Executor;

/**
 * Fingerprint / face / device-PIN unlock for the Admin APK.
 * Web layer calls isAvailable + authenticate; lock state lives in JS.
 */
@CapacitorPlugin(name = "BiometricAuth")
public class BiometricAuthPlugin extends Plugin {

    private static final int AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_WEAK
            | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        Context context = getContext();
        BiometricManager manager = BiometricManager.from(context);
        int status = manager.canAuthenticate(AUTHENTICATORS);
        boolean available = status == BiometricManager.BIOMETRIC_SUCCESS;

        int bioOnly =
            manager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK);
        boolean biometryEnrolled = bioOnly == BiometricManager.BIOMETRIC_SUCCESS;

        JSObject ret = new JSObject();
        ret.put("available", available);
        ret.put("biometryEnrolled", biometryEnrolled);
        ret.put("status", statusToString(status));
        call.resolve(ret);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        String reason = call.getString("reason", "Unlock Hydrogen RO Admin");
        String title = call.getString("title", "Unlock Admin");
        String subtitle = call.getString("subtitle", reason);

        FragmentActivity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not ready");
            return;
        }

        BiometricManager manager = BiometricManager.from(getContext());
        int status = manager.canAuthenticate(AUTHENTICATORS);
        if (status != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject(statusToString(status), statusToString(status));
            return;
        }

        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt =
            new BiometricPrompt(
                activity,
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(
                        @NonNull BiometricPrompt.AuthenticationResult result
                    ) {
                        JSObject ret = new JSObject();
                        ret.put("ok", true);
                        call.resolve(ret);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        // User cancelled — soft fail so UI can stay on lock screen.
                        if (
                            errorCode == BiometricPrompt.ERROR_USER_CANCELED
                                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                                || errorCode == BiometricPrompt.ERROR_CANCELED
                        ) {
                            call.reject("canceled", "canceled");
                            return;
                        }
                        call.reject(String.valueOf(errString), "failed");
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        // Wrong finger — prompt stays open; no reject yet.
                    }
                }
            );

        BiometricPrompt.PromptInfo.Builder builder =
            new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(AUTHENTICATORS);

        // DEVICE_CREDENTIAL cannot be combined with a negative button.
        activity.runOnUiThread(() -> {
            try {
                prompt.authenticate(builder.build());
            } catch (Exception e) {
                call.reject(e.getMessage() != null ? e.getMessage() : "prompt_failed", "failed");
            }
        });
    }

    private static String statusToString(int status) {
        switch (status) {
            case BiometricManager.BIOMETRIC_SUCCESS:
                return "available";
            case BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "no_hardware";
            case BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "hw_unavailable";
            case BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "none_enrolled";
            case BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED:
                return "security_update_required";
            case BiometricManager.BIOMETRIC_ERROR_UNSUPPORTED:
                return "unsupported";
            case BiometricManager.BIOMETRIC_STATUS_UNKNOWN:
                return "unknown";
            default:
                return "unavailable";
        }
    }
}

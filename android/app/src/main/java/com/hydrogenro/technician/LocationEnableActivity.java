package com.hydrogenro.technician;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.WindowManager;
import androidx.core.app.NotificationManagerCompat;
import com.google.android.gms.common.api.ResolvableApiException;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.LocationSettingsRequest;
import com.google.android.gms.location.Priority;
import com.google.android.gms.location.SettingsClient;

/**
 * Invisible window. The only thing the technician sees is Android's own
 * "Turn on location" dialog from Google Play services.
 */
public class LocationEnableActivity extends Activity {

    private static final String TAG = "HroLocationEnable";
    static final String EXTRA_UPLOAD_URL = "uploadUrl";
    static final String EXTRA_TECHNICIAN_ID = "technicianId";
    static final String EXTRA_NONCE = "nonce";
    private static final int REQUEST_ENABLE = 4107;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        NotificationManagerCompat.from(this).cancel(LocationEnablePrompt.NOTIFICATION_ID);

        if (LocationServicesStatus.isEnabled(this)) {
            startFixAndFinish();
            return;
        }

        try {
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
                .build();
            LocationSettingsRequest settings = new LocationSettingsRequest.Builder()
                .addLocationRequest(request)
                .setAlwaysShow(true)
                .build();
            SettingsClient client = LocationServices.getSettingsClient(this);
            client.checkLocationSettings(settings)
                .addOnSuccessListener(unused -> startFixAndFinish())
                .addOnFailureListener(error -> {
                    if (error instanceof ResolvableApiException) {
                        try {
                            ((ResolvableApiException) error).startResolutionForResult(
                                LocationEnableActivity.this,
                                REQUEST_ENABLE
                            );
                            return;
                        } catch (Throwable t) {
                            Log.w(TAG, "System location dialog failed", t);
                        }
                    }
                    finish();
                });
        } catch (Throwable t) {
            Log.w(TAG, "Location settings check failed", t);
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_ENABLE && resultCode == RESULT_OK) {
            startFixAndFinish();
            return;
        }
        finish();
    }

    private void startFixAndFinish() {
        Intent intent = getIntent();
        String uploadUrl = intent != null ? intent.getStringExtra(EXTRA_UPLOAD_URL) : null;
        String technicianId = intent != null ? intent.getStringExtra(EXTRA_TECHNICIAN_ID) : null;
        String nonce = intent != null ? intent.getStringExtra(EXTRA_NONCE) : null;
        if (uploadUrl != null && technicianId != null && nonce != null) {
            try {
                LocationFixService.start(this, uploadUrl, technicianId, nonce);
            } catch (Throwable t) {
                Log.w(TAG, "Fix after enabling location failed", t);
            }
        }
        finish();
    }
}

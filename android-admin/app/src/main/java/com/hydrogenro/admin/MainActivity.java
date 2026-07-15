package com.hydrogenro.admin;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Custom-sound channel must exist before any push arrives.
        NotificationChannels.ensureJobAlerts(this);
    }
}

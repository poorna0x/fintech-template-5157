package com.hydrogenro.technician;

import android.app.Application;

/**
 * Runs before any activity, service or receiver in the process, which is the
 * only place a crash handler can catch crashes in the FCM service and the
 * call/location background paths — not just the webview activity.
 */
public class HroApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        CrashReporter.install(this);
        // Ships whatever the previous (crashed) process left behind.
        CrashReporter.uploadPendingAsync(this);
        // Retry any dismiss/open acks that failed while offline.
        TechPushAckReceiver.flushPendingAsync(this);
    }
}

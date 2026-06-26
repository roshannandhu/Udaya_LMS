package com.udayalearn.lms;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.BridgeActivity;
import com.udayalearn.lms.plugins.SecureScreenPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge starts
        registerPlugin(SecureScreenPlugin.class);
        super.onCreate(savedInstanceState);
        // FLAG_SECURE starts OFF — enabled/disabled per role from JavaScript
        NotificationChannels.ensure(this);
        handleNavigate(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNavigate(intent);
    }

    /** A live-class alarm (or notification tap) can ask the app to open a specific
     *  in-app route. Defer briefly so the web view is ready, then drive the SPA. */
    private void handleNavigate(Intent intent) {
        if (intent == null) return;
        final String path = intent.getStringExtra("udaya_navigate");
        if (path == null || path.isEmpty()) return;
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "window.location.assign('" + path + "')", null);
                }
            } catch (Exception ignored) {}
        }, 1200);
    }
}

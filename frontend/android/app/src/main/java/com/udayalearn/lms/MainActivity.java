package com.udayalearn.lms;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.udayalearn.lms.plugins.SecureScreenPlugin;

import java.io.File;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge starts
        registerPlugin(SecureScreenPlugin.class);
        registerPlugin(LiveAlarmPlugin.class);
        // BEFORE the WebView loads: on a version change, wipe any stale WebView
        // service-worker + HTTP caches. A persisted SW from a prior build would
        // otherwise serve a cached index.html pointing at old chunk hashes that no
        // longer exist in the new APK → blank white screen on update. localStorage /
        // IndexedDB are preserved so users stay logged in.
        clearStaleWebViewCachesOnUpgrade();
        super.onCreate(savedInstanceState);
        
        // Request Camera and microphone permission upfront, but delay it to avoid startup crash
        new Handler(Looper.getMainLooper()).postDelayed(this::requestCameraAndAudioPermissions, 2000);

        // FLAG_SECURE is ON for EVERYONE, always (like Google Pay) — blocks OS
        // screenshots, screen recording, and the recents thumbnail. Set here at
        // launch (not role-based) and the SecureScreen plugin's disable() is a
        // no-op, so nothing can ever turn it off in-app.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE);
        NotificationChannels.ensure(this);
        handleNavigate(getIntent());
    }

    private void requestCameraAndAudioPermissions() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            String[] permissions = {
                android.Manifest.permission.CAMERA,
                android.Manifest.permission.RECORD_AUDIO
            };
            boolean needsRequest = false;
            for (String perm : permissions) {
                if (checkSelfPermission(perm) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    needsRequest = true;
                    break;
                }
            }
            if (needsRequest) {
                requestPermissions(permissions, 1024);
            }
        }
    }

    /** On a versionCode change, delete the WebView's service-worker + cache dirs so a
     *  stale precached app from a previous build can't hijack the first load and blank
     *  the screen. Runs at most once per upgrade (guarded by SharedPreferences). */
    private void clearStaleWebViewCachesOnUpgrade() {
        try {
            int current;
            try {
                current = getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
            } catch (Exception e) {
                current = -1;
            }
            SharedPreferences sp = getSharedPreferences("udaya_app", MODE_PRIVATE);
            int last = sp.getInt("last_version_code", -1);
            if (current == last) return; // already cleared for this version

            File appDir = getFilesDir().getParentFile(); // /data/data/<pkg>
            if (appDir != null) {
                File webview = new File(appDir, "app_webview");
                // Nuke only caches + service workers; KEEP "Local Storage", "IndexedDB",
                // "databases" so the login session and persisted stores survive.
                String[] purge = {"Service Worker", "Cache", "Code Cache", "GPUCache"};
                deleteDirsNamed(webview, purge);
            }
            sp.edit().putInt("last_version_code", current).apply();
        } catch (Exception ignored) {
            // Never let cache cleanup crash app startup.
        }
    }

    /** Recursively delete every directory whose name matches one of `names`, skipping
     *  storage dirs we must preserve. */
    private void deleteDirsNamed(File root, String[] names) {
        if (root == null || !root.isDirectory()) return;
        File[] children = root.listFiles();
        if (children == null) return;
        for (File child : children) {
            if (!child.isDirectory()) continue;
            String n = child.getName();
            if (n.equals("Local Storage") || n.equals("IndexedDB") || n.equals("databases")) {
                continue; // preserve login + persisted app state
            }
            boolean match = false;
            for (String target : names) {
                if (n.equals(target)) { match = true; break; }
            }
            if (match) {
                deleteRecursive(child);
            } else {
                deleteDirsNamed(child, names); // descend (e.g. app_webview/Default/...)
            }
        }
    }

    private void deleteRecursive(File f) {
        if (f == null || !f.exists()) return;
        if (f.isDirectory()) {
            File[] kids = f.listFiles();
            if (kids != null) for (File k : kids) deleteRecursive(k);
        }
        // best-effort; ignore failures
        f.delete();
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

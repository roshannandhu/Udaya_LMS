package com.udayalearn.lms.plugins;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecureScreen")
public class SecureScreenPlugin extends Plugin {

    /** Call from JS when a student logs in — blocks all screenshots & recordings */
    @PluginMethod
    public void enable(PluginCall call) {
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE
            )
        );
        call.resolve();
    }

    /** No-op by design. Screenshots are blocked for EVERYONE, always (set natively
     *  in MainActivity.onCreate), so the flag must never be cleared — not even by
     *  the legacy teacher-role disable() calls in App.jsx/auth.js. Kept (resolving
     *  successfully) only so those existing JS calls don't error. */
    @PluginMethod
    public void disable(PluginCall call) {
        call.resolve();
    }
}

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

    /** Call from JS when a teacher logs in or any user logs out — removes restriction */
    @PluginMethod
    public void disable(PluginCall call) {
        getActivity().runOnUiThread(() ->
            getActivity().getWindow().clearFlags(
                WindowManager.LayoutParams.FLAG_SECURE
            )
        );
        call.resolve();
    }
}

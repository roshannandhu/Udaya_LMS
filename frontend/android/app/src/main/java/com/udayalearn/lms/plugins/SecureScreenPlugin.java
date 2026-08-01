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
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (getActivity() != null && getActivity().getWindow() != null) {
                getActivity().getWindow().setFlags(
                    WindowManager.LayoutParams.FLAG_SECURE,
                    WindowManager.LayoutParams.FLAG_SECURE
                );
            }
        });
        call.resolve();
    }

    /** Clears FLAG_SECURE — called when the admin policy allows screenshots for this role. */
    @PluginMethod
    public void disable(PluginCall call) {
        if (getActivity() == null) {
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (getActivity() != null && getActivity().getWindow() != null) {
                getActivity().getWindow().clearFlags(
                    WindowManager.LayoutParams.FLAG_SECURE
                );
            }
        });
        call.resolve();
    }
}

package com.tutoria.lms;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.tutoria.lms.plugins.SecureScreenPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge starts
        registerPlugin(SecureScreenPlugin.class);
        super.onCreate(savedInstanceState);
        // FLAG_SECURE starts OFF — enabled/disabled per role from JavaScript
    }
}

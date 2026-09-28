package com.modosabor.rider;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean appInForeground = false;

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(RiderSecureStorePlugin.class);
        registerPlugin(RiderAlertPlugin.class);
        registerPlugin(RiderBiometricPlugin.class);
        registerPlugin(RiderUpdaterPlugin.class);
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;
    }

    @Override
    public void onPause() {
        appInForeground = false;
        super.onPause();
    }

    public static boolean isAppInForeground() {
        return appInForeground;
    }
}

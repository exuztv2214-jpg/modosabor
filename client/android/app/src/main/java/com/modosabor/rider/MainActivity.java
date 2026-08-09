package com.modosabor.rider;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(RiderSecureStorePlugin.class);
    }
}

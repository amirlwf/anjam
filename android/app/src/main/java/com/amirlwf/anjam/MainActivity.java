package com.amirlwf.anjam;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom Capacitor plugins are NOT auto-registered — without this every
        // AlarmBridge call rejects with "Plugin is not implemented" and no alarm
        // is ever scheduled on the device.
        registerPlugin(AlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

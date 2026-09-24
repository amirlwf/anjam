package com.amirlwf.anjam;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** AlarmManager entries do not survive a reboot or an app update —
 *  re-arm every saved alarm as soon as the system allows. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || "android.intent.action.QUICKBOOT_POWERON".equals(action)) {
            try {
                AlarmScheduler.restoreAll(ctx);
            } catch (Throwable ignored) {
            }
        }
    }
}

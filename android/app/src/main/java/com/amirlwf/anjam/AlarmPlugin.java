package com.amirlwf.anjam;

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** JS bridge: schedule/cancel the exact countdown alarm. */
@CapacitorPlugin(name = "AlarmBridge")
public class AlarmPlugin extends Plugin {

    @PluginMethod
    public void schedule(PluginCall call) {
        Long at = call.getLong("at");
        if (at == null) {
            call.reject("missing 'at'");
            return;
        }
        String title = call.getString("title", "Anjam");
        String body = call.getString("body", "Time is up!");
        String dismiss = call.getString("dismiss", "Dismiss");
        String snooze = call.getString("snooze", "Snooze +5 min");
        int req = call.getData().optInt("req", AlarmScheduler.REQUEST_CODE);
        JSObject ret = new JSObject();
        try {
            AlarmScheduler.schedule(getContext(), req, at, title, body, dismiss, snooze);
            ret.put("ok", true);
        } catch (Throwable t) {
            ret.put("ok", false);
            ret.put("reason", String.valueOf(t.getMessage()));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        int req = call.getData().optInt("req", AlarmScheduler.REQUEST_CODE);
        try {
            AlarmScheduler.cancel(getContext(), req);
        } catch (Throwable ignored) {
        }
        call.resolve();
    }

    /** Diagnostics for Settings: can we notify / ring exactly / show full-screen? */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            boolean notif;
            if (Build.VERSION.SDK_INT >= 24) {
                android.app.NotificationManager nm = (android.app.NotificationManager)
                        getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                notif = nm != null && nm.areNotificationsEnabled();
            } else {
                notif = true;
            }
            boolean exact = true;
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
                exact = am != null && am.canScheduleExactAlarms();
            }
            boolean fsi = true;
            if (Build.VERSION.SDK_INT >= 34) {
                fsi = NotificationManagerCompat.from(getContext()).canUseFullScreenIntent();
            }
            ret.put("ok", true);
            ret.put("notif", notif);
            ret.put("exact", exact);
            ret.put("fsi", fsi);
            ret.put("sdk", Build.VERSION.SDK_INT);
        } catch (Throwable t) {
            ret.put("ok", false);
            ret.put("reason", String.valueOf(t.getMessage()));
        }
        call.resolve(ret);
    }

    /** Open the system screen where the user grants exact-alarm access. */
    @PluginMethod
    public void requestExact(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
                if (am != null && !am.canScheduleExactAlarms()) {
                    Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                    i.setData(Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                }
            }
        } catch (Throwable ignored) {
        }
        call.resolve();
    }

    /** Open the system screen for full-screen intents (Android 14+). */
    @PluginMethod
    public void openFsiSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                i.setData(Uri.parse("package:" + getContext().getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            }
        } catch (Throwable ignored) {
        }
        call.resolve();
    }

    /** Test ring straight to AlarmActivity — proves the whole core end to end. */
    @PluginMethod
    public void testRing(PluginCall call) {
        long delay = call.getData().optLong("delayMs", 10000L);
        String title = call.getString("title", "Anjam");
        String body = call.getString("body", "Alarm test");
        String dismiss = call.getString("dismiss", "Dismiss");
        String snooze = call.getString("snooze", "Snooze +5 min");
        JSObject ret = new JSObject();
        try {
            AlarmScheduler.schedule(getContext(), 7116,
                    System.currentTimeMillis() + Math.max(1500L, delay),
                    title, body, dismiss, snooze);
            ret.put("ok", true);
        } catch (Throwable t) {
            ret.put("ok", false);
            ret.put("reason", String.valueOf(t.getMessage()));
        }
        call.resolve(ret);
    }
}

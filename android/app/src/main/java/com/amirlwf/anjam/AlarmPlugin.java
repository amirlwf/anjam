package com.amirlwf.anjam;

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
        JSObject ret = new JSObject();
        try {
            AlarmScheduler.schedule(getContext(), at, title, body, dismiss, snooze);
            ret.put("ok", true);
        } catch (Throwable t) {
            ret.put("ok", false);
            ret.put("reason", String.valueOf(t.getMessage()));
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        try {
            AlarmScheduler.cancel(getContext());
        } catch (Throwable ignored) {
        }
        call.resolve();
    }
}

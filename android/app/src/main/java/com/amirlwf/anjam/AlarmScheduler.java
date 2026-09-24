package com.amirlwf.anjam;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;

/** Exact alarm scheduling via AlarmManager.setAlarmClock (fires in Doze,
 *  shows as a system alarm — the strongest trigger Android offers). */
public final class AlarmScheduler {
    public static final String EXTRA_AT = "at";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    public static final String EXTRA_DISMISS = "dismiss";
    public static final String EXTRA_SNOOZE = "snooze";
    public static final int REQUEST_CODE = 7117;

    private AlarmScheduler() {}

    private static PendingIntent receiverIntent(Context ctx) {
        Intent i = new Intent(ctx, AlarmReceiver.class);
        return PendingIntent.getBroadcast(
                ctx, REQUEST_CODE, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    public static void schedule(Context ctx, long at, String title, String body,
                                String dismiss, String snooze) {
        schedule(ctx, REQUEST_CODE, at, title, body, dismiss, snooze);
    }

    /** req = distinct request code so many task alarms can coexist. */
    public static void schedule(Context ctx, int req, long at, String title, String body,
                                String dismiss, String snooze) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) throw new AlarmUnavailableException("AlarmManager missing");
        Intent i = new Intent(ctx, AlarmReceiver.class);
        i.putExtra("req", req);
        i.putExtra(EXTRA_AT, at);
        i.putExtra(EXTRA_TITLE, title);
        i.putExtra(EXTRA_BODY, body);
        i.putExtra(EXTRA_DISMISS, dismiss);
        i.putExtra(EXTRA_SNOOZE, snooze);
        PendingIntent pi = PendingIntent.getBroadcast(
                ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long trigger = Math.max(at, System.currentTimeMillis() + 100);
        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(trigger, pi);
        am.setAlarmClock(info, pi);
        persistEntry(ctx, req, at, title, body, dismiss, snooze);
    }

    public static void cancel(Context ctx) {
        cancel(ctx, REQUEST_CODE);
    }

    public static void cancel(Context ctx, int req) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(ctx, AlarmReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(
                ctx, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        pi.cancel();
        forgetEntry(ctx, req);
    }

    /* ---- saved schedule: AlarmManager forgets everything on reboot/update,
            so each registration is mirrored to prefs and re-armed by
            BootReceiver the moment the device comes back up. ---- */
    private static final String PREFS = "anjam.alarms";
    private static final String PREF_KEY = "schedule";
    private static final long MISSED_WINDOW_MS = 2L * 60 * 60 * 1000;

    private static JSONArray readArr(SharedPreferences sp) {
        try {
            String s = sp.getString(PREF_KEY, null);
            if (s != null) return new JSONArray(s);
        } catch (Throwable ignored) {
        }
        return new JSONArray();
    }

    private static void persistEntry(Context ctx, int req, long at, String title, String body,
                                     String dismiss, String snooze) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = readArr(sp);
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null && o.optInt("req", Integer.MIN_VALUE) != req) out.put(o);
            }
            JSONObject o = new JSONObject();
            o.put("req", req);
            o.put("at", at);
            o.put("title", title);
            o.put("body", body);
            o.put("dismiss", dismiss);
            o.put("snooze", snooze);
            out.put(o);
            JSONArray capped = new JSONArray();
            for (int i = Math.max(0, out.length() - 100); i < out.length(); i++) capped.put(out.opt(i));
            sp.edit().putString(PREF_KEY, capped.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    private static void forgetEntry(Context ctx, int req) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = readArr(sp);
            JSONArray out = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null && o.optInt("req", Integer.MIN_VALUE) != req) out.put(o);
            }
            sp.edit().putString(PREF_KEY, out.toString()).apply();
        } catch (Throwable ignored) {
        }
    }

    /** Re-arm every saved alarm after reboot / app update. Entries missed by
     *  less than 2h ring almost immediately, older ones are dropped. */
    public static void restoreAll(Context ctx) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray arr = readArr(sp);
            long now = System.currentTimeMillis();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                long at = o.optLong("at", 0L);
                if (at <= now) {
                    if (now - at > MISSED_WINDOW_MS) continue;
                    at = now + 1500;
                    o.put("at", at);
                }
                try {
                    schedule(ctx, o.optInt("req", REQUEST_CODE), at,
                            o.optString("title", "Anjam"),
                            o.optString("body", ""),
                            o.optString("dismiss", "Dismiss"),
                            o.optString("snooze", "Snooze +5 min"));
                } catch (Throwable ignored) {
                }
            }
        } catch (Throwable ignored) {
        }
    }

    static final class AlarmUnavailableException extends RuntimeException {
        AlarmUnavailableException(String msg) { super(msg); }
    }
}

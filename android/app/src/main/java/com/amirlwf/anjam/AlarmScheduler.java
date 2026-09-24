package com.amirlwf.anjam;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

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
    }

    static final class AlarmUnavailableException extends RuntimeException {
        AlarmUnavailableException(String msg) { super(msg); }
    }
}

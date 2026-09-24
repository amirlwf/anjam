package com.amirlwf.anjam;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Fires when the exact alarm triggers: posts a full-screen notification so the
 *  system launches AlarmActivity even with the screen off / device locked. */
public class AlarmReceiver extends BroadcastReceiver {
    static final String CHANNEL_ID = "anjam-alarm";
    static final int NOTI_ID = 2002;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE);
        String body = intent.getStringExtra(AlarmScheduler.EXTRA_BODY);
        String dismiss = intent.getStringExtra(AlarmScheduler.EXTRA_DISMISS);
        String snooze = intent.getStringExtra(AlarmScheduler.EXTRA_SNOOZE);
        long at = intent.getLongExtra(AlarmScheduler.EXTRA_AT, System.currentTimeMillis());
        if (title == null) title = "Anjam";
        if (body == null) body = "Time is up!";
        if (dismiss == null) dismiss = "Dismiss";
        if (snooze == null) snooze = "Snooze +5 min";

        Intent act = new Intent(ctx, AlarmActivity.class);
        act.putExtra(AlarmScheduler.EXTRA_AT, at);
        act.putExtra(AlarmScheduler.EXTRA_TITLE, title);
        act.putExtra(AlarmScheduler.EXTRA_BODY, body);
        act.putExtra(AlarmScheduler.EXTRA_DISMISS, dismiss);
        act.putExtra(AlarmScheduler.EXTRA_SNOOZE, snooze);
        act.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent fullPi = PendingIntent.getActivity(
                ctx, 1001, act, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Alarm", NotificationManager.IMPORTANCE_HIGH);
            ch.setBypassDnd(true);
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 500, 500, 500});
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            b = new Notification.Builder(ctx, CHANNEL_ID);
        } else {
            b = new Notification.Builder(ctx);
            b.setPriority(Notification.PRIORITY_MAX);
        }
        Notification n = b
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(fullPi)
                .setFullScreenIntent(fullPi, true)
                .build();
        try {
            nm.notify(NOTI_ID, n);
        } catch (SecurityException ignored) {
            // notification permission denied — full-screen launch may still work
        }

        // Best effort for Android < 10 (background activity start): launch directly.
        try {
            ctx.startActivity(act);
        } catch (Throwable ignored) {
            // On Android 10+ the full-screen intent above owns the launch.
        }
    }
}

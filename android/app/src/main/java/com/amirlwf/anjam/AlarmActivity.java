package com.amirlwf.anjam;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Full-screen alarm UI: shows over the lock screen, turns the screen on and
 *  rings the system alarm tone (looping) + repeating vibration until the user
 *  dismisses or snoozes — like the phone's own clock app. */
public class AlarmActivity extends Activity {
    private MediaPlayer player;
    private Vibrator vibrator;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String title = str(getIntent().getStringExtra(AlarmScheduler.EXTRA_TITLE), "Anjam");
        String body = str(getIntent().getStringExtra(AlarmScheduler.EXTRA_BODY), "Time is up!");
        String dismiss = str(getIntent().getStringExtra(AlarmScheduler.EXTRA_DISMISS), "Dismiss");
        String snooze = str(getIntent().getStringExtra(AlarmScheduler.EXTRA_SNOOZE), "Snooze +5 min");

        buildUi(title, body, dismiss, snooze);
        startRinging();
    }

    private static String str(String v, String def) {
        return v == null ? def : v;
    }

    private int dp(int n) {
        return Math.round(n * getResources().getDisplayMetrics().density);
    }

    private void buildUi(final String title, final String body,
                         final String dismiss, final String snooze) {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0F1117"));
        root.setPadding(dp(28), dp(24), dp(28), dp(24));

        ImageView logo = new ImageView(this);
        logo.setImageResource(R.mipmap.ic_launcher);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(92), dp(92));
        lp.bottomMargin = dp(22);
        logo.setLayoutParams(lp);
        logo.setClipToOutline(true);
        GradientDrawable logoBg = new GradientDrawable();
        logoBg.setColor(Color.WHITE);
        logoBg.setCornerRadius(dp(22));
        logo.setBackground(logoBg);
        root.addView(logo);

        TextView t = new TextView(this);
        t.setText(title);
        t.setTextColor(Color.WHITE);
        t.setTextSize(26);
        t.setGravity(Gravity.CENTER);
        t.setTypeface(null, android.graphics.Typeface.BOLD);
        root.addView(t);

        TextView b = new TextView(this);
        b.setText(body);
        b.setTextColor(Color.parseColor("#9AA3B8"));
        b.setTextSize(15);
        b.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams bp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        bp.topMargin = dp(8);
        bp.bottomMargin = dp(30);
        b.setLayoutParams(bp);
        root.addView(b);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER);

        TextView snoozeBtn = makeBtn(snooze, Color.parseColor("#232840"), Color.WHITE, true);
        snoozeBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    AlarmScheduler.schedule(getApplicationContext(),
                            System.currentTimeMillis() + 5 * 60 * 1000,
                            title, body, dismiss, snooze);
                } catch (Throwable ignored) {
                }
                finish();
            }
        });
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        sp.rightMargin = dp(12);
        sp.leftMargin = dp(6);
        snoozeBtn.setLayoutParams(sp);
        row.addView(snoozeBtn);

        TextView dismissBtn = makeBtn(dismiss, Color.parseColor("#6366F1"), Color.WHITE, false);
        dismissBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        LinearLayout.LayoutParams dpz = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        dpz.leftMargin = dp(12);
        dpz.rightMargin = dp(6);
        dismissBtn.setLayoutParams(dpz);
        row.addView(dismissBtn);

        root.addView(row);
        setContentView(root);
    }

    private TextView makeBtn(String label, int bg, int fg, boolean outline) {
        TextView btn = new TextView(this);
        btn.setText(label);
        btn.setTextColor(fg);
        btn.setTextSize(15);
        btn.setGravity(Gravity.CENTER);
        btn.setMinWidth(dp(140));
        btn.setMinHeight(dp(52));
        btn.setPadding(dp(22), dp(14), dp(22), dp(14));
        GradientDrawable bgd = new GradientDrawable();
        bgd.setCornerRadius(dp(16));
        if (outline) {
            bgd.setColor(Color.TRANSPARENT);
            bgd.setStroke(dp(2), Color.parseColor("#3A4160"));
        } else {
            bgd.setColor(bg);
        }
        btn.setBackground(bgd);
        btn.setClickable(true);
        btn.setFocusable(true);
        return btn;
    }

    private void startRinging() {
        // make sure the alarm stream is audible (clock-app behaviour)
        try {
            android.media.AudioManager am =
                    (android.media.AudioManager) getSystemService(AUDIO_SERVICE);
            if (am != null) {
                int max = am.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM);
                int cur = am.getStreamVolume(android.media.AudioManager.STREAM_ALARM);
                if (cur < max / 3) {
                    am.setStreamVolume(android.media.AudioManager.STREAM_ALARM, Math.max(max / 3, 1), 0);
                }
            }
        } catch (Throwable ignored) {
        }

        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            player = MediaPlayer.create(this, uri);
            if (player != null) {
                player.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                player.setLooping(true);
                player.start();
            }
        } catch (Throwable ignored) {
        }

        try {
            vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                long[] pattern = {0, 700, 500, 700, 500, 1200};
                if (Build.VERSION.SDK_INT >= 26) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Throwable ignored) {
        }
    }

    private void stopRinging() {
        try {
            if (player != null) {
                player.stop();
                player.release();
            }
        } catch (Throwable ignored) {
        }
        player = null;
        try {
            if (vibrator != null) vibrator.cancel();
        } catch (Throwable ignored) {
        }
        vibrator = null;
    }

    @Override
    protected void onDestroy() {
        stopRinging();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Back = dismiss (same as leaving a clock alarm).
        finish();
    }
}

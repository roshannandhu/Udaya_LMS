package com.udayalearn.lms;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;

import androidx.core.app.NotificationCompat;

import java.util.Map;

/** Full-screen, alarm-style live-class reminder. Raised from a data-only FCM message
 *  via a full-screen-intent notification; on the lock screen (or Android <=13) it
 *  takes over the screen, otherwise it shows as a loud heads-up. Plays a looping
 *  alarm tone until Join or Dismiss (auto-stops after a couple of minutes). */
public class LiveClassAlarmActivity extends Activity {

    public static final String EXTRA_TITLE   = "title";
    public static final String EXTRA_WHEN    = "when";
    public static final String EXTRA_SUBJECT = "subject";

    private static final int ALARM_NOTIF_ID = 2001;
    private static final long AUTO_STOP_MS  = 120_000; // stop ringing after 2 min if ignored

    private MediaPlayer player;
    private final Handler autoStop = new Handler(Looper.getMainLooper());

    /** Build + post the full-screen-intent notification that launches this activity. */
    public static void raiseAlarm(Context ctx, Map<String, String> data) {
        NotificationChannels.ensure(ctx);
        String title   = val(data.get("title"), "Live class");
        String when    = val(data.get("when"), "soon");
        String subject = val(data.get("subject"), "");

        Intent full = new Intent(ctx, LiveClassAlarmActivity.class);
        full.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        full.putExtra(EXTRA_TITLE, title);
        full.putExtra(EXTRA_WHEN, when);
        full.putExtra(EXTRA_SUBJECT, subject);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getActivity(ctx, 1001, full, flags);

        String head = "now".equals(when) ? "Live class starting now" : "Live class starting " + when;
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, NotificationChannels.ALARM)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(head)
            .setContentText(title)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(pi, true)
            .setContentIntent(pi)
            .setAutoCancel(true);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(ALARM_NOTIF_ID, b.build());
    }

    private static String val(String v, String fallback) {
        return (v == null || v.isEmpty()) ? fallback : v;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showWhenLockedAndTurnScreenOn();
        setContentView(R.layout.activity_live_class_alarm);

        Intent it = getIntent();
        String title   = val(it.getStringExtra(EXTRA_TITLE), "Live class");
        String when    = val(it.getStringExtra(EXTRA_WHEN), "soon");
        String subject = it.getStringExtra(EXTRA_SUBJECT);

        ((TextView) findViewById(R.id.alarm_title)).setText(title);
        ((TextView) findViewById(R.id.alarm_when)).setText(
            "now".equals(when) ? "Starting now" : "Starting " + when);
        TextView subjView = findViewById(R.id.alarm_subject);
        if (subject != null && !subject.isEmpty()) subjView.setText(subject);
        else subjView.setVisibility(View.GONE);

        Button join = findViewById(R.id.alarm_join);
        Button dismiss = findViewById(R.id.alarm_dismiss);
        join.setOnClickListener(v -> {
            stopAlarm();
            Intent open = new Intent(this, MainActivity.class);
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            open.putExtra("udaya_navigate", "/student/live-classes");
            startActivity(open);
            finish();
        });
        dismiss.setOnClickListener(v -> { stopAlarm(); finish(); });

        startAlarm();
        autoStop.postDelayed(this::stopAlarm, AUTO_STOP_MS);
    }

    private void showWhenLockedAndTurnScreenOn() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void startAlarm() {
        try {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (sound == null) return;
            player = new MediaPlayer();
            player.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            player.setDataSource(this, sound);
            player.setLooping(true);
            player.prepare();
            player.start();
        } catch (Exception ignored) {}
    }

    private void stopAlarm() {
        autoStop.removeCallbacksAndMessages(null);
        try {
            if (player != null) { player.stop(); player.release(); player = null; }
        } catch (Exception ignored) {}
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(ALARM_NOTIF_ID);
    }

    @Override
    protected void onDestroy() {
        stopAlarm();
        super.onDestroy();
    }
}

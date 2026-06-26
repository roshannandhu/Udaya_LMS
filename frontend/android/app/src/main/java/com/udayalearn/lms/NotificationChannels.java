package com.udayalearn.lms;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

/** Notification channels used by the app. Created early (MainActivity) and again
 *  defensively before posting, since a channel must exist on Android 8+ for a
 *  notification to show. */
public final class NotificationChannels {
    public static final String DEFAULT = "udaya_default";   // normal pushes
    public static final String ALARM   = "udaya_alarm";     // full-screen live-class reminders

    private NotificationChannels() {}

    public static void ensure(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null) return;

        if (nm.getNotificationChannel(DEFAULT) == null) {
            NotificationChannel def = new NotificationChannel(
                DEFAULT, "General", NotificationManager.IMPORTANCE_HIGH);
            def.setDescription("Class updates, replies and reminders");
            def.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(def);
        }

        if (nm.getNotificationChannel(ALARM) == null) {
            NotificationChannel alarm = new NotificationChannel(
                ALARM, "Live class alarms", NotificationManager.IMPORTANCE_HIGH);
            alarm.setDescription("Full-screen reminders before a live class starts");
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (sound != null) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                alarm.setSound(sound, attrs);
            }
            alarm.enableVibration(true);
            alarm.setVibrationPattern(new long[]{0, 600, 400, 600, 400, 600});
            alarm.setBypassDnd(true);
            alarm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(alarm);
        }
    }
}

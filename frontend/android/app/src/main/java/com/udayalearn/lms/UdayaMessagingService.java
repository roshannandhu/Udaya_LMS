package com.udayalearn.lms;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationManager;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Extends the Capacitor push service. Three cases:
 *  - "live_class_reminder" data → full-screen alarm.
 *  - a normal notification message reaching here means the app is in the FOREGROUND
 *    (the system tray handles it when backgrounded). The Capacitor plugin would only
 *    fire a silent JS event, so we post our own notification on the sound-enabled
 *    channel to make foreground pushes audible + visible.
 *  - anything else → let the plugin handle it. */
public class UdayaMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data != null && "live_class_reminder".equals(data.get("kind"))) {
            LiveClassAlarmActivity.raiseAlarm(getApplicationContext(), data);
            return;
        }

        // Title/body from the notification block, falling back to data fields.
        String title = null, body = null;
        RemoteMessage.Notification n = remoteMessage.getNotification();
        if (n != null) { title = n.getTitle(); body = n.getBody(); }
        if (title == null && data != null) title = data.get("title");
        if (body == null && data != null) body = data.get("body");

        if (title != null || body != null) {
            showForegroundNotification(getApplicationContext(),
                title != null ? title : "Udaya",
                body != null ? body : "");
        }

        // Let the plugin fire its JS event too (in-app bell refresh).
        super.onMessageReceived(remoteMessage);
    }

    private void showForegroundNotification(Context ctx, String title, String body) {
        NotificationChannels.ensure(ctx);

        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, NotificationChannels.DEFAULT)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)   // sound + vibrate on pre-O
            .setAutoCancel(true)
            .setContentIntent(pi);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            int id = (int) (System.currentTimeMillis() & 0x7FFFFFFF);
            nm.notify(id, b.build());
        }
    }
}

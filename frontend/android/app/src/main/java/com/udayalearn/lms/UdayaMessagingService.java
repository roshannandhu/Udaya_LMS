package com.udayalearn.lms;

import androidx.annotation.NonNull;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/** Extends the Capacitor push service so normal notifications keep working, but
 *  intercepts the data-only "live_class_reminder" message to raise a full-screen
 *  alarm (handled even when the app is closed). Registered in AndroidManifest in
 *  place of the plugin's own service. */
public class UdayaMessagingService extends MessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data != null && "live_class_reminder".equals(data.get("kind"))) {
            LiveClassAlarmActivity.raiseAlarm(getApplicationContext(), data);
        } else {
            super.onMessageReceived(remoteMessage);
        }
    }
}

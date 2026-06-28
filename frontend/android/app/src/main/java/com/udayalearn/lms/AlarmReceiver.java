package com.udayalearn.lms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.HashMap;
import java.util.Map;

/** Fires when a scheduled live-class alarm goes off → raises the full-screen alarm
 *  (reuses LiveClassAlarmActivity.raiseAlarm, which posts a full-screen-intent
 *  notification so it works from the background and over the lock screen). */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Map<String, String> data = new HashMap<>();
        data.put("title", intent.getStringExtra("title"));
        data.put("subject", intent.getStringExtra("subject"));
        data.put("when", intent.getStringExtra("when"));
        data.put("live_class_id", intent.getStringExtra("live_class_id"));
        try {
            LiveClassAlarmActivity.raiseAlarm(context, data);
        } catch (Exception ignored) {}
    }
}

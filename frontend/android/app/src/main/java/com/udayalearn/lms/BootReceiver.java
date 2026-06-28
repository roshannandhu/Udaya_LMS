package com.udayalearn.lms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;

/** After a reboot, AlarmManager forgets all alarms. Re-arm future live-class alarms from
 *  the schedule we persisted, so reminders survive a restart like real alarm apps. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        if (!action.equals(Intent.ACTION_BOOT_COMPLETED)
                && !action.equals("android.intent.action.QUICKBOOT_POWERON")) return;
        try {
            SharedPreferences sp = context.getSharedPreferences(LiveAlarmPlugin.PREFS, Context.MODE_PRIVATE);
            String json = sp.getString(LiveAlarmPlugin.KEY_SCHEDULE, null);
            if (json == null) return;
            LiveAlarmPlugin.armFromJson(context, new JSONArray(json));
        } catch (Exception ignored) {}
    }
}

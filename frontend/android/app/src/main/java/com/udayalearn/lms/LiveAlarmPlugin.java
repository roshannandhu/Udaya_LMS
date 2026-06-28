package com.udayalearn.lms;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

/** Schedules on-device, Doze-exempt full-screen alarms for upcoming live classes — like a
 *  bus-booking / Google reminder. Independent of push/FCM: fires even when the app is
 *  closed, offline, or in battery saver. Reuses LiveClassAlarmActivity for the UI. */
@CapacitorPlugin(name = "LiveAlarm")
public class LiveAlarmPlugin extends Plugin {

    static final int[] OFFSETS_MIN = {15, 10, 5, 0};
    static final String PREFS = "udaya_live_alarms";
    static final String KEY_SCHEDULE = "schedule_json";

    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray classes = call.getArray("classes", new JSArray());
        try {
            cancelAllInternal(getContext());
            JSONArray persist = new JSONArray();
            for (int i = 0; i < classes.length(); i++) {
                JSONObject c = classes.getJSONObject(i);
                persist.put(c);
            }
            // Persist BEFORE arming so BootReceiver can re-arm after a restart.
            getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY_SCHEDULE, persist.toString()).apply();
            int armed = armFromJson(getContext(), persist);
            JSObject ret = new JSObject();
            ret.put("armed", armed);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("schedule failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        boolean canUse = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34
            NotificationManager nm = getContext().getSystemService(NotificationManager.class);
            if (nm != null) {
                canUse = nm.canUseFullScreenIntent();
            }
        }
        ret.put("granted", canUse);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        cancelAllInternal(getContext());
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().remove(KEY_SCHEDULE).apply();
        call.resolve();
    }

    /** Arm every (class, offset) whose trigger time is still in the future. Returns count. */
    static int armFromJson(Context ctx, JSONArray classes) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return 0;
        long now = System.currentTimeMillis();
        int armed = 0;
        for (int i = 0; i < classes.length(); i++) {
            JSONObject c = classes.optJSONObject(i);
            if (c == null) continue;
            String id = c.optString("id", String.valueOf(i));
            String title = c.optString("title", "Live class");
            String subject = c.optString("subject", "");
            long start = c.optLong("startMillis", 0L);
            if (start <= 0) continue;
            for (int off : OFFSETS_MIN) {
                long triggerAt = start - off * 60_000L;
                if (triggerAt <= now) continue;
                String when = off == 0 ? "now" : "in " + off + " min";
                int reqCode = (id + "_" + off).hashCode();

                Intent intent = new Intent(ctx, AlarmReceiver.class);
                intent.putExtra("title", title);
                intent.putExtra("subject", subject);
                intent.putExtra("when", when);
                intent.putExtra("live_class_id", id);

                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, intent, flags);

                // setAlarmClock: exact + Doze-exempt + no SCHEDULE_EXACT_ALARM grant needed.
                AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAt, pi);
                am.setAlarmClock(info, pi);
                armed++;
            }
        }
        return armed;
    }

    /** Cancel every alarm we could have scheduled from the persisted schedule. */
    static void cancelAllInternal(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String json = sp.getString(KEY_SCHEDULE, null);
        if (json == null) return;
        try {
            JSONArray classes = new JSONArray(json);
            for (int i = 0; i < classes.length(); i++) {
                JSONObject c = classes.optJSONObject(i);
                if (c == null) continue;
                String id = c.optString("id", String.valueOf(i));
                for (int off : OFFSETS_MIN) {
                    int reqCode = (id + "_" + off).hashCode();
                    Intent intent = new Intent(ctx, AlarmReceiver.class);
                    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
                    PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode, intent, flags);
                    am.cancel(pi);
                }
            }
        } catch (Exception ignored) {}
    }
}

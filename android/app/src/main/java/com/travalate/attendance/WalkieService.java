package com.travalate.attendance;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps the app (and so the Walkie-talkie in the page) alive with the screen off or the app in the background.
 * It shows a small "Walkie-talkie is on" notification, holds the microphone permission class Android requires for
 * background audio, and keeps the CPU and Wi-Fi awake. The audio itself is handled by the page.
 */
public class WalkieService extends Service {

    private static final String CHANNEL = "walkie";
    private static final int NOTIFICATION_ID = 7;
    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;

    static void start(Context c) {
        Intent i = new Intent(c, WalkieService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { /* not allowed right now: the page keeps working while the app is open */ }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, WalkieService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            Notification.Builder b;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Walkie-talkie", NotificationManager.IMPORTANCE_LOW));
                b = new Notification.Builder(this, CHANNEL);
            } else {
                b = new Notification.Builder(this);
            }
            Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            Notification n = b.setContentTitle("Walkie-talkie is on")
                    .setContentText("You will hear your team. Tap to open the app.")
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setContentIntent(pi).setOngoing(true).build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, n);
            }
        } catch (Exception e) { // e.g. the microphone permission is not granted yet
            stopSelf();
            return START_NOT_STICKY;
        }
        try {
            if (cpu == null) {
                PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
                cpu = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "travalate:walkie");
                cpu.setReferenceCounted(false);
                cpu.acquire();
            }
            if (wifi == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                wifi = wm.createWifiLock(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF, "travalate:walkie");
                wifi.setReferenceCounted(false);
                wifi.acquire();
            }
        } catch (Exception ignored) { /* the service still runs without the locks */ }
        return START_NOT_STICKY; // if Android ends the app, the page is gone too: it starts again when the app is opened
    }

    @Override
    public void onDestroy() {
        try { if (cpu != null && cpu.isHeld()) cpu.release(); } catch (Exception ignored) { }
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) { }
        cpu = null; wifi = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}

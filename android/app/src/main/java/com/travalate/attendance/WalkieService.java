package com.travalate.attendance;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Keeps the app (and so the Walkie-talkie in the page) alive with the screen off or the app in the background.
 * It shows a small "Walkie-talkie is on" notification, holds the microphone permission class Android requires for
 * background audio, and keeps the CPU and Wi-Fi awake. The audio itself is handled by the page.
 *
 * When the app is swiped away from the recent apps, its screen (and the page in it) is gone. The service then opens its
 * own hidden copy of the page, which is already logged in and joins the Walkie-talkie by itself, so the team can still be
 * heard. Opening the app again removes the hidden copy (MainActivity), and the normal screen takes over.
 */
public class WalkieService extends Service {

    private static final String CHANNEL = "walkie";
    private static final int NOTIFICATION_ID = 7;
    private static WalkieService inst;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private WebView bg;   // the hidden copy of the page, only while the app screen is closed
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

    /** true: keep listening without the app screen (hidden page); false: the app screen is back, remove the hidden page. */
    static void background(final boolean on) {
        final WalkieService s = inst;
        if (s == null) return;
        s.ui.post(new Runnable() { public void run() { if (on) s.bgStart(); else s.bgStop(); } });
    }

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void bgStart() {
        if (bg != null || BuildConfig.APP_URL.isEmpty()) return;
        final WebView w = new WebView(getApplicationContext());
        WebSettings ws = w.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);   // same storage as the app screen: the login is already there
        ws.setDatabaseEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false);   // sound without a tap
        ws.setAllowFileAccess(false);
        ws.setUserAgentString(ws.getUserAgentString() + " AttendanceApp/" + BuildConfig.VERSION_NAME);
        w.addJavascriptInterface(new BgBridge(), "AttendanceApp");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                boolean audio = false;
                for (String r : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) audio = true;
                if (audio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                } else {
                    request.deny();
                }
            }
        });
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (bg == view) { bgStop(); ui.postDelayed(new Runnable() { public void run() { bgStart(); } }, 2000); }
                return true;
            }
        });
        w.onResume();
        w.resumeTimers();
        w.loadUrl(BuildConfig.APP_URL);
        bg = w;
    }

    private void bgStop() {
        WebView w = bg;
        bg = null;
        if (w == null) return;
        try { w.stopLoading(); w.destroy(); } catch (Exception ignored) { }
    }

    /** What the hidden page may call. Only "Walkie-talkie off" matters: the page gave up (e.g. opened on another phone). */
    private class BgBridge {
        @JavascriptInterface
        public void walkieService(final boolean on) {
            if (!on) ui.post(new Runnable() { public void run() { stopSelf(); } });
        }

        @JavascriptInterface
        public String version() { return BuildConfig.VERSION_NAME; }

        @JavascriptInterface
        public void retry() { }

        @JavascriptInterface
        public void checkUpdate() { }
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
        inst = null;
        bgStop();
        try { if (cpu != null && cpu.isHeld()) cpu.release(); } catch (Exception ignored) { }
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception ignored) { }
        cpu = null; wifi = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}

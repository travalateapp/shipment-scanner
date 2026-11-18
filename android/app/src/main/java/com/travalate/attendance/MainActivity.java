package com.travalate.attendance;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.PowerManager;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * The attendance app in a full-screen WebView. The page itself is the hosted web app (GitHub Pages), so
 * changes to the web app reach everyone without a new APK. This class only adds what a browser normally
 * provides: location and camera permissions, picking a photo, saving downloads and printing.
 */
public class MainActivity extends Activity {

    private static final int REQ_LOCATION = 1;
    private static final int REQ_CAMERA = 2;
    private static final int REQ_FILE = 3;
    private static final int REQ_STORAGE = 4;
    private static final int REQ_AUDIO = 5;
    private static final int REQ_NOTIFICATIONS = 6;

    private WebView web;
    private String appHost;

    private GeolocationPermissions.Callback geoCallback;
    private String geoOrigin;
    private PermissionRequest cameraRequest;
    private PermissionRequest audioRequest;
    private boolean walkieOn; // Walkie-talkie running: keep the page alive with the screen off
    private ValueCallback<Uri[]> fileCallback;
    private PendingFile pendingFile;
    private WebView printView; // kept so it is not garbage-collected while printing
    private long lastBackAt; // for "press Back twice to exit"
    private Updater updater;

    private static class PendingFile {
        final byte[] data; final String name; final String mime;
        PendingFile(byte[] data, String name, String mime) { this.data = data; this.name = name; this.mime = mime; }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);
        appHost = Uri.parse(BuildConfig.APP_URL).getHost();
        updater = new Updater(this);
        updater.check(false); // newer APK on GitHub? Ask once, download, open the installer

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true); // the page keeps the login and language in localStorage
        ws.setDatabaseEnabled(true);
        ws.setGeolocationEnabled(true);
        ws.setMediaPlaybackRequiresUserGesture(false); // live camera preview for the selfie
        ws.setAllowFileAccess(false);
        ws.setUserAgentString(ws.getUserAgentString() + " AttendanceApp/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "AttendanceApp");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false); // keep the page running when the screen is off
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String host = u.getHost();
                if (host != null && (host.equals(appHost) || host.endsWith("google.com") || host.endsWith("googleusercontent.com"))) {
                    return false;
                }
                // Anything else (e.g. a Drive link) opens in the phone's browser.
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (has(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    callback.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsCamera = false, wantsAudio = false;
                    for (String r : request.getResources()) {
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsAudio = true;
                    }
                    if (wantsAudio && !wantsCamera) { // Walkie-talkie microphone
                        if (has(Manifest.permission.RECORD_AUDIO)) {
                            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        } else {
                            if (audioRequest != null) audioRequest.deny();
                            audioRequest = request;
                            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
                        }
                        return;
                    }
                    if (!wantsCamera) { request.deny(); return; }
                    if (has(Manifest.permission.CAMERA)) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        cameraRequest = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                // Only used when the live camera is not available: let the user pick / take a photo.
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (BuildConfig.APP_URL.isEmpty()) {
            web.loadData("<h3 style='font-family:sans-serif;padding:24px'>This build has no app link. Build the APK again from GitHub "
                    + "(Actions → Build Android APK → Run workflow) and paste your app link.</h3>", "text/html", "UTF-8");
        } else if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(BuildConfig.APP_URL);
        }
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void showOffline() {
        String html = "<html><body style='font-family:sans-serif;background:#f3f5fa;display:flex;align-items:center;"
                + "justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:24px'>"
                + "<h2>No internet connection</h2><p style='color:#6b7486'>Check your mobile data / Wi-Fi.</p>"
                + "<button style='background:#2f5fe3;color:#fff;border:0;border-radius:12px;padding:14px 28px;font-size:16px' "
                + "onclick='AttendanceApp.retry()'>Try again</button></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_LOCATION && geoCallback != null) {
            geoCallback.invoke(geoOrigin, granted, false);
            geoCallback = null;
        } else if (requestCode == REQ_CAMERA && cameraRequest != null) {
            if (granted) cameraRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            else cameraRequest.deny();
            cameraRequest = null;
        } else if (requestCode == REQ_AUDIO && audioRequest != null) {
            if (granted) audioRequest.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            else audioRequest.deny();
            audioRequest = null;
        } else if (requestCode == REQ_STORAGE && pendingFile != null) {
            PendingFile f = pendingFile;
            pendingFile = null;
            if (granted) writeDownload(f);
            else Toast.makeText(this, "Storage permission is needed to save the file.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /**
     * Back: the page closes a pop-up or returns to the previous screen (appBack() in the page). When there is
     * nothing to go back to, Back must be pressed twice within 2 seconds to leave the app.
     */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return typeof appBack==='function'?appBack():'';}catch(e){return '';}})()", value -> {
            String result = "";
            try { result = new JSONArray("[" + value + "]").optString(0, ""); } catch (Exception ignored) { }
            if ("handled".equals(result)) return;
            if (web.canGoBack()) { web.goBack(); return; }
            long now = SystemClock.elapsedRealtime();
            if (now - lastBackAt < 2000) {
                finish();
            } else {
                lastBackAt = now;
                Toast.makeText(this, result.isEmpty() || "null".equals(result) ? "Press back again to exit" : result,
                        Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        updater.onResume();
    }

    @Override
    protected void onDestroy() {
        WalkieService.stop(this);
        updater.destroy();
        super.onDestroy();
    }

    @Override
    protected void onPause() {
        if (walkieOn) web.resumeTimers(); else web.onPause(); // the Walkie-talkie must keep listening with the screen off
        super.onPause();
    }

    /* ---------------- Walkie-talkie ---------------- */

    /** On: run the foreground service so the page keeps listening with the screen off. Off: stop it. */
    private void setWalkie(boolean on) {
        walkieOn = on;
        if (!on) { WalkieService.stop(this); return; }
        if (Build.VERSION.SDK_INT >= 33 && !has(Manifest.permission.POST_NOTIFICATIONS)) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS); // the notice is only for show
        }
        if (has(Manifest.permission.RECORD_AUDIO)) WalkieService.start(this);
        // Once: ask Android not to put the app to sleep (a system dialog with one Allow button).
        try {
            android.content.SharedPreferences sp = getSharedPreferences("walkie", MODE_PRIVATE);
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !sp.getBoolean("batteryAsked", false)
                    && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                sp.edit().putBoolean("batteryAsked", true).apply();
                startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName())));
            }
        } catch (Exception ignored) { /* not available on this phone */ }
    }

    /* ---------------- Downloads ---------------- */

    private void saveDownload(PendingFile f) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && !has(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
            pendingFile = f;
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
            return;
        }
        writeDownload(f);
    }

    private void writeDownload(PendingFile f) {
        try {
            Uri uri = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, f.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, f.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("no uri");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(f.data); }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                try (OutputStream out = new FileOutputStream(new File(dir, f.name))) { out.write(f.data); }
            }
            Toast.makeText(this, "Saved to Downloads: " + f.name, Toast.LENGTH_LONG).show();
            if (uri != null) {
                Intent open = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, f.mime)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivity(open); } catch (Exception ignored) { /* no app to open it: the file is still saved */ }
            }
        } catch (Exception e) {
            Toast.makeText(this, "Could not save the file: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void shareDownload(byte[] data, String name, String mime, String text) {
        try {
            File f = new File(ShareProvider.dir(this), name);
            try (OutputStream out = new FileOutputStream(f)) { out.write(data); }
            Uri file = ShareProvider.uri(this, name);
            Intent send = new Intent(Intent.ACTION_SEND).setType(mime)
                    .putExtra(Intent.EXTRA_STREAM, file)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            send.setClipData(android.content.ClipData.newRawUri(name, file)); // read permission for the receiving app
            // A caption only when given: next to a document WhatsApp may send the text and drop the file.
            if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
            for (String pkg : new String[]{"com.whatsapp", "com.whatsapp.w4b"}) { // WhatsApp, then WhatsApp Business
                try { startActivity(new Intent(send).setPackage(pkg)); return; } catch (Exception ignored) { }
            }
            startActivity(Intent.createChooser(send, "Share payslip"));
        } catch (Exception e) {
            Toast.makeText(this, "Could not share the payslip: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void printHtml(String html, String jobName) {
        printView = new WebView(this);
        printView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                PrintManager pm = (PrintManager) getSystemService(PRINT_SERVICE);
                pm.print(jobName, view.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
            }
        });
        printView.setVisibility(View.GONE);
        printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    /** Called from the page as window.AttendanceApp.*. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            final PendingFile f = new PendingFile(Base64.decode(base64, Base64.DEFAULT),
                    name.replaceAll("[\\\\/:*?\"<>|]", "_"), mime);
            runOnUiThread(() -> saveDownload(f));
        }

        /** Payslip → WhatsApp (or the share list when WhatsApp is not installed). */
        @JavascriptInterface
        public void shareFile(String base64, String name, String mime, String text) {
            final byte[] data = Base64.decode(base64, Base64.DEFAULT);
            final String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            runOnUiThread(() -> shareDownload(data, safe, mime, text));
        }

        @JavascriptInterface
        public void print(String html, String jobName) {
            runOnUiThread(() -> printHtml(html, jobName));
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> web.loadUrl(BuildConfig.APP_URL));
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        /** Walkie-talkie on/off (page → app): keeps listening with the screen off while on. */
        @JavascriptInterface
        public void walkieService(boolean on) {
            runOnUiThread(() -> setWalkie(on));
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> updater.check(true));
        }
    }
}

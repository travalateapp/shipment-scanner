package com.travalate.planner;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONArray;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * The Blinkit Shipment Planner in a full-screen WebView. The page is the planner's own Index.html, bundled in
 * the APK and served from https://appassets.androidplatform.net/ ; it talks to the Apps Script web app the
 * same way the GitHub Pages copy does (fetch to …/exec). This class only adds what a browser normally
 * provides: choosing files (Inventory, Bulk RO, R.O. PDFs), saving the downloaded Excel files, and Back.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/index.html";
    private static final int REQ_FILE = 1;
    private static final int REQ_STORAGE = 2;

    private WebView web;
    private WebViewAssetLoader assets;
    private ValueCallback<Uri[]> fileCallback;
    private PendingFile pendingFile;
    private long lastBackAt;
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
        updater = new Updater(this);
        updater.check(false); // newer APK on GitHub? Ask once, download, open the installer

        assets = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings ws = web.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true); // login, saved plan and filters live in localStorage
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);
        ws.setUserAgentString(ws.getUserAgentString() + " BlinkitPlanner/" + BuildConfig.VERSION_NAME);
        web.addJavascriptInterface(new Bridge(), "PlannerApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                // Anything else (e.g. a sheet or Drive link) opens in the phone's browser.
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
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                // Any file: Android often doesn't know .xlsx by its type, so the page checks the file itself.
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT).setType("*/*").addCategory(Intent.CATEGORY_OPENABLE);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "Choose file"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(startUrl());
    }

    /** The bundled page, with the Apps Script deployment ID when the build has one (else the page asks once). */
    private String startUrl() {
        String id = BuildConfig.DEPLOYMENT_ID;
        return id.isEmpty() ? START : START + "?id=" + Uri.encode(id);
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void showOffline() {
        String html = "<html><body style='font-family:sans-serif;background:#f4f6fa;display:flex;align-items:center;"
                + "justify-content:center;height:100vh;margin:0'><div style='text-align:center;padding:24px'>"
                + "<h2>No internet connection</h2><p style='color:#64748b'>Check your mobile data / Wi-Fi.</p>"
                + "<button style='background:#0f3460;color:#fff;border:0;border-radius:12px;padding:14px 28px;font-size:16px' "
                + "onclick='PlannerApp.retry()'>Try again</button></div></body></html>";
        web.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_STORAGE && pendingFile != null) {
            PendingFile f = pendingFile;
            pendingFile = null;
            if (granted) writeDownload(f);
            else Toast.makeText(this, "Storage permission is needed to save the file.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null && clip.getItemCount() > 0) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /**
     * Back: the page closes a pop-up or goes back to the Dashboard (appBack() in the page). On the Dashboard,
     * Back must be pressed twice within 2 seconds to leave the app.
     */
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(function(){try{return typeof appBack==='function'?appBack():'';}catch(e){return '';}})()", value -> {
            String result = "";
            try { result = new JSONArray("[" + value + "]").optString(0, ""); } catch (Exception ignored) { }
            if ("handled".equals(result)) return;
            long now = SystemClock.elapsedRealtime();
            if (now - lastBackAt < 2000) {
                finish();
            } else {
                lastBackAt = now;
                Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT).show();
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
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        updater.destroy();
        super.onDestroy();
    }

    /* ---------------- Downloads (Bulk RO files, plan Excel) ---------------- */

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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, f.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, f.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Exception("no uri");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(f.data); }
            } else {
                File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists()) dir.mkdirs();
                try (OutputStream out = new FileOutputStream(new File(dir, f.name))) { out.write(f.data); }
            }
            Toast.makeText(this, "Saved to Downloads: " + f.name, Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Could not save the file: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    /** Called from the page as window.PlannerApp.*. */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String base64, String name, String mime) {
            final PendingFile f = new PendingFile(Base64.decode(base64, Base64.DEFAULT),
                    name.replaceAll("[\\\\/:*?\"<>|]", "_"), mime);
            runOnUiThread(() -> saveDownload(f));
        }

        @JavascriptInterface
        public void retry() {
            runOnUiThread(() -> web.loadUrl(startUrl()));
        }

        @JavascriptInterface
        public String version() {
            return BuildConfig.VERSION_NAME;
        }

        @JavascriptInterface
        public void checkUpdate() {
            runOnUiThread(() -> updater.check(true));
        }
    }
}

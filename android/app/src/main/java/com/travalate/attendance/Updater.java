package com.travalate.attendance;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Keeps the APK up to date without sending a new file to everyone. Every few hours the app asks GitHub for
 * the latest release (built by the "Build Android APK" workflow, tag apk-v1.N where N is the version code).
 * When it is newer, the user is asked once, the APK is downloaded, and Android's install screen opens: the
 * user taps Update. (Android does not let apps from outside the Play Store install updates silently.)
 */
final class Updater {

    private static final long CHECK_EVERY_MS = 6L * 60 * 60 * 1000;
    private static final String APK = "application/vnd.android.package-archive";

    private final Activity activity;
    private String pendingUrl; // waiting for "Install unknown apps" to be allowed
    private long downloadId = -1;
    private BroadcastReceiver receiver;

    Updater(Activity activity) {
        this.activity = activity;
    }

    /** force = check now even if checked recently. */
    void check(boolean force) {
        final String repo = BuildConfig.UPDATE_REPO;
        if (repo.isEmpty()) return;
        final SharedPreferences prefs = activity.getSharedPreferences("updates", Context.MODE_PRIVATE);
        if (!force && System.currentTimeMillis() - prefs.getLong("lastCheck", 0) < CHECK_EVERY_MS) return;
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + repo + "/releases/latest").openConnection();
                c.setConnectTimeout(15000);
                c.setReadTimeout(15000);
                c.setRequestProperty("Accept", "application/vnd.github+json");
                if (c.getResponseCode() != 200) return;
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = r.readLine()) != null) sb.append(line);
                }
                JSONObject rel = new JSONObject(sb.toString());
                prefs.edit().putLong("lastCheck", System.currentTimeMillis()).apply();
                if (versionFromTag(rel.optString("tag_name")) <= BuildConfig.VERSION_CODE) {
                    if (force) activity.runOnUiThread(() -> Toast.makeText(activity, "The app is up to date.", Toast.LENGTH_SHORT).show());
                    return;
                }
                String url = null;
                JSONArray assets = rel.optJSONArray("assets");
                for (int i = 0; assets != null && i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    if (a.optString("name").endsWith(".apk")) { url = a.optString("browser_download_url"); break; }
                }
                if (url == null) return;
                final String u = url, name = rel.optString("name", "A new version");
                activity.runOnUiThread(() -> ask(u, name));
            } catch (Exception ignored) {
                // No internet or GitHub not reachable: try again next time.
            }
        }).start();
    }

    static int versionFromTag(String tag) {
        Matcher m = Pattern.compile("(\\d+)$").matcher(tag == null ? "" : tag);
        return m.find() ? Integer.parseInt(m.group(1)) : 0;
    }

    private void ask(String url, String name) {
        if (activity.isFinishing()) return;
        new AlertDialog.Builder(activity)
                .setTitle("Update available")
                .setMessage(name + " is ready. Update now? It takes a few seconds and you stay logged in.")
                .setPositiveButton("Update", (d, w) -> start(url))
                .setNegativeButton("Later", null)
                .show();
    }

    private void start(String url) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            // One time only: Android needs permission for this app to install its updates.
            pendingUrl = url;
            Toast.makeText(activity, "Allow \"Install unknown apps\" for this app, then come back.", Toast.LENGTH_LONG).show();
            activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            return;
        }
        download(url);
    }

    void onResume() {
        if (pendingUrl == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) return;
        String u = pendingUrl;
        pendingUrl = null;
        download(u);
    }

    private void download(String url) {
        File old = UpdateProvider.file(activity);
        if (old.exists()) old.delete();
        final DownloadManager dm = (DownloadManager) activity.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url))
                .setTitle(activity.getString(R.string.app_name) + " update")
                .setMimeType(APK)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, UpdateProvider.NAME);
        downloadId = dm.enqueue(req);
        Toast.makeText(activity, "Downloading the update…", Toast.LENGTH_SHORT).show();
        if (receiver != null) return;
        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) == downloadId) install(dm, downloadId);
            }
        };
        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= 33) activity.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
        else activity.registerReceiver(receiver, filter);
    }

    private void install(DownloadManager dm, long id) {
        boolean ok = false;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            ok = c != null && c.moveToFirst()
                    && c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL;
        } catch (Exception ignored) { }
        if (!ok) {
            Toast.makeText(activity, "The update could not be downloaded. It will be offered again later.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(UpdateProvider.uri(activity), APK)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(i);
        } catch (Exception e) {
            Toast.makeText(activity, "Could not open the installer: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    void destroy() {
        if (receiver != null) {
            try { activity.unregisterReceiver(receiver); } catch (Exception ignored) { }
            receiver = null;
        }
    }
}

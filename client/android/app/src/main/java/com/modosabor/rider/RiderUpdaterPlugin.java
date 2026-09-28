package com.modosabor.rider;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Descarga APKs con el DownloadManager nativo, incluso si la WebView pasa a segundo plano. */
@CapacitorPlugin(name = "RiderUpdater")
public class RiderUpdaterPlugin extends Plugin {
    @PluginMethod
    public void download(PluginCall call) {
        String rawUrl = call.getString("url", "").trim();
        String fileName = call.getString("fileName", "modosabor-rider-update.apk").trim();
        if (!rawUrl.startsWith("https://")) {
            call.reject("La descarga debe usar HTTPS");
            return;
        }
        if (!fileName.matches("[A-Za-z0-9._-]+\\.apk")) {
            fileName = "modosabor-rider-update.apk";
        }
        try {
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(rawUrl));
            request.setTitle("Actualización Modo Sabor Rider");
            request.setDescription("Descargando la nueva versión…");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(false);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            long id = manager.enqueue(request);
            call.resolve(new com.getcapacitor.JSObject().put("downloadId", id));
        } catch (Exception error) {
            call.reject("No se pudo iniciar la descarga", error);
        }
    }
}

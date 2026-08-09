package com.modosabor.rider;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

/**
 * FCM data-only: Android lo entrega aunque la WebView no esté viva. Así la
 * asignación usa el sonido y la voz nativos, en lugar de depender de JS.
 */
public class RiderFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "rider-orders-v2";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        if (!"pedido_asignado".equals(data.get("type"))) return;

        String title = safe(data.get("title"), "Nuevo pedido asignado");
        String body = safe(data.get("body"), "Tenés un pedido nuevo para revisar.");

        // Con la app visible, React muestra su tarjeta y pide el anuncio por
        // el plugin. En background el servicio queda a cargo de ambos.
        if (!MainActivity.isAppInForeground()) {
            showNotification(title, body, data.get("pedidoId"));
            RiderAlertVoice.speak(this, "Nuevo pedido asignado. Revisá la aplicación.");
        }
    }

    private String safe(String value, String fallback) {
        String clean = value == null ? "" : value.trim();
        return clean.isEmpty() ? fallback : clean;
    }

    private void showNotification(String title, String body, String pedidoId) {
        createChannel();
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent action = PendingIntent.getActivity(
            this,
            Math.max(1, parseId(pedidoId)),
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(action)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE);

        NotificationManagerCompat.from(this).notify(Math.max(1, parseId(pedidoId)), notification.build());
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .build();
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Pedidos del rider",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Avisos sonoros de pedidos asignados");
        channel.enableVibration(true);
        channel.setSound(sound, attributes);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private int parseId(String value) {
        try {
            return Integer.parseInt(value == null ? "0" : value.replaceAll("\\D", ""));
        } catch (Exception ignored) {
            return 1;
        }
    }
}

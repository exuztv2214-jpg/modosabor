package com.modosabor.rider;

import android.content.Context;
import android.speech.tts.TextToSpeech;

import java.util.Locale;

/** Un único motor de voz para UI, Socket.IO y FCM en segundo plano. */
public final class RiderAlertVoice {
    private static TextToSpeech engine;
    private static boolean ready = false;
    private static String pendingText = "";

    private RiderAlertVoice() {}

    public static synchronized void speak(Context context, String text) {
        if (text == null || text.trim().isEmpty()) return;
        pendingText = text.trim();
        if (engine == null) {
            Context appContext = context.getApplicationContext();
            engine = new TextToSpeech(appContext, status -> {
                synchronized (RiderAlertVoice.class) {
                    ready = status == TextToSpeech.SUCCESS;
                    if (!ready) return;
                    engine.setLanguage(new Locale("es", "AR"));
                    engine.setSpeechRate(1.0f);
                    engine.speak(pendingText, TextToSpeech.QUEUE_FLUSH, null, "rider-order");
                }
            });
            return;
        }
        if (ready) engine.speak(pendingText, TextToSpeech.QUEUE_FLUSH, null, "rider-order");
    }
}

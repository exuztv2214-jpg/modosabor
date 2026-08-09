package com.modosabor.rider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Expone el TTS de Android al Rider sin depender de Web Speech/WebView. */
@CapacitorPlugin(name = "RiderAlert")
public class RiderAlertPlugin extends Plugin {
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.reject("Texto requerido");
            return;
        }
        RiderAlertVoice.speak(getContext(), text);
        call.resolve();
    }
}

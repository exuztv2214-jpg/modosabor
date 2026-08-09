package com.modosabor.mozo;

import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Almacena el JWT del mozo cifrado con Android Keystore. */
@CapacitorPlugin(name = "MozoSecureStore")
public class MozoSecureStorePlugin extends Plugin {
    private static final String STORE_NAME = "modo_sabor_mozo_secure";

    private SharedPreferences store() throws Exception {
        MasterKey key = new MasterKey.Builder(getContext())
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        return EncryptedSharedPreferences.create(
            getContext(), STORE_NAME, key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    private String key(PluginCall call) {
        String value = call.getString("key", "").trim();
        return value.startsWith("ms_mozo_") ? value : null;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = key(call);
        if (key == null) { call.reject("Clave no permitida"); return; }
        try { call.resolve(new JSObject().put("value", store().getString(key, null))); }
        catch (Exception error) { call.reject("No se pudo leer la sesión protegida", error); }
    }

    @PluginMethod
    public void setAndVerify(PluginCall call) {
        String key = key(call);
        String value = call.getString("value", "");
        if (key == null) { call.reject("Clave no permitida"); return; }
        try {
            SharedPreferences prefs = store();
            boolean saved = prefs.edit().putString(key, value).commit();
            String read = prefs.getString(key, null);
            if (!saved || !value.equals(read)) { call.reject("No se pudo proteger la sesión"); return; }
            call.resolve(new JSObject().put("value", read));
        } catch (Exception error) { call.reject("No se pudo guardar la sesión protegida", error); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = key(call);
        if (key == null) { call.reject("Clave no permitida"); return; }
        try { store().edit().remove(key).apply(); call.resolve(); }
        catch (Exception error) { call.reject("No se pudo borrar la sesión protegida", error); }
    }
}

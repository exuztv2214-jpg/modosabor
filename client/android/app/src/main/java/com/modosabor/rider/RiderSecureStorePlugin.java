package com.modosabor.rider;

import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;

/**
 * Guarda credenciales y cola offline del rider cifradas por Android Keystore.
 * No hay ruta JavaScript que lea estos valores sin pasar por este bridge.
 */
@CapacitorPlugin(name = "RiderSecureStore")
public class RiderSecureStorePlugin extends Plugin {
    private static final String STORE_NAME = "modo_sabor_rider_secure";

    private SharedPreferences store() throws Exception {
        MasterKey key = new MasterKey.Builder(getContext())
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build();
        return EncryptedSharedPreferences.create(
            getContext(),
            STORE_NAME,
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    private String requireKey(PluginCall call) {
        String key = call.getString("key", "").trim();
        if (!key.startsWith("ms_rider_")) return null;
        return key;
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = requireKey(call);
        if (key == null) {
            call.reject("Clave no permitida");
            return;
        }
        try {
            call.resolve(new com.getcapacitor.JSObject().put("value", store().getString(key, null)));
        } catch (Exception error) {
            call.reject("No se pudo leer almacenamiento seguro", error);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = requireKey(call);
        String value = call.getString("value", "");
        if (key == null) {
            call.reject("Clave no permitida");
            return;
        }
        try {
            store().edit().putString(key, value).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo guardar almacenamiento seguro", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = requireKey(call);
        if (key == null) {
            call.reject("Clave no permitida");
            return;
        }
        try {
            store().edit().remove(key).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("No se pudo borrar almacenamiento seguro", error);
        }
    }

    @PluginMethod
    public void keys(PluginCall call) {
        try {
            JSONArray keys = new JSONArray();
            for (String key : store().getAll().keySet()) keys.put(key);
            call.resolve(new com.getcapacitor.JSObject().put("keys", keys));
        } catch (Exception error) {
            call.reject("No se pudo listar almacenamiento seguro", error);
        }
    }
}

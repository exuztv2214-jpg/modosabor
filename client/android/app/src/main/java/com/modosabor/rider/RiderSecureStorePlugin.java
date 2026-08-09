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

    /** Guarda y vuelve a leer en la misma operación para no aceptar una
     * sesión que Android no haya podido persistir realmente. */
    @PluginMethod
    public void setAndVerify(PluginCall call) {
        String key = requireKey(call);
        String value = call.getString("value", "");
        if (key == null) {
            call.reject("Clave no permitida");
            return;
        }
        try {
            SharedPreferences prefs = store();
            boolean written = prefs.edit().putString(key, value).commit();
            String saved = prefs.getString(key, null);
            if (!written || !value.equals(saved)) {
                call.reject("No se pudo verificar el guardado seguro");
                return;
            }
            call.resolve(new com.getcapacitor.JSObject().put("value", saved));
        } catch (Exception error) {
            call.reject("No se pudo guardar la sesión protegida", error);
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

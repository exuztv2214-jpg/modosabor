package com.modosabor.rider;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Huella o PIN del teléfono: nunca envía ni almacena biometría en Modo Sabor. */
@CapacitorPlugin(name = "RiderBiometric")
public class RiderBiometricPlugin extends Plugin {
    private static final int ALLOWED =
        BiometricManager.Authenticators.BIOMETRIC_STRONG |
        BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        int result = BiometricManager.from(getContext()).canAuthenticate(ALLOWED);
        call.resolve(new JSObject().put("available", result == BiometricManager.BIOMETRIC_SUCCESS));
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        if (!(getActivity() instanceof FragmentActivity)) {
            call.reject("La autenticación biométrica no está disponible");
            return;
        }
        if (BiometricManager.from(getContext()).canAuthenticate(ALLOWED) != BiometricManager.BIOMETRIC_SUCCESS) {
            call.reject("Configurá una huella o PIN en el teléfono");
            return;
        }

        String title = call.getString("title", "Desbloquear Modo Sabor Rider");
        String subtitle = call.getString("subtitle", "Confirmá tu identidad");
        BiometricPrompt prompt = new BiometricPrompt(
            (FragmentActivity) getActivity(),
            ContextCompat.getMainExecutor(getContext()),
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    call.resolve(new JSObject().put("authenticated", true));
                }

                @Override
                public void onAuthenticationError(int code, CharSequence message) {
                    call.resolve(new JSObject().put("authenticated", false));
                }
            }
        );
        BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(ALLOWED)
            .build();
        prompt.authenticate(info);
    }
}

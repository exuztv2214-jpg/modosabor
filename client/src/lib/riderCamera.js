// Foto de entrega. Cuando el rider marca "entregado", puede sacar una
// foto del paquete en la puerta del cliente. Sirve como prueba visual
// ante reclamos "no me llegó". Usa @capacitor/camera en nativo, cae al
// input file en web/PWA.

import { Capacitor } from '@capacitor/core';

function isNative() {
  return Capacitor.isNativePlatform?.() === true;
}

/**
 * Captura una foto de entrega. Devuelve un dataURL (base64) o null si
 * el usuario canceló o hubo error.
 */
export async function captureDeliveryPhoto() {
  if (isNative()) {
    try {
      const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
      const photo = await Camera.getPhoto({
        quality: 65,
        allowEditing: false,
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        saveToGallery: false,
        width: 1024,
        promptLabelHeader: 'Foto de entrega',
        promptLabelCancel: 'Cancelar',
      });
      return photo?.dataUrl || null;
    } catch (err) {
      // Cancelado por el usuario o permiso denegado; silent-fail.
      return null;
    }
  }

  // Web/PWA: input file con capture=environment para preferir cámara trasera.
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '') || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

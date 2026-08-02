import { useEffect, useRef } from 'react';

/**
 * Mantiene la pantalla encendida mientras el rider está en ruta.
 *
 * Sin esto, el celular se bloquea a los 30 segundos y el rider tiene
 * que desbloquear cada vez que quiere mirar el mapa — manejando.
 *
 * Usa la Screen Wake Lock API, disponible en Chrome/WebView Android
 * moderno. Si no está soportada, no hace nada (no rompe).
 *
 * Importante: el lock se pierde cuando la app pasa a background. Por eso
 * re-adquirimos al volver al foreground mientras siga activo.
 *
 * OJO CON LA BATERÍA: la pantalla prendida es lo que más consume en un
 * celular. Por eso solo se activa durante el reparto activo, nunca en
 * el home ni con la app en espera.
 *
 * @param {boolean} activo
 */
export function useWakeLock(activo) {
  const lockRef = useRef(null);

  useEffect(() => {
    if (!activo) return undefined;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;

    let cancelado = false;

    const adquirir = async () => {
      try {
        // Si ya tenemos uno vivo, no pedimos otro.
        if (lockRef.current && !lockRef.current.released) return;
        const lock = await navigator.wakeLock.request('screen');
        if (cancelado) {
          lock.release().catch(() => {
            // El navegador puede haber liberado el lock antes de este cleanup.
          });
          return;
        }
        lockRef.current = lock;
        // El navegador puede soltarlo solo (batería baja, etc.).
        lock.addEventListener?.('release', () => {
          lockRef.current = null;
        });
      } catch {
        // Permiso denegado o no soportado: seguimos sin wake lock.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') adquirir();
    };

    adquirir();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      try {
        lockRef.current?.release?.();
      } catch {
        // No hacemos fallar el cierre de pantalla por un release ya resuelto.
      }
      lockRef.current = null;
    };
  }, [activo]);
}

export default useWakeLock;

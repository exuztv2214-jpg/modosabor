/**
 * Feedback háptico semántico para la app rider.
 *
 * En vez de llamar navigator.vibrate() suelto por todos lados, definimos
 * patrones con significado. El rider aprende a distinguir la vibración
 * sin mirar la pantalla (va manejando).
 *
 * Patrones (arrays = [vibrar, pausa, vibrar, ...] en ms):
 *   tap      → toque suave de confirmación de UI
 *   success  → acción completada bien (entrega, cambio de estado)
 *   warning  → algo requiere atención (sin señal, incidencia)
 *   error    → algo falló
 *   arrive   → llegaste al destino (más largo, distintivo)
 *   newOrder → pedido nuevo asignado
 */

const PATTERNS = {
  tap: 12,
  success: [30, 60, 30],
  warning: [60, 80, 60],
  error: [100, 60, 100, 60, 100],
  arrive: [200, 100, 200, 100, 200],
  newOrder: [120, 80, 120, 80, 240],
};

/**
 * Dispara un patrón háptico. Silencioso si el device no soporta vibración
 * (iOS Safari, desktop) — nunca tira error.
 *
 * @param {keyof PATTERNS} kind
 */
export function haptic(kind = 'tap') {
  try {
    if (typeof navigator === 'undefined' || !navigator.vibrate) return false;
    const pattern = PATTERNS[kind] ?? PATTERNS.tap;
    navigator.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}

export default haptic;

import { riderStorageGet, riderStorageSet } from './nativeRiderGps.js';

/**
 * Preferencias de la app del rider.
 *
 * Son del repartidor, no del legajo: el volumen del aviso, si quiere que le
 * cante el pedido en voz alta, si vibra y el tamaño de letra. Nada de esto
 * afecta al local ni a lo que ve el cliente, así que se guarda en el propio
 * celular y no se sincroniza con el servidor.
 *
 * Antes estaban clavadas en el código —el aviso de pedido nuevo tenía el
 * sonido en "1" y la voz en "0" escritos a mano— y el rider no podía cambiar
 * nada. Un repartidor que trabaja con casco quiere la voz; uno que reparte de
 * noche en un barrio tranquilo capaz prefiere sólo vibración.
 *
 * Los valores por defecto son los que menos molestan: suena y vibra, no habla.
 */

const CLAVE = 'ms_rider_preferencias';

export const PREFERENCIAS_POR_DEFECTO = {
  sonido: true,
  voz: false,
  vibracion: true,
  letraGrande: false,
};

/** Lee las preferencias del celular. Nunca falla: ante la duda, las de fábrica. */
export async function leerPreferencias() {
  try {
    const crudo = await riderStorageGet(CLAVE);
    if (!crudo) return { ...PREFERENCIAS_POR_DEFECTO };
    const guardadas = typeof crudo === 'string' ? JSON.parse(crudo) : crudo;
    // Se mezclan con las de fábrica para que agregar una preferencia nueva no
    // rompa a quien ya tenía guardadas las viejas.
    return { ...PREFERENCIAS_POR_DEFECTO, ...(guardadas || {}) };
  } catch {
    return { ...PREFERENCIAS_POR_DEFECTO };
  }
}

/** Guarda las preferencias. Si el storage falla, la app sigue andando igual. */
export async function guardarPreferencias(preferencias) {
  try {
    await riderStorageSet(CLAVE, JSON.stringify(preferencias || {}));
  } catch {
    // Sin storage las preferencias duran lo que la sesión. No es motivo para
    // cortarle el turno al rider.
  }
}

/**
 * Traduce las preferencias al formato de configuración que espera
 * `runOrderAlert`, que usa strings '1'/'0' porque viene de la config del local.
 */
export function preferenciasParaAlerta(preferencias) {
  return {
    alertas_pedido_sonido: preferencias?.sonido ? '1' : '0',
    alertas_pedido_voz: preferencias?.voz ? '1' : '0',
  };
}

import { AlertCircle, CheckCircle2, Package, Truck } from 'lucide-react';
import { hoyArgentina } from '../../lib/fechaNegocio';

/**
 * Columnas del tablero.
 *
 * `COLS` es el flujo completo (con KDS). `SIMPLE_COLS` es el flujo corto
 * que se usa cuando `modulo_kds_activo` está apagado: sin "confirmado" ni
 * "listo", porque sin pantalla de cocina esas dos etapas no las marca
 * nadie y sólo agregan clicks.
 */
export const COLS = [
  { estado: 'nuevo', label: 'Nuevos', icon: AlertCircle },
  { estado: 'confirmado', label: 'Confirmados', icon: CheckCircle2 },
  { estado: 'preparando', label: 'Preparando', icon: Package },
  { estado: 'listo', label: 'Listos', icon: Package },
  { estado: 'en_camino', label: 'En camino', icon: Truck },
];

export const SIMPLE_COLS = [
  { estado: 'nuevo', label: 'Nuevos', icon: AlertCircle },
  { estado: 'preparando', label: 'Preparando', icon: Package },
  { estado: 'en_camino', label: 'Enviados', icon: Truck },
];

export const PRINT_LABELS = {
  comanda_cocina: 'Comanda cocina',
  ticket_cliente: 'Ticket cliente',
  delivery_ticket: 'Hoja delivery',
};

export const HIST_ESTADOS = [
  '',
  'nuevo',
  'confirmado',
  'preparando',
  'listo',
  'en_camino',
  'entregado',
  'cancelado',
];

export const HIST_TIPOS = ['', 'delivery', 'retiro', 'mesa'];

export const ESTADOS_ACTIVOS = ['nuevo', 'confirmado', 'preparando', 'listo', 'en_camino'];

export const TIPO_LABELS = {
  delivery: 'Delivery',
  retiro: 'Retira',
  mesa: 'Mesa',
};

export const todayStr = () => hoyArgentina();

export function minutesElapsed(iso) {
  if (!iso) return null;
  try {
    const ms = Date.now() - new Date(String(iso).replace(' ', 'T')).getTime();
    return Math.max(0, Math.floor(ms / 60000));
  } catch {
    return null;
  }
}

export function fmtElapsed(min) {
  if (min === null || min === undefined) return null;
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/**
 * A partir de cuántos minutos un pedido se considera demorado.
 *
 * El delivery tolera más porque incluye el viaje; el mostrador y la mesa
 * se miden contra la expectativa del cliente que está esperando ahí.
 */
export function umbralDemora(tipoEntrega) {
  return tipoEntrega === 'delivery' ? 40 : 25;
}

/**
 * Escapa un valor para CSV.
 *
 * El export anterior envolvía el nombre del cliente en comillas pero no
 * escapaba las comillas internas, así que un cliente llamado `Juan "el
 * Flaco"` rompía la columna y desplazaba todo el resto de la fila.
 */
export function csvCell(value) {
  const text = String(value ?? '');
  if (!/[",\n;]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

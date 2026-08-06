import user1 from '../../image/profile/user-1.jpg';
import user2 from '../../image/profile/user-2.jpg';
import user3 from '../../image/profile/user-3.jpg';
import user4 from '../../image/profile/user-4.jpg';
import user5 from '../../image/profile/user-5.jpg';
import user6 from '../../image/profile/user-6.jpg';
import user7 from '../../image/profile/user-7.jpg';
import user8 from '../../image/profile/user-8.jpg';
import user9 from '../../image/profile/user-9.jpg';
import user10 from '../../image/profile/user-10.jpg';
import user11 from '../../image/profile/user-11.jpg';
import user12 from '../../image/profile/user-12.jpg';

export const AVATARS = [
  user1,
  user2,
  user3,
  user4,
  user5,
  user6,
  user7,
  user8,
  user9,
  user10,
  user11,
  user12,
];

/**
 * Avatares locales guardados como token, no como URL.
 *
 * El selector guardaba en la base el valor del import de Vite, que en
 * producción es una ruta con hash de contenido (`/assets/user-3.a1b2c3.jpg`).
 * En el build siguiente ese hash cambia y todas las fotos que alguien haya
 * elegido dejan de existir: quedan las iniciales.
 *
 * Es el mismo problema que ya se arregló en Clientes y se resuelve igual:
 * en la base va `local:3` y el índice se traduce al import en tiempo de
 * render. Los avatares subidos por el usuario (rutas `/uploads/...`) siguen
 * guardándose tal cual.
 */
const TOKEN_PREFIJO = 'local:';

export function avatarToken(indice) {
  return `${TOKEN_PREFIJO}${indice % AVATARS.length}`;
}

export function esTokenLocal(valor) {
  return String(valor || '').startsWith(TOKEN_PREFIJO);
}

/** Traduce lo guardado en la base a algo que el `<img>` pueda mostrar. */
export function resolveAvatarPersonal(valor) {
  const raw = String(valor || '').trim();
  if (!raw.startsWith(TOKEN_PREFIJO)) return raw;
  const indice = Number(raw.slice(TOKEN_PREFIJO.length));
  return AVATARS[Number.isFinite(indice) ? Math.abs(indice) % AVATARS.length : 0];
}

/**
 * Avatar por defecto para quien nunca eligió uno. Determinístico sobre el id
 * para que la misma persona muestre siempre la misma cara.
 */
export function avatarPorDefecto(seed) {
  const numero = Number(seed);
  return avatarToken(Number.isFinite(numero) ? Math.abs(Math.trunc(numero)) : 0);
}

/**
 * Fecha de hoy en formato YYYY-MM-DD, en hora local.
 *
 * Antes esto era `new Date().toISOString().split('T')[0]`, que devuelve la
 * fecha en UTC. En Tucumán (UTC-3) eso significa que a partir de las 21:00
 * `toISOString()` ya devuelve el día siguiente: justo en el pico del turno
 * noche, la planilla semanal, el ranking de asistencia y las fechas por
 * defecto de las metas se corrían un día para adelante.
 *
 * Además era una constante de módulo, evaluada una sola vez al importar: si
 * dejabas la pestaña abierta pasada la medianoche, seguía en el día viejo.
 * Por eso ahora es una función.
 */
export function hoyIso() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const ROLES = [
  { value: 'cocina', label: 'Cocina' },
  { value: 'cajero', label: 'Cajero' },
  { value: 'mozo', label: 'Mozo' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'ayudante', label: 'Ayudante' },
  { value: 'encargado', label: 'Encargado' },
];

export const TURNOS = [
  { value: 'manana', label: 'Mañana' },
  { value: 'noche', label: 'Noche' },
  { value: 'doble', label: 'Doble turno' },
];

export const FREQUENCY_OPTIONS = [
  { value: 'diario', label: 'Diario' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'quincenal', label: 'Quincenal' },
  { value: 'mensual', label: 'Mensual' },
];

export const PAYMENT_OPTIONS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'mercadopago', label: 'Mercado Pago' },
  { value: 'modo', label: 'Modo' },
  { value: 'uala', label: 'Uala' },
];

export const EMPTY_FORM = {
  nombre: '',
  rol_operativo: 'cocina',
  telefono: '',
  email: '',
  turno_preferido: 'manana',
  frecuencia_pago: 'mensual',
  monto_base: '',
  medio_pago_preferido: 'efectivo',
  activo: 1,
  notas: '',
  avatar_url: '',
  fecha_nacimiento: '',
  fecha_ingreso: hoyIso(),
  direccion: '',
  categoria_id: 1,
  clock_pin: '',
};

export const EMPTY_MOVEMENT = {
  tipo: 'adelanto',
  descripcion: '',
  monto: '',
  insumo_id: '',
  cantidad_insumo: '',
  impacta_caja: 1,
};

export const MOVEMENT_TYPES = ['adelanto', 'descuento', 'consumo'];

export const EMPTY_SETTLEMENT = {
  unidades: '1',
  metodo_pago: 'efectivo',
  periodo_desde: '',
  periodo_hasta: '',
  notas: '',
  impacta_caja: 1,
};

export const EMPTY_ATTENDANCE = {
  estado: 'presente',
  notas: '',
};

export const EMPTY_GOAL = {
  fecha_desde: hoyIso(),
  fecha_hasta: hoyIso(),
  tipo: 'general',
  objetivo: '',
  progreso: '',
  unidad: 'u',
  premio_puntos: '0',
  premio_monto: '',
  notas: '',
};

export const EMPTY_PRODUCT_CONSUMPTION = {
  producto_id: '',
  cantidad: '1',
  descuento_empleado_pct: '20',
  descripcion: '',
};

export const EMPTY_WEEKLY_EDITOR = {
  fecha_operativa: '',
  estado: 'presente',
  ingreso_en: '',
  salida_en: '',
  notas: '',
  turno_id: '',
};

/** @deprecated Usar `hoyIso()`, que se reevalúa. Queda por compatibilidad. */
export const todayIso = hoyIso();

/**
 * ISO del servidor → valor para un `<input type="datetime-local">`.
 *
 * Los horarios de fichada se guardan con `new Date().toISOString()`, o sea en
 * UTC y con la Z al final. La planilla los metía en el input con
 * `String(valor).slice(0, 16)`, que corta la cadena UTC tal cual: una entrada
 * de las 11:23 de la mañana aparecía como 14:23.
 *
 * Peor: al guardar la corrección se mandaba ese 14:23 de vuelta y el servidor
 * lo tomaba como hora nueva. Cada vez que abrías y guardabas un día, el
 * horario se corría tres horas más. Acumulativo.
 */
export function isoAInputLocal(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de un `datetime-local` (hora local) → ISO UTC para el servidor. */
export function inputLocalAIso(valor) {
  if (!valor) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[13px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 hover:border-gray-300';

export const SELECT = `${CONTROL} appearance-none pr-9 bg-[url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat`;

export const LABEL = 'mb-1.5 block text-[12px] font-medium text-gray-600';

export const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

/** Etiquetas legibles para los estados de asistencia. */
export const ESTADO_ASISTENCIA = {
  presente: { label: 'Presente', bg: '#E7F5EF', fg: '#0F6E56' },
  tarde: { label: 'Llegó tarde', bg: '#FDF3D3', fg: '#95661A' },
  ausente: { label: 'Ausente', bg: '#FEF2F2', fg: '#9E141E' },
  franco: { label: 'Franco', bg: '#F1F5F9', fg: '#475569' },
};

export function estadoAsistencia(valor) {
  const key = String(valor || '').toLowerCase();
  return ESTADO_ASISTENCIA[key] || { label: valor || 'Sin marcar', bg: '#F1F5F9', fg: '#64748B' };
}

/** Los roles y turnos se guardan sin tilde; para mostrar hay que traducirlos. */
export function rolLabel(valor) {
  return ROLES.find((r) => r.value === valor)?.label || valor || 'Sin rol';
}

export function turnoLabel(valor) {
  return TURNOS.find((t) => t.value === valor)?.label || valor || 'Sin turno';
}

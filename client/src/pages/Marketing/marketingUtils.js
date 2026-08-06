/**
 * Utilidades de Marketing.
 *
 * Salieron del componente porque varias tenían bugs que convenía aislar y
 * comentar en un solo lugar.
 */

export const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'google', label: 'Google' },
  { value: 'general', label: 'General' },
];

export const PROMO_TYPES = [
  { value: 'descuento_fijo', label: 'Descuento fijo' },
  { value: 'porcentaje', label: 'Porcentaje' },
  { value: 'envio_gratis', label: 'Envío gratis' },
  { value: 'combo_especial', label: 'Combo especial' },
  { value: 'promo_producto', label: 'Promo por producto' },
];

export const CONTENT_STATES = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'listo', label: 'Listo para publicar' },
  { value: 'publicado', label: 'Publicado' },
];

export const CALENDAR_STATES = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'listo', label: 'Listo' },
  { value: 'publicado', label: 'Publicado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export const canalLabel = (value) =>
  CHANNELS.find((c) => c.value === value)?.label || value || 'General';

export const promoTipoLabel = (value) =>
  PROMO_TYPES.find((t) => t.value === value)?.label || value || '—';

export const estadoLabel = (lista, value) =>
  lista.find((e) => e.value === value)?.label || value || '—';

export const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

export function fmtDate(value, conHora = true) {
  if (!value) return '—';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    ...(conHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/**
 * Fecha para un `<input type="datetime-local">`.
 *
 * Estaba escrito como `new Date(value).toISOString().slice(0, 16)`. `toISOString`
 * devuelve UTC, y acá estamos en UTC-3: al abrir una campaña para editarla, el
 * campo mostraba tres horas menos de lo guardado. Y como al guardar se manda
 * lo que muestra el campo, **cada edición corría la fecha tres horas hacia
 * atrás**. Editabas una campaña cuatro veces y se te iba medio día.
 *
 * Se construye a mano en hora local.
 */
export function toInputDate(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export const ESTADO_TONOS = {
  activa: { label: 'Activa', bg: '#E7F5EF', fg: '#0F6E56' },
  programada: { label: 'Programada', bg: '#E9F1FA', fg: '#1F5FA0' },
  vencida: { label: 'Terminada', bg: '#F1F5F9', fg: '#475569' },
  pausada: { label: 'Pausada', bg: '#E5E7EB', fg: '#4B5563' },
};

/**
 * Estado real de una campaña o promo.
 *
 * Igual que pasaba en Cupones: la etiqueta salía del flag `activa` y nada
 * más, así que una campaña que terminó el mes pasado seguía figurando en
 * verde como "Activa". Las fechas estaban cargadas y no se miraban.
 */
export function estadoPorFechas(item) {
  if (!item?.activa) return 'pausada';
  const ahora = Date.now();
  const inicio = item.fecha_inicio ? new Date(item.fecha_inicio).getTime() : null;
  const fin = item.fecha_fin ? new Date(item.fecha_fin).getTime() : null;
  if (inicio && !Number.isNaN(inicio) && ahora < inicio) return 'programada';
  if (fin && !Number.isNaN(fin) && ahora > fin) return 'vencida';
  return 'activa';
}

export function copiar(texto, toast, mensaje = 'Copiado') {
  const value = String(texto || '');
  if (!value) return toast.error('No hay nada para copiar');
  if (!navigator.clipboard?.writeText) {
    return toast.error('El navegador no permite copiar automáticamente');
  }
  return navigator.clipboard
    .writeText(value)
    .then(() => toast.success(mensaje))
    .catch(() => toast.error('No se pudo copiar'));
}

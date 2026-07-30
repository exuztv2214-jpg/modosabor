import { normalizeText, safeParseArray } from './pedidoForm.js';

// Re-export desde pedidoForm.js para unificar
export { safeParseArray } from './pedidoForm.js';

export const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export const DEFAULT_HERO = '/uploads/asset-1783015436277.jpg';
export const DEFAULT_BRAND_LOGO = '/uploads/logo-1774056380094.svg';

export function getPublicBrandTheme(config = {}) {
  const configuredPrimary = String(config?.negocio_color_primario || config?.color_primario || '')
    .trim()
    .toLowerCase();

  const coolPrimaries = new Set(['#15c0f9', '#0ea5e9', '#38bdf8', '#22d3ee']);
  const primary =
    !configuredPrimary || coolPrimaries.has(configuredPrimary) ? '#c81d25' : configuredPrimary;

  return {
    primary,
    primaryStrong: '#8f1018',
    accent: '#f59e0b',
    accentSoft: '#fff2d9',
    surface: '#fff8f4',
    panel: '#fffdfb',
    ink: '#141414',
    muted: '#6b7280',
    border: '#f1dfd7',
  };
}

export function isEnabled(value) {
  return String(value || '0') === '1' || value === true;
}

export function isEnabledDefault(value, defaultEnabled = true) {
  if (value === undefined || value === null || value === '') return defaultEnabled;
  return String(value) === '1' || value === true;
}

export function isActiveByDate(item) {
  if (!item?.activa && item?.activa !== undefined) return false;
  const now = Date.now();
  const desde = item?.desde ? new Date(item.desde).getTime() : null;
  const hasta = item?.hasta ? new Date(item.hasta).getTime() : null;
  if (desde && Number.isFinite(desde) && now < desde) return false;
  if (hasta && Number.isFinite(hasta) && now > hasta) return false;
  return true;
}

export function getProximaAperturaText(config) {
  if (config?.abierto_ahora) return null;
  try {
    const turnos = JSON.parse(config?.negocio_horarios || '[]');
    if (!Array.isArray(turnos) || turnos.length === 0) return null;
    const activos = turnos.filter((t) => t.activo !== false);
    if (!activos.length) return null;
    const now = new Date();
    const minAhora = now.getHours() * 60 + now.getMinutes();
    const parseMin = (str) => {
      const [h, m] = String(str || '00:00')
        .split(':')
        .map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const sorted = [...activos].sort(
      (a, b) => parseMin(a.desde || a.inicio) - parseMin(b.desde || b.inicio)
    );
    const proxHoy = sorted.find((t) => parseMin(t.desde || t.inicio) > minAhora);
    if (proxHoy) {
      const h = String(proxHoy.desde || proxHoy.inicio || '')
        .split(':')[0]
        ?.padStart(2, '0');
      const m =
        String(proxHoy.desde || proxHoy.inicio || '')
          .split(':')[1]
          ?.padStart(2, '0') || '00';
      return `Abre hoy a las ${h}:${m}`;
    }
    const primero = sorted[0];
    if (primero) {
      const h = String(primero.desde || primero.inicio || '')
        .split(':')[0]
        ?.padStart(2, '0');
      const m =
        String(primero.desde || primero.inicio || '')
          .split(':')[1]
          ?.padStart(2, '0') || '00';
      return `Abre mañana a las ${h}:${m}`;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildWhatsAppUrl(config, message = '') {
  const phone = String(config?.negocio_telefono || '').replace(/\D/g, '');
  if (!phone) return 'https://wa.me/';
  const finalPhone = phone.startsWith('54') ? phone : `54${phone}`;
  const text = encodeURIComponent(message || 'Hola Modo Sabor, quiero hacer un pedido.');
  return `https://wa.me/${finalPhone}?text=${text}`;
}

export function buildTrackingLink(pedido) {
  if (!pedido?.id) return '/';
  return pedido?.tracking_token
    ? `/seguimiento/${pedido.id}?token=${encodeURIComponent(pedido.tracking_token)}`
    : `/seguimiento/${pedido.id}`;
}

export function getCategoryDescription(categoryName = '') {
  const normalized = normalizeText(categoryName);
  if (normalized.includes('menu del dia'))
    return 'Opciones listas para resolver el almuerzo o la cena sin pensar demasiado.';
  if (normalized.includes('pizza'))
    return 'Clásicas y especiales con presentación entera o media para compartir o caerle solo.';
  if (normalized.includes('hamburg'))
    return 'Smash, dobles y extremas con combinaciones bien cargadas.';
  if (normalized.includes('milan')) return 'Ternera o pollo con versiones bien contundentes.';
  if (normalized.includes('empan'))
    return 'Docena o media docena para sumar al pedido sin vueltas.';
  if (normalized.includes('papa')) return 'Porciones para acompañar o picar fuerte.';
  if (normalized.includes('bebida')) return 'Lo justo para completar el pedido.';
  return 'Elegí tus favoritos y armá el pedido en pocos pasos.';
}

export function getVariantHint(producto = {}) {
  const variantes = safeParseArray(producto?.variantes);
  const extras = safeParseArray(producto?.extras);
  if (variantes.length === 0 && extras.length === 0) return '';

  const labels = variantes
    .map((group) => String(group?.nombre || '').trim())
    .filter(Boolean)
    .slice(0, 2);

  if (labels.length > 0) {
    return `Elegí ${labels.join(' y ').toLowerCase()}`;
  }

  return 'Personalizalo antes de agregarlo';
}

export function isMenuDelDiaProduct(producto = {}) {
  return (
    normalizeText(producto?.categoria_nombre || '') === 'menu del dia' ||
    Number(producto?.menu_dia_base || 0) === 1
  );
}

export function isVisibleOnPublicMenu(producto = {}) {
  if (!isMenuDelDiaProduct(producto)) return true;
  return Number(producto?.menu_dia_disponible_hoy || 0) === 1;
}

export function getVariantSelectionPrice(producto = {}, selection = {}, extras = []) {
  const basePrice = Number(producto?.precio || 0);
  const variantsExtra = Object.values(selection || {}).reduce(
    (acc, option) => acc + Number(option?.precio_extra || 0),
    0
  );
  const extrasExtra = (extras || []).reduce((acc, extra) => acc + Number(extra?.precio || 0), 0);
  return basePrice + variantsExtra + extrasExtra;
}

export function useInitialFormState() {
  try {
    const saved = JSON.parse(localStorage.getItem('ms_form') || '{}');
    return {
      nombre: saved.nombre || '',
      telefono: saved.telefono || '',
      direccion: saved.direccion || '',
      tipo_entrega: saved.tipo_entrega || 'delivery',
      metodo_pago: saved.metodo_pago || 'efectivo',
      notas: '',
    };
  } catch {
    return {
      nombre: '',
      telefono: '',
      direccion: '',
      tipo_entrega: 'delivery',
      metodo_pago: 'efectivo',
      notas: '',
    };
  }
}

export function getInitialCart() {
  try {
    const saved = sessionStorage.getItem('ms_carrito');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

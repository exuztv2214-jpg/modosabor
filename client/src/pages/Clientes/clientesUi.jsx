import { User } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';

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

export const LOCAL_AVATARS = [
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
 * Los avatares del sistema se guardan como token, no como URL.
 *
 * El selector guardaba en la base la ruta que genera Vite al compilar
 * (`/assets/user-3.a1b2c3.jpg`). Ese hash cambia en cada build, así que el
 * avatar que elegías hoy quedaba apuntando a un archivo inexistente después
 * del próximo deploy. Guardando `local:3` la referencia sobrevive.
 *
 * Una foto subida por el usuario sí es una URL real de `/uploads` y se guarda
 * tal cual.
 */
const TOKEN_PREFIJO = 'local:';

export function avatarToken(indice) {
  return `${TOKEN_PREFIJO}${indice % LOCAL_AVATARS.length}`;
}

/**
 * Avatar asignado a un cliente que nunca eligió uno.
 *
 * Las doce fotos ya estaban en el sistema pero solo se usaban si alguien
 * entraba a la ficha y elegía una a mano, así que en la práctica la lista era
 * un muro de iniciales grises.
 *
 * Es determinístico sobre el id: el mismo cliente muestra siempre la misma
 * cara, en cualquier pantalla y entre recargas. Con `Math.random()` la foto
 * cambiaría en cada render, que es peor que no tener ninguna.
 */
export function avatarTokenPorDefecto(seed) {
  const numero = Number(seed);
  if (!Number.isFinite(numero)) return avatarToken(0);
  return avatarToken(Math.abs(Math.trunc(numero)));
}

/** Para el alta, donde todavía no hay id. */
export function avatarTokenAleatorio() {
  return avatarToken(Math.floor(Math.random() * LOCAL_AVATARS.length));
}

/** Convierte lo guardado en la base a algo que el `<img>` pueda mostrar. */
export function resolveAvatar(valor, fallbackId = null) {
  const raw = String(valor || '').trim();
  if (raw.startsWith(TOKEN_PREFIJO)) {
    const indice = Number(raw.slice(TOKEN_PREFIJO.length));
    return LOCAL_AVATARS[Number.isFinite(indice) ? indice % LOCAL_AVATARS.length : 0];
  }
  if (raw) return raw;
  if (fallbackId != null) return resolveAvatar(avatarTokenPorDefecto(fallbackId));
  return '';
}

/**
 * Niveles del cliente.
 *
 * Acá el color sí codifica información y además es información que el cliente
 * ya conoce por el nombre —bronce, plata, oro, platino son metales—, así que
 * es la excepción razonable a la regla del acento único. Un nivel que se ve
 * distinto es lo que hace que subir de nivel signifique algo.
 */
export const NIVEL_ESTILO = {
  // banda: fondo de la cabecera · fuerte: anillo del avatar y sellos llenos
  // texto: nombre sobre la banda · suave: el chip blanco que va encima
  Bronce: {
    banda: '#FBF0E4',
    fuerte: '#C98A3E',
    texto: '#6B3F0C',
    apagado: '#96702F',
    borde: '#EFCDA6',
    bg: '#FDF2E9',
    fg: '#9A5B12',
  },
  Plata: {
    banda: '#F1F5F9',
    fuerte: '#94A3B8',
    texto: '#334155',
    apagado: '#5A6B7F',
    borde: '#CBD5E1',
    bg: '#F1F5F9',
    fg: '#475569',
  },
  Oro: {
    banda: '#FDF3D3',
    fuerte: '#E0A924',
    texto: '#6B4108',
    apagado: '#95661A',
    borde: '#FDE047',
    bg: '#FEF9C3',
    fg: '#854D0E',
  },
  Platino: {
    banda: '#F1EEFE',
    fuerte: '#8B7BE0',
    texto: '#42237F',
    apagado: '#5E43A8',
    borde: '#DDD6FE',
    bg: '#F5F3FF',
    fg: '#5B21B6',
  },
};

/** Tonos de las dos métricas de la tarjeta. */
export const METRICA_TONOS = {
  gastado: { bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A' },
  pedidos: { bg: '#E9F1FA', label: '#1F5FA0', valor: '#0B3A66' },
};

export function nivelEstilo(nivel) {
  return NIVEL_ESTILO[nivel] || NIVEL_ESTILO.Bronce;
}

export function NivelBadge({ nivel, className = '' }) {
  const estilo = nivelEstilo(nivel);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ background: estilo.bg, color: estilo.fg, borderColor: estilo.borde }}
    >
      {nivel || 'Bronce'}
    </span>
  );
}

/**
 * Piezas visuales compartidas del módulo de clientes.
 *
 * Antes cada archivo definía sus propias tarjetas, sus propios tonos y hasta
 * su propia tabla de colores de nivel —`ClientesHeader` tenía un `LEVEL_COLORS`
 * con valores distintos a los del hook—. Todo eso vive acá ahora.
 */

export const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

export const SELECT =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

/**
 * Segmentos del cliente.
 *
 * El código convivía con dos vocabularios: el backend manda `estado_segmento`
 * y el front calculaba un fallback con nombres distintos (`en-riesgo` contra
 * `riesgo`). Cada filtro tenía que acordarse de chequear los dos. Acá se
 * normaliza una sola vez y el resto del módulo usa estas claves.
 */
export const SEGMENTOS = {
  'premio-listo': { label: 'Premio listo', bg: '#ECFDF5', fg: '#065F46', dot: '#10B981' },
  vip: { label: 'VIP', bg: '#FEF6E7', fg: '#92400E', dot: '#F59E0B' },
  recurrente: { label: 'Recurrente', bg: '#EFF6FF', fg: '#1E40AF', dot: '#3B82F6' },
  activo: { label: 'Activo', bg: '#ECFDF5', fg: '#065F46', dot: '#10B981' },
  nuevo: { label: 'Nuevo', bg: '#F0F9FF', fg: '#075985', dot: '#0EA5E9' },
  'por-reactivar': { label: 'Por reactivar', bg: '#FEF6E7', fg: '#92400E', dot: '#F59E0B' },
  riesgo: { label: 'En riesgo', bg: '#FEF2F2', fg: '#9E141E', dot: BRAND },
  perdido: { label: 'Perdido', bg: '#F5F5F4', fg: '#57534E', dot: '#A8A29E' },
};

/**
 * Normaliza cualquier variante que llegue a una de las claves de `SEGMENTOS`.
 * `en-riesgo` y `riesgo` eran el mismo estado escrito de dos formas.
 */
export function normalizarSegmento(valor) {
  const clave = String(valor || '').trim();
  if (clave === 'en-riesgo') return 'riesgo';
  return SEGMENTOS[clave] ? clave : 'activo';
}

export function segmentoTono(valor) {
  return SEGMENTOS[normalizarSegmento(valor)];
}

export const NIVELES = ['Bronce', 'Plata', 'Oro', 'Platino'];

export function Card({ title, helper, action, children, className = '', bodyClassName = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3> : null}
            {helper ? <p className="mt-0.5 text-[12px] text-gray-500">{helper}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

/**
 * `tono` pinta el fondo de la métrica. Se usa cuando el número tiene una
 * lectura propia —premios sin canjear, plata facturada— y no cuando es un
 * conteo neutro, que se queda en blanco.
 */
export const STAT_TONOS = {
  verde: { bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A', barra: '#10B981' },
  ambar: { bg: '#FDF3D3', label: '#95661A', valor: '#6B4108', barra: '#E0A924' },
  azul: { bg: '#E9F1FA', label: '#1F5FA0', valor: '#0B3A66', barra: '#3B82F6' },
  violeta: { bg: '#F1EEFE', label: '#5E43A8', valor: '#42237F', barra: '#8B7BE0' },
};

export function Stat({ label, value, helper, alerta = false, tono = null }) {
  const t = alerta ? null : STAT_TONOS[tono] || null;
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={{ background: t ? t.bg : '#fff' }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: alerta ? BRAND : t ? t.barra : '#E5E7EB' }}
      />
      <div className="pl-2">
        <p className="text-[12px]" style={{ color: t ? t.label : '#6B7280' }}>
          {label}
        </p>
        <p
          className="mt-1 truncate text-[24px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: alerta ? BRAND : t ? t.valor : '#111827' }}
        >
          {value}
        </p>
        {helper ? (
          <p className="mt-1.5 text-[11px] leading-4" style={{ color: t ? t.label : '#9CA3AF' }}>
            {helper}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function Empty({ title, description, action }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-6 py-12 text-center">
      <p className="text-[14px] font-medium text-gray-600">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function EstadoPill({ segmento, className = '' }) {
  const tono = segmentoTono(segmento);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
      style={{ background: tono.bg, color: tono.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tono.dot }} aria-hidden />
      {tono.label}
    </span>
  );
}

/**
 * `fallbackId` hace que un cliente sin foto propia igual muestre una de las
 * doce del sistema, siempre la misma. Sin él vuelve la inicial gris.
 */
export function AvatarDisplay({ url, nombre, size = 'h-12 w-12', fallbackId = null }) {
  const src = resolveAvatar(url, fallbackId);

  if (src) {
    return (
      <img
        src={src}
        className={`${size} shrink-0 rounded-xl bg-gray-100 object-cover`}
        alt={nombre || 'Cliente'}
      />
    );
  }
  return (
    <div
      className={`${size} flex shrink-0 items-center justify-center rounded-xl bg-gray-200 text-[16px] font-semibold text-gray-600`}
    >
      {nombre?.[0]?.toUpperCase() || <User size={16} strokeWidth={STROKE} />}
    </div>
  );
}

/**
 * Barra de progreso de sellos.
 *
 * En el detalle esto se dibujaba con una grilla de `sellosParaPremio + 1`
 * columnas forzadas en una sola fila dentro de una columna de 380px: con la
 * configuración por defecto de 7 sellos los círculos ya no entraban y se
 * apretaban unos contra otros. Ahora envuelve.
 */
export function SellosProgreso({ actuales = 0, total = 7, size = 'md', color = BRAND }) {
  const hechos = Math.min(Number(actuales) || 0, total);
  const dim = size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-[12px]';
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: total }, (_, index) => index + 1).map((num) => {
        const marcado = num <= hechos;
        return (
          <span
            key={num}
            className={`${dim} flex items-center justify-center rounded-full font-semibold tabular-nums transition-colors`}
            style={
              marcado
                ? { background: color, color: '#fff' }
                : { background: '#F1F3F6', color: '#9CA3AF' }
            }
          >
            {num}
          </span>
        );
      })}
    </div>
  );
}

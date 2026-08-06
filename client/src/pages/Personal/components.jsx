import { User } from 'lucide-react';

import { resolveAssetUrl } from '../../lib/assets.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import { avatarPorDefecto, resolveAvatarPersonal } from './constants.js';

/**
 * Avatar de una persona del equipo.
 *
 * Recibía `url` cruda y la metía tal cual en el `src`. Los avatares que se
 * suben desde el formulario se guardan como `/uploads/personal/...`, una ruta
 * relativa al servidor, no al cliente: en desarrollo (puertos distintos) y en
 * la app móvil esas fotos no cargaban nunca y quedaba el cuadrado gris.
 * `resolveAssetUrl` es el helper que ya usa el resto del sistema para eso.
 *
 * También faltaba el fallback cuando la imagen existe en la base pero el
 * archivo ya no está en disco: el `onError` ahora cae a la inicial.
 */
export function AvatarDisplay({ url, nombre, size = 'h-20 w-20', seed = null }) {
  // Orden: token local → ruta subida → avatar por defecto según el id.
  const guardado = url || (seed != null ? avatarPorDefecto(seed) : '');
  const src = resolveAssetUrl(resolveAvatarPersonal(guardado));

  const inicial = (
    <div
      className={`${size} flex items-center justify-center rounded-full font-semibold text-white`}
      style={{ background: BRAND }}
    >
      {nombre?.[0]?.toUpperCase() || <User size={20} strokeWidth={STROKE} />}
    </div>
  );

  if (!src) return inicial;

  return (
    <div className={`${size} overflow-hidden rounded-full bg-gray-100`}>
      <img
        src={src}
        alt={nombre || 'Avatar'}
        className="h-full w-full object-cover object-center"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}

/**
 * Tarjeta de métrica del encabezado.
 *
 * El color ahora informa en vez de decorar: sólo se pinta cuando el número
 * pide una acción (plata pendiente de pagar, gente ausente). Antes las cuatro
 * tarjetas tenían un color distinto cada una porque sí, y el ojo no sabía
 * cuál mirar.
 */
export function StatCard({ label, value, icon: Icon, alerta = false, hint = null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: alerta ? BRAND : '#E5E7EB' }}
      />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] text-gray-500">{label}</p>
          {Icon ? (
            <Icon size={15} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-300" />
          ) : null}
        </div>
        <p
          className="mt-1 truncate text-[22px] font-bold leading-none tracking-tight"
          style={{ color: alerta ? BRAND : '#111827' }}
        >
          {value}
        </p>
        {hint ? <p className="mt-1.5 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Contenedor estándar de sección. */
export function Card({ title, helper, action, children, className = '' }) {
  return (
    <section
      className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}
    >
      {title || action ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3> : null}
            {helper ? <p className="mt-0.5 text-[12px] text-gray-500">{helper}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Estado vacío.
 *
 * Varias listas del módulo (alertas operativas, metas, catálogo de consumo)
 * se renderizaban con un `.map()` pelado: sin datos quedaba un recuadro en
 * blanco, indistinguible de algo que no cargó.
 */
export function Empty({ title, description, action = null }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center">
      <p className="text-[13px] font-medium text-gray-600">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-4 text-gray-400">{description}</p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Pastilla de estado con tono explícito. */
export function Pill({ label, bg, fg }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}

/** Fila etiqueta/valor, usada en las fichas de datos. */
export function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-[12px] text-gray-500">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-[13px] font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

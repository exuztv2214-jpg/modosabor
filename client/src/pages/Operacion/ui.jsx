import { useState } from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed } from 'lucide-react';

import { STROKE } from '../../lib/theme.js';
import { resolveAssetUrl } from '../../lib/assets.js';

export const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

/** Tarjeta base. Blanca sobre el fondo gris, sombra apenas perceptible. */
export function Card({ children, className = '' }) {
  return (
    <section className={`rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
            <Icon size={16} strokeWidth={STROKE} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/**
 * Métrica del día.
 *
 * El número es lo único en negrita: es lo que se lee de un vistazo. La
 * etiqueta y el detalle van en peso normal para no competir con él.
 */
export function Stat({ label, value, helper, icon: Icon, tone, index = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.05, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
    >
      {/* Barrita de color al costado: da identidad a cada métrica sin pintar
          la tarjeta entera, que sería demasiado. */}
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: tone?.fg || '#D1D5DB' }}
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-[12px] text-gray-500">{label}</p>
          <p className="mt-1 text-[28px] font-bold leading-none tabular-nums tracking-tight text-gray-900">
            {value}
          </p>
          {helper ? <p className="mt-1.5 text-[11px] text-gray-400">{helper}</p> : null}
        </div>
        {Icon ? (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ background: tone?.bg || '#F3F4F6', color: tone?.fg || '#6B7280' }}
          >
            <Icon size={18} strokeWidth={STROKE} />
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * Anillo de progreso. Se usa para el chequeo del local: un círculo que se
 * completa comunica "cuánto falta" mucho más rápido que la frase "6 de 8".
 */
export function ProgressRing({ value, total, color = '#059669', size = 46 }) {
  const radio = (size - 6) / 2;
  const circunferencia = 2 * Math.PI * radio;
  const proporcion = total > 0 ? Math.min(1, value / total) : 0;

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          stroke="#E5E7EB"
          strokeWidth="4"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radio}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circunferencia}
          initial={{ strokeDashoffset: circunferencia }}
          animate={{ strokeDashoffset: circunferencia * (1 - proporcion) }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-gray-700">
        {value}
      </span>
    </span>
  );
}

/**
 * Miniatura de un plato.
 *
 * Cae al ícono genérico si el producto no tiene foto o si el archivo se
 * borró del servidor. Nunca deja un hueco ni el ícono roto del navegador.
 */
export function PlatoThumb({ imagen, nombre, size = 44, rounded = 'rounded-xl' }) {
  const [roto, setRoto] = useState(false);
  const url = imagen ? resolveAssetUrl(imagen) : null;

  if (url && !roto) {
    return (
      <img
        src={url}
        alt={nombre || ''}
        onError={() => setRoto(true)}
        style={{ width: size, height: size }}
        className={`shrink-0 object-cover ${rounded}`}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center bg-gray-100 ${rounded}`}
    >
      <UtensilsCrossed size={size * 0.42} strokeWidth={1.5} className="text-gray-300" />
    </span>
  );
}

/** Campo numérico con etiqueta arriba. Se usa en stock y en el menú del día. */
export function NumberField({ label, value, onChange, step = '1', min = '0', className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[11px] font-medium text-gray-400">{label}</span>
      <input
        type="number"
        min={min}
        step={step}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-semibold tabular-nums text-gray-900 outline-none transition focus:border-gray-400"
      />
    </label>
  );
}

/** Interruptor. Reemplaza a los checkbox nativos, que se veían de otra época. */
export function Switch({ checked, onChange, label, hint, tone }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50"
    >
      <span
        className={`mt-0.5 relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? '' : 'bg-gray-200'}`}
        style={checked ? { background: tone || '#059669' } : undefined}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-tight text-gray-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-gray-400">{hint}</span> : null}
      </span>
    </button>
  );
}

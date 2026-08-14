import { useEffect, useRef, useState } from 'react';

/**
 * Sistema visual del TPV.
 *
 * Tres reglas que ordenan todo lo demás:
 *
 *  1. Un solo acento. El rojo de marca aparece en el botón de cobrar, el
 *     precio, el total, la categoría activa y poco más. Todo el resto es
 *     gris. Un color que aparece en todos lados deja de significar algo.
 *
 *  2. El peso tipográfico se gana. `font-bold` está reservado para plata
 *     (precios y totales). Los títulos van en 600, las etiquetas en 500 y
 *     el texto corriente en normal. Antes usábamos `font-black` en todo y
 *     por eso la pantalla se veía gritada.
 *
 *  3. Dos radios y nada más: 12px para controles, 16px para tarjetas. La
 *     separación entre bloques la hace el fondo gris, no los bordes.
 */

/** Formato de plata. Sin decimales: en el mostrador nadie cobra centavos. */
export const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

export const TPV_BG = '#F6F7F9';
export const BRAND = '#DC1F2D';

/** Grosor de trazo único para todos los íconos de lucide. */
export const STROKE = 1.9;

export function SectionLabel({ children, className = '' }) {
  return <p className={`text-[11px] font-semibold text-gray-400 ${className}`}>{children}</p>;
}

/**
 * Popover anclado a un botón.
 *
 * Se cierra con Escape, con click afuera y volviendo a tocar el botón.
 * No usa portal: un `absolute` alcanza y evita peleas de z-index con el
 * drawer del carrito en mobile.
 */
export function Popover({
  open,
  onClose,
  children,
  align = 'left',
  placement = 'bottom',
  className = '',
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onClose?.();
    };

    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      className={`absolute z-40 w-[300px] rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.12)] ${
        placement === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]'
      } ${align === 'right' ? 'right-0' : 'left-0'} ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Botón chico de la fila de utilidades del pedido.
 *
 * El badge numérico es lo que reemplaza a las tarjetas que antes estaban
 * siempre desplegadas: si dice "2" ya sabés que hay dos pedidos guardados
 * sin gastar 140px de alto para averiguarlo.
 */
export function UtilityButton({ icon: Icon, label, badge, active, onClick }) {
  const hasBadge = badge !== undefined && badge !== null && badge !== '' && badge !== 0;

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`relative flex h-9 flex-1 items-center justify-center rounded-xl transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : hasBadge
            ? 'bg-brand-50 text-brand-600 hover:bg-brand-100'
            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
      }`}
    >
      <Icon size={17} strokeWidth={STROKE} />
      {hasBadge ? (
        <span
          className={`absolute right-1.5 top-1 flex h-[15px] min-w-[15px] items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
            active ? 'bg-white text-gray-900' : 'bg-brand-500 text-white'
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Tooltip que explica por qué un botón deshabilitado no se puede apretar.
 *
 * Al no existir ya el bloque de pre-chequeo, este texto es la única forma
 * de saber qué falta. Aparece en hover y en focus, así que también sirve
 * navegando con teclado.
 */
export function BlockedHint({ reason, children }) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      role="group"
      className="relative min-w-0 flex-1"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {visible && reason ? (
        <div
          role="tooltip"
          className="absolute bottom-[calc(100%+10px)] left-1/2 z-40 w-max max-w-[260px] -translate-x-1/2 rounded-xl bg-gray-900 px-3 py-2 text-center text-[11px] font-medium leading-snug text-white shadow-lg"
        >
          {reason}
          <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-gray-900" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

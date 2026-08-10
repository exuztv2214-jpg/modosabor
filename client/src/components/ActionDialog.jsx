import { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * El diálogo de confirmar del sistema.
 *
 * Lo usan dieciséis pantallas: borrar un empleado, cancelar una reserva,
 * cerrar la caja, eliminar un producto. Era el único componente que quedó
 * afuera del rediseño, así que arrastraba tres cosas de la plantilla comprada:
 *
 *   - `bg-rose-600` y `focus:ring-blue-100`, colores sueltos de Tailwind en vez
 *     de la paleta del sistema. El azul es especialmente delator: Modo Sabor no
 *     tiene azul en ningún lado.
 *   - `text-slate-*` donde el resto del sistema usa `gray-*`. Son dos grises
 *     distintos, y puestos al lado se nota.
 *   - Botones en `font-black uppercase tracking-widest`, que gritan. El resto
 *     del sistema usa peso semibold en caja normal.
 *
 * La interfaz de props no cambió: las dieciséis pantallas siguen andando sin
 * tocarlas.
 */
export default function ActionDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  loading = false,
  onConfirm,
  onClose,
  inputLabel = '',
  inputPlaceholder = '',
  inputValue = '',
  onInputChange,
  // Contenido extra bajo la descripción: un detalle de lo que se pierde, una
  // segunda opción menos destructiva. Va antes de los botones para que se lea
  // antes de decidir.
  children,
}) {
  /*
    Escape cierra. Se escucha en el documento y no en la tarjeta porque el foco
    vive en el campo o en los botones: un onKeyDown colgado del contenedor no
    se dispararía nunca.
  */
  useEffect(() => {
    if (!open) return undefined;
    const alPresionar = (evento) => {
      if (evento.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [open, onClose]);

  if (!open) return null;

  const tones = {
    danger: {
      icon: 'bg-danger-50 text-danger-600',
      button: 'bg-danger-600 hover:bg-danger-700 text-white',
    },
    warning: {
      icon: 'bg-warning-50 text-warning-600',
      button: 'bg-warning-500 hover:bg-warning-600 text-white',
    },
    primary: {
      icon: 'bg-brand-50 text-brand-500',
      button: 'bg-brand-500 hover:bg-brand-600 text-white',
    },
  };

  const currentTone = tones[tone] || tones.danger;

  return (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-[2px]"
      /*
        Cierra sólo si el clic cae en el fondo. Se mira el destino en vez de
        frenar la propagación adentro: así la tarjeta queda sin manejadores.
      */
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) onClose?.();
      }}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Confirmar acción'}
      >
        <div className="flex items-start gap-4">
          <div
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${currentTone.icon}`}
          >
            <AlertTriangle size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-gray-900">{title}</h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">{description}</p>
          </div>
        </div>

        {onInputChange ? (
          <div className="mt-6">
            {inputLabel ? (
              <label
                htmlFor="action-dialog-input"
                className="mb-2 block text-[12px] font-medium text-gray-500"
              >
                {inputLabel}
              </label>
            ) : null}
            <input
              id="action-dialog-input"
              autoFocus
              value={inputValue}
              onChange={(event) => onInputChange(event.target.value)}
              placeholder={inputPlaceholder}
              className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-[13px] font-medium text-gray-800 outline-none transition focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-50"
            />
          </div>
        ) : null}

        {children ? <div className="pl-15">{children}</div> : null}

        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl border border-gray-200 px-5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-[13px] font-semibold transition disabled:opacity-60 ${currentTone.button}`}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

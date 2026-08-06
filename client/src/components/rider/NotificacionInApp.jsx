import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, MapPin, X } from 'lucide-react';

import { haptic } from '../../lib/riderHaptics.js';

const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

/**
 * Notificación in-app de pedido nuevo (estilo Rappi).
 *
 * Reemplaza al toast genérico cuando llega un pedido con la app abierta.
 * Cae desde arriba, tiene la marca del local, muestra los datos que le
 * importan al rider (dirección y monto) y trae acción directa.
 *
 * Se puede descartar deslizando hacia arriba — gesto natural para
 * "sacarme esto de encima" sin tener que apuntar a una X chiquita
 * mientras manejás.
 *
 * Auto-cierra a los 8 segundos: es más que un toast normal porque un
 * pedido nuevo merece atención, pero no se queda para siempre tapando
 * la pantalla.
 */
export default function NotificacionInApp({ pedido, onVer, onCerrar }) {
  useEffect(() => {
    if (!pedido) return undefined;
    haptic('newOrder');
    const t = setTimeout(() => onCerrar?.(), 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id]);

  return (
    <AnimatePresence>
      {pedido && (
        <motion.div
          initial={{ y: -120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -120, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 300 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.5, bottom: 0 }}
          onDragEnd={(_, info) => {
            // Deslizar hacia arriba lo descarta.
            if (info.offset.y < -50) onCerrar?.();
          }}
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] cursor-grab active:cursor-grabbing"
        >
          <div
            className="overflow-hidden rounded-[22px] shadow-2xl"
            style={{ background: 'linear-gradient(135deg,#dc1f2d,#b91c1c)' }}
          >
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                <Package size={20} className="text-white" strokeWidth={2.6} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-white/75">Nuevo pedido asignado</p>
                <p className="mt-0.5 truncate text-sm font-bold text-white">
                  #{pedido.numero} · {pedido.cliente_nombre || 'Sin nombre'}
                </p>
                <p className="mt-1 flex items-start gap-1 text-[13px] font-semibold leading-snug text-white/85">
                  <MapPin size={11} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-1">
                    {pedido.cliente_direccion || 'Sin dirección'}
                  </span>
                </p>
              </div>

              <button
                type="button"
                onClick={onCerrar}
                aria-label="Descartar"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white"
              >
                <X size={13} strokeWidth={3} />
              </button>
            </div>

            <div className="flex items-center gap-2 border-t border-white/15 px-4 py-2.5">
              <span className="flex-1 text-lg font-bold tabular-nums text-white">
                {fmtPesos(pedido.total)}
              </span>
              <button
                type="button"
                onClick={() => {
                  haptic('tap');
                  onVer?.(pedido);
                }}
                className="h-9 rounded-xl bg-white px-5 text-[13px] font-semibold text-[#dc1f2d] shadow-md active:scale-95"
              >
                Ver
              </button>
            </div>
          </div>

          {/* Pista visual del gesto de descarte */}
          <p className="mt-1.5 text-center text-[12px] font-medium text-gray-400">
            Deslizá hacia arriba para descartar
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Undo2, AlertTriangle } from 'lucide-react';

import { haptic } from '../../lib/riderHaptics.js';

/**
 * Barra flotante para deshacer una entrega recién marcada.
 *
 * Aparece apenas el rider marca "entregado" y se va sola cuando se
 * acaba la ventana (default 5 min). Muestra el countdown para que se
 * entienda que la opción caduca.
 *
 * Escenario real que resuelve: el rider desliza el swipe sin querer, o
 * marca el pedido equivocado cuando lleva varios encima. Sin esto, el
 * local queda con un pedido "entregado" que sigue en la moto.
 *
 * Props:
 *   pedido       objeto del pedido recién entregado (o null)
 *   ventanaMin   minutos de ventana (default 5)
 *   onDeshacer   async fn(pedido, motivo) → debe devolver true si salió bien
 *   onExpirar    fn() se llama cuando se acaba el tiempo
 */
export default function DeshacerEntrega({ pedido, ventanaMin = 5, onDeshacer, onExpirar }) {
  const [restante, setRestante] = useState(ventanaMin * 60);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Reinicia el contador cada vez que aparece un pedido nuevo.
  useEffect(() => {
    if (!pedido) return undefined;
    setRestante(ventanaMin * 60);
    setConfirmando(false);
    const timer = setInterval(() => {
      setRestante((s) => {
        if (s <= 1) {
          clearInterval(timer);
          onExpirar?.();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido?.id, ventanaMin]);

  if (!pedido) return null;

  const mm = Math.floor(restante / 60);
  const ss = String(restante % 60).padStart(2, '0');

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    haptic('warning');
    try {
      await onDeshacer?.(pedido, 'Marcado por error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AnimatePresence>
      {restante > 0 && (
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="fixed inset-x-3 bottom-3 z-[95]"
        >
          <div className="overflow-hidden rounded-2xl bg-gray-900 shadow-2xl">
            {/* Barra de progreso del tiempo restante */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: restante / (ventanaMin * 60) }}
              transition={{ ease: 'linear', duration: 1 }}
              style={{ originX: 0 }}
              className="h-1 bg-amber-400"
            />

            {!confirmando ? (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-black uppercase tracking-widest text-white">
                    Pedido #{pedido.numero} entregado
                  </p>
                  <p className="mt-0.5 text-[10px] font-semibold text-gray-400">
                    ¿Te equivocaste? Podés deshacerlo por {mm}:{ss}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    haptic('tap');
                    setConfirmando(true);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white active:scale-95"
                >
                  <Undo2 size={13} strokeWidth={3} />
                  Deshacer
                </button>
              </div>
            ) : (
              <div className="px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-[11px] font-bold leading-snug text-white">
                    El pedido vuelve a &quot;en camino&quot; y queda registrado que se marcó por
                    error.
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmando(false)}
                    className="h-10 rounded-xl bg-white/10 text-[10px] font-black uppercase tracking-widest text-gray-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={confirmar}
                    disabled={enviando}
                    className="h-10 rounded-xl bg-amber-500 text-[10px] font-black uppercase tracking-widest text-gray-900 disabled:opacity-60"
                  >
                    {enviando ? 'Deshaciendo...' : 'Sí, deshacer'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

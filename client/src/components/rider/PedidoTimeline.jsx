import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import { ETAPAS_PEDIDO, indiceEtapa } from '../../lib/riderUx.js';

/**
 * Timeline horizontal del ciclo de vida del pedido.
 * Asignado → Retiré → En camino → Entregué
 *
 * Cada punto se llena y muestra un check cuando la etapa se superó.
 * La línea entre puntos se colorea progresivamente con una animación
 * de ancho (scaleX) para que se lea el avance de un vistazo.
 *
 * Si el estado no matchea el flujo normal (cancelado, incidencia)
 * el componente no renderiza nada — no tiene sentido mostrar progreso.
 */
export default function PedidoTimeline({ estado, className = '' }) {
  const actual = indiceEtapa(estado);
  if (actual < 0) return null;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-start">
        {ETAPAS_PEDIDO.map((etapa, i) => {
          const completada = i <= actual;
          const esActual = i === actual;
          const esUltima = i === ETAPAS_PEDIDO.length - 1;
          return (
            <div key={etapa.key} className="flex flex-1 items-start">
              {/* Punto + label */}
              <div className="flex min-w-0 flex-col items-center gap-1.5">
                <motion.div
                  initial={false}
                  animate={{
                    scale: esActual ? [1, 1.15, 1] : 1,
                    backgroundColor: completada ? '#10b981' : '#e5e7eb',
                  }}
                  transition={{
                    scale: esActual
                      ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
                      : { duration: 0.2 },
                    backgroundColor: { duration: 0.35 },
                  }}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm"
                >
                  {completada ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', damping: 14, stiffness: 320 }}
                      className="text-white"
                    >
                      <Check size={14} strokeWidth={3.5} />
                    </motion.span>
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                  )}
                </motion.div>
                <span
                  className={`text-center text-[13px] font-medium leading-tight ${
                    completada ? 'text-emerald-600' : 'text-gray-400'
                  }`}
                >
                  {etapa.label}
                </span>
              </div>

              {/* Conector hacia la siguiente etapa */}
              {!esUltima && (
                <div className="relative mt-3.5 h-1 flex-1 overflow-hidden rounded-full bg-gray-200">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: i < actual ? 1 : 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
                    style={{ originX: 0 }}
                    className="absolute inset-0 rounded-full bg-emerald-500"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

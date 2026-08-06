import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, DollarSign, Clock, Trophy, X } from 'lucide-react';

import { fireRiderConfetti } from '../../lib/riderCelebration.js';
import { fmtDuracion } from '../../lib/riderUx.js';
import { haptic } from '../../lib/riderHaptics.js';

const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

/**
 * Modal de cierre de turno.
 *
 * Se muestra cuando el rider se pone "no disponible" habiendo hecho
 * al menos una entrega. Da cierre emocional al día en vez de un
 * apagado seco, y de paso le deja el resumen a mano por si tiene que
 * rendir efectivo en el local.
 *
 * Props:
 *   open          bool
 *   entregas      number
 *   totalCobrado  number  (pesos)
 *   efectivo      number  (pesos, lo que tiene que rendir)
 *   minutos       number  duración del turno
 *   metaCumplida  bool    llegó o superó la meta diaria configurada
 *   record        bool    superó su récord HISTÓRICO de entregas en un día
 *   recordAnterior number el récord previo, para mostrarlo en el mensaje
 *   onClose       fn
 *
 * `metaCumplida` y `record` son cosas distintas: la meta es un objetivo
 * configurable del negocio (default 10); el récord es la mejor marca
 * personal histórica del rider. Se puede cumplir la meta sin batir el
 * récord, y viceversa.
 */
export default function CierreTurnoModal({
  open,
  entregas = 0,
  totalCobrado = 0,
  efectivo = 0,
  minutos = 0,
  metaCumplida = false,
  record = false,
  recordAnterior = 0,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;
    // Celebración al abrir. Más confetti si batió el récord histórico.
    fireRiderConfetti(record ? 52 : metaCumplida ? 38 : 26);
    haptic('success');
  }, [open, record, metaCumplida]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 24, stiffness: 280 }}
            className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl"
          >
            {/* Header celebratorio */}
            <div
              className="relative px-6 pb-6 pt-7 text-center text-white"
              style={{ background: 'linear-gradient(135deg,#059669,#047857)' }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white"
              >
                <X size={16} strokeWidth={3} />
              </button>

              <motion.div
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 12, stiffness: 220, delay: 0.1 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/20 backdrop-blur"
              >
                <Trophy size={30} strokeWidth={2.4} />
              </motion.div>

              <p className="mt-4 text-[12px] font-medium text-white/80">Turno cerrado</p>
              <h2
                className="mt-1 text-2xl font-bold leading-tight"
                style={{ fontFamily: '"Poppins","Inter",sans-serif' }}
              >
                ¡Buen trabajo!
              </h2>

              {/* Récord histórico tiene prioridad sobre meta cumplida:
                  si batió su marca, ese es el logro que se destaca. */}
              {record ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold text-amber-600"
                >
                  🏆 Récord personal
                  {recordAnterior > 0 ? ` · antes ${recordAnterior}` : ''}
                </motion.div>
              ) : metaCumplida ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="mx-auto mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/25 px-3 py-1.5 text-[12px] font-semibold text-white backdrop-blur"
                >
                  ✅ Meta del día cumplida
                </motion.div>
              ) : null}
            </div>

            {/* Stats del turno. Si no hay marca de inicio (minutos = 0) se
                omite la columna de tiempo en vez de mostrar "0 min", que
                seria un dato falso. */}
            <div
              className={`grid divide-x divide-gray-100 border-b border-gray-100 ${
                minutos > 0 ? 'grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {[
                { icon: Package, label: 'Entregas', value: entregas, tone: 'text-gray-500' },
                ...(minutos > 0
                  ? [
                      {
                        icon: Clock,
                        label: 'Tiempo',
                        value: fmtDuracion(minutos),
                        tone: 'text-gray-500',
                      },
                    ]
                  : []),
                {
                  icon: DollarSign,
                  label: 'Cobrado',
                  value: fmtPesos(totalCobrado),
                  tone: 'text-emerald-600',
                },
              ].map(({ icon: Icon, label, value, tone }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.08 }}
                  className="px-3 py-5 text-center"
                >
                  <Icon size={17} className={`mx-auto ${tone}`} strokeWidth={2.2} />
                  <p className="mt-2 truncate text-[19px] font-bold tabular-nums text-gray-900">
                    {value}
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-400">{label}</p>
                </motion.div>
              ))}
            </div>

            {/* Efectivo a rendir — lo más importante operativamente */}
            {efectivo > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
                className="mx-6 mt-5 rounded-2xl bg-amber-50 px-4 py-3.5"
              >
                <p className="text-[12px] font-medium text-amber-800">
                  Efectivo a rendir en el local
                </p>
                <p className="mt-1 text-[26px] font-bold leading-none tabular-nums text-amber-900">
                  {fmtPesos(efectivo)}
                </p>
              </motion.div>
            )}

            <div className="p-6">
              <button
                type="button"
                onClick={onClose}
                className="h-13 flex h-13 w-full items-center justify-center rounded-2xl bg-gray-900 py-4 text-[15px] font-semibold text-white transition active:scale-[0.98]"
              >
                Listo
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

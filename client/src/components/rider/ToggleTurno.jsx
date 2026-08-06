import { motion, AnimatePresence } from 'framer-motion';
import { Power } from 'lucide-react';

/**
 * Botón grande circular de disponibilidad (estilo Uber Driver).
 *
 * Reemplaza el toggle chico anterior. El rider necesita ver de un
 * vistazo — sin leer — si está trabajando o no. Verde con ondas
 * expansivas = online. Gris apagado = offline.
 *
 * Las ondas (ping) solo corren cuando está online, para no gastar
 * batería de gama baja con animaciones permanentes.
 *
 * NOTA: el feedback háptico lo dispara `toggleOnline` en RiderPanel,
 * no este componente. Si vibrara acá tambien se sentiria doble.
 */
export default function ToggleTurno({ online, onToggle, disabled = false }) {
  const handle = () => {
    if (disabled) return;
    onToggle?.(!online);
  };

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <button
        type="button"
        onClick={handle}
        disabled={disabled}
        aria-pressed={online}
        aria-label={online ? 'Pasar a no disponible' : 'Pasar a disponible'}
        className="relative flex h-[104px] w-[104px] items-center justify-center rounded-full disabled:opacity-50"
      >
        {/* Ondas expansivas solo cuando está online */}
        <AnimatePresence>
          {online && (
            <>
              <motion.span
                key="ring-1"
                initial={{ opacity: 0.55, scale: 1 }}
                animate={{ opacity: 0, scale: 1.55 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                className="absolute inset-0 rounded-full bg-emerald-400"
              />
              <motion.span
                key="ring-2"
                initial={{ opacity: 0.4, scale: 1 }}
                animate={{ opacity: 0, scale: 1.55 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: 1 }}
                className="absolute inset-0 rounded-full bg-emerald-400"
              />
            </>
          )}
        </AnimatePresence>

        {/* Núcleo del botón */}
        <motion.span
          animate={{
            backgroundColor: online ? '#10b981' : '#e5e7eb',
            boxShadow: online
              ? '0 12px 30px -6px rgba(16,185,129,0.55)'
              : '0 6px 16px -6px rgba(0,0,0,0.25)',
          }}
          transition={{ duration: 0.3 }}
          whileTap={{ scale: 0.93 }}
          className="relative z-10 flex h-[92px] w-[92px] items-center justify-center rounded-full"
        >
          <motion.span
            animate={{ color: online ? '#ffffff' : '#9ca3af', rotate: online ? 0 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <Power size={38} strokeWidth={2.8} />
          </motion.span>
        </motion.span>
      </button>

      <div className="text-center">
        <p
          className={`text-[15px] font-semibold transition-colors ${
            online ? 'text-emerald-600' : 'text-gray-400'
          }`}
        >
          {online ? 'Disponible' : 'No disponible'}
        </p>
        <p className="mt-0.5 text-[10px] font-bold text-gray-400">
          {online ? 'Estás recibiendo pedidos' : 'Tocá para empezar a recibir'}
        </p>
      </div>
    </div>
  );
}

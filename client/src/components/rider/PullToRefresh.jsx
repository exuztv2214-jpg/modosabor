import { useRef, useState } from 'react';
import { motion } from 'framer-motion';

import { haptic } from '../../lib/riderHaptics.js';

const UMBRAL = 70; // px que hay que tirar para disparar
const MAX_TIRON = 110;

/**
 * Pull-to-refresh con el logo de Modo Sabor.
 *
 * Implementado a mano con touch events en vez de una librería: son ~80
 * líneas y evita sumar una dependencia de 15 KB a una app que corre en
 * celulares de gama baja.
 *
 * Solo se activa si el scroll está arriba de todo (scrollTop === 0),
 * para no pelearse con el scroll normal de la lista.
 *
 * El logo rota proporcionalmente a cuánto tiraste y da un háptico al
 * cruzar el umbral, así el rider sabe que puede soltar sin mirar.
 */
export default function PullToRefresh({ onRefresh, children, disabled = false }) {
  const [tiron, setTiron] = useState(0);
  const [refrescando, setRefrescando] = useState(false);
  const inicioY = useRef(null);
  const cruzoUmbral = useRef(false);
  const contenedorRef = useRef(null);

  const puedeTirar = () => {
    if (disabled || refrescando) return false;
    const el = contenedorRef.current;
    if (!el) return false;
    // Buscamos el scroller real: puede ser el contenedor o la ventana.
    return (el.scrollTop || window.scrollY || document.documentElement.scrollTop || 0) <= 0;
  };

  const onTouchStart = (e) => {
    if (!puedeTirar()) return;
    inicioY.current = e.touches?.[0]?.clientY ?? null;
    cruzoUmbral.current = false;
  };

  const onTouchMove = (e) => {
    if (inicioY.current === null) return;
    const y = e.touches?.[0]?.clientY ?? 0;
    const delta = y - inicioY.current;
    if (delta <= 0) {
      setTiron(0);
      return;
    }
    // Resistencia: cuanto más tirás, menos se mueve. Se siente natural.
    const conResistencia = Math.min(MAX_TIRON, delta * 0.5);
    setTiron(conResistencia);

    if (conResistencia >= UMBRAL && !cruzoUmbral.current) {
      cruzoUmbral.current = true;
      haptic('tap');
    }
  };

  const onTouchEnd = async () => {
    const debeRefrescar = tiron >= UMBRAL;
    inicioY.current = null;

    if (!debeRefrescar) {
      setTiron(0);
      return;
    }

    setRefrescando(true);
    setTiron(UMBRAL);
    try {
      await onRefresh?.();
    } finally {
      setRefrescando(false);
      setTiron(0);
      cruzoUmbral.current = false;
    }
  };

  const progreso = Math.min(1, tiron / UMBRAL);

  return (
    <div
      ref={contenedorRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="relative"
    >
      {/* Indicador: llamita que gira */}
      <motion.div
        animate={{ height: tiron }}
        transition={{
          type: refrescando ? 'spring' : 'tween',
          duration: refrescando ? undefined : 0,
        }}
        className="flex items-end justify-center overflow-hidden"
      >
        <motion.div
          animate={{
            rotate: refrescando ? 360 : progreso * 270,
            scale: 0.6 + progreso * 0.4,
          }}
          transition={
            refrescando ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0.1 }
          }
          style={{ opacity: progreso }}
          className="mb-2"
        >
          <svg width="24" height="30" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16 0 C14 8, 6 10, 6 20 C6 28, 11 34, 16 40 C21 34, 26 28, 26 20 C26 14, 22 12, 20 8 C19 12, 17 12, 16 10 C15 12, 15 6, 16 0 Z"
              fill="#dc1f2d"
            />
          </svg>
        </motion.div>
      </motion.div>

      <motion.div animate={{ y: refrescando ? 0 : 0 }}>{children}</motion.div>
    </div>
  );
}

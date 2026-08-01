import { useEffect, useRef, useState } from 'react';
import { animate, useMotionValue, useTransform, motion } from 'framer-motion';

/**
 * AnimatedNumber: cuenta desde el valor anterior hasta el nuevo con
 * ease-out. Sirve para dar sensación de "actualización en vivo" cuando
 * el rider entrega otro pedido y sube el contador.
 *
 * @param {number} value - valor final a mostrar
 * @param {(n: number) => string} [format] - formatter opcional (ej: moneda)
 * @param {number} [duration=0.9] - segundos de la animación
 */
export default function AnimatedNumber({ value, format, duration = 0.9, className, style }) {
  const numeric = Number(value) || 0;
  const previousRef = useRef(numeric);
  const motionValue = useMotionValue(previousRef.current);
  const [displayed, setDisplayed] = useState(previousRef.current);

  useEffect(() => {
    const controls = animate(motionValue, numeric, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplayed(latest),
    });
    previousRef.current = numeric;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numeric, duration]);

  const shown = format ? format(displayed) : Math.round(displayed).toLocaleString('es-AR');

  return (
    <span className={className} style={style}>
      {shown}
    </span>
  );
}

/** Toast chico animado que aparece cuando un contador crece.  */
export function DeltaFlash({ delta, colorClass = 'text-emerald-300' }) {
  if (!delta) return null;
  return (
    <motion.span
      key={delta}
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: -8, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className={`pointer-events-none absolute -top-1 right-0 text-[10px] font-black ${colorClass}`}
    >
      +{delta}
    </motion.span>
  );
}

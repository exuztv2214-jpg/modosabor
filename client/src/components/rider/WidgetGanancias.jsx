import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Flame } from 'lucide-react';

import AnimatedNumber from '../AnimatedNumber.jsx';

const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/**
 * Widget de ganancias del día con comparativa y mini gráfico semanal.
 *
 * Los datos vienen del backend (`/repartidores/:id/rider/:code/stats`),
 * no del historial local: así sobreviven a que el rider cambie de
 * celular o se le borre la app.
 *
 * Decisiones:
 *  - La variación vs ayer se omite si ayer fue $0 (no tiene sentido
 *    mostrar "+∞%").
 *  - Las barras del gráfico usan altura mínima visible aunque el día
 *    haya sido cero, para que se entienda que el día existe y estuvo
 *    en cero, no que falta el dato.
 */
export default function WidgetGanancias({ stats, loading = false }) {
  if (loading && !stats) {
    return <div className="rider-shimmer h-40 rounded-[24px]" />;
  }
  if (!stats) return null;

  const hoy = stats.hoy || { entregas: 0, facturado: 0 };
  const variacion = stats.variacionFacturado;
  const serie = Array.isArray(stats.serie7dias) ? stats.serie7dias : [];
  const maxFacturado = Math.max(1, ...serie.map((d) => d.facturado));
  const racha = Number(stats.racha || 0);

  const subio = Number.isFinite(variacion) && variacion > 0;
  const bajo = Number.isFinite(variacion) && variacion < 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
            Cobrado hoy
          </p>
          <p className="mt-1.5 text-3xl font-black tabular-nums text-gray-900">
            $<AnimatedNumber value={hoy.facturado} />
          </p>
          <p className="mt-1 text-xs font-bold text-gray-400">
            {hoy.entregas} {hoy.entregas === 1 ? 'entrega' : 'entregas'}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {(subio || bajo) && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black tabular-nums ${
                subio ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-600'
              }`}
            >
              {subio ? (
                <TrendingUp size={11} strokeWidth={3} />
              ) : (
                <TrendingDown size={11} strokeWidth={3} />
              )}
              {subio ? '+' : ''}
              {variacion}% vs ayer
            </span>
          )}
          {racha >= 2 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-[10px] font-black tabular-nums text-warning-700">
              <Flame size={11} strokeWidth={3} />
              {racha} días seguidos
            </span>
          )}
        </div>
      </div>

      {/* Mini gráfico de los últimos 7 días */}
      {serie.length > 0 && (
        <div className="mt-5">
          <div className="flex items-end justify-between gap-1.5" style={{ height: 56 }}>
            {serie.map((dia, i) => {
              const esHoy = i === serie.length - 1;
              const alturaPct = (dia.facturado / maxFacturado) * 100;
              return (
                <div
                  key={dia.fecha}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                >
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(6, alturaPct)}%` }}
                    transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                    className={`w-full rounded-t-md ${esHoy ? 'bg-primary-500' : 'bg-primary-100'}`}
                    title={`${dia.fecha}: ${fmtPesos(dia.facturado)} · ${dia.entregas} entregas`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between gap-1.5">
            {serie.map((dia, i) => {
              const esHoy = i === serie.length - 1;
              const d = new Date(`${dia.fecha}T12:00:00`);
              return (
                <span
                  key={dia.fecha}
                  className={`flex-1 text-center text-[9px] font-black ${
                    esHoy ? 'text-primary-600' : 'text-gray-300'
                  }`}
                >
                  {DIAS_CORTOS[d.getDay()]}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

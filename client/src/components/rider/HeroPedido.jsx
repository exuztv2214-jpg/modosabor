import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, ChevronRight } from 'lucide-react';

import { fmtDistancia, etaMinutos, distanciaMetros, nivelUrgencia } from '../../lib/riderUx.js';
import { haptic } from '../../lib/riderHaptics.js';

/**
 * Card grande del próximo pedido.
 *
 * Cuando el rider tiene varias entregas asignadas, la lista plana hace
 * que todas compitan por atención. Esta card resuelve la pregunta
 * "¿a dónde voy AHORA?" de un vistazo, y el resto queda abajo en
 * formato compacto.
 *
 * Muestra distancia y ETA solo si tenemos la posición del rider; si el
 * GPS todavía no arrancó, se omiten en vez de mostrar datos inventados.
 */
export default function HeroPedido({ pedido, riderLat, riderLng, onAbrir, onNavegar }) {
  if (!pedido) return null;

  const dist = distanciaMetros(riderLat, riderLng, pedido.cliente_latitud, pedido.cliente_longitud);
  const eta = dist !== null ? etaMinutos(dist) : null;
  const urgencia = nivelUrgencia(pedido.creado_en);
  const inicial = String(pedido.cliente_nombre || '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  const enCamino = pedido.estado === 'en_camino';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="overflow-hidden rounded-[28px] shadow-lg"
      style={{
        background: enCamino
          ? 'linear-gradient(135deg,#059669,#047857)'
          : 'linear-gradient(135deg,#dc1f2d,#b91c1c)',
      }}
    >
      {/* Encabezado: a dónde vas */}
      <button
        type="button"
        onClick={() => {
          haptic('tap');
          onAbrir?.(pedido);
        }}
        className="w-full px-5 pt-5 pb-4 text-left"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/75">
            {enCamino ? 'Estás yendo a' : 'Tu próxima entrega'}
          </span>
          {urgencia.minutos !== null && urgencia.nivel !== 'ok' && (
            <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur">
              <Clock size={10} strokeWidth={3} />
              {urgencia.minutos} min
            </span>
          )}
        </div>

        <div className="mt-3 flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl font-black text-white backdrop-blur">
            {inicial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black leading-tight text-white">
              {pedido.cliente_nombre || 'Sin nombre'}
            </p>
            <p className="mt-1 flex items-start gap-1 text-sm font-semibold leading-snug text-white/85">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{pedido.cliente_direccion || 'Sin dirección'}</span>
            </p>
          </div>
          <ChevronRight size={20} className="mt-1 shrink-0 text-white/60" />
        </div>

        {/* Distancia y ETA: solo si el GPS ya nos ubicó */}
        {dist !== null && (
          <div className="mt-4 flex items-center gap-4">
            <div>
              <p className="text-2xl font-black leading-none text-white tabular-nums">
                {fmtDistancia(dist)}
              </p>
              <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                Distancia
              </p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div>
              <p className="text-2xl font-black leading-none text-white tabular-nums">{eta} min</p>
              <p className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-white/60">
                Estimado
              </p>
            </div>
          </div>
        )}
      </button>

      {/* Acción principal */}
      <div className="border-t border-white/15 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            haptic('tap');
            onNavegar?.(pedido);
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black uppercase tracking-widest text-gray-900 shadow-md transition active:scale-[0.98]"
        >
          <Navigation size={17} strokeWidth={2.8} />
          Ver ruta
        </button>
      </div>
    </motion.div>
  );
}

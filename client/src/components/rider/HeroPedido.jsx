import { motion } from 'framer-motion';
import { MapPin, Navigation, Clock, ChevronRight } from 'lucide-react';

import {
  fmtDistancia,
  etaMinutos,
  distanciaMetros,
  nivelUrgencia,
  tieneUbicacionUsable,
} from '../../lib/riderUx.js';
import { haptic } from '../../lib/riderHaptics.js';

/**
 * Card grande del próximo pedido.
 *
 * Cuando el rider tiene varias entregas asignadas, la lista plana hace
 * que todas compitan por atención. Esta card resuelve la pregunta
 * "¿a dónde voy AHORA?" de un vistazo, y el resto queda abajo en
 * formato compacto.
 *
 * Distancia y ETA se muestran SOLO si el pedido tiene un punto GPS real
 * y el rider ya está ubicado. Si el cliente no compartió ubicación (muy
 * común: "barrio Mutual"), se avisa explícitamente en vez de mostrar
 * números inventados — el (0,0) daba cosas como "7602 km · 16291 min".
 */
export default function HeroPedido({ pedido, riderLat, riderLng, onAbrir, onNavegar }) {
  if (!pedido) return null;

  const tienePunto = tieneUbicacionUsable(pedido);
  const dist = tienePunto
    ? distanciaMetros(riderLat, riderLng, pedido.cliente_latitud, pedido.cliente_longitud)
    : null;
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
          <span className="text-[12px] font-medium text-white/75">
            {enCamino ? 'Estás yendo a' : 'Tu próxima entrega'}
          </span>
          {urgencia.minutos !== null && urgencia.nivel !== 'ok' && (
            <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur">
              <Clock size={10} strokeWidth={3} />
              {urgencia.minutos} min
            </span>
          )}
        </div>

        <div className="mt-3 flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold text-white backdrop-blur">
            {inicial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold leading-tight text-white">
              {pedido.cliente_nombre || 'Sin nombre'}
            </p>
            <p className="mt-1 flex items-start gap-1 text-sm font-semibold leading-snug text-white/85">
              <MapPin size={14} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{pedido.cliente_direccion || 'Sin dirección'}</span>
            </p>
          </div>
          <ChevronRight size={20} className="mt-1 shrink-0 text-white/60" />
        </div>

        {/* Distancia y ETA: solo con punto GPS real Y rider ubicado.
            Si el cliente no compartió ubicación, lo decimos en vez de
            mostrar un número inventado. */}
        {dist !== null ? (
          <div className="mt-4 flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold leading-none text-white tabular-nums">
                {fmtDistancia(dist)}
              </p>
              <p className="mt-0.5 text-[12px] font-medium text-white/60">Distancia</p>
            </div>
            <div className="h-8 w-px bg-white/20" />
            <div>
              <p className="text-2xl font-bold leading-none text-white tabular-nums">{eta} min</p>
              <p className="mt-0.5 text-[12px] font-medium text-white/60">Estimado</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl bg-white/15 px-3 py-2.5 backdrop-blur">
            <p className="text-[13px] font-bold leading-snug text-white/90">
              {tienePunto
                ? 'Buscando tu ubicación para calcular la distancia…'
                : 'El cliente no compartió ubicación exacta. Guiate por la dirección.'}
            </p>
          </div>
        )}
      </button>

      {/* Acción principal: abre el modo ruta con el mapa a pantalla
          completa. Si el pedido no tiene punto GPS el mapa no puede
          trazar nada, así que en ese caso llevamos al detalle. */}
      <div className="border-t border-white/15 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            haptic('tap');
            if (tienePunto) onNavegar?.(pedido);
            else onAbrir?.(pedido);
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[15px] font-semibold text-gray-900 shadow-md transition active:scale-[0.98]"
        >
          <Navigation size={17} strokeWidth={2.8} />
          {tienePunto ? 'Ver ruta en el mapa' : 'Ver pedido'}
        </button>
      </div>
    </motion.div>
  );
}

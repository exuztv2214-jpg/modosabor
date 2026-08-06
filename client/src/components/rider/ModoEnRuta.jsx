import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, Navigation, MapPin, ChevronUp, AlertCircle } from 'lucide-react';

import RiderRouteMap from '../RiderRouteMap.jsx';
import { useWakeLock } from '../../lib/useWakeLock.js';
import {
  fmtDistancia,
  etaMinutos,
  distanciaMetros,
  tieneUbicacionUsable,
} from '../../lib/riderUx.js';
import { haptic } from '../../lib/riderHaptics.js';

const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

/**
 * Modo "en ruta": pantalla completa mientras el rider va manejando.
 *
 * Todo lo que no sea el mapa y la acción de entregar desaparece. Es el
 * mismo patrón que Uber cuando estás en viaje: menos cosas en pantalla
 * = menos distracción arriba de la moto.
 *
 * La pantalla se mantiene encendida con Wake Lock mientras dura, porque
 * si no el celular se bloquea a los 30 segundos y hay que desbloquear
 * manejando. Se libera al salir.
 *
 * Props:
 *   abierto     bool
 *   pedido      pedido en curso
 *   riderLat/Lng posición actual
 *   mapConfig
 *   onCerrar    fn — volver a la vista normal
 *   onEntregar  fn(pedido) — dispara el flujo de entrega
 *   onNavegarExterno fn(pedido) — abrir Google Maps / Waze
 *   onLlamar    fn(telefono)
 *   onIncidencia fn(pedido)
 */
export default function ModoEnRuta({
  abierto,
  pedido,
  riderLat,
  riderLng,
  mapConfig,
  onCerrar,
  onEntregar,
  onNavegarExterno,
  onIncidencia,
}) {
  const [panelAbierto, setPanelAbierto] = useState(false);

  // Solo mantenemos la pantalla viva mientras el modo está activo.
  useWakeLock(Boolean(abierto && pedido));

  if (!pedido) return null;

  // Sin punto GPS real no hay distancia posible. El (0,0) que llega
  // cuando el cliente no comparte ubicacion daba miles de km.
  const dist = tieneUbicacionUsable(pedido)
    ? distanciaMetros(riderLat, riderLng, pedido.cliente_latitud, pedido.cliente_longitud)
    : null;
  const eta = dist !== null ? etaMinutos(dist) : null;
  const cerca = dist !== null && dist < 150;

  return (
    <AnimatePresence>
      {abierto && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex flex-col bg-gray-900"
        >
          {/* ── Barra superior mínima ── */}
          <div className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => {
                haptic('tap');
                onCerrar?.();
              }}
              aria-label="Salir del modo ruta"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <X size={18} strokeWidth={3} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-white/50">Pedido #{pedido.numero}</p>
              <p className="truncate text-sm font-bold text-white">
                {pedido.cliente_nombre || 'Sin nombre'}
              </p>
            </div>
            {dist !== null && (
              <div
                className={`shrink-0 rounded-2xl px-3 py-1.5 text-right ${
                  cerca ? 'bg-emerald-500' : 'bg-white/10'
                }`}
              >
                <p className="text-sm font-bold leading-none text-white tabular-nums">
                  {fmtDistancia(dist)}
                </p>
                <p className="mt-0.5 text-[12px] font-medium text-white/70">
                  {cerca ? '¡Llegando!' : `${eta} min`}
                </p>
              </div>
            )}
          </div>

          {/* ── Mapa: ocupa todo lo que queda ── */}
          <div className="min-h-0 flex-1">
            <RiderRouteMap
              riderLat={riderLat}
              riderLng={riderLng}
              clientLat={pedido.cliente_latitud}
              clientLng={pedido.cliente_longitud}
              clientLocationExact={Boolean(pedido.cliente_ubicacion_exacta)}
              clientGeocoded={Boolean(pedido.cliente_geocodificado)}
              geocodingPrecision={pedido.cliente_geocoding_precision}
              clientAddress={pedido.cliente_direccion}
              onNavigate={() => onNavegarExterno?.(pedido)}
              mapConfig={mapConfig}
            />
          </div>

          {/* ── Panel inferior: colapsado por defecto ── */}
          <div className="shrink-0 rounded-t-[28px] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
            {/* Handle para expandir los detalles */}
            <button
              type="button"
              onClick={() => setPanelAbierto((v) => !v)}
              className="flex w-full flex-col items-center gap-1 px-5 pb-1 pt-3"
            >
              <span className="h-1 w-10 rounded-full bg-gray-300" />
              <span className="flex items-center gap-1 text-[12px] font-medium text-gray-400">
                <ChevronUp
                  size={12}
                  strokeWidth={3}
                  className={`transition-transform ${panelAbierto ? 'rotate-180' : ''}`}
                />
                {panelAbierto ? 'Ocultar' : 'Detalles'}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {panelAbierto && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 px-5 pb-3">
                    <div className="flex items-start gap-2 rounded-2xl bg-gray-50 p-3">
                      <MapPin size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                      <p className="text-sm font-bold leading-snug text-gray-800">
                        {pedido.cliente_direccion || 'Sin dirección'}
                      </p>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-3">
                      <span className="text-[12px] font-medium text-gray-500">A cobrar</span>
                      <span className="text-xl font-bold tabular-nums text-gray-900">
                        {fmtPesos(pedido.total)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {pedido.cliente_telefono && (
                        <a
                          href={`tel:${pedido.cliente_telefono}`}
                          onClick={() => haptic('tap')}
                          className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-50 text-[13px] font-semibold text-emerald-700"
                        >
                          <Phone size={14} /> Llamar
                        </a>
                      )}
                      {/* Estos tres botones se usan manejando. El texto pasó de
                          10px con tracking ancho a 13px normal: a 10px en un
                          celular en la mano no se lee. */}
                      <button
                        type="button"
                        onClick={() => onNavegarExterno?.(pedido)}
                        className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700"
                      >
                        <Navigation size={14} /> Maps
                      </button>
                      <button
                        type="button"
                        onClick={() => onIncidencia?.(pedido)}
                        className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-amber-50 text-[13px] font-semibold text-amber-700"
                      >
                        <AlertCircle size={14} /> Problema
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Acción principal: siempre visible, dedo grande */}
            <div className="px-5 pt-2">
              <button
                type="button"
                onClick={() => {
                  haptic('success');
                  onEntregar?.(pedido);
                }}
                className={`flex h-16 w-full items-center justify-center rounded-2xl text-[17px] font-bold text-white shadow-lg transition active:scale-[0.98] ${
                  cerca ? 'bg-emerald-500 shadow-emerald-200' : 'bg-gray-900'
                }`}
              >
                Marcar entregado
              </button>
              {!cerca && dist !== null && (
                <p className="mt-2 text-center text-[10px] font-bold text-gray-400">
                  Todavía estás a {fmtDistancia(dist)} del destino
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

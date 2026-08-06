import { Star, Gift, X } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { fmt } from '../constants.js';

export function PremiosModal({ open, onClose, detail, config }) {
  if (!open || !detail?.item) return null;

  const puntos = Number(detail.item.puntos_reconocimiento || 0);
  const umbral = Number(config?.umbral_canje_puntos || 0);
  const recompensa = Number(config?.recompensa_canje_pesos || 0);
  const faltan = Math.max(0, umbral - puntos);
  const puedeCanjear = umbral > 0 && puntos >= umbral;
  const progreso = umbral > 0 ? Math.min(100, Math.round((puntos / umbral) * 100)) : 0;

  // Los valores salen de la configuración real del sistema. Antes esta lista
  // estaba escrita a mano en el componente con números que no coincidían con
  // los que efectivamente se otorgan.
  const formas = config
    ? [
        { label: 'Puntualidad', pts: config.puntos_por_puntualidad },
        { label: 'Feedback positivo de un cliente', pts: config.puntos_por_feedback_positivo },
        { label: 'Venta destacada', pts: config.puntos_por_venta_destacada },
      ].filter((f) => Number(f.pts) > 0)
    : [];

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative p-6 text-center text-white" style={{ background: BRAND }}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded-lg p-1.5 text-white/70 transition hover:bg-white/15 hover:text-white"
          >
            <X size={16} strokeWidth={STROKE} />
          </button>
          <Star size={32} className="mx-auto mb-2 fill-white" strokeWidth={0} />
          <p className="text-[36px] font-bold leading-none tabular-nums">{puntos}</p>
          <p className="mt-1 text-[12px] text-white/85">Puntos de {detail.item.nombre}</p>
        </div>

        <div className="space-y-4 p-5">
          {umbral > 0 ? (
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-start gap-2.5">
                <Gift
                  size={16}
                  strokeWidth={STROKE}
                  className="mt-0.5 shrink-0"
                  style={{ color: puedeCanjear ? '#0F6E56' : '#9CA3AF' }}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-gray-900">
                    {puedeCanjear
                      ? `Puede canjear ${recompensa > 0 ? fmt(recompensa) : 'su premio'}`
                      : `Le faltan ${faltan} puntos para canjear`}
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Con {umbral} puntos se canjea
                    {recompensa > 0 ? ` un premio de ${fmt(recompensa)}` : ' un premio'}.
                  </p>
                </div>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progreso}%`,
                    background: puedeCanjear ? '#10B981' : BRAND,
                  }}
                />
              </div>
            </div>
          ) : null}

          {formas.length > 0 ? (
            <div>
              <p className="mb-2 text-[12px] text-gray-500">Cómo se ganan</p>
              <div className="divide-y divide-gray-100">
                {formas.map((f) => (
                  <div key={f.label} className="flex items-center justify-between py-2">
                    <span className="text-[13px] text-gray-700">{f.label}</span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-900">
                      +{f.pts}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-gray-400">
              No se pudo leer la configuración de reconocimientos.
            </p>
          )}

          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

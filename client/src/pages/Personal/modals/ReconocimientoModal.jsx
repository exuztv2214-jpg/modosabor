import { X, Award } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { CONTROL, LABEL } from '../constants.js';

/** Atajos para no tipear siempre lo mismo. */
const SUGERENCIAS = [
  { motivo: 'Puntualidad impecable', puntos: '10' },
  { motivo: 'Cubrió un turno de otro', puntos: '15' },
  { motivo: 'Buen trato con un cliente', puntos: '10' },
  { motivo: 'Sacó adelante un servicio difícil', puntos: '20' },
];

export function ReconocimientoModal({
  open,
  onClose,
  detail,
  form,
  onFormChange,
  saving,
  onConfirm,
}) {
  if (!open || !detail?.item) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Dar un reconocimiento"
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Dar un reconocimiento</h3>
            <p className="mt-0.5 text-[12px] text-gray-500">A {detail.item.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className={LABEL}>Motivo</span>
            <input
              value={form.motivo}
              onChange={(e) => onFormChange((p) => ({ ...p, motivo: e.target.value }))}
              className={CONTROL}
              placeholder="Ej: puntualidad impecable esta semana"
            />
          </label>

          <div className="flex flex-wrap gap-1.5">
            {SUGERENCIAS.map((s) => (
              <button
                key={s.motivo}
                type="button"
                onClick={() => onFormChange((p) => ({ ...p, motivo: s.motivo, puntos: s.puntos }))}
                className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 transition hover:bg-gray-200"
              >
                {s.motivo}
              </button>
            ))}
          </div>

          <label className="block">
            <span className={LABEL}>Puntos</span>
            <input
              type="number"
              min="0"
              max="100"
              value={form.puntos}
              onChange={(e) => onFormChange((p) => ({ ...p, puntos: e.target.value }))}
              className={`${CONTROL} font-mono`}
            />
          </label>

          <label className="block">
            <span className={LABEL}>
              Detalle <span className="font-normal text-gray-400">(opcional)</span>
            </span>
            <textarea
              value={form.descripcion}
              onChange={(e) => onFormChange((p) => ({ ...p, descripcion: e.target.value }))}
              className={`${CONTROL} h-20 resize-none py-2.5`}
              placeholder="Qué pasó exactamente. Queda guardado en su historial."
            />
          </label>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving || !form.motivo.trim()}
            style={{ background: BRAND }}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <Award size={14} strokeWidth={STROKE} />
            {saving ? 'Guardando…' : 'Otorgar'}
          </button>
        </div>
      </div>
    </div>
  );
}

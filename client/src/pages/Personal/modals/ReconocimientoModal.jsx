import { X } from 'lucide-react';
import { CONTROL } from '../constants.js';

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[32px] bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400">
            Reconocimiento para
          </p>
          <p className="text-lg font-black text-gray-900 mt-0.5">{detail.item.nombre}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Motivo *
            </label>
            <input
              value={form.motivo}
              onChange={(e) => onFormChange((p) => ({ ...p, motivo: e.target.value }))}
              className={CONTROL}
              placeholder="Ej: Puntualidad perfecta esta semana"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Puntos a otorgar
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.puntos}
              onChange={(e) => onFormChange((p) => ({ ...p, puntos: e.target.value }))}
              className={CONTROL}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">
              Descripción <span className="normal-case text-gray-300 font-medium">(opcional)</span>
            </label>
            <textarea
              value={form.descripcion}
              onChange={(e) => onFormChange((p) => ({ ...p, descripcion: e.target.value }))}
              className={`${CONTROL} h-20 py-3 resize-none`}
              placeholder="Detallá el reconocimiento..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 h-11 rounded-xl bg-gray-100 text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="flex-1 h-11 rounded-xl bg-success-500 text-sm font-black text-white hover:bg-[#0fc8a6] transition-all disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Otorgar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

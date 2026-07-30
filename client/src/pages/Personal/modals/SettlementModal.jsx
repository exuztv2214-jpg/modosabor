import { X, Banknote } from 'lucide-react';
import { CONTROL, PAYMENT_OPTIONS, fmt } from '../constants.js';

export function SettlementModal({
  open,
  onClose,
  settlementForm,
  onSettlementFormChange,
  selectedPerson,
  detail,
  liquidacionPreview,
  onConfirmar,
  onAuto,
  saving,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#2A3547]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Liquidar Haberes</h3>
            <p className="text-sm font-semibold text-success-500 mt-1">{selectedPerson?.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">
                Unidades ({selectedPerson?.frecuencia_pago})
              </label>
              <input
                type="number"
                value={settlementForm.unidades}
                onChange={(e) =>
                  onSettlementFormChange({ ...settlementForm, unidades: e.target.value })
                }
                className={CONTROL}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Método de Pago</label>
              <select
                value={settlementForm.metodo_pago}
                onChange={(e) =>
                  onSettlementFormChange({ ...settlementForm, metodo_pago: e.target.value })
                }
                className={CONTROL}
              >
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Periodo desde</label>
              <input
                type="date"
                value={settlementForm.periodo_desde}
                onChange={(e) =>
                  onSettlementFormChange({ ...settlementForm, periodo_desde: e.target.value })
                }
                className={CONTROL}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-700 mb-1 block">Periodo hasta</label>
              <input
                type="date"
                value={settlementForm.periodo_hasta}
                onChange={(e) =>
                  onSettlementFormChange({ ...settlementForm, periodo_hasta: e.target.value })
                }
                className={CONTROL}
              />
            </div>
          </div>

          {detail?.resumen_laboral ? (
            <div className="rounded-xl border border-primary-500/15 bg-primary-50/50 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary-500 mb-2">
                Sugerencia automática
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="font-semibold text-gray-500">Jornadas</p>
                  <p className="font-black text-gray-900">
                    {detail.resumen_laboral.unidades_sugeridas || 0}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-gray-500">Neto estimado</p>
                  <p className="font-black text-gray-900">
                    {fmt(detail.resumen_laboral.monto_neto_estimado || 0)}
                  </p>
                </div>
              </div>
              {detail?.resumen_liquidacion_ejecutivo?.recommendation ? (
                <p className="mt-3 text-xs font-semibold leading-5 text-gray-600">
                  {detail.resumen_liquidacion_ejecutivo.recommendation}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            className={`p-6 rounded-xl flex items-center justify-between border ${liquidacionPreview.neto < 0 ? 'bg-danger-50 border-rose-200' : 'bg-[#E6FFFA] border-success-500/20'}`}
          >
            <div>
              <p
                className={`text-xs font-bold uppercase tracking-wider mb-1 ${liquidacionPreview.neto < 0 ? 'text-rose-500' : 'text-success-500'}`}
              >
                Monto Neto Final
              </p>
              <p
                className={`text-3xl font-bold ${liquidacionPreview.neto < 0 ? 'text-danger-600' : 'text-gray-900'}`}
              >
                {liquidacionPreview.label}
              </p>
              {liquidacionPreview.neto < 0 && (
                <p className="text-xs font-semibold text-rose-500 mt-1">
                  ⚠️ Los adelantos superan el sueldo bruto
                </p>
              )}
            </div>
            <div
              className={`h-14 w-14 rounded-full bg-white flex items-center justify-center shadow-sm ${liquidacionPreview.neto < 0 ? 'text-rose-400' : 'text-success-500'}`}
            >
              <Banknote size={32} />
            </div>
          </div>

          <textarea
            value={settlementForm.notas}
            onChange={(e) => onSettlementFormChange({ ...settlementForm, notas: e.target.value })}
            className={CONTROL + ' h-20 py-3 resize-none'}
            placeholder="Añadir nota al recibo..."
          />
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onAuto}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary-500 text-white text-sm font-bold shadow-lg shadow-[#5D87FF]/20 active:scale-95 transition-all disabled:opacity-50"
          >
            Auto liquidar
          </button>
          <button
            onClick={onConfirmar}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-success-500 text-white text-sm font-bold shadow-lg shadow-[#13DEB9]/20 active:scale-95 transition-all"
          >
            Confirmar Pago
          </button>
        </div>
      </div>
    </div>
  );
}

import { Plus, MinusCircle, X } from 'lucide-react';
import { CONTROL } from './constants';

export default function AjusteStockModal({
  movementModal,
  movementForm,
  saving,
  onCloseMovementModal,
  onRegistrarMovimiento,
  onSetMovementForm,
}) {
  if (!movementModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
              <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                Movimiento manual
              </p>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
              {movementModal.nombre}
            </h3>
          </div>
          <button
            onClick={onCloseMovementModal}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
          >
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'entrada' }))}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 font-black text-xs uppercase tracking-widest ${movementForm.tipo === 'entrada' ? 'border-emerald-200 bg-success-50 text-success-600' : 'border-gray-100 text-gray-400'}`}
            >
              <Plus size={16} />
              Entrada
            </button>
            <button
              type="button"
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'salida' }))}
              className={`flex h-14 items-center justify-center gap-2 rounded-2xl border-2 font-black text-xs uppercase tracking-widest ${movementForm.tipo === 'salida' ? 'border-rose-200 bg-danger-50 text-rose-500' : 'border-gray-100 text-gray-400'}`}
            >
              <MinusCircle size={16} />
              Salida
            </button>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Cantidad
            </label>
            <input
              type="number"
              value={movementForm.cantidad}
              onChange={(e) => onSetMovementForm((prev) => ({ ...prev, cantidad: e.target.value }))}
              className={CONTROL + ' mt-1'}
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Motivo
            </label>
            <input
              value={movementForm.motivo}
              onChange={(e) => onSetMovementForm((prev) => ({ ...prev, motivo: e.target.value }))}
              placeholder="Ej: rotura, reposicion, consumo interno"
              className={CONTROL + ' mt-1'}
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onCloseMovementModal}
            className="flex-1 h-14 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onRegistrarMovimiento}
            disabled={saving}
            className="flex-[2] h-14 rounded-2xl bg-primary-500 text-sm font-black text-white uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-600 transition-all disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Confirmar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

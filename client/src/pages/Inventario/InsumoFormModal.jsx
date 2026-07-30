import { X } from 'lucide-react';
import { CONTROL, RUBROS, UNITS } from './constants';

export default function InsumoFormModal({
  insumoModal,
  insumoForm,
  saving,
  onCloseInsumoModal,
  onSaveInsumo,
  onSetInsumoForm,
}) {
  if (!insumoModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
              <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                {insumoModal === 'new' ? 'Crear' : 'Ajustar'}
              </p>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
              Datos del Insumo
            </h3>
          </div>
          <button onClick={onCloseInsumoModal} className="rounded-full p-2 hover:bg-gray-100">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-4">
          <input
            value={insumoForm.nombre}
            onChange={(e) => onSetInsumoForm((p) => ({ ...p, nombre: e.target.value }))}
            placeholder="Nombre (ej: Prepizza Grande)"
            className={CONTROL}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <input
                list="rubros-list"
                value={insumoForm.rubro}
                onChange={(e) => onSetInsumoForm((p) => ({ ...p, rubro: e.target.value }))}
                placeholder="Rubro (libre o elegir)"
                className={CONTROL}
              />
              <datalist id="rubros-list">
                {RUBROS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
            <select
              value={insumoForm.unidad}
              onChange={(e) => onSetInsumoForm((p) => ({ ...p, unidad: e.target.value }))}
              className={CONTROL}
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Stock Actual
              </label>
              <input
                type="number"
                value={insumoForm.stock_actual}
                onChange={(e) => onSetInsumoForm((p) => ({ ...p, stock_actual: e.target.value }))}
                className={CONTROL + ' mt-1'}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Stock Mínimo
              </label>
              <input
                type="number"
                value={insumoForm.stock_minimo}
                onChange={(e) => onSetInsumoForm((p) => ({ ...p, stock_minimo: e.target.value }))}
                className={CONTROL + ' mt-1'}
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Costo Unitario ($)
            </label>
            <input
              type="number"
              value={insumoForm.costo_unitario}
              onChange={(e) => onSetInsumoForm((p) => ({ ...p, costo_unitario: e.target.value }))}
              className={CONTROL + ' mt-1'}
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onCloseInsumoModal}
            className="flex-1 h-14 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
          >
            CANCELAR
          </button>
          <button
            onClick={onSaveInsumo}
            disabled={saving}
            className="flex-[2] h-14 rounded-2xl bg-primary-500 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 active:scale-95 disabled:opacity-50"
          >
            {saving ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
          </button>
        </div>
      </div>
    </div>
  );
}

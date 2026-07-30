import { X } from 'lucide-react';
import { CONTROL, MOVEMENT_TYPES } from '../constants.js';
import { formatAmountForInput } from '../../../lib/amountInput.js';
import { ToggleSwitch } from './ToggleSwitch.jsx';

export function MovementModal({
  open,
  onClose,
  movementForm,
  onMovementFormChange,
  selectedPerson,
  saving,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#2A3547]/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Registrar Movimiento</h3>
            <p className="text-sm font-semibold text-primary-500 mt-1">{selectedPerson?.nombre}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 text-gray-400 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-bold text-gray-700 mb-2 block">Tipo de Movimiento</label>
            <div className="grid grid-cols-3 gap-2">
              {MOVEMENT_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => onMovementFormChange({ ...movementForm, tipo: t })}
                  className={`h-10 rounded-xl text-[11px] font-black uppercase border-2 transition-all ${
                    movementForm.tipo === t
                      ? t === 'adelanto'
                        ? 'border-rose-400 bg-danger-50 text-danger-600'
                        : t === 'descuento'
                          ? 'border-amber-400 bg-warning-50 text-warning-600'
                          : 'border-primary-500 bg-primary-50 text-primary-500'
                      : 'border-gray-100 text-gray-400 hover:border-gray-200'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">Monto ($)</label>
            <input
              type="text"
              inputMode="decimal"
              autoFocus
              value={movementForm.monto}
              onChange={(e) => onMovementFormChange({ ...movementForm, monto: e.target.value })}
              onBlur={() =>
                onMovementFormChange((prev) => ({
                  ...prev,
                  monto: prev.monto === '' ? '' : formatAmountForInput(prev.monto),
                }))
              }
              className={CONTROL + ' text-lg font-bold text-primary-500'}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-700 mb-1 block">
              Descripción / Motivo
            </label>
            <input
              value={movementForm.descripcion}
              onChange={(e) =>
                onMovementFormChange({ ...movementForm, descripcion: e.target.value })
              }
              className={CONTROL}
              placeholder={
                movementForm.tipo === 'adelanto'
                  ? 'Ej: Adelanto de quincena'
                  : movementForm.tipo === 'descuento'
                    ? 'Ej: Descuento por falta'
                    : 'Ej: Consumo en local'
              }
            />
          </div>
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
            <ToggleSwitch
              checked={movementForm.impacta_caja === 1}
              onChange={(v) => onMovementFormChange({ ...movementForm, impacta_caja: v ? 1 : 0 })}
              label="Impactar en Caja"
              description="Registra el movimiento en el cierre de caja."
              color="blue"
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={saving}
            className="flex-1 h-11 rounded-xl bg-primary-500 text-white text-sm font-bold shadow-lg shadow-[#5D87FF]/20 active:scale-95 transition-all disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

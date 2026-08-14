import { X } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { formatAmountForInput } from '../../../lib/amountInput.js';
import { CONTROL, LABEL, fmt } from '../constants.js';
import { ToggleSwitch } from './ToggleSwitch.jsx';

/**
 * Los tres tipos, explicados.
 *
 * Antes los botones mostraban el valor crudo en mayúsculas —ADELANTO,
 * DESCUENTO, CONSUMO— sin decir qué hace cada uno. Los tres terminan restando
 * del sueldo, así que la diferencia sólo importa para el historial, y eso no
 * se aclaraba en ningún lado.
 */
const TIPOS = [
  {
    value: 'adelanto',
    label: 'Adelanto',
    ayuda: 'Le diste plata a cuenta del sueldo.',
    placeholder: 'Ej: adelanto de quincena',
  },
  {
    value: 'descuento',
    label: 'Descuento',
    ayuda: 'Se le descuenta por algo puntual.',
    placeholder: 'Ej: rotura de vajilla',
  },
  {
    value: 'consumo',
    label: 'Consumo',
    ayuda: 'Se llevó algo del local.',
    placeholder: 'Ej: cena del turno',
  },
];

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

  const tipo = TIPOS.find((t) => t.value === movementForm.tipo) || TIPOS[0];
  const pendienteActual = Number(selectedPerson?.pendiente_total || 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
      }}
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
        }}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Nuevo movimiento</h3>
            <p className="mt-0.5 text-[12px] text-gray-500">{selectedPerson?.nombre}</p>
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
          <div>
            <span className={LABEL}>Tipo</span>
            <div className="grid grid-cols-3 gap-2">
              {TIPOS.map((t) => {
                const activo = movementForm.tipo === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => onMovementFormChange({ ...movementForm, tipo: t.value })}
                    className="h-10 rounded-xl text-[13px] font-semibold transition"
                    style={{
                      background: activo ? '#FEF2F2' : '#F3F4F6',
                      color: activo ? BRAND : '#6B7280',
                      boxShadow: activo ? `inset 0 0 0 1.5px ${BRAND}` : 'none',
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-gray-500">{tipo.ayuda}</p>
          </div>

          <label className="block">
            <span className={LABEL}>Monto</span>
            <input
              type="text"
              inputMode="decimal"
              value={movementForm.monto}
              onChange={(e) => onMovementFormChange({ ...movementForm, monto: e.target.value })}
              onBlur={() =>
                onMovementFormChange((prev) => ({
                  ...prev,
                  monto: prev.monto === '' ? '' : formatAmountForInput(prev.monto),
                }))
              }
              className={`${CONTROL} h-12 font-mono text-[17px] font-semibold`}
              placeholder="0,00"
            />
          </label>

          <label className="block">
            <span className={LABEL}>Motivo</span>
            <input
              value={movementForm.descripcion}
              onChange={(e) =>
                onMovementFormChange({ ...movementForm, descripcion: e.target.value })
              }
              className={CONTROL}
              placeholder={tipo.placeholder}
            />
          </label>

          <div className="rounded-xl bg-gray-50 p-4">
            <ToggleSwitch
              checked={movementForm.impacta_caja === 1}
              onChange={(v) => onMovementFormChange({ ...movementForm, impacta_caja: v ? 1 : 0 })}
              label="Impactar en caja"
              description="Si está activo, sale del efectivo del día y aparece en el cierre."
            />
          </div>

          {/* No se veía en ningún lado cuánto le quedaba debiendo después de
              cargar el movimiento, que es justo lo que querés saber. */}
          {pendienteActual > 0 ? (
            <p className="text-[12px] text-gray-500">
              Ya tiene {fmt(pendienteActual)} sin liquidar.
            </p>
          ) : null}
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
            disabled={saving}
            style={{ background: BRAND }}
            className="h-11 flex-1 rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>
  );
}

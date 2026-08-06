import { MinusCircle, Plus, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { CONTROL } from './constants';

const MOTIVOS = {
  entrada: ['Reposición', 'Compra sin remito', 'Devolución', 'Corrección de conteo'],
  salida: ['Rotura', 'Vencimiento', 'Consumo interno', 'Corrección de conteo'],
};

export default function AjusteStockModal({
  movementModal,
  movementForm,
  saving,
  onCloseMovementModal,
  onRegistrarMovimiento,
  onSetMovementForm,
}) {
  if (!movementModal) return null;

  const esEntrada = movementForm.tipo === 'entrada';
  const cantidad = Number(movementForm.cantidad || 0);
  const actual = Number(movementModal.stock_actual || 0);
  // Antes cargabas un número a ciegas: no se veía el stock actual ni cómo
  // quedaba después del movimiento.
  const resultado = esEntrada ? actual + cantidad : actual - cantidad;
  const dejaNegativo = !esEntrada && cantidad > 0 && resultado < 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onCloseMovementModal}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[17px] font-semibold text-gray-900">
              {movementModal.nombre}
            </h3>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Tiene {actual} {movementModal.unidad} en stock
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseMovementModal}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'entrada' }))}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                esEntrada
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Plus size={15} strokeWidth={STROKE} />
              Entra
            </button>
            <button
              type="button"
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'salida' }))}
              style={!esEntrada ? { borderColor: BRAND, color: BRAND } : undefined}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                !esEntrada ? 'bg-red-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <MinusCircle size={15} strokeWidth={STROKE} />
              Sale
            </button>
          </div>

          <div>
            <label className="block text-[12px] font-medium text-gray-600">Cantidad</label>
            <input
              type="number"
              min="0"
              value={movementForm.cantidad}
              onChange={(e) => onSetMovementForm((prev) => ({ ...prev, cantidad: e.target.value }))}
              className={`${CONTROL} mt-1 text-[18px] font-semibold tabular-nums`}
              placeholder="0"
            />
          </div>

          {cantidad > 0 ? (
            <div
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
              style={{ background: dejaNegativo ? '#FEF2F2' : '#F3F4F6' }}
            >
              <span className="text-[13px] text-gray-600">Queda en</span>
              <span
                className="text-[16px] font-bold tabular-nums"
                style={{ color: dejaNegativo ? BRAND : '#111827' }}
              >
                {resultado} {movementModal.unidad}
              </span>
            </div>
          ) : null}

          {dejaNegativo ? (
            <p className="text-[12px] leading-4" style={{ color: BRAND }}>
              La salida es mayor al stock que hay cargado. Revisá la cantidad antes de confirmar.
            </p>
          ) : null}

          <div>
            <label className="block text-[12px] font-medium text-gray-600">Motivo</label>
            <input
              value={movementForm.motivo}
              onChange={(e) => onSetMovementForm((prev) => ({ ...prev, motivo: e.target.value }))}
              placeholder="Por qué se ajusta"
              className={`${CONTROL} mt-1`}
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(MOTIVOS[movementForm.tipo] || []).map((motivo) => (
                <button
                  key={motivo}
                  type="button"
                  onClick={() => onSetMovementForm((prev) => ({ ...prev, motivo }))}
                  className="rounded-lg bg-gray-100 px-2.5 py-1 text-[12px] font-medium text-gray-700 transition hover:bg-gray-200"
                >
                  {motivo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onCloseMovementModal}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onRegistrarMovimiento}
            disabled={saving || cantidad <= 0}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Registrar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

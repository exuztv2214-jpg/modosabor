import { MinusCircle, Plus, Trash2, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { CONTROL } from './constants';

const MOTIVOS = {
  entrada: ['Reposición', 'Compra sin remito', 'Devolución', 'Corrección de conteo'],
  salida: ['Consumo interno', 'Corrección de conteo', 'Traslado'],
  /*
    Los de merma tienen que coincidir **exactamente** con MOTIVOS_MERMA del
    servidor: la ruta rechaza cualquier otro. Es a propósito — con motivo libre,
    "vencido", "Vencido" y "se venció" serían tres categorías distintas y el
    reporte de fin de mes no serviría para nada.

    "Rotura" y "Vencimiento" salieron de la lista de salida: eran mermas
    disfrazadas de ajuste, que bajaban el stock sin registrar la plata perdida.
  */
  merma: [
    'vencido',
    'roto o caído',
    'mal preparado',
    'devuelto por el cliente',
    'prueba o degustación',
    'robo o faltante',
    'otro',
  ],
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
  const esMerma = movementForm.tipo === 'merma';
  const cantidad = Number(movementForm.cantidad || 0);
  const actual = Number(movementModal.stock_actual || 0);
  // Antes cargabas un número a ciegas: no se veía el stock actual ni cómo
  // quedaba después del movimiento.
  const resultado = esEntrada ? actual + cantidad : actual - cantidad;
  const dejaNegativo = !esEntrada && cantidad > 0 && resultado < 0;

  /*
    Cuánta plata se está por tirar. Se muestra **antes** de confirmar, no
    después: ver "$12.000" ahí mismo es lo que hace que alguien piense dos veces
    y que la merma se registre en serio en vez de ser un trámite.

    El costo unitario viene en pesos desde el servidor, igual que el resto de la
    plata que llega a la pantalla.
  */
  const costoPerdido = esMerma ? cantidad * Number(movementModal.costo_unitario || 0) : 0;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseMovementModal?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Ajustar stock de ${movementModal.nombre || 'insumo'}`}
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
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
          {/*
            Tres modos. "Se tiró" es su propia opción y no un motivo adentro de
            "Sale" porque no son la misma cosa: una salida mueve stock, una
            merma es plata perdida. Mezclarlas es lo que hacía imposible saber
            cuánto se tira por mes.
          */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() =>
                onSetMovementForm((prev) => ({ ...prev, tipo: 'entrada', motivo: '' }))
              }
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
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'salida', motivo: '' }))}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                movementForm.tipo === 'salida'
                  ? 'border-gray-900 bg-gray-100 text-gray-900'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <MinusCircle size={15} strokeWidth={STROKE} />
              Sale
            </button>
            <button
              type="button"
              onClick={() => onSetMovementForm((prev) => ({ ...prev, tipo: 'merma', motivo: '' }))}
              style={esMerma ? { borderColor: BRAND, color: BRAND } : undefined}
              className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-semibold transition ${
                esMerma ? 'bg-red-50' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Trash2 size={15} strokeWidth={STROKE} />
              Se tiró
            </button>
          </div>

          <div>
            <label
              htmlFor="field-AjusteStockModal-jsx-85-0"
              className="block text-[12px] font-medium text-gray-600"
            >
              Cantidad
            </label>
            <input
              id="field-AjusteStockModal-jsx-85-0"
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

          {/* La plata que se está por tirar, antes de confirmar. */}
          {esMerma && cantidad > 0 ? (
            <div className="rounded-xl bg-red-50 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] text-gray-600">Se pierden</span>
                <span className="text-[18px] font-bold tabular-nums" style={{ color: BRAND }}>
                  ${costoPerdido.toLocaleString('es-AR')}
                </span>
              </div>
              {!Number(movementModal.costo_unitario) ? (
                <p className="mt-1 text-[11px] leading-4 text-gray-500">
                  Este insumo no tiene costo cargado, así que la pérdida figura en cero. Cargale el
                  costo para que el reporte sirva.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <label
              htmlFor="field-AjusteStockModal-jsx-118-1"
              className="block text-[12px] font-medium text-gray-600"
            >
              Motivo
            </label>
            {/*
              En una merma el motivo NO se puede escribir a mano: tiene que ser
              uno de la lista, porque el servidor rechaza cualquier otro. Con
              texto libre, "vencido", "Vencido" y "se venció" serían tres
              categorías y el reporte no serviría.
            */}
            {!esMerma ? (
              <input
                id="field-AjusteStockModal-jsx-118-1"
                value={movementForm.motivo}
                onChange={(e) => onSetMovementForm((prev) => ({ ...prev, motivo: e.target.value }))}
                placeholder="Por qué se ajusta"
                className={`${CONTROL} mt-1`}
              />
            ) : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(MOTIVOS[movementForm.tipo] || []).map((motivo) => {
                const elegido = movementForm.motivo === motivo;
                return (
                  <button
                    key={motivo}
                    type="button"
                    onClick={() => onSetMovementForm((prev) => ({ ...prev, motivo }))}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition ${
                      elegido
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {motivo}
                  </button>
                );
              })}
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
            // En una merma el motivo es obligatorio: sin él, el servidor
            // rechaza y el usuario se come un error que se podía evitar acá.
            disabled={saving || cantidad <= 0 || (esMerma && !movementForm.motivo)}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : esMerma ? 'Registrar la merma' : 'Registrar movimiento'}
          </button>
        </div>
      </div>
    </div>
  );
}

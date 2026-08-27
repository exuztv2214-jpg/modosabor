import { X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { CONTROL, RUBROS, UNITS } from './constants';

function Campo({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function InsumoFormModal({
  insumoModal,
  insumoForm,
  saving,
  onCloseInsumoModal,
  onSaveInsumo,
  onSetInsumoForm,
}) {
  if (!insumoModal) return null;

  const set = (campo) => (e) => onSetInsumoForm((p) => ({ ...p, [campo]: e.target.value }));
  const esNuevo = insumoModal === 'new';

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseInsumoModal?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={esNuevo ? 'Nuevo insumo' : 'Editar insumo'}
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-gray-900">
              {esNuevo ? 'Nuevo insumo' : `Editar ${insumoForm.nombre || 'insumo'}`}
            </h3>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Los insumos son la materia prima que descuentan las recetas
            </p>
          </div>
          <button
            type="button"
            onClick={onCloseInsumoModal}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {/* Nombre, rubro y unidad eran sólo `placeholder`: apenas cargabas
              los datos no se sabía qué era cada campo. */}
          <Campo label="Nombre">
            <input
              value={insumoForm.nombre}
              onChange={set('nombre')}
              placeholder="Ej: Prepizza grande"
              className={CONTROL}
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Rubro" hint="Podés escribir uno nuevo">
              <input
                list="rubros-list"
                value={insumoForm.rubro}
                onChange={set('rubro')}
                placeholder="General"
                className={CONTROL}
              />
              <datalist id="rubros-list">
                {RUBROS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Campo>

            <Campo label="Unidad" hint="Cómo se cuenta este insumo">
              <select value={insumoForm.unidad} onChange={set('unidad')} className={CONTROL}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Stock actual">
              <input
                type="number"
                min="0"
                value={insumoForm.stock_actual}
                onChange={set('stock_actual')}
                className={`${CONTROL} tabular-nums`}
              />
            </Campo>

            <Campo label="Stock mínimo" hint="Debajo de esto avisa que falta">
              <input
                type="number"
                min="0"
                value={insumoForm.stock_minimo}
                onChange={set('stock_minimo')}
                className={`${CONTROL} tabular-nums`}
              />
            </Campo>
          </div>

          <Campo label="Costo unitario" hint="Lo que te cuesta una unidad">
            <input
              type="number"
              min="0"
              value={insumoForm.costo_unitario}
              onChange={set('costo_unitario')}
              className={`${CONTROL} tabular-nums`}
            />
          </Campo>

          {/*
            `activo` viaja en el formulario desde siempre pero no había ningún
            control para cambiarlo: sólo se podía dar de baja un insumo desde
            la base de datos.
          */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={Number(insumoForm.activo) === 1}
              onChange={(e) => onSetInsumoForm((p) => ({ ...p, activo: e.target.checked ? 1 : 0 }))}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
              style={{ accentColor: BRAND }}
            />
            <span>
              <span className="block text-[13px] font-medium text-gray-900">Insumo en uso</span>
              <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                Si lo desactivás deja de aparecer al cargar compras y recetas.
              </span>
            </span>
          </label>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onCloseInsumoModal}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSaveInsumo}
            disabled={saving || !String(insumoForm.nombre || '').trim()}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : esNuevo ? 'Crear insumo' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

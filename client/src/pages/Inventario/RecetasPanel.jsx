import { useState } from 'react';
import { AlertTriangle, ChevronDown, Plus, Save, Trash2, Wand2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import ActionDialog from '../../components/ActionDialog.jsx';
import { CONTROL } from './constants';
import { fmtStock } from './utils';

export default function RecetasPanel({
  productos,
  selectedProductId,
  selectedProduct,
  productConfig,
  recipeRows,
  insumos,
  saving,
  onSetSelectedProductId,
  onSetProductConfig,
  onSaveProductConfig,
  onSyncPizzas,
  onSyncEmpanadas,
  onSyncMilanesas,
  onSyncHamburguesas,
  onSyncPapas,
  onSetRecipeRows,
  onSaveRecipe,
}) {
  const [masivasAbiertas, setMasivasAbiertas] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);

  const porReceta = productConfig.stock_mode === 'recipe';

  /*
    Las cinco sincronizaciones reescriben de una sola vez las recetas de toda
    una familia de productos. Estaban como cinco botones azules idénticos, en
    la misma fila que "Guardar modo", sin ninguna confirmación: un clic
    equivocado te reescribía las recetas de todas las milanesas y no había
    forma de volver atrás.
  */
  const MASIVAS = [
    { label: 'Pizzas con Prepizza', accion: onSyncPizzas },
    { label: 'Empanadas', accion: onSyncEmpanadas },
    { label: 'Milanesas', accion: onSyncMilanesas },
    { label: 'Hamburguesas', accion: onSyncHamburguesas },
    { label: 'Papas Full Cheddar', accion: onSyncPapas },
  ];

  /**
   * `const next = [...recipeRows]; next[idx].campo = valor` copia el array
   * pero no los objetos: estaba mutando la misma fila que seguía dentro del
   * estado, así que React comparaba la referencia contra sí misma.
   */
  const setRow = (idx, campo, valor) => {
    onSetRecipeRows((rows) =>
      rows.map((row, index) => (index === idx ? { ...row, [campo]: valor } : row))
    );
  };

  const insumoDe = (id) => insumos.find((i) => String(i.id) === String(id)) || null;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-4">
        <h3 className="text-[15px] font-semibold text-gray-900">Recetas y descuento de stock</h3>
        <p className="mt-0.5 text-[12px] text-gray-500">
          Definí de qué insumos descuenta cada producto cuando se vende
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <div>
          <label className="block text-[12px] font-medium text-gray-600">Producto</label>
          <select
            value={selectedProductId}
            onChange={(e) => onSetSelectedProductId(e.target.value)}
            className={CONTROL + ' mt-1'}
          >
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {p.stock_mode === 'recipe' ? 'por receta' : 'stock directo'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-gray-600">Cómo lleva el stock</label>
          <select
            value={productConfig.stock_mode}
            onChange={(e) => onSetProductConfig((p) => ({ ...p, stock_mode: e.target.value }))}
            className={CONTROL + ' mt-1 font-medium'}
          >
            <option value="direct">Stock directo</option>
            <option value="recipe">Por receta</option>
          </select>
        </div>
      </div>

      {selectedProduct && !selectedProduct.disponible_para_venta ? (
        <div
          className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5"
          style={{ background: '#FEF2F2' }}
        >
          <AlertTriangle
            size={15}
            strokeWidth={STROKE}
            className="mt-0.5 shrink-0"
            style={{ color: BRAND }}
          />
          <p className="text-[12px] leading-4" style={{ color: '#7F1D1D' }}>
            El TPV no deja vender este producto ahora mismo: le falta stock de algún insumo de su
            receta.
          </p>
        </div>
      ) : null}

      {porReceta ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-gray-600">
              Descuenta de estos insumos por cada unidad vendida
            </p>
            <button
              type="button"
              onClick={() =>
                onSetRecipeRows((rows) => [
                  ...rows,
                  {
                    insumo_id: '',
                    cantidad: '',
                    condicion_tipo: 'siempre',
                    condicion_grupo: '',
                    condicion_valor: '',
                  },
                ])
              }
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <Plus size={13} strokeWidth={STROKE} />
              Insumo
            </button>
          </div>

          {recipeRows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-[13px] text-gray-400">
              La receta está vacía. Sin insumos cargados este producto no descuenta nada al
              venderse.
            </p>
          ) : (
            <div className="space-y-2">
              {recipeRows.map((row, idx) => {
                const insumo = insumoDe(row.insumo_id);
                const condicional = row.condicion_tipo && row.condicion_tipo !== 'siempre';

                return (
                  <div key={idx} className="rounded-xl bg-gray-50 p-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={row.insumo_id}
                        onChange={(e) => setRow(idx, 'insumo_id', e.target.value)}
                        className={CONTROL + ' flex-1'}
                      >
                        <option value="">Elegí un insumo…</option>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} ({i.unidad})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={row.cantidad}
                        onChange={(e) => setRow(idx, 'cantidad', e.target.value)}
                        placeholder="Cant."
                        className={`${CONTROL} w-[110px] tabular-nums`}
                      />
                      <button
                        type="button"
                        onClick={() => onSetRecipeRows((rows) => rows.filter((_, i) => i !== idx))}
                        title="Quitar de la receta"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} strokeWidth={STROKE} />
                      </button>
                    </div>

                    {/* Elegías un insumo sin ver cuánto había en stock. */}
                    {insumo ? (
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px]">
                        <span style={{ color: insumo.stock_bajo ? BRAND : '#9CA3AF' }}>
                          Hay {fmtStock(insumo.stock_actual, insumo.unidad)}
                          {insumo.stock_bajo ? ' · por debajo del mínimo' : ''}
                        </span>
                        {condicional ? (
                          <span className="rounded-full bg-white px-2 py-0.5 text-gray-500">
                            Sólo si {row.condicion_grupo || 'variante'} ={' '}
                            {row.condicion_valor || '—'}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onSaveRecipe}
            disabled={saving}
            style={{ background: BRAND }}
            className="mt-3 inline-flex h-11 items-center gap-1.5 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <Save size={15} strokeWidth={STROKE} />
            {saving ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-gray-50 p-4">
          <p className="text-[13px] text-gray-600">
            Este producto lleva stock propio: se descuenta de a una unidad y no toca los insumos.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-40">
              <label className="block text-[12px] font-medium text-gray-600">Stock actual</label>
              <input
                type="number"
                min="0"
                value={productConfig.stock_directo}
                onChange={(e) =>
                  onSetProductConfig((p) => ({ ...p, stock_directo: e.target.value }))
                }
                className={`${CONTROL} mt-1 tabular-nums`}
              />
            </div>
            <button
              type="button"
              onClick={onSaveProductConfig}
              disabled={!selectedProduct || saving}
              style={{ background: BRAND }}
              className="h-11 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {porReceta ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={onSaveProductConfig}
            disabled={!selectedProduct || saving}
            className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
          >
            Guardar modo de stock
          </button>
        </div>
      ) : null}

      {/* ── Acciones masivas, plegadas ── */}
      <div className="mt-4 border-t border-gray-100 pt-3">
        <button
          type="button"
          onClick={() => setMasivasAbiertas((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-700">
            <Wand2 size={14} strokeWidth={STROKE} className="text-gray-400" />
            Armar recetas en lote
          </span>
          <ChevronDown
            size={16}
            strokeWidth={STROKE}
            className={`text-gray-400 transition ${masivasAbiertas ? 'rotate-180' : ''}`}
          />
        </button>

        {masivasAbiertas ? (
          <>
            <p className="mt-2 text-[12px] leading-4 text-gray-500">
              Cada botón reescribe de golpe la receta de toda una familia de productos con la
              configuración estándar. Sirve para dejar todo armado de una, pero pisa lo que hayas
              ajustado a mano en esos productos.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {MASIVAS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setConfirmacion(item)}
                  disabled={saving}
                  className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>

      <ActionDialog
        open={Boolean(confirmacion)}
        title={confirmacion ? `Rearmar recetas: ${confirmacion.label}` : ''}
        description="Se reescriben las recetas de todos los productos de esa familia con la configuración estándar. Si alguno tenía una receta ajustada a mano, se pierde. No se puede deshacer."
        confirmLabel="Rearmar igual"
        cancelLabel="Cancelar"
        tone="warning"
        loading={saving}
        onConfirm={() => {
          confirmacion?.accion?.();
          setConfirmacion(null);
        }}
        onClose={() => setConfirmacion(null)}
      />
    </div>
  );
}

import { TrendingUp, Plus, Save, X } from 'lucide-react';
import { CONTROL } from './constants';

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
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-sm border border-gray-100">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-[#FEF5E5] flex items-center justify-center text-warning-500">
          <TrendingUp size={20} strokeWidth={3} />
        </div>
        <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
          Vincular Productos a Stock Compartido
        </h3>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 flex-wrap">
          <div className="flex-1">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Elegir Producto
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => onSetSelectedProductId(e.target.value)}
              className={CONTROL + ' mt-1'}
            >
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre} ({p.stock_mode === 'recipe' ? 'Receta' : 'Stock Directo'})
                </option>
              ))}
            </select>
          </div>
          <div className="md:w-48">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Modo Stock
            </label>
            <select
              value={productConfig.stock_mode}
              onChange={(e) => onSetProductConfig((p) => ({ ...p, stock_mode: e.target.value }))}
              className={CONTROL + ' mt-1'}
            >
              <option value="direct">Stock Directo</option>
              <option value="recipe">Usa Receta</option>
            </select>
          </div>
          <div className="md:w-48 md:self-end">
            <button
              onClick={onSaveProductConfig}
              disabled={!selectedProduct || saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Guardar modo
            </button>
          </div>
          <div className="md:w-72 md:self-end">
            <button
              onClick={onSyncPizzas}
              disabled={saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Sincronizar pizzas con Prepizza
            </button>
          </div>
          <div className="md:w-72 md:self-end">
            <button
              onClick={onSyncEmpanadas}
              disabled={saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Sincronizar empanadas
            </button>
          </div>
          <div className="md:w-72 md:self-end">
            <button
              onClick={onSyncMilanesas}
              disabled={saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Sincronizar milanesas
            </button>
          </div>
          <div className="md:w-72 md:self-end">
            <button
              onClick={onSyncHamburguesas}
              disabled={saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Sincronizar hamburguesas
            </button>
          </div>
          <div className="md:w-72 md:self-end">
            <button
              onClick={onSyncPapas}
              disabled={saving}
              className="h-11 w-full rounded-2xl bg-primary-500 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
            >
              Sincronizar papas
            </button>
          </div>
        </div>

        {productConfig.stock_mode === 'recipe' ? (
          <div className="space-y-4 rounded-[24px] bg-background p-6 border border-blue-50">
            <p className="text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest italic">
              Este producto descontará de los siguientes insumos:
            </p>

            {recipeRows.map((row, idx) => (
              <div
                key={idx}
                className="flex flex-wrap gap-3 items-end bg-white p-4 rounded-2xl shadow-sm border border-gray-100"
              >
                <div className="flex-1 min-w-[150px]">
                  <select
                    value={row.insumo_id}
                    onChange={(e) => {
                      const next = [...recipeRows];
                      next[idx].insumo_id = e.target.value;
                      onSetRecipeRows(next);
                    }}
                    className={CONTROL + ' h-10 px-3 bg-white'}
                  >
                    <option value="">Elegir base...</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <input
                    type="number"
                    value={row.cantidad}
                    onChange={(e) => {
                      const next = [...recipeRows];
                      next[idx].cantidad = e.target.value;
                      onSetRecipeRows(next);
                    }}
                    placeholder="Cant."
                    className={CONTROL + ' h-10 px-3 bg-white'}
                  />
                </div>
                <button
                  onClick={() => onSetRecipeRows(recipeRows.filter((_, i) => i !== idx))}
                  className="h-10 w-10 rounded-xl bg-danger-50 text-rose-500 flex items-center justify-center hover:bg-danger-100 transition-all"
                >
                  <X size={18} />
                </button>
              </div>
            ))}

            <div className="flex gap-3 pt-2">
              <button
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
                className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black text-gray-600 hover:bg-gray-50 transition-all"
              >
                <Plus size={16} /> AGREGAR INSUMO
              </button>
              <button
                onClick={onSaveRecipe}
                disabled={saving}
                className="flex h-11 items-center gap-2 rounded-xl bg-primary-500 px-6 text-xs font-black text-white shadow-lg shadow-primary-100 hover:bg-primary-600 transition-all"
              >
                <Save size={16} /> GUARDAR RECETA
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] bg-white p-8 border-2 border-dashed border-gray-100">
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">
              Este producto usa stock directo.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-[180px_1fr]">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Stock Directo
                </label>
                <input
                  type="number"
                  value={productConfig.stock_directo}
                  onChange={(e) =>
                    onSetProductConfig((p) => ({ ...p, stock_directo: e.target.value }))
                  }
                  className={CONTROL + ' mt-1'}
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={onSaveProductConfig}
                  disabled={!selectedProduct || saving}
                  className="h-11 rounded-2xl bg-primary-500 px-6 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 disabled:opacity-50"
                >
                  Guardar stock directo
                </button>
              </div>
            </div>
            <button
              onClick={() => onSetProductConfig((p) => ({ ...p, stock_mode: 'recipe' }))}
              className="mt-5 text-primary-500 font-black text-xs uppercase hover:underline"
            >
              Cambiar a modo receta
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

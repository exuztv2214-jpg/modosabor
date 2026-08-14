import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, X } from 'lucide-react';

import api from '../../lib/api.js';
import { fmtMoney } from '../../lib/formatters.js';
import { BRAND, STROKE } from '../../lib/theme.js';

/**
 * Registrar una compra de insumos.
 *
 * Esto existía dos veces: una acá dentro de `Compras.jsx` y otra escrita
 * aparte dentro de `Inventario/index.jsx`. La de Inventario era peor —mutaba
 * el estado al editar una fila, no mostraba el total en ningún lado y le
 * faltaban referencia de pago y notas— pero era la que se usaba desde la
 * pantalla donde ves los faltantes, o sea el lugar más natural para comprar.
 *
 * Ahora hay una sola implementación y las dos pantallas la abren.
 */

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

const METODOS = [
  { value: 'efectivo', label: 'Efectivo de caja', nota: 'Sale de la caja del turno abierto' },
  { value: 'transferencia', label: 'Transferencia', nota: '' },
  {
    value: 'cuenta_corriente',
    label: 'Cuenta corriente',
    nota: 'La mercadería entra pero queda a pagar',
  },
];

function Campo({ label, hint, children }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

export default function NuevaCompraModal({
  insumos = [],
  proveedores = [],
  // Insumos que ya se sabe que faltan: se precargan al abrir desde Inventario.
  faltantes = [],
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState({
    proveedor: '',
    metodo_pago: 'efectivo',
    referencia_pago: '',
    notas: '',
  });

  const [items, setItems] = useState(() => {
    if (faltantes.length > 0) {
      return faltantes.slice(0, 10).map((item) => ({
        insumo_id: String(item.id),
        cantidad: String(item.faltante || ''),
        costo_unitario: String(item.costo_unitario || ''),
      }));
    }
    return [{ insumo_id: '', cantidad: '', costo_unitario: '' }];
  });

  const [saving, setSaving] = useState(false);

  const total = useMemo(
    () =>
      items.reduce((acc, i) => acc + Number(i.cantidad || 0) * Number(i.costo_unitario || 0), 0),
    [items]
  );

  const validos = items.filter((i) => i.insumo_id && Number(i.cantidad) > 0);
  const metodoActual = METODOS.find((m) => m.value === form.metodo_pago);

  const updateItem = (idx, key, val) => {
    setItems((prev) =>
      prev.map((item, index) => {
        if (index !== idx) return item;
        const next = { ...item, [key]: val };
        if (key === 'insumo_id') {
          const insumo = insumos.find((i) => String(i.id) === String(val));
          next.costo_unitario = String(insumo?.costo_unitario || '');
        }
        return next;
      })
    );
  };

  const addItem = () =>
    setItems((prev) => [...prev, { insumo_id: '', cantidad: '', costo_unitario: '' }]);

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async () => {
    if (validos.length === 0) {
      toast.error('Agregá al menos un insumo con cantidad');
      return;
    }
    setSaving(true);
    try {
      await api.post('/compras', {
        ...form,
        total,
        items: validos.map((i) => ({
          insumo_id: Number(i.insumo_id),
          cantidad: Number(i.cantidad),
          costo_unitario: Number(i.costo_unitario || 0),
        })),
      });
      toast.success('Compra registrada y stock actualizado');
      onSaved?.();
    } catch (err) {
      toast.error(err?.error || 'Error al registrar la compra');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
      }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
        }}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-[17px] font-semibold text-gray-900">Registrar compra</h2>
            <p className="mt-0.5 text-[12px] text-gray-500">
              Suma el stock de los insumos apenas la confirmes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {faltantes.length > 0 ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-[12px] leading-4 text-amber-900">
              Se precargaron los {Math.min(faltantes.length, 10)} insumos que están por debajo del
              mínimo, con la cantidad que falta. Ajustá lo que haga falta.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Proveedor">
              <input
                list="proveedores-list"
                value={form.proveedor}
                onChange={(e) => setForm((p) => ({ ...p, proveedor: e.target.value }))}
                placeholder="Nombre del proveedor"
                className={CONTROL}
              />
              <datalist id="proveedores-list">
                {proveedores.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Campo>

            <Campo label="Cómo se pagó" hint={metodoActual?.nota}>
              <select
                value={form.metodo_pago}
                onChange={(e) => setForm((p) => ({ ...p, metodo_pago: e.target.value }))}
                className={`${CONTROL} font-medium`}
              >
                {METODOS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Campo>

            <Campo label="Referencia" hint="N° de factura, remito o transferencia">
              <input
                value={form.referencia_pago}
                onChange={(e) => setForm((p) => ({ ...p, referencia_pago: e.target.value }))}
                placeholder="Opcional"
                className={CONTROL}
              />
            </Campo>

            <Campo label="Notas">
              <input
                value={form.notas}
                onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                placeholder="Opcional"
                className={CONTROL}
              />
            </Campo>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label
                htmlFor="field-NuevaCompraModal-jsx-210-0"
                className="text-[12px] font-medium text-gray-600"
              >
                Qué se compró
              </label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex h-9 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                <Plus size={13} strokeWidth={STROKE} />
                Agregar
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => {
                const subtotal = Number(item.cantidad || 0) * Number(item.costo_unitario || 0);
                const insumo = insumos.find((i) => String(i.id) === String(item.insumo_id));

                return (
                  <div key={idx} className="rounded-xl bg-gray-50 p-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        id="field-NuevaCompraModal-jsx-210-0"
                        value={item.insumo_id}
                        onChange={(e) => updateItem(idx, 'insumo_id', e.target.value)}
                        className={`${CONTROL} flex-1`}
                      >
                        <option value="">Elegí un insumo…</option>
                        {insumos.map((ins) => (
                          <option key={ins.id} value={ins.id}>
                            {ins.nombre} ({ins.unidad})
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                        placeholder="Cant."
                        className={`${CONTROL} w-[100px] tabular-nums`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.costo_unitario}
                        onChange={(e) => updateItem(idx, 'costo_unitario', e.target.value)}
                        placeholder="Costo x u."
                        className={`${CONTROL} w-[120px] tabular-nums`}
                      />
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        disabled={items.length === 1}
                        title="Quitar"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                      >
                        <Trash2 size={15} strokeWidth={STROKE} />
                      </button>
                    </div>

                    {insumo || subtotal > 0 ? (
                      <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px]">
                        <span className="text-gray-400">
                          {insumo ? `Hay ${insumo.stock_actual} ${insumo.unidad} en stock` : ''}
                        </span>
                        {subtotal > 0 ? (
                          <span className="font-semibold tabular-nums text-gray-700">
                            {fmtMoney(subtotal)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-4">
          <div>
            <p className="text-[12px] text-gray-500">
              {validos.length} {validos.length === 1 ? 'insumo' : 'insumos'}
            </p>
            <p className="text-[20px] font-bold leading-none tabular-nums text-gray-900">
              {fmtMoney(total)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || validos.length === 0}
              style={{ background: BRAND }}
              className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {saving ? 'Registrando…' : 'Registrar compra'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

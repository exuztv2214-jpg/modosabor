import { useMemo } from 'react';
import { Boxes, Save } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, CardHeader } from './ui.jsx';

/**
 * Carga de stock del arranque del día.
 *
 * Los insumos base van primero porque son los que comparten pizzas,
 * hamburguesas y milanesas: si falla uno, se cae media carta. Los productos
 * con stock propio quedan agrupados por categoría abajo.
 *
 * Los campos con stock en cero se marcan en rojo. Es el error más caro de
 * esta pantalla: cargar todo menos uno y quedarse sin vender ese producto
 * toda la noche sin darse cuenta.
 */
export default function StockDiarioPanel({
  insumos = [],
  productos = [],
  sucio,
  guardando,
  onChangeInsumo,
  onChangeProducto,
  onGuardar,
}) {
  const porCategoria = useMemo(() => {
    const mapa = new Map();
    productos.forEach((producto) => {
      const clave = producto.categoria || 'Otros';
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave).push(producto);
    });
    return Array.from(mapa.entries());
  }, [productos]);

  const enCero = [...insumos, ...productos].filter(
    (item) => Number(item.stock_actual ?? item.stock_directo ?? 0) <= 0
  ).length;

  const campo = (valor, onChange, step = '1') => (
    <input
      type="number"
      min="0"
      step={step}
      value={valor ?? ''}
      onChange={(event) => onChange(event.target.value)}
      style={
        Number(valor || 0) <= 0
          ? { borderColor: BRAND, background: '#FEF2F2', color: BRAND }
          : undefined
      }
      className="mt-2 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] font-semibold tabular-nums text-gray-900 outline-none transition focus:border-gray-400"
    />
  );

  return (
    <Card>
      <CardHeader
        icon={Boxes}
        title="Stock del día"
        subtitle={
          enCero > 0
            ? `${enCero} ${enCero === 1 ? 'ítem está' : 'ítems están'} en cero`
            : 'Todo cargado con stock'
        }
        action={
          <button
            type="button"
            onClick={onGuardar}
            disabled={guardando || !sucio}
            style={sucio ? { background: BRAND, color: '#FFFFFF' } : undefined}
            className={`flex h-10 items-center gap-2 rounded-xl px-4 text-[12px] font-semibold transition disabled:opacity-50 ${sucio ? '' : 'bg-gray-100 text-gray-500'}`}
          >
            <Save size={15} strokeWidth={STROKE} />
            {guardando ? 'Guardando…' : sucio ? 'Guardar' : 'Guardado'}
          </button>
        }
      />

      <div className="border-t border-gray-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-medium text-gray-400">Bases de cocina</p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {insumos.map((item) => (
            <label key={item.id} className="rounded-xl bg-gray-50 p-3">
              <span className="block truncate text-[13px] font-medium text-gray-800">
                {item.nombre}
              </span>
              <span className="mt-0.5 block text-[11px] text-gray-400">
                {item.rubro} · {item.unidad}
              </span>
              {campo(item.stock_actual, (valor) => onChangeInsumo(item.id, valor), '0.5')}
            </label>
          ))}
        </div>

        {porCategoria.map(([categoria, lista]) => (
          <div key={categoria} className="mt-5">
            <p className="mb-2 text-[11px] font-medium text-gray-400">{categoria}</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {lista.map((producto) => (
                <label key={producto.id} className="rounded-xl bg-gray-50 p-3">
                  <span className="block truncate text-[13px] font-medium text-gray-800">
                    {producto.nombre}
                  </span>
                  {campo(producto.stock_directo, (valor) => onChangeProducto(producto.id, valor))}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

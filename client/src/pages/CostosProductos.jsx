import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';

import api from '../lib/api.js';

const pesos = (valor) =>
  `$${Number(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;

function parseCosto(valor) {
  const normalizado = String(valor ?? '')
    .trim()
    .replace(/\./g, '')
    .replace(',', '.');
  if (!normalizado) return null;
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero >= 0 ? numero : NaN;
}

function Margen({ precio, costo }) {
  const margen = Number(precio || 0) - Number(costo || 0);
  const porcentaje = Number(precio || 0) > 0 ? Math.round((margen / precio) * 100) : 0;
  const negativo = margen < 0;

  return (
    <div className={`text-right tabular-nums ${negativo ? 'text-red-600' : 'text-emerald-700'}`}>
      <div className="flex items-center justify-end gap-1 text-[13px] font-semibold">
        {negativo ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
        {pesos(margen)}
      </div>
      <div className="text-[11px] font-medium opacity-80">{porcentaje}%</div>
    </div>
  );
}

export default function CostosProductos() {
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [valores, setValores] = useState({});
  const [guardando, setGuardando] = useState({});
  const inputRefs = useRef({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await api.get('/productos/costos');
      setData(respuesta);
      setValores(
        Object.fromEntries(
          (respuesta.productos || []).map((producto) => [producto.id, String(producto.costo ?? 0)])
        )
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar los costos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const sinCosto = useMemo(
    () =>
      (data?.productos || []).filter((producto) => {
        const costo = parseCosto(valores[producto.id]);
        return costo === null || costo === 0;
      }).length,
    [data?.productos, valores]
  );

  const guardarCosto = async (producto) => {
    const costo = parseCosto(valores[producto.id]);
    if (costo === null) {
      toast.error('Ingresá un costo o dejá el valor anterior');
      setValores((actual) => ({ ...actual, [producto.id]: String(producto.costo ?? 0) }));
      return;
    }
    if (Number.isNaN(costo)) {
      toast.error('El costo debe ser un número mayor o igual a cero');
      return;
    }
    if (Number(costo) === Number(producto.costo || 0)) return;

    setGuardando((actual) => ({ ...actual, [producto.id]: true }));
    try {
      const actualizado = await api.put(`/productos/${producto.id}`, { costo });
      setData((actual) => ({
        ...actual,
        productos: actual.productos.map((fila) =>
          fila.id === producto.id ? { ...fila, costo: actualizado.costo } : fila
        ),
      }));
      setValores((actual) => ({ ...actual, [producto.id]: String(actualizado.costo ?? costo) }));
      toast.success(`${producto.nombre}: costo guardado`);
    } catch (error) {
      toast.error(error?.error || `No se pudo guardar ${producto.nombre}`);
      setValores((actual) => ({ ...actual, [producto.id]: String(producto.costo ?? 0) }));
    } finally {
      setGuardando((actual) => ({ ...actual, [producto.id]: false }));
    }
  };

  const moverSiguiente = (evento, indice, producto) => {
    if (evento.key !== 'Enter') return;
    evento.preventDefault();
    guardarCosto(producto);
    inputRefs.current[indice + 1]?.focus();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16 pt-2">
      <section className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-gray-900">
              Costos y márgenes
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-500">
              Cargá cuánto cuesta hacer o comprar cada producto. Están ordenados por unidades
              vendidas en los últimos 30 días para empezar por lo que más impacta el resultado.
            </p>
          </div>
          <button
            type="button"
            onClick={cargar}
            disabled={cargando}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[13px] leading-relaxed text-amber-900">
              {sinCosto} de {data?.activos || 0} productos activos todavía no tienen costo. Hasta
              completar esos datos, el estado de resultados puede mostrar una ganancia mayor a la
              real.
            </p>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white">
        {cargando ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[13px] text-gray-500">
            <Loader2 size={17} className="animate-spin" />
            Cargando productos…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full text-left">
              <thead className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-4 py-3 text-right">Vendidos (30 días)</th>
                  <th className="px-4 py-3 text-right">Precio de venta</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-5 py-3 text-right">Margen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.productos || []).map((producto, indice) => {
                  const costoActual = parseCosto(valores[producto.id]);
                  const costoParaMargen = Number.isFinite(costoActual)
                    ? costoActual
                    : producto.costo;
                  return (
                    <tr key={producto.id} className="transition hover:bg-gray-50/60">
                      <td className="px-5 py-3.5">
                        <p className="text-[13px] font-semibold text-gray-900">{producto.nombre}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {producto.categoria_nombre || 'Sin categoría'}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] tabular-nums text-gray-600">
                        {producto.unidades_vendidas}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[13px] font-medium tabular-nums text-gray-800">
                        {pesos(producto.precio)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-2">
                          {guardando[producto.id] ? (
                            <Loader2 size={14} className="animate-spin text-gray-400" />
                          ) : null}
                          <label className="sr-only" htmlFor={`costo-${producto.id}`}>
                            Costo de {producto.nombre}
                          </label>
                          <input
                            ref={(elemento) => {
                              inputRefs.current[indice] = elemento;
                            }}
                            id={`costo-${producto.id}`}
                            value={valores[producto.id] ?? ''}
                            inputMode="decimal"
                            onChange={(evento) =>
                              setValores((actual) => ({
                                ...actual,
                                [producto.id]: evento.target.value,
                              }))
                            }
                            onBlur={() => guardarCosto(producto)}
                            onKeyDown={(evento) => moverSiguiente(evento, indice, producto)}
                            disabled={Boolean(guardando[producto.id])}
                            className="h-9 w-28 rounded-lg border border-gray-200 bg-white px-2 text-right text-[13px] font-medium tabular-nums outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <Margen precio={producto.precio} costo={costoParaMargen} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!cargando && data?.productos?.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center text-[13px] text-gray-500">
          No hay productos activos para cargar.
        </div>
      ) : null}

      <p className="flex items-center gap-1.5 text-[12px] text-gray-400">
        <Check size={14} className="text-emerald-600" />
        Usá Tab para seguir al próximo producto. El costo se guarda al salir del campo o al
        presionar Enter.
      </p>
    </div>
  );
}

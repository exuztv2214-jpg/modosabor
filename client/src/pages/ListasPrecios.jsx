import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, RefreshCw, Store, Tags, Truck } from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';
import { formatAmountForInput, parseLocalizedAmount } from '../lib/amountInput.js';

/**
 * Listas de precios.
 *
 * ── Para qué ───────────────────────────────────────────────────────────────
 *
 * Que el mismo plato pueda valer distinto según por dónde se venda. La
 * milanesa a $10.500 en el mostrador y a $11.500 por delivery, porque el envío
 * propio cuesta y el precio de mostrador no tiene que subsidiarlo.
 *
 * ── La idea que hay que entender para usarla ───────────────────────────────
 *
 * Una lista guarda **sólo las excepciones**. Los productos que no toques
 * siguen valiendo lo de siempre.
 *
 * Por eso la pantalla muestra el precio normal al lado y el campo vacío por
 * defecto: vacío quiere decir "vale lo mismo que siempre", no "vale cero".
 * Borrar el número saca la excepción.
 *
 * Si se copiaran los 94 precios a cada lista, subir un precio obligaría a
 * acordarse de subirlo en todos lados, y el día que alguien se olvide el
 * delivery vendería a precio viejo sin que nadie se entere.
 */

const CANALES = [
  { id: 'mostrador', titulo: 'Mostrador y mesas', icono: Store },
  { id: 'delivery', titulo: 'Delivery', icono: Truck },
  { id: 'web', titulo: 'Web y WhatsApp', icono: Tags },
];

const CONTROL =
  'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] tabular-nums text-gray-900 outline-none transition focus:border-gray-400';

export default function ListasPrecios() {
  const [listas, setListas] = useState([]);
  const [canales, setCanales] = useState({});
  const [elegida, setElegida] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [borradores, setBorradores] = useState({});

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [data, catalogo] = await Promise.all([
        api.get('/listas-precios'),
        api.get('/productos?activo=1'),
      ]);
      setListas(data.listas || []);
      setCanales(data.canales || {});
      setProductos(catalogo || []);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar las listas');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrir = useCallback(async (id) => {
    setElegida(id);
    try {
      const data = await api.get(`/listas-precios/${id}`);
      setDetalle(data);
      // Los precios ya puestos arrancan cargados en el formulario; el resto
      // queda vacío, que es como se lee "vale lo de siempre".
      setBorradores(
        Object.fromEntries(
          (data.precios || []).map((p) => [p.producto_id, formatAmountForInput(p.precio)])
        )
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo abrir la lista');
    }
  }, []);

  const crear = async () => {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    try {
      const lista = await api.post('/listas-precios', { nombre });
      setNombreNuevo('');
      await cargar();
      abrir(lista.id);
      toast.success(`Lista "${nombre}" creada`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear');
    }
  };

  const asignarCanal = async (canal, listaId) => {
    try {
      const actualizado = await api.put('/listas-precios/canales/asignar', {
        [canal]: listaId || null,
      });
      setCanales(actualizado);
      toast.success(
        listaId
          ? `${CANALES.find((c) => c.id === canal).titulo} usa esa lista`
          : `${CANALES.find((c) => c.id === canal).titulo} vuelve a los precios de siempre`
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo asignar');
    }
  };

  /*
    Se guarda al salir del campo y no con un botón por fila. Son 94 productos:
    un botón por cada uno sería una pantalla llena de botones, y un "guardar
    todo" al final haría que un error de tipeo se descubra recién al final.
  */
  const guardarPrecio = async (productoId) => {
    if (!elegida) return;
    const valor = parseLocalizedAmount(borradores[productoId], 0);
    try {
      await api.put(`/listas-precios/${elegida}/producto/${productoId}`, { precio: valor });
      await abrir(elegida);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el precio');
    }
  };

  const porCategoria = useMemo(() => {
    const mapa = new Map();
    for (const producto of productos) {
      const categoria = producto.categoria_nombre || 'Sin categoría';
      if (!mapa.has(categoria)) mapa.set(categoria, []);
      mapa.get(categoria).push(producto);
    }
    return Array.from(mapa.entries());
  }, [productos]);

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Cargando las listas…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-16 pt-2">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-gray-900">
              <Tags size={19} strokeWidth={STROKE} style={{ color: BRAND }} />
              Listas de precios
            </h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-500">
              Para que el mismo plato pueda valer distinto según por dónde se venda. Una lista
              guarda <span className="text-gray-700">sólo las excepciones</span>: lo que no toques
              sigue valiendo lo de siempre.
            </p>
          </div>
          <button
            type="button"
            onClick={cargar}
            title="Recargar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:text-gray-600"
          >
            <RefreshCw size={15} strokeWidth={STROKE} />
          </button>
        </div>
      </div>

      {/* ── Qué lista usa cada canal ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        {CANALES.map((canal) => (
          <div key={canal.id} className="rounded-2xl border border-gray-200/80 bg-white p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <canal.icono size={16} strokeWidth={STROKE} className="text-gray-400" />
              <p className="text-[13px] font-semibold text-gray-900">{canal.titulo}</p>
            </div>
            <select
              value={canales[canal.id] || ''}
              onChange={(evento) => asignarCanal(canal.id, evento.target.value)}
              className={CONTROL}
            >
              <option value="">Precios de siempre</option>
              {listas
                .filter((lista) => Number(lista.activo) === 1)
                .map((lista) => (
                  <option key={lista.id} value={lista.id}>
                    {lista.nombre}
                  </option>
                ))}
            </select>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[280px_1fr]">
        {/* ── Las listas ── */}
        <div className="space-y-2">
          <div className="rounded-2xl border border-gray-200/80 bg-white p-3">
            <div className="flex gap-2">
              <input
                value={nombreNuevo}
                onChange={(evento) => setNombreNuevo(evento.target.value)}
                onKeyDown={(evento) => evento.key === 'Enter' && crear()}
                placeholder="Nombre de la lista"
                className={CONTROL}
              />
              <button
                type="button"
                onClick={crear}
                disabled={!nombreNuevo.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white transition disabled:opacity-40"
                style={{ backgroundColor: BRAND }}
                aria-label="Crear lista"
              >
                <Plus size={16} strokeWidth={STROKE} />
              </button>
            </div>
          </div>

          {listas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-[12px] text-gray-400">
              Todavía no hay ninguna lista.
              <br />
              Creá una, por ejemplo &ldquo;Delivery&rdquo;.
            </div>
          ) : (
            listas.map((lista) => (
              <button
                key={lista.id}
                type="button"
                onClick={() => abrir(lista.id)}
                className={`w-full rounded-2xl border p-3 text-left transition ${
                  elegida === lista.id
                    ? 'border-gray-900 bg-white'
                    : 'border-gray-200/80 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-gray-900">{lista.nombre}</p>
                  {Number(lista.activo) !== 1 ? (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-500">
                      apagada
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {lista.productos === 0
                    ? 'Sin excepciones: todo al precio de siempre'
                    : `${lista.productos} ${lista.productos === 1 ? 'precio distinto' : 'precios distintos'}`}
                </p>
              </button>
            ))
          )}
        </div>

        {/* ── Los precios de la lista elegida ── */}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
          {!elegida ? (
            <div className="py-16 text-center text-[13px] text-gray-400">
              Elegí una lista para ponerle precios.
            </div>
          ) : (
            <>
              <p className="mb-1 text-[15px] font-semibold text-gray-900">{detalle?.nombre}</p>
              <p className="mb-4 text-[12px] leading-relaxed text-gray-500">
                Dejá vacío lo que valga lo mismo de siempre. Borrar el número saca la excepción.
              </p>

              <div className="space-y-4">
                {porCategoria.map(([categoria, items]) => (
                  <div key={categoria}>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {categoria}
                    </p>
                    <div className="space-y-1">
                      {items.map((producto) => {
                        const borrador = borradores[producto.id] ?? '';
                        const distinto =
                          borrador !== '' &&
                          parseLocalizedAmount(borrador, 0) !== Number(producto.precio || 0);
                        return (
                          <div
                            key={producto.id}
                            className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-gray-50"
                          >
                            <p className="min-w-0 flex-1 truncate text-[13px] text-gray-900">
                              {producto.nombre}
                            </p>
                            <p className="shrink-0 text-[12px] tabular-nums text-gray-400">
                              ${formatAmountForInput(producto.precio)}
                            </p>
                            <input
                              value={borrador}
                              onChange={(evento) =>
                                setBorradores((prev) => ({
                                  ...prev,
                                  [producto.id]: evento.target.value,
                                }))
                              }
                              onBlur={() => guardarPrecio(producto.id)}
                              onKeyDown={(evento) =>
                                evento.key === 'Enter' && evento.currentTarget.blur()
                              }
                              placeholder="—"
                              inputMode="decimal"
                              aria-label={`Precio de ${producto.nombre} en ${detalle?.nombre}`}
                              className={`h-9 w-28 shrink-0 rounded-xl border px-2.5 text-right text-[13px] tabular-nums outline-none transition ${
                                distinto
                                  ? 'border-gray-900 font-semibold text-gray-900'
                                  : 'border-gray-200 text-gray-500 focus:border-gray-400'
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

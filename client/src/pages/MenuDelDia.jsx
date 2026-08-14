import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  Check,
  GripVertical,
  Loader2,
  RefreshCw,
  Save,
  Star,
  UtensilsCrossed,
} from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';
import { formatAmountForInput, parseLocalizedAmount } from '../lib/amountInput.js';

/**
 * El menú del día, en su propia pantalla.
 *
 * ── Por qué no son dos columnas ────────────────────────────────────────────
 *
 * La idea original era arrastrar platos entre "Económicos" y "Ejecutivos".
 * No sirve: **el mismo plato puede venderse en las dos porciones el mismo
 * día** —la suprema a $5.000 chica y a $7.000 grande—. Dos columnas obligan a
 * elegir una, y para poder tener las dos había que cargar el plato duplicado.
 * De ahí salen los duplicados que hay hoy en la carta: "Canelón" y
 * "Canelones", "Suprema a la napolitana" y "Suprema napolitana".
 *
 * Entonces es una tarjeta por plato con los dos precios. Si sólo se llena uno,
 * se vende en esa porción nada más. Si se llenan los dos, el cliente elige — y
 * la IA de WhatsApp ya sabe cotizar cada tamaño por separado.
 *
 * Arrastrar sí, pero para el **orden** en que salen en la web. Eso es lo que
 * de verdad decide qué se vende más.
 */

const CONTROL =
  'h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-[13px] tabular-nums text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

function fmt(valor) {
  return `$${formatAmountForInput(valor || 0)}`;
}

export default function MenuDelDia() {
  const [datos, setDatos] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await api.get('/operacion/menu-dia');
      setDatos(data);
      setItems(
        (data.items || []).map((item, indice) => ({
          ...item,
          orden_hoy: Number.isFinite(Number(item.orden_hoy)) ? Number(item.orden_hoy) : indice,
        }))
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el menú del día');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = (id, campo, valor) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));

  const guarnicionesDisponibles = datos?.guarnicionesLista || [];

  const toggleGuarnicion = (id, nombre) =>
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const actuales = item.guarniciones_hoy || [];
        return {
          ...item,
          guarniciones_hoy: actuales.includes(nombre)
            ? actuales.filter((g) => g !== nombre)
            : [...actuales, nombre],
        };
      })
    );

  /*
    Arrastrar para ordenar. Sin librerías: son diez o quince platos y el
    arrastre nativo del navegador alcanza. Sumar una dependencia entera para
    esto sería pagar peso de carga en el celular del local a cambio de nada.
  */
  const soltarSobre = (destinoId) => {
    if (!arrastrando || arrastrando === destinoId) return;
    setItems((prev) => {
      const orden = [...prev];
      const desde = orden.findIndex((i) => i.id === arrastrando);
      const hasta = orden.findIndex((i) => i.id === destinoId);
      if (desde < 0 || hasta < 0) return prev;
      const [movido] = orden.splice(desde, 1);
      orden.splice(hasta, 0, movido);
      return orden.map((item, indice) => ({ ...item, orden_hoy: indice }));
    });
    setArrastrando(null);
  };

  const disponiblesHoy = useMemo(
    () => items.filter((item) => Number(item.disponible_hoy) === 1),
    [items]
  );

  const guardar = async () => {
    // Un plato disponible sin ningún precio no se puede vender: la web lo
    // mostraría en cero y la IA no sabría qué cobrar.
    const sinPrecio = disponiblesHoy.filter(
      (item) =>
        !parseLocalizedAmount(item.precio_economico_hoy, 0) &&
        !parseLocalizedAmount(item.precio_ejecutivo_hoy, 0) &&
        !parseLocalizedAmount(item.precio_hoy, 0)
    );
    if (sinPrecio.length > 0) {
      toast.error(`Falta el precio de: ${sinPrecio.map((i) => i.nombre).join(', ')}`);
      return;
    }

    setGuardando(true);
    try {
      await api.put('/operacion/menu-dia', {
        items: items.map((item) => ({
          ...item,
          precio_hoy: parseLocalizedAmount(item.precio_hoy, 0),
          precio_economico_hoy: parseLocalizedAmount(item.precio_economico_hoy, 0),
          precio_ejecutivo_hoy: parseLocalizedAmount(item.precio_ejecutivo_hoy, 0),
        })),
      });
      toast.success('Menú del día guardado');
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Cargando el menú de hoy…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28 pt-2">
      {/* ── Cabecera ── */}
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-gray-900">
              <CalendarDays size={20} strokeWidth={STROKE} style={{ color: BRAND }} />
              Menú del día
            </h1>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-gray-500">
              Lo que marques acá es lo que sale en la web y lo que ofrece la IA por WhatsApp. Un
              plato puede venderse en las dos porciones el mismo día: cargá los dos precios.
            </p>
            <p className="mt-2 text-[12px] font-medium text-gray-400">
              {datos?.fecha} · {disponiblesHoy.length} plato
              {disponiblesHoy.length === 1 ? '' : 's'} disponible
              {disponiblesHoy.length === 1 ? '' : 's'} hoy
            </p>
          </div>
          <button
            type="button"
            onClick={cargar}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border border-gray-200 px-4 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50"
          >
            <RefreshCw size={15} strokeWidth={STROKE} />
            Recargar
          </button>
        </div>
      </div>

      {/* ── Platos ── */}
      {items.length === 0 ? (
        <div className="rounded-3xl bg-white px-6 py-16 text-center shadow-sm">
          <UtensilsCrossed size={30} className="mx-auto text-gray-300" strokeWidth={1.6} />
          <p className="mt-3 text-[15px] font-semibold text-gray-900">
            Todavía no hay platos en el repertorio
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-gray-500">
            Los platos del menú del día se crean desde Operación. Una vez creados, quedan acá para
            elegir cuáles salen cada día.
          </p>
        </div>
      ) : (
        <div className="space-y-2" role="list">
          {items.map((item) => {
            const activo = Number(item.disponible_hoy) === 1;
            return (
              <div
                key={item.id}
                draggable
                /*
                  `listitem` y no un botón: la tarjeta entera es arrastrable
                  pero adentro tiene campos y botones propios. Envolverla en
                  algo clickeable robaría los clics de los campos de precio.
                */
                role="listitem"
                onDragStart={() => setArrastrando(item.id)}
                onDragOver={(evento) => evento.preventDefault()}
                onDrop={() => soltarSobre(item.id)}
                className={`rounded-2xl bg-white p-4 shadow-sm transition ${
                  activo ? 'ring-1 ring-brand-200' : 'opacity-70'
                } ${arrastrando === item.id ? 'opacity-40' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-1 cursor-grab text-gray-300" title="Arrastrar para ordenar">
                    <GripVertical size={16} strokeWidth={STROKE} />
                  </span>

                  <button
                    type="button"
                    onClick={() => cambiar(item.id, 'disponible_hoy', activo ? 0 : 1)}
                    aria-pressed={activo}
                    className={`mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md border transition ${
                      activo ? 'border-transparent text-white' : 'border-gray-300 bg-white'
                    }`}
                    style={activo ? { backgroundColor: BRAND } : undefined}
                  >
                    {activo ? <Check size={13} strokeWidth={3} /> : null}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[14px] font-semibold text-gray-900">{item.nombre}</p>
                      <button
                        type="button"
                        onClick={() =>
                          cambiar(
                            item.id,
                            'destacado_hoy',
                            Number(item.destacado_hoy) === 1 ? 0 : 1
                          )
                        }
                        title="Destacado en la web"
                        className={`rounded-lg p-1 transition ${
                          Number(item.destacado_hoy) === 1
                            ? 'text-warning-500'
                            : 'text-gray-300 hover:text-gray-400'
                        }`}
                      >
                        <Star
                          size={15}
                          strokeWidth={STROKE}
                          fill={Number(item.destacado_hoy) === 1 ? 'currentColor' : 'none'}
                        />
                      </button>
                    </div>

                    {activo ? (
                      <>
                        {/* ── Los dos tamaños ── */}
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {[
                            ['precio_economico_hoy', 'Económico', datos?.precioSugeridoEconomico],
                            ['precio_ejecutivo_hoy', 'Ejecutivo', datos?.precioSugeridoEjecutivo],
                          ].map(([campo, etiqueta, sugerido]) => (
                            <div key={campo}>
                              <label
                                htmlFor={`${campo}-${item.id}`}
                                className="mb-1 block text-[12px] font-medium text-gray-500"
                              >
                                {etiqueta}{' '}
                                <span className="font-normal text-gray-400">
                                  · vacío = hoy no se vende así
                                </span>
                              </label>
                              <input
                                id={`${campo}-${item.id}`}
                                value={item[campo] || ''}
                                onChange={(evento) => cambiar(item.id, campo, evento.target.value)}
                                placeholder={sugerido ? fmt(sugerido) : '0'}
                                inputMode="decimal"
                                className={CONTROL}
                              />
                            </div>
                          ))}
                        </div>

                        {/* ── Guarniciones, de la lista compartida ── */}
                        {guarnicionesDisponibles.length > 0 ? (
                          <div className="mt-3">
                            <p className="mb-1.5 text-[12px] font-medium text-gray-500">
                              Guarniciones que ofrece
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {guarnicionesDisponibles.map((guarnicion) => {
                                const elegida = (item.guarniciones_hoy || []).includes(guarnicion);
                                return (
                                  <button
                                    key={guarnicion}
                                    type="button"
                                    onClick={() => toggleGuarnicion(item.id, guarnicion)}
                                    className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                                      elegida
                                        ? 'bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-300'
                                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                    }`}
                                  >
                                    {guarnicion}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {/* ── Postres ── */}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[
                            ['ofrece_postre_hoy', 'Postre', datos?.extraPostrePrecio],
                            [
                              'ofrece_bebida_postre_hoy',
                              'Postre + bebida',
                              datos?.extraBebidaPostrePrecio,
                            ],
                          ].map(([campo, etiqueta, precio]) => {
                            const puesto = Number(item[campo]) === 1;
                            return (
                              <button
                                key={campo}
                                type="button"
                                onClick={() => cambiar(item.id, campo, puesto ? 0 : 1)}
                                className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                                  puesto
                                    ? 'bg-brand-50 font-medium text-brand-700 ring-1 ring-brand-300'
                                    : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                {etiqueta}
                                {precio ? ` ${fmt(precio)}` : ''}
                                {/*
                                  Si el precio del extra está en cero, se regala.
                                  Vale más avisarlo acá que descubrirlo en la caja.
                                */}
                                {puesto && !precio ? ' · ⚠ sin precio' : ''}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Guardar, siempre a la vista ── */}
      {items.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-[12px] text-gray-500">
              {disponiblesHoy.length} plato{disponiblesHoy.length === 1 ? '' : 's'} sale
              {disponiblesHoy.length === 1 ? '' : 'n'} hoy
            </p>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="inline-flex h-11 items-center gap-2 rounded-xl px-6 text-[13px] font-semibold text-white transition disabled:opacity-60"
              style={{ backgroundColor: BRAND }}
            >
              {guardando ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} strokeWidth={STROKE} />
              )}
              Guardar el menú de hoy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

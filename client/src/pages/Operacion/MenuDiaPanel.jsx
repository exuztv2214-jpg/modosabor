import { useMemo, useState } from 'react';
import { Copy, Plus, Save, Search, Settings2, UtensilsCrossed } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, CardHeader } from './ui.jsx';
import MenuDiaItemCard from './MenuDiaItemCard.jsx';

/**
 * Menú del día: la tarea diaria del local.
 *
 * Se ordena por lo que se hace en la práctica: primero se ve qué sale hoy,
 * después se busca en la biblioteca lo que falta. Por eso los platos activos
 * van arriba y expandidos, y el resto abajo en filas de una línea.
 */
export default function MenuDiaPanel({
  menuDia,
  sucio,
  guardando,
  copiando,
  onChangeItem,
  onChangeTipo,
  onMover,
  onArchivar,
  onGuardar,
  onCopiarAyer,
  onAbrirConfig,
  onAbrirNuevo,
}) {
  const [busqueda, setBusqueda] = useState('');
  const [expandidos, setExpandidos] = useState(() => new Set());

  const toggleExpandido = (id) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = menuDia.items || [];
  const activos = useMemo(() => items.filter((item) => Number(item.disponible_hoy) === 1), [items]);

  const guardados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return items
      .filter((item) => Number(item.disponible_hoy) !== 1)
      .filter((item) =>
        termino
          ? String(item.nombre || '')
              .toLowerCase()
              .includes(termino)
          : true
      );
  }, [items, busqueda]);

  const propsItem = {
    guarnicionesLista: menuDia.guarnicionesLista || [],
    extraPostrePrecio: menuDia.extraPostrePrecio ?? 1000,
    extraBebidaPostrePrecio: menuDia.extraBebidaPostrePrecio ?? 1000,
  };

  return (
    <Card>
      <CardHeader
        icon={UtensilsCrossed}
        title="Menú del día"
        subtitle={
          activos.length > 0
            ? `${activos.length} ${activos.length === 1 ? 'plato sale' : 'platos salen'} hoy · ${menuDia.fecha || ''}`
            : 'Todavía no elegiste qué sale hoy'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onAbrirConfig}
              title="Precios base, extras y lista de guarniciones"
              className="flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
            >
              <Settings2 size={15} strokeWidth={STROKE} />
              Ajustes
            </button>
            <button
              type="button"
              onClick={onCopiarAyer}
              disabled={copiando || !menuDia.ultimaFechaDisponible}
              title={
                menuDia.ultimaFechaDisponible
                  ? `Copiar el menú del ${menuDia.ultimaFechaDisponible}`
                  : 'Todavía no hay un menú anterior guardado'
              }
              className="flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-40"
            >
              <Copy size={15} strokeWidth={STROKE} />
              {copiando ? 'Copiando…' : 'Copiar ayer'}
            </button>
            <button
              type="button"
              onClick={onGuardar}
              disabled={guardando}
              style={sucio ? { background: BRAND, color: '#FFFFFF' } : undefined}
              className={`flex h-10 items-center gap-2 rounded-xl px-4 text-[12px] font-semibold transition disabled:opacity-50 ${sucio ? '' : 'bg-gray-100 text-gray-500'}`}
            >
              <Save size={15} strokeWidth={STROKE} />
              {guardando ? 'Guardando…' : sucio ? 'Guardar cambios' : 'Guardado'}
            </button>
          </div>
        }
      />

      <div className="border-t border-gray-100 px-5 py-4">
        {items.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-10 text-center">
            <UtensilsCrossed size={26} strokeWidth={1.4} className="mx-auto mb-2 text-gray-300" />
            <p className="text-[13px] font-medium text-gray-500">
              Todavía no hay platos en la biblioteca
            </p>
            <button
              type="button"
              onClick={onAbrirNuevo}
              style={{ background: BRAND }}
              className="mt-4 h-10 rounded-xl px-5 text-[12px] font-semibold text-white"
            >
              Crear el primero
            </button>
          </div>
        ) : (
          <>
            {/* ── Lo que sale hoy ── */}
            <p className="mb-2 text-[11px] font-medium text-gray-400">Salen hoy</p>
            {activos.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-center text-[12px] text-gray-400">
                Ningún plato marcado para hoy. Activá los que van desde la lista de abajo.
              </div>
            ) : (
              <div className="space-y-2.5">
                {activos.map((item, index) => (
                  <MenuDiaItemCard
                    key={item.id}
                    item={item}
                    abierto
                    primero={index === 0}
                    ultimo={index === activos.length - 1}
                    {...propsItem}
                    onChange={(campo, valor) => onChangeItem(item.id, campo, valor)}
                    onChangeTipo={(tipo) => onChangeTipo(item.id, tipo)}
                    onSubir={() => onMover(item.id, -1)}
                    onBajar={() => onMover(item.id, 1)}
                    onArchivar={() => onArchivar(item)}
                    onToggleAbierto={() => toggleExpandido(item.id)}
                  />
                ))}
              </div>
            )}

            {/* ── Biblioteca ── */}
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-medium text-gray-400">
                Biblioteca · {guardados.length}
              </p>
              <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-[260px]">
                <Search
                  size={14}
                  strokeWidth={STROKE}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Buscar plato…"
                  className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-[13px] text-gray-800 outline-none transition focus:border-gray-400"
                />
              </div>
              <button
                type="button"
                onClick={onAbrirNuevo}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                <Plus size={14} strokeWidth={STROKE} />
                Nuevo plato
              </button>
            </div>

            <div className="mt-2 space-y-1.5">
              {guardados.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-3 text-[12px] text-gray-400">
                  {busqueda
                    ? 'Ningún plato guardado coincide con esa búsqueda.'
                    : 'Todos los platos de la biblioteca están saliendo hoy.'}
                </p>
              ) : (
                guardados.map((item) => (
                  <MenuDiaItemCard
                    key={item.id}
                    item={item}
                    abierto={expandidos.has(item.id)}
                    {...propsItem}
                    onChange={(campo, valor) => onChangeItem(item.id, campo, valor)}
                    onChangeTipo={(tipo) => onChangeTipo(item.id, tipo)}
                    onArchivar={() => onArchivar(item)}
                    onToggleAbierto={() => toggleExpandido(item.id)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

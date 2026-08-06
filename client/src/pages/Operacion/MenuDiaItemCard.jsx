import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, ChevronDown, Star, Trash2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { fmt, NumberField, PlatoThumb, Switch } from './ui.jsx';

/**
 * Un plato de la biblioteca del menú del día.
 *
 * Dos formas según el caso: los que salen hoy se muestran completos, porque
 * son los que hay que ajustar; los guardados quedan en una fila de una línea
 * que se puede abrir. Con treinta platos en la biblioteca, esa diferencia es
 * la que hace que la pantalla sea usable.
 */
export default function MenuDiaItemCard({
  item,
  abierto,
  primero,
  ultimo,
  guarnicionesLista = [],
  extraPostrePrecio,
  extraBebidaPostrePrecio,
  onToggleAbierto,
  onChange,
  onChangeTipo,
  onSubir,
  onBajar,
  onArchivar,
}) {
  const sale = Number(item.disponible_hoy) === 1;
  const seleccionadas = Array.isArray(item.guarniciones_hoy) ? item.guarniciones_hoy : [];
  const esEjecutivo = item.tipo_hoy === 'ejecutivo';

  // ── Fila compacta ──
  if (!abierto) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="group flex items-center gap-3 rounded-xl bg-white p-2 pr-3 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)]"
      >
        <PlatoThumb imagen={item.imagen} nombre={item.nombre} size={42} rounded="rounded-lg" />
        <button
          type="button"
          onClick={() => onChange('disponible_hoy', 1)}
          title="Sacar hoy"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-gray-200 text-transparent transition hover:border-gray-400 hover:text-gray-400"
        >
          <Check size={13} strokeWidth={3} />
        </button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-700">
          {item.nombre}
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
          {esEjecutivo ? 'Ejecutivo' : 'Económico'} · {fmt(item.precio_hoy)}
        </span>
        <button
          type="button"
          onClick={onToggleAbierto}
          className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-800 focus:opacity-100"
        >
          Editar
        </button>
      </motion.div>
    );
  }

  // ── Tarjeta completa ──
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={sale ? { boxShadow: `0 0 0 2px ${BRAND}, 0 1px 2px rgba(15,23,42,0.06)` } : undefined}
    >
      {/* Cabecera */}
      <div className="flex items-start gap-3">
        <PlatoThumb imagen={item.imagen} nombre={item.nombre} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-gray-900">{item.nombre}</p>
            {sale ? (
              <span
                className="rounded-md px-2 py-0.5 text-[10px] font-semibold text-white"
                style={{ background: BRAND }}
              >
                Sale hoy
              </span>
            ) : (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                Guardado
              </span>
            )}
            {Number(item.destacado_hoy) === 1 ? (
              <span className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <Star size={10} strokeWidth={2.4} />
                Destacado
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {seleccionadas.length > 0
              ? `${seleccionadas.length} guarnición${seleccionadas.length === 1 ? '' : 'es'} para elegir`
              : 'Se pide directo, sin guarnición'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {sale ? (
            <>
              <button
                type="button"
                onClick={onSubir}
                disabled={primero}
                title="Subir en la carta"
                aria-label="Subir en la carta"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
              >
                <ArrowUp size={15} strokeWidth={STROKE} />
              </button>
              <button
                type="button"
                onClick={onBajar}
                disabled={ultimo}
                title="Bajar en la carta"
                aria-label="Bajar en la carta"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
              >
                <ArrowDown size={15} strokeWidth={STROKE} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={onArchivar}
            title="Archivar plato"
            aria-label="Archivar plato"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 transition hover:bg-gray-100 hover:text-gray-600"
          >
            <Trash2 size={15} strokeWidth={STROKE} />
          </button>
          {!sale ? (
            <button
              type="button"
              onClick={onToggleAbierto}
              aria-label="Cerrar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"
            >
              <ChevronDown size={16} strokeWidth={STROKE} className="rotate-180" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Sale hoy */}
      <div className="mt-3 rounded-xl bg-gray-50">
        <Switch
          checked={sale}
          onChange={(valor) => onChange('disponible_hoy', valor ? 1 : 0)}
          label="Sale hoy"
          hint={sale ? 'Visible en la web y en el TPV' : 'Guardado en la biblioteca'}
          tone={BRAND}
        />
      </div>

      {/* Tipo */}
      <div className="mt-3 flex gap-1 rounded-xl bg-gray-100 p-1">
        {[
          { value: 'economico', label: 'Económico' },
          { value: 'ejecutivo', label: 'Ejecutivo' },
        ].map((opcion) => {
          const activo = opcion.value === 'ejecutivo' ? esEjecutivo : !esEjecutivo;
          return (
            <button
              key={opcion.value}
              type="button"
              onClick={() => onChangeTipo(opcion.value)}
              className={`h-9 flex-1 rounded-lg text-[12px] transition ${activo ? 'bg-white font-semibold text-gray-900 shadow-sm' : 'font-medium text-gray-500 hover:text-gray-700'}`}
            >
              {opcion.label}
            </button>
          );
        })}
      </div>

      {/* Precio y stock */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <NumberField
          label="Precio"
          step="100"
          value={item.precio_hoy}
          onChange={(valor) => onChange('precio_hoy', valor)}
        />
        <NumberField
          label="Stock de hoy"
          value={item.stock_hoy}
          onChange={(valor) => onChange('stock_hoy', valor)}
        />
      </div>

      {/* Guarniciones */}
      {guarnicionesLista.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium text-gray-400">
            Guarniciones que puede elegir el cliente
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guarnicionesLista.map((guarnicion) => {
              const activa = seleccionadas.includes(guarnicion);
              return (
                <button
                  key={guarnicion}
                  type="button"
                  onClick={() =>
                    onChange(
                      'guarniciones_hoy',
                      activa
                        ? seleccionadas.filter((x) => x !== guarnicion)
                        : [...seleccionadas, guarnicion]
                    )
                  }
                  style={activa ? { background: BRAND, color: '#FFFFFF' } : undefined}
                  className={`rounded-lg px-3 py-1.5 text-[12px] transition ${activa ? 'font-semibold' : 'bg-gray-100 font-medium text-gray-600 hover:bg-gray-200'}`}
                >
                  {guarnicion}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Extras */}
      <div className="mt-3 space-y-1 rounded-xl bg-gray-50">
        <Switch
          checked={Number(item.ofrece_postre_hoy) === 1}
          onChange={(valor) => onChange('ofrece_postre_hoy', valor ? 1 : 0)}
          label="Ofrecer postre"
          hint={`+ ${fmt(extraPostrePrecio)}`}
        />
        {esEjecutivo ? (
          <Switch
            checked={Number(item.ofrece_bebida_postre_hoy) === 1}
            onChange={(valor) => onChange('ofrece_bebida_postre_hoy', valor ? 1 : 0)}
            label="Ofrecer bebida + postre"
            hint={`+ ${fmt(extraBebidaPostrePrecio)} · sólo ejecutivos`}
          />
        ) : null}
        <Switch
          checked={Number(item.destacado_hoy) === 1}
          onChange={(valor) => onChange('destacado_hoy', valor ? 1 : 0)}
          label="Destacar en la carta"
          hint="Aparece primero en la web"
          tone="#D97706"
        />
      </div>

      {/* Descripción */}
      <label className="mt-3 block">
        <span className="mb-1 block text-[11px] font-medium text-gray-400">Descripción de hoy</span>
        <textarea
          rows={2}
          value={item.descripcion_hoy || ''}
          onChange={(event) => onChange('descripcion_hoy', event.target.value)}
          placeholder="Cómo se describe el plato en la web"
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-400"
        />
      </label>
    </motion.div>
  );
}

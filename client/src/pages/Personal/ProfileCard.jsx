import { Bike, Star, Trash2, Pencil, Wallet } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { AvatarDisplay, Pill } from './components.jsx';
import { fmt, rolLabel, turnoLabel } from './constants.js';

export function ProfileCard({ detail, onEditar, onLiquidar, onEliminar }) {
  const item = detail.item;
  const debe = Number(item.pendiente_total || 0) > 0;

  return (
    <div className="-mt-10 flex flex-col items-center justify-between gap-5 sm:flex-row sm:items-end">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
        <div className="shrink-0 rounded-full border-4 border-white shadow-sm">
          <AvatarDisplay
            url={item.avatar_url}
            seed={item.id}
            nombre={item.nombre}
            size="h-24 w-24"
          />
        </div>

        <div className="pb-1 text-center sm:text-left">
          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <h2 className="text-xl font-semibold leading-tight tracking-tight text-gray-900">
              {item.nombre}
            </h2>
            {/* Una baja no se distinguía en ningún lado de la ficha: podías
                estar liquidándole un sueldo a alguien que ya no trabaja. */}
            {!item.activo ? <Pill label="Dado de baja" bg="#F1F5F9" fg="#475569" /> : null}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] text-gray-500 sm:justify-start">
            {/* Se mostraban los valores crudos de la base: "cocina", "manana". */}
            <span>{rolLabel(item.rol_operativo)}</span>
            <span className="text-gray-300">·</span>
            <span>{turnoLabel(item.turno_preferido)}</span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1">
              <Star size={12} strokeWidth={STROKE} className="text-amber-500" />
              {item.puntos_reconocimiento || 0} pts
            </span>
            {item.rol_operativo === 'delivery' ? (
              <>
                <span className="text-gray-300">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Bike size={12} strokeWidth={STROKE} />
                  Rider sincronizado
                </span>
              </>
            ) : null}
          </div>

          {debe ? (
            <p className="mt-1.5 text-[12px] font-medium" style={{ color: BRAND }}>
              Debe {fmt(item.pendiente_total)} sin liquidar
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 gap-2 pb-1">
        <button
          type="button"
          onClick={() => onEditar(item)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-3.5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
        >
          <Pencil size={14} strokeWidth={STROKE} />
          Editar
        </button>
        <button
          type="button"
          onClick={onLiquidar}
          style={{ background: BRAND }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-semibold text-white transition hover:brightness-110"
        >
          <Wallet size={14} strokeWidth={STROKE} />
          Liquidar
        </button>
        <button
          type="button"
          onClick={() => onEliminar(item)}
          title="Eliminar del sistema"
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-500 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <Trash2 size={15} strokeWidth={STROKE} />
        </button>
      </div>
    </div>
  );
}

import { Plus, ShoppingCart } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Stat } from '../Clientes/clientesUi.jsx';

export default function InventarioHeader({ stats, faltantes, onOpenCompraModal, onOpenNewInsumo }) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Inventario</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {stats.total === 0
              ? 'Todavía no hay insumos cargados'
              : `${stats.total} insumos · ${stats.receta} productos con receta`}
          </p>
        </div>

        {/*
          Los dos botones eran iguales: mismo color, mismo peso, mismo tamaño.
          Registrar una compra es lo que se hace todos los días; crear un
          insumo se hace una vez cada tanto.
        */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenCompraModal}
            style={{ background: BRAND }}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <ShoppingCart size={16} strokeWidth={STROKE} />
            Registrar compra
          </button>
          <button
            type="button"
            onClick={onOpenNewInsumo}
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
          >
            <Plus size={16} strokeWidth={STROKE} />
            Nuevo insumo
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Por debajo del mínimo"
          value={stats.bajos}
          helper={
            faltantes.length > 0 ? `${faltantes.length} para reponer hoy` : 'Todo el stock en orden'
          }
          alerta={stats.bajos > 0}
        />
        {/*
          "Venta frenada" es el número más caro de la pantalla: son productos
          que el TPV no deja vender porque falta un insumo de su receta. Estaba
          último y en ámbar, con el mismo peso que un conteo neutro.
        */}
        <Stat
          label="Productos sin poder vender"
          value={stats.frenados}
          helper={
            stats.frenados > 0 ? 'El TPV los bloquea por falta de insumos' : 'Todo disponible'
          }
          alerta={stats.frenados > 0}
        />
        <Stat
          label="Insumos cargados"
          value={stats.total}
          helper="Materia prima del inventario"
          tono="azul"
        />
        <Stat
          label="Productos con receta"
          value={stats.receta}
          helper="Descuentan stock al venderse"
          tono="verde"
        />
      </div>
    </>
  );
}

import { ShoppingCart, Plus, Boxes, AlertTriangle, TrendingUp, MinusCircle } from 'lucide-react';
import Stat from './Stat';

export default function InventarioHeader({ stats, faltantes, onOpenCompraModal, onOpenNewInsumo }) {
  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-1 bg-primary-500 rounded-full"></div>
            <p className="text-sm font-black text-primary-500 uppercase tracking-[0.3em]">
              Gestión de Suministros
            </p>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Inventario y Recetas</h1>
          <p className="mt-1 text-gray-500 font-medium">
            Controla el stock compartido de pizzas, hamburguesas y milanesas.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onOpenCompraModal}
            className="flex h-12 items-center gap-2 rounded-2xl bg-primary-500 px-6 text-sm font-black text-white shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 active:scale-95"
          >
            <ShoppingCart size={18} strokeWidth={3} />
            REGISTRAR COMPRA
          </button>
          <button
            onClick={onOpenNewInsumo}
            className="flex h-12 items-center gap-2 rounded-2xl bg-primary-500 text-white px-6 text-sm font-black shadow-lg shadow-primary-100 transition-all hover:bg-primary-600 active:scale-95"
          >
            <Plus size={18} strokeWidth={3} />
            NUEVO INSUMO
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total Insumos" value={stats.total} icon={Boxes} tint="blue" />
        <Stat
          label="Stock Crítico"
          value={stats.bajos}
          icon={AlertTriangle}
          tint="rose"
          helper={`${faltantes.length} para reponer`}
        />
        <Stat
          label="Con Receta"
          value={stats.receta}
          icon={TrendingUp}
          tint="emerald"
          helper="Descuento compartido"
        />
        <Stat
          label="Venta Frenada"
          value={stats.frenados}
          icon={MinusCircle}
          tint="amber"
          helper="Sin ingredientes"
        />
      </div>
    </>
  );
}

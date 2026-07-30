import { Briefcase, Clock, Star, Bike, Pencil, Trash2 } from 'lucide-react';
import { AvatarDisplay } from './components.jsx';

export function ProfileCard({ detail, selectedPerson, onEditar, onLiquidar, onEliminar }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-center sm:items-end -mt-10 gap-6">
      <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
        <div className="h-28 w-28 rounded-full border-4 border-white bg-gray-100 shadow-lg overflow-hidden shrink-0">
          <AvatarDisplay
            url={detail.item.avatar_url}
            nombre={detail.item.nombre}
            size="w-full h-full"
          />
        </div>
        <div className="text-center sm:text-left pb-1">
          <h2 className="text-2xl font-bold text-gray-900 leading-tight">{detail.item.nombre}</h2>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-1">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <Briefcase size={14} className="text-primary-500" /> {detail.item.rol_operativo}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <Clock size={14} className="text-warning-500" /> {detail.item.turno_preferido}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <Star size={14} className="text-amber-400" /> {detail.item.puntos_reconocimiento} pts
            </span>
            {detail.item.rol_operativo === 'delivery' ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-success-600 uppercase tracking-wider">
                <Bike size={14} className="text-emerald-500" /> Rider sincronizado
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2 pb-1">
        <button
          onClick={() => onEditar(detail.item)}
          className="h-10 px-4 rounded-lg bg-gray-50 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-all"
        >
          Editar Perfil
        </button>
        <button
          onClick={onLiquidar}
          className="h-10 px-4 rounded-lg bg-primary-500 text-white text-xs font-bold shadow-lg shadow-[#5D87FF]/20 hover:bg-primary-600 transition-all"
        >
          Liquidar Pago
        </button>
        <button
          onClick={() => onEliminar(detail.item)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-100 bg-danger-50 text-rose-500 hover:bg-danger-100 transition-all"
          title="Eliminar personal"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

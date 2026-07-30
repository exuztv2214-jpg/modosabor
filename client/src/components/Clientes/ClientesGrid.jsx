import { Gift, History, MapPin, ShieldAlert, Star } from 'lucide-react';

export default function ClientesGrid({
  filtered,
  abrirDetalle,
  AvatarDisplay,
  getEstadoBadge,
  fmtMoney,
  sellosParaPremio,
  getCardQuickAction,
  toast,
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {filtered.map((c) => (
        <div
          key={c.id}
          onClick={() => abrirDetalle(c)}
          className={`group cursor-pointer rounded-[32px] bg-white p-6 border border-gray-100 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 text-center ${!c.fidelizacion_activa ? 'opacity-60 grayscale-[0.5]' : ''}`}
        >
          <div className="mx-auto w-24 h-24 mb-4 relative">
            <AvatarDisplay url={c.avatar_url} nombre={c.nombre} size="w-full h-full" />
            <div className="absolute -bottom-2 -right-2 px-3 py-1 rounded-lg bg-primary-500 text-white text-[10px] font-black uppercase shadow-md border-2 border-white">
              {c.nivel}
            </div>
            {!c.fidelizacion_activa && (
              <div
                className="absolute top-0 right-0 h-6 w-6 rounded-full bg-danger-500 flex items-center justify-center text-white border-2 border-white"
                title="Lealtad Desactivada"
              >
                <ShieldAlert size={12} strokeWidth={3} />
              </div>
            )}
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <h4 className="font-black text-gray-900 uppercase tracking-tight text-lg truncate">
                {c.nombre}
              </h4>
            </div>
            <div className="mb-2 flex items-center justify-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${getEstadoBadge(c).className}`}
              >
                {getEstadoBadge(c).label}
              </span>
            </div>
            <p className="text-[10px] font-black text-primary-500 bg-primary-50 px-2 py-0.5 rounded-full inline-block mb-2">
              {c.codigo_tarjeta}
            </p>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1 text-center">
              <MapPin size={12} /> {c.direccion || 'Sin dirección'}
            </p>
          </div>

          <div className="row grid grid-cols-2 gap-3 mb-6">
            <div className="py-3 px-2 bg-gray-50 rounded-[20px] flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-500 shrink-0">
                <History size={16} />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1 truncate">
                  Pedidos
                </p>
                <p className="text-sm font-black text-gray-800 leading-none">
                  {c.total_pedidos || 0}
                </p>
              </div>
            </div>
            <div className="py-3 px-2 bg-gray-50 rounded-[20px] flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-warning-100 flex items-center justify-center text-warning-500 shrink-0">
                <Star size={16} />
              </div>
              <div className="text-left min-w-0">
                <p className="text-[9px] font-black text-gray-400 uppercase leading-none mb-1 truncate">
                  Invertido
                </p>
                <p className="text-sm font-black text-primary-500 leading-none truncate">
                  {fmtMoney(c.total_gastado)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                PROGRESO SELLO
              </span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {c.sellos_actuales || 0} / {sellosParaPremio}
              </span>
            </div>
            <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-50">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-primary-500 to-info-500 shadow-[0_0_10px_rgba(93,135,255,0.3)]"
                style={{
                  width: `${Math.min(100, ((c.sellos_actuales || 0) / sellosParaPremio) * 100)}%`,
                }}
              />
            </div>
            {c.recompensas_pendientes > 0 && (
              <div className="pt-1 flex items-center justify-center gap-1 text-[9px] font-black text-success-500 uppercase animate-pulse">
                <Gift size={12} /> ¡{c.recompensas_pendientes} PREMIO LISTO!
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                abrirDetalle(c);
              }}
              className="rounded-[18px] border border-gray-100 bg-background px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 transition-all hover:text-primary-500"
            >
              Ver ficha
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                const action = getCardQuickAction(c);
                if (!c.telefono) {
                  toast.error('Este cliente no tiene telefono cargado');
                  return;
                }
                window.open(action.href, '_blank');
              }}
              className="rounded-[18px] border border-gray-100 bg-background px-3 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 transition-all hover:text-success-500"
            >
              {getCardQuickAction(c).label}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

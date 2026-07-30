import { format, parseISO } from 'date-fns';
import { Star, Trophy } from 'lucide-react';

export function PuntosTab({ detail, onOpenPremios, onOpenReconocimiento }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
      <div className="md:col-span-4 space-y-6">
        <div className="rounded-xl bg-gradient-to-br from-primary-500 to-info-500 p-6 text-white shadow-lg">
          <h4 className="text-sm font-bold uppercase tracking-widest opacity-80">
            Puntos Acumulados
          </h4>
          <div className="flex items-center gap-3 mt-4">
            <Star size={32} className="fill-white" />
            <span className="text-5xl font-black">{detail.item.puntos_reconocimiento}</span>
          </div>
          <p className="text-xs font-bold mt-6 opacity-90 uppercase leading-relaxed tracking-tight">
            Gana puntos por puntualidad, feedback positivo de clientes y desempeño destacado.
          </p>
          <button
            onClick={onOpenPremios}
            className="w-full mt-6 h-10 rounded-lg bg-white/20 backdrop-blur-md text-xs font-bold uppercase hover:bg-white/30 transition-all"
          >
            Ver Premios
          </button>
        </div>
      </div>

      <div className="md:col-span-8 rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-base font-bold text-gray-900">Historial de Reconocimientos</h4>
          <button
            onClick={onOpenReconocimiento}
            className="h-8 px-3 rounded-lg bg-[#E6FFFA] text-success-500 text-[11px] font-bold hover:bg-success-500 hover:text-white transition-all"
          >
            Dar Reconocimiento
          </button>
        </div>
        <div className="space-y-4">
          {detail.reconocimientos.map((r, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-4 rounded-xl border border-gray-50 bg-gray-50/30"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-amber-400 shadow-sm border border-amber-100">
                  <Trophy size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">
                    {r.tipo === 'canje' ? 'Canje de puntos' : r.tipo}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    {format(parseISO(r.fecha), 'dd MMM yyyy')}
                  </p>
                </div>
              </div>
              <span
                className={`font-black text-sm ${r.puntos > 0 ? 'text-emerald-500' : 'text-rose-500'}`}
              >
                {r.puntos > 0 ? `+${r.puntos}` : r.puntos} pts
              </span>
            </div>
          ))}
          {detail.reconocimientos.length === 0 && (
            <div className="py-12 text-center text-gray-400 italic text-sm">
              No hay reconocimientos registrados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

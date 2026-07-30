import { Star } from 'lucide-react';

export function PremiosModal({ open, onClose, detail }) {
  if (!open || !detail?.item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-[32px] bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-br from-primary-500 to-info-500 p-8 text-white text-center">
          <Star size={40} className="fill-white mx-auto mb-3" />
          <p className="text-4xl font-black">{detail.item.puntos_reconocimiento}</p>
          <p className="text-sm font-bold opacity-80 mt-1">Puntos acumulados</p>
        </div>
        <div className="p-6">
          <p className="text-xs font-black uppercase tracking-widest text-gray-400 mb-4">
            Cómo ganar puntos
          </p>
          <div className="space-y-3">
            {[
              { label: 'Puntualidad perfecta', pts: '+5' },
              { label: 'Feedback positivo de clientes', pts: '+10' },
              { label: 'Desempeño destacado', pts: '+15' },
              { label: 'Capacitación completada', pts: '+20' },
            ].map((r) => (
              <div
                key={r.label}
                className="flex justify-between items-center py-2 border-b border-gray-50"
              >
                <span className="text-sm font-semibold text-gray-700">{r.label}</span>
                <span className="text-sm font-black text-primary-500">{r.pts} pts</span>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="w-full mt-6 h-11 rounded-xl bg-gray-100 text-sm font-black text-gray-500 hover:bg-gray-200 transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

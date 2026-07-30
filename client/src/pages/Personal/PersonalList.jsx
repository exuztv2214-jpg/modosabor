import { ChevronRight } from 'lucide-react';
import { AvatarDisplay } from './components.jsx';

export function PersonalList({ personal, selectedId, onSelectId }) {
  return (
    <div className="lg:col-span-4">
      <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col h-full max-h-[750px] overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <h3 className="text-lg font-bold text-gray-900">Personal</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar">
          {personal.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectId(String(item.id))}
              className={`group cursor-pointer rounded-xl p-3 transition-all duration-200 flex items-center gap-3 ${String(selectedId) === String(item.id) ? 'bg-primary-50 text-primary-500' : 'bg-white hover:bg-gray-50 text-gray-700'}`}
            >
              <div className="relative shrink-0">
                <div className="h-11 w-11 rounded-full overflow-hidden border-2 border-white shadow-sm">
                  <AvatarDisplay url={item.avatar_url} nombre={item.nombre} size="w-full h-full" />
                </div>
                {!item.activo && (
                  <div className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-danger-500 border-2 border-white"></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm truncate">{item.nombre}</h4>
                <p
                  className={`text-[11px] font-semibold uppercase tracking-wider ${String(selectedId) === String(item.id) ? 'text-primary-500/80' : 'text-gray-400'}`}
                >
                  {item.rol_operativo}
                </p>
              </div>
              <ChevronRight
                size={16}
                className={
                  String(selectedId) === String(item.id)
                    ? 'text-primary-500'
                    : 'text-gray-300 group-hover:translate-x-1 transition-all'
                }
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

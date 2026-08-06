import { BRAND } from '../../lib/theme.js';

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'equipo', label: 'Asistencia' },
  { id: 'planilla', label: 'Planilla semanal' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'trayectoria', label: 'Trayectoria' },
  { id: 'puntos', label: 'Puntos y premios' },
];

/**
 * Seis pestañas sin scroll horizontal: en un celular se apretaban hasta
 * romper el layout. Ahora la barra scrollea y las etiquetas no se cortan.
 */
export function TabsNav({ activeTab, onTabChange }) {
  return (
    <div className="-mx-1 mt-6 overflow-x-auto border-b border-gray-100">
      <div className="flex min-w-max gap-1 px-1">
        {TABS.map((t) => {
          const activo = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className="relative shrink-0 px-3 pb-3 pt-1 text-[13px] font-medium transition"
              style={{ color: activo ? BRAND : '#6B7280' }}
            >
              {t.label}
              {activo ? (
                <span
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full"
                  style={{ background: BRAND }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabsNav({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'equipo', label: 'Turnos y Asistencia' },
    { id: 'planilla', label: 'Planilla Semanal' },
    { id: 'movimientos', label: 'Movimientos' },
    { id: 'trayectoria', label: 'Trayectoria' },
    { id: 'puntos', label: 'Puntos y Premios' },
  ];

  return (
    <div className="flex gap-6 mt-8 border-b border-gray-100">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onTabChange(t.id)}
          className={`pb-4 text-xs font-bold uppercase tracking-wider transition-all relative ${activeTab === t.id ? 'text-primary-500' : 'text-gray-400 hover:text-gray-600'}`}
        >
          {t.label}
          {activeTab === t.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-full"></div>
          )}
        </button>
      ))}
    </div>
  );
}

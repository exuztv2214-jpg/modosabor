import { ExternalLink, Plus, RefreshCw, Users, CheckCircle2, Clock, Wallet } from 'lucide-react';
import { StatCard } from './components.jsx';
import { fmt } from './constants.js';

export function PersonalHeader({ stats, turnoActual, onRefresh, onNuevo }) {
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Gestión de Personal</h1>
          <p className="text-sm font-medium text-gray-500">
            Administra los roles, pagos y actividad de tu equipo.
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/personal/reloj"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            <ExternalLink size={16} />
            Reloj del equipo
          </a>
          <button
            onClick={onRefresh}
            className="h-11 w-11 flex items-center justify-center rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 transition-all"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={onNuevo}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary-500 text-white px-5 text-sm font-bold shadow-lg shadow-[#5D87FF]/20 hover:bg-primary-600 transition-all"
          >
            <Plus size={18} strokeWidth={2.5} />
            Nuevo Miembro
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Equipo" value={stats.total} icon={Users} tint="blue" />
        <StatCard
          label="Miembros Activos"
          value={stats.activos}
          icon={CheckCircle2}
          tint="emerald"
        />
        <StatCard label="Turno Actual" value={turnoActual || 'Cerrado'} icon={Clock} tint="amber" />
        <StatCard
          label="Pendiente de Pago"
          value={fmt(stats.pendiente)}
          icon={Wallet}
          tint="rose"
        />
      </div>
    </>
  );
}

import {
  Search,
  RefreshCw,
  Plus,
  Download,
  Settings,
  UserRound,
  Star,
  TrendingUp,
} from 'lucide-react';
import toast from 'react-hot-toast';

const LEVEL_COLORS = {
  Bronce: '#b45309',
  Plata: '#64748b',
  Oro: '#f59e0b',
  Platino: '#94a3b8',
};

function StatCard({ label, value, icon: Icon, tint = 'blue' }) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    amber: 'bg-warning-50 text-warning-500',
    rose: 'bg-danger-50 text-danger-500',
    emerald: 'bg-success-50 text-success-500',
    sky: 'bg-info-50 text-info-500',
  };
  return (
    <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1">
            {label}
          </p>
          <p className="text-2xl font-black text-gray-900">{value}</p>
        </div>
        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${tints[tint]}`}>
          <Icon size={22} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

export default function ClientesHeader({
  search,
  setSearch,
  filtroNivel,
  setFiltroNivel,
  filtroEstado,
  setFiltroEstado,
  filtroBeneficio,
  setFiltroBeneficio,
  stats,
  loading,
  canManageFidelidadConfig,
  onConfig,
  onExport,
  onNuevo,
  onRefresh,
  fmtMoney,
  control,
}) {
  return (
    <>
      {/* Header Seccion */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-1 bg-primary-500 rounded-full"></div>
            <p className="text-sm font-black text-primary-500 uppercase tracking-[0.3em]">
              CRM & Fidelización
            </p>
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Comunidad Modo Sabor</h1>
          <p className="mt-1 text-gray-500 font-medium">
            Gestiona tu base de clientes y premia su lealtad.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onConfig}
            className={`h-12 w-12 flex items-center justify-center rounded-2xl bg-white border border-gray-100 text-gray-400 shadow-sm transition-all ${canManageFidelidadConfig ? 'hover:text-primary-500' : 'cursor-not-allowed opacity-60'}`}
            title="Configuración de Fidelidad"
          >
            <Settings size={20} />
          </button>
          <button
            onClick={onExport}
            className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white border border-gray-100 text-gray-400 shadow-sm hover:text-primary-500 hover:border-primary-200 transition-all"
            title="Exportar CSV"
          >
            <Download size={18} />
          </button>
          <button
            onClick={onNuevo}
            className="flex h-12 items-center gap-2 rounded-2xl bg-primary-500 text-white px-6 text-sm font-black shadow-lg shadow-primary-100 active:scale-95 transition-all"
          >
            <Plus size={18} strokeWidth={3} />
            NUEVO CLIENTE
          </button>
          <button
            onClick={onRefresh}
            className="h-12 w-12 flex items-center justify-center rounded-2xl bg-white border border-gray-100 text-gray-400 shadow-sm"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Metricas VIP */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:gap-6">
        <StatCard label="Clientes Totales" value={stats.total} icon={UserRound} tint="blue" />
        <StatCard label="Miembros VIP" value={stats.vip} icon={Star} tint="amber" />
        <StatCard
          label="Ventas Acumuladas"
          value={fmtMoney(stats.ltv)}
          icon={TrendingUp}
          tint="emerald"
        />
      </div>

      {/* Buscador y Filtros */}
      <div className="rounded-[32px] bg-white p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, teléfono o código MS..."
            className={control + ' pl-12 bg-background'}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            className="h-12 px-6 rounded-2xl bg-background border-none text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
          >
            <option value="Todos">Todos los niveles</option>
            {Object.keys(LEVEL_COLORS).map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="h-12 px-6 rounded-2xl bg-background border-none text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
          >
            <option value="Todos">Todos los estados</option>
            <option value="VIP">Solo VIP</option>
            <option value="Premio listo">Premio listo</option>
            <option value="Recurrente">Recurrentes</option>
            <option value="Activo">Activos</option>
            <option value="Por reactivar">Por reactivar</option>
            <option value="En riesgo">En riesgo</option>
            <option value="Perdido">Perdidos</option>
            <option value="Nuevo">Nuevos</option>
          </select>
          <select
            value={filtroBeneficio}
            onChange={(e) => setFiltroBeneficio(e.target.value)}
            className="h-12 px-6 rounded-2xl bg-background border-none text-sm font-bold text-gray-600 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
          >
            <option value="Todos">Todos los beneficios</option>
            <option value="Con premio">Con premio listo</option>
            <option value="Fidelización activa">Fidelización activa</option>
            <option value="Fidelización pausada">Fidelización pausada</option>
            <option value="Perfil incompleto">Perfil incompleto</option>
          </select>
        </div>
      </div>
    </>
  );
}

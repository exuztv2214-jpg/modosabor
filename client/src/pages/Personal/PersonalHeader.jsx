import { ExternalLink, Plus, RefreshCw, Users, CheckCircle2, Clock, Wallet } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { StatCard } from './components.jsx';
import { fmt } from './constants.js';

export function PersonalHeader({ stats, turnoActual, onRefresh, onNuevo }) {
  const bajas = Math.max(0, stats.total - stats.activos);

  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Personal</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Turnos, asistencia, sueldos y reconocimientos del equipo
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href="/personal/reloj"
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
          >
            <ExternalLink size={15} strokeWidth={STROKE} />
            Reloj del equipo
          </a>
          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 hover:text-gray-700"
          >
            <RefreshCw size={16} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={onNuevo}
            style={{ background: BRAND }}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <Plus size={16} strokeWidth={STROKE} />
            Nuevo miembro
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Equipo activo"
          value={stats.activos}
          icon={Users}
          hint={bajas > 0 ? `${bajas} dado${bajas === 1 ? '' : 's'} de baja` : 'Sin bajas'}
        />
        <StatCard
          label="Turno actual"
          value={turnoActual || 'Cerrado'}
          icon={Clock}
          hint={turnoActual ? 'Turno abierto ahora' : 'No hay turno abierto'}
        />
        <StatCard
          label="Con saldo pendiente"
          value={stats.conPendiente}
          icon={CheckCircle2}
          // Sólo se pinta si efectivamente le debés a alguien. Antes las cuatro
          // tarjetas tenían color fijo y ninguna llamaba la atención.
          alerta={stats.conPendiente > 0}
          hint={stats.conPendiente > 0 ? `de ${stats.activos} activos` : 'Nadie con plata a cobrar'}
        />
        <StatCard
          label="Total a liquidar"
          value={fmt(stats.pendiente)}
          icon={Wallet}
          alerta={stats.pendiente > 0}
          hint="Adelantos, descuentos y consumos sin liquidar"
        />
      </div>
    </>
  );
}

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock,
  Bike,
  AlertTriangle,
  Undo2,
  Package,
  TrendingUp,
  RefreshCw,
  ChefHat,
  Hourglass,
  Navigation,
} from 'lucide-react';

import api from '../lib/api.js';

const fmtMin = (n) => (Number.isFinite(n) ? `${n} min` : '—');
const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function hoyISO(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Card de una etapa del proceso, con mediana y promedio. */
function EtapaCard({ icon: Icon, titulo, dato, descripcion, tone = 'blue' }) {
  const tones = {
    blue: 'bg-primary-50 text-primary-600',
    amber: 'bg-warning-50 text-warning-600',
    emerald: 'bg-success-50 text-success-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  // Si el promedio se dispara respecto de la mediana hay outliers:
  // conviene avisarlo en vez de mostrar solo un número lindo.
  const hayOutliers =
    Number.isFinite(dato?.mediana) &&
    Number.isFinite(dato?.promedio) &&
    dato.promedio > dato.mediana * 1.6;

  return (
    <div className="rounded-[22px] border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            {titulo}
          </p>
          <p className="mt-2 text-3xl font-black tabular-nums text-gray-900">
            {fmtMin(dato?.mediana)}
          </p>
          <p className="mt-1 text-[11px] font-bold text-gray-400">
            Promedio {fmtMin(dato?.promedio)}
          </p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone]}`}>
          <Icon size={20} strokeWidth={2.5} />
        </div>
      </div>
      <p className="mt-3 text-[11px] font-semibold leading-relaxed text-gray-500">{descripcion}</p>
      {hayOutliers && (
        <p className="mt-2 rounded-lg bg-warning-50 px-2 py-1 text-[10px] font-bold text-warning-700">
          Hay casos muy lentos que estiran el promedio
        </p>
      )}
    </div>
  );
}

export default function ReportesDelivery() {
  const [rango, setRango] = useState({ desde: hoyISO(-7), hasta: hoyISO(0) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = async (r = rango) => {
    setLoading(true);
    try {
      const res = await api.get('/reportes-delivery/resumen', { params: r });
      setData(res);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar los reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarPreset = (dias) => {
    const nuevo = { desde: hoyISO(-dias), hasta: hoyISO(0) };
    setRango(nuevo);
    cargar(nuevo);
  };

  const maxPedidosHora = useMemo(
    () => Math.max(1, ...(data?.porHora || []).map((h) => h.pedidos)),
    [data]
  );

  const totales = data?.totales || {};
  const dur = data?.duraciones || {};

  return (
    <div className="space-y-6">
      {/* ── Header + filtros ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-gray-900">
            Reportes de delivery
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Dónde se va el tiempo entre que entra el pedido y llega al cliente.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { label: 'Hoy', dias: 0 },
            { label: '7 días', dias: 7 },
            { label: '30 días', dias: 30 },
          ].map(({ label, dias }) => (
            <button
              key={label}
              type="button"
              onClick={() => aplicarPreset(dias)}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-200"
            >
              {label}
            </button>
          ))}
          <input
            type="date"
            value={rango.desde}
            onChange={(e) => setRango((p) => ({ ...p, desde: e.target.value }))}
            className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-700"
          />
          <input
            type="date"
            value={rango.hasta}
            onChange={(e) => setRango((p) => ({ ...p, hasta: e.target.value }))}
            className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-bold text-gray-700"
          />
          <button
            type="button"
            onClick={() => cargar()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-500 px-4 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Aplicar
          </button>
        </div>
      </div>

      {/* ── Totales ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          {
            label: 'Pedidos',
            value: totales.pedidos ?? 0,
            icon: Package,
            tone: 'text-primary-600',
          },
          {
            label: 'Entregados',
            value: totales.entregados ?? 0,
            icon: TrendingUp,
            tone: 'text-success-600',
          },
          {
            label: 'Sin entregar',
            value: totales.sin_entregar ?? 0,
            icon: Hourglass,
            tone: 'text-gray-500',
          },
          {
            label: 'Incidencias',
            value: totales.incidencias ?? 0,
            icon: AlertTriangle,
            tone: 'text-warning-600',
          },
          {
            label: 'Entregas deshechas',
            value: totales.reversiones ?? 0,
            icon: Undo2,
            tone: 'text-danger-600',
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                {label}
              </p>
              <Icon size={16} className={tone} strokeWidth={2.6} />
            </div>
            <p className="mt-2 text-2xl font-black tabular-nums text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Dónde se va el tiempo ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <EtapaCard
          icon={ChefHat}
          titulo="Preparación"
          dato={dur.preparacion}
          tone="amber"
          descripcion="Desde que se confirma el pedido hasta que la cocina lo marca listo."
        />
        <EtapaCard
          icon={Hourglass}
          titulo="Espera de retiro"
          dato={dur.espera_retiro}
          tone="violet"
          descripcion="El pedido está listo y espera a que un rider lo retire. Si es alto, faltan riders."
        />
        <EtapaCard
          icon={Navigation}
          titulo="Viaje"
          dato={dur.viaje}
          tone="blue"
          descripcion="Desde que sale del local hasta que llega al cliente."
        />
        <EtapaCard
          icon={Clock}
          titulo="Total"
          dato={dur.total}
          tone="emerald"
          descripcion="Punta a punta: lo que percibe el cliente desde que hace el pedido."
        />
      </div>

      {/* ── Por rider ── */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Bike size={18} className="text-primary-600" />
          <h2 className="text-sm font-black uppercase tracking-tight text-gray-900">Por rider</h2>
        </div>
        {(data?.porRider || []).length === 0 ? (
          <p className="text-sm font-semibold text-gray-400">Sin entregas en el rango elegido.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                  <th className="pb-3">Rider</th>
                  <th className="pb-3 text-right">Entregas</th>
                  <th className="pb-3 text-right">Viaje (mediana)</th>
                  <th className="pb-3 text-right">Total (mediana)</th>
                  <th className="pb-3 text-right">Incidencias</th>
                  <th className="pb-3 text-right">Deshechas</th>
                  <th className="pb-3 text-right">Facturado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.porRider.map((r) => (
                  <tr key={r.repartidor_id} className="text-gray-800">
                    <td className="py-3 font-black">{r.nombre}</td>
                    <td className="py-3 text-right font-bold tabular-nums">{r.entregas}</td>
                    <td className="py-3 text-right font-bold tabular-nums">
                      {fmtMin(r.viaje_mediana)}
                    </td>
                    <td className="py-3 text-right font-bold tabular-nums">
                      {fmtMin(r.total_mediana)}
                    </td>
                    <td
                      className={`py-3 text-right font-bold tabular-nums ${r.incidencias > 0 ? 'text-warning-700' : 'text-gray-400'}`}
                    >
                      {r.incidencias}
                    </td>
                    <td
                      className={`py-3 text-right font-bold tabular-nums ${r.reversiones > 0 ? 'text-danger-600' : 'text-gray-400'}`}
                    >
                      {r.reversiones}
                    </td>
                    <td className="py-3 text-right font-bold tabular-nums">
                      {fmtPesos(r.facturado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Por franja horaria ── */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={18} className="text-violet-600" />
          <h2 className="text-sm font-black uppercase tracking-tight text-gray-900">
            Carga por hora
          </h2>
        </div>
        {(data?.porHora || []).length === 0 ? (
          <p className="text-sm font-semibold text-gray-400">Sin datos en el rango.</p>
        ) : (
          <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
            {data.porHora.map((h) => (
              <div key={h.hora} className="flex min-w-[38px] flex-1 flex-col items-center gap-1.5">
                <span className="text-[9px] font-black tabular-nums text-gray-400">
                  {h.pedidos}
                </span>
                <div
                  className="w-full rounded-t-lg bg-violet-500 transition-all"
                  style={{ height: `${Math.max(6, (h.pedidos / maxPedidosHora) * 120)}px` }}
                  title={`${h.pedidos} pedidos · mediana ${fmtMin(h.total_mediana)}`}
                />
                <span className="text-[9px] font-black tabular-nums text-gray-500">
                  {String(h.hora).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] font-semibold text-gray-500">
          Pasá el mouse sobre una barra para ver la mediana de esa franja.
        </p>
      </section>

      {/* ── Los más lentos ── */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle size={18} className="text-warning-600" />
          <h2 className="text-sm font-black uppercase tracking-tight text-gray-900">
            Los 10 más lentos
          </h2>
        </div>
        {(data?.masLentos || []).length === 0 ? (
          <p className="text-sm font-semibold text-gray-400">Sin entregas en el rango.</p>
        ) : (
          <div className="space-y-2">
            {data.masLentos.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-black text-gray-900">
                    #{p.numero} · {p.rider || 'Sin rider'}
                  </p>
                  <p className="truncate text-xs font-semibold text-gray-500">{p.direccion}</p>
                </div>
                <span className="shrink-0 rounded-full bg-warning-100 px-3 py-1 text-xs font-black tabular-nums text-warning-700">
                  {fmtMin(p.minutos)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

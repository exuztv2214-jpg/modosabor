import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Clock,
  Bike,
  AlertTriangle,
  Download,
  Undo2,
  Package,
  TrendingUp,
  RefreshCw,
  ChefHat,
  Hourglass,
  Navigation,
  CalendarDays,
} from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';

const fmtMin = (n) => (Number.isFinite(n) ? `${n} min` : '—');
const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function hoyISO(offsetDias = 0) {
  const d = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Card de una etapa del proceso, con mediana y promedio. */
const TONOS_ETAPA = {
  blue: { bg: '#E9F1FA', label: '#1F5FA0', valor: '#0B3A66', barra: '#3B82F6' },
  amber: { bg: '#FDF3D3', label: '#95661A', valor: '#6B4108', barra: '#E0A924' },
  emerald: { bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A', barra: '#10B981' },
  violet: { bg: '#F1EEFE', label: '#5E43A8', valor: '#42237F', barra: '#8B7BE0' },
};

function EtapaCard({ icon: Icon, titulo, dato, descripcion, tone = 'blue' }) {
  const t = TONOS_ETAPA[tone] || TONOS_ETAPA.blue;
  // Si el promedio se dispara respecto de la mediana hay outliers:
  // conviene avisarlo en vez de mostrar solo un número lindo.
  const hayOutliers =
    Number.isFinite(dato?.mediana) &&
    Number.isFinite(dato?.promedio) &&
    dato.promedio > dato.mediana * 1.6;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={{ background: t.bg }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.barra }} />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px]" style={{ color: t.label }}>
              {titulo}
            </p>
            <p
              className="mt-1 text-[24px] font-bold leading-none tabular-nums tracking-tight"
              style={{ color: t.valor }}
            >
              {fmtMin(dato?.mediana)}
            </p>
            <p className="mt-1.5 text-[11px]" style={{ color: t.label }}>
              Promedio {fmtMin(dato?.promedio)}
            </p>
          </div>
          <Icon size={17} strokeWidth={STROKE} className="mt-0.5 shrink-0 opacity-35" />
        </div>

        <p className="mt-2 text-[11px] leading-4" style={{ color: t.label }}>
          {descripcion}
        </p>

        {hayOutliers && (
          <p
            className="mt-2 rounded-lg bg-white/70 px-2 py-1 text-[11px] leading-4"
            style={{ color: t.valor }}
          >
            Hay casos muy lentos que estiran el promedio
          </p>
        )}
      </div>
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

  const peorDia = useMemo(() => {
    const vals = (data?.porDia || []).map((d) => d.total_mediana).filter((v) => Number.isFinite(v));
    return vals.length ? Math.max(...vals) : null;
  }, [data]);

  /**
   * Exportar.
   *
   * Era el único módulo de reportes sin salida a CSV: podías mirar los
   * números en pantalla pero no llevártelos para comparar meses ni cruzarlos
   * con nada.
   */
  const exportarCsv = () => {
    if (!data) return toast.error('No hay datos para exportar');
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lista = (key) => (Array.isArray(data?.[key]) ? data[key] : []);

    // Los nombres de campo salen del endpoint /reportes-delivery/resumen.
    // No hay `porZona` ni `puntualidad` ahí: si los pedís, exportás columnas
    // vacías sin que nada avise.
    const filas = [
      ['Sección', 'Nombre', 'Valor 1', 'Valor 2'].map(cell).join(','),
      ['Resumen', 'Pedidos', totales.pedidos ?? 0, ''].map(cell).join(','),
      ['Resumen', 'Entregados', totales.entregados ?? 0, ''].map(cell).join(','),
      ['Resumen', 'Sin entregar', totales.sin_entregar ?? 0, ''].map(cell).join(','),
      ['Resumen', 'Incidencias', totales.incidencias ?? 0, ''].map(cell).join(','),
      ['Resumen', 'Entregas deshechas', totales.reversiones ?? 0, ''].map(cell).join(','),
      ['Tiempos (min)', 'etapa', 'mediana', 'promedio'].map(cell).join(','),
      ...['preparacion', 'espera_retiro', 'viaje', 'total'].map((etapa) =>
        ['Tiempos', etapa, dur?.[etapa]?.mediana ?? '', dur?.[etapa]?.promedio ?? '']
          .map(cell)
          .join(',')
      ),
      ['Rider', 'nombre', 'entregas', 'facturado'].map(cell).join(','),
      ...lista('porRider').map((r) =>
        ['Rider', r.nombre, r.entregas, r.facturado].map(cell).join(',')
      ),
      ['Hora', 'hora', 'pedidos', 'total mediana'].map(cell).join(','),
      ...lista('porHora').map((h) =>
        ['Hora', h.hora, h.pedidos, h.total_mediana ?? ''].map(cell).join(',')
      ),
      ['Día', 'fecha', 'pedidos', 'total mediana'].map(cell).join(','),
      ...lista('porDia').map((d) =>
        ['Día', d.fecha, d.pedidos, d.total_mediana ?? ''].map(cell).join(',')
      ),
    ].join('\n');

    const blob = new Blob(['﻿' + filas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delivery_${rango.desde}_${rango.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado');
  };

  const totales = data?.totales || {};
  const dur = data?.duraciones || {};

  const preset = (dias) => rango.desde === hoyISO(-dias) && rango.hasta === hoyISO(0);

  // El Layout ya aplica el fondo (bg-background === APP_BG) y el padding
  // horizontal; acá sólo el ritmo vertical.
  return (
    <div className="py-6">
      <div className="space-y-4">
        {/* ── Encabezado ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Reportes de delivery
            </h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              Dónde se va el tiempo entre que entra el pedido y llega al cliente
            </p>
          </div>

          <button
            type="button"
            onClick={exportarCsv}
            disabled={!data}
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 disabled:opacity-40"
          >
            <Download size={16} strokeWidth={STROKE} />
            CSV
          </button>
        </div>

        {/* ── Rango ── */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="flex rounded-xl bg-gray-200/70 p-1">
            {[
              { label: 'Hoy', dias: 0 },
              { label: '7 días', dias: 7 },
              { label: '30 días', dias: 30 },
            ].map(({ label, dias }) => (
              <button
                key={label}
                type="button"
                onClick={() => aplicarPreset(dias)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  preset(dias)
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={rango.desde}
              onChange={(e) => setRango((p) => ({ ...p, desde: e.target.value }))}
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
            <span className="text-[13px] text-gray-400">a</span>
            <input
              type="date"
              value={rango.hasta}
              onChange={(e) => setRango((p) => ({ ...p, hasta: e.target.value }))}
              className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
            />
          </div>

          <button
            type="button"
            onClick={() => cargar()}
            disabled={loading}
            style={{ background: BRAND }}
            className="inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            Aplicar
          </button>
        </div>

        {/* ── Totales ── */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: 'Pedidos', value: totales.pedidos ?? 0, icon: Package },
            { label: 'Entregados', value: totales.entregados ?? 0, icon: TrendingUp },
            { label: 'Sin entregar', value: totales.sin_entregar ?? 0, icon: Hourglass },
            // Incidencias y entregas deshechas son las dos que piden mirar algo:
            // van en rojo sólo cuando efectivamente hay.
            {
              label: 'Incidencias',
              value: totales.incidencias ?? 0,
              icon: AlertTriangle,
              alerta: Number(totales.incidencias || 0) > 0,
            },
            {
              label: 'Entregas deshechas',
              value: totales.reversiones ?? 0,
              icon: Undo2,
              alerta: Number(totales.reversiones || 0) > 0,
            },
          ].map(({ label, value, icon: Icon, alerta }) => (
            <div
              key={label}
              className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
            >
              <span
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: alerta ? BRAND : '#E5E7EB' }}
              />
              <div className="pl-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] text-gray-500">{label}</p>
                  <Icon size={15} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-300" />
                </div>
                <p
                  className="mt-1 text-[24px] font-bold leading-none tabular-nums tracking-tight"
                  style={{ color: alerta ? BRAND : '#111827' }}
                >
                  {value}
                </p>
              </div>
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
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center gap-2">
            <Bike size={18} strokeWidth={STROKE} style={{ color: BRAND }} />
            <h2 className="text-[15px] font-semibold text-gray-900">Por rider</h2>
          </div>
          {(data?.porRider || []).length === 0 ? (
            <p className="text-[13px] text-gray-400">Sin entregas en el rango elegido.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[12px] text-gray-500">
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
                      <td className="py-3 font-semibold">{r.nombre}</td>
                      <td className="py-3 text-right font-bold tabular-nums">{r.entregas}</td>
                      <td className="py-3 text-right font-bold tabular-nums">
                        {fmtMin(r.viaje_mediana)}
                      </td>
                      <td className="py-3 text-right font-bold tabular-nums">
                        {fmtMin(r.total_mediana)}
                      </td>
                      <td
                        className="py-3 text-right font-bold tabular-nums"
                        style={{ color: r.incidencias > 0 ? '#95661A' : '#9CA3AF' }}
                      >
                        {r.incidencias}
                      </td>
                      <td
                        className="py-3 text-right font-bold tabular-nums"
                        style={{ color: r.reversiones > 0 ? BRAND : '#9CA3AF' }}
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
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center gap-2">
            <Clock size={18} strokeWidth={STROKE} className="text-gray-400" />
            <h2 className="text-[15px] font-semibold text-gray-900">Carga por hora</h2>
          </div>
          {(data?.porHora || []).length === 0 ? (
            <p className="text-[13px] text-gray-400">Sin datos en el rango.</p>
          ) : (
            <div className="flex items-end gap-1.5 overflow-x-auto pb-2">
              {data.porHora.map((h) => (
                <div
                  key={h.hora}
                  className="flex min-w-[38px] flex-1 flex-col items-center gap-1.5"
                >
                  <span className="text-[9px] font-semibold tabular-nums text-gray-400">
                    {h.pedidos}
                  </span>
                  {/* Sólo la franja pico va en rojo: es la que te dice a qué
                    hora necesitás más riders. El resto es contexto. */}
                  <div
                    className="w-full rounded-t-lg transition-all"
                    style={{
                      height: `${Math.max(6, (h.pedidos / maxPedidosHora) * 120)}px`,
                      background: h.pedidos === maxPedidosHora ? BRAND : '#D1D5DB',
                    }}
                    title={`${h.pedidos} pedidos · mediana ${fmtMin(h.total_mediana)}`}
                  />
                  <span className="text-[9px] font-semibold tabular-nums text-gray-500">
                    {String(h.hora).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-gray-500">
            Pasá el mouse sobre una barra para ver la mediana de esa franja.
          </p>
        </section>

        {/* ── Día a día ──
          El backend ya devolvía `porDia` (pedidos, entregados y mediana por
          fecha) y la pantalla no lo mostraba en ningún lado. Es el único
          corte que responde "¿esto viene mejorando o empeorando?". */}
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center gap-2">
            <CalendarDays size={18} strokeWidth={STROKE} className="text-gray-400" />
            <h2 className="text-[15px] font-semibold text-gray-900">Día a día</h2>
          </div>
          {(data?.porDia || []).length === 0 ? (
            <p className="text-[13px] text-gray-400">Sin datos en el rango.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[12px] text-gray-500">
                    <th className="pb-3">Fecha</th>
                    <th className="pb-3 text-right">Pedidos</th>
                    <th className="pb-3 text-right">Entregados</th>
                    <th className="pb-3 text-right">Total (mediana)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.porDia.map((d) => {
                    // El peor día del rango se marca: sin eso hay que comparar
                    // números a ojo fila por fila.
                    const esPeor = Number.isFinite(d.total_mediana) && d.total_mediana === peorDia;
                    return (
                      <tr key={d.fecha} className="text-gray-800">
                        <td className="py-3 font-medium">{d.fecha}</td>
                        <td className="py-3 text-right font-semibold tabular-nums">{d.pedidos}</td>
                        <td className="py-3 text-right font-semibold tabular-nums">
                          {d.entregados}
                        </td>
                        <td
                          className="py-3 text-right font-semibold tabular-nums"
                          style={{ color: esPeor ? BRAND : '#111827' }}
                        >
                          {fmtMin(d.total_mediana)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Los más lentos ── */}
        <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle size={18} strokeWidth={STROKE} style={{ color: '#95661A' }} />
            <h2 className="text-[15px] font-semibold text-gray-900">Los 10 más lentos</h2>
          </div>
          {(data?.masLentos || []).length === 0 ? (
            <p className="text-[13px] text-gray-400">Sin entregas en el rango.</p>
          ) : (
            <div className="space-y-2">
              {data.masLentos.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      #{p.numero} · {p.rider || 'Sin rider'}
                    </p>
                    <p className="truncate text-xs text-gray-500">{p.direccion}</p>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums"
                    style={{ background: '#FEF2F2', color: '#9E141E' }}
                  >
                    {fmtMin(p.minutos)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

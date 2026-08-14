import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, subDays, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Armchair,
  Bike,
  Cake,
  CalendarRange,
  Crown,
  Clock3,
  Download,
  MapPin,
  Package,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

import api from '../lib/api.js';
import { paymentMethodLabel } from '../lib/paymentStatus.js';
import { BRAND, STROKE } from '../lib/theme.js';

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;
const today = new Date();
// Paleta naranja/celeste de la plantilla original. Ahora acompaña al resto
// del sistema: rojo de marca primero, después los tonos de las métricas.
const COLORS = [BRAND, '#E0A924', '#047857', '#1F5FA0', '#8B7BE0', '#C98A3E'];

function toDate(value) {
  return new Date(String(value || '').replace(' ', 'T'));
}

function csvEscape(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

/*
  Los tres primitivos que usa todo el archivo. Cambiarlos acá alcanza para
  alinear el módulo entero con el resto del sistema.
*/
const TONOS_STAT = {
  orange: { bg: '#FDF3D3', label: '#95661A', valor: '#6B4108', barra: '#E0A924' },
  blue: { bg: '#E9F1FA', label: '#1F5FA0', valor: '#0B3A66', barra: '#3B82F6' },
  emerald: { bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A', barra: '#10B981' },
  purple: { bg: '#F1EEFE', label: '#5E43A8', valor: '#42237F', barra: '#8B7BE0' },
  slate: { bg: '#fff', label: '#6B7280', valor: '#111827', barra: '#E5E7EB' },
};

function StatCard({ icon: Icon, label, value, helper, tone = 'orange', alerta = false }) {
  const t = alerta ? null : TONOS_STAT[tone] || TONOS_STAT.orange;
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={{ background: t ? t.bg : '#fff' }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: alerta ? BRAND : t.barra }}
      />
      <div className="flex items-start justify-between gap-3 pl-2">
        <div className="min-w-0">
          <p className="text-[12px]" style={{ color: alerta ? BRAND : t.label }}>
            {label}
          </p>
          <p
            className="mt-1 truncate text-[24px] font-bold leading-none tabular-nums tracking-tight"
            style={{ color: alerta ? BRAND : t.valor }}
          >
            {value}
          </p>
          {helper ? (
            <p className="mt-1.5 text-[11px] leading-4" style={{ color: alerta ? BRAND : t.label }}>
              {helper}
            </p>
          ) : null}
        </div>
        {Icon ? (
          <Icon size={17} strokeWidth={STROKE} className="mt-0.5 shrink-0 opacity-35" />
        ) : null}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-[13px] text-gray-400">
      {message}
    </div>
  );
}

export default function Reportes() {
  const navigate = useNavigate();
  const [desde, setDesde] = useState(format(subDays(today, 6), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(today, 'yyyy-MM-dd'));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ordersFilter, setOrdersFilter] = useState({ tipo: '', estado: '', metodo: '' });
  const [ordersPage, setOrdersPage] = useState(25);

  const cargar = async (customDesde = desde, customHasta = hasta) => {
    setLoading(true);
    try {
      const [premium, personalStats, asistencia] = await Promise.allSettled([
        api.get(`/reportes/premium?desde=${customDesde}&hasta=${customHasta}`),
        api.get('/personal/estadisticas'),
        api.get(`/personal/asistencia/analitica?desde=${customDesde}&hasta=${customHasta}`),
      ]);

      if (premium.status !== 'fulfilled') {
        // El motivo real del rechazo se descartaba y salía siempre el mismo
        // mensaje genérico, aunque el server dijera qué pasó.
        throw premium.reason || new Error('No se pudo cargar el reporte');
      }

      setData({
        ...premium.value,
        personal: {
          stats: personalStats.status === 'fulfilled' ? personalStats.value : null,
          attendance: asistencia.status === 'fulfilled' ? asistencia.value : null,
        },
      });
    } catch (error) {
      toast.error(error?.error || error?.message || 'No se pudieron cargar los reportes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // El rango inicial se consulta al montar; el usuario aplica los cambios desde el filtro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarPreset = (preset) => {
    let nextDesde = desde;
    let nextHasta = format(today, 'yyyy-MM-dd');

    if (preset === 'hoy') {
      nextDesde = nextHasta;
    } else if (preset === '7d') {
      nextDesde = format(subDays(today, 6), 'yyyy-MM-dd');
    } else if (preset === '30d') {
      nextDesde = format(subDays(today, 29), 'yyyy-MM-dd');
    } else if (preset === 'mes') {
      nextDesde = format(startOfMonth(today), 'yyyy-MM-dd');
    }

    setDesde(nextDesde);
    setHasta(nextHasta);
    cargar(nextDesde, nextHasta);
  };

  const metodoPagoChart = useMemo(
    () =>
      (data?.paymentMethods || []).map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
      })),
    [data]
  );

  const exportarCsv = () => {
    if (!data) return;

    /*
      Se accedía directo a `data.resumen.totalVentas`, `data.salon.topMesas`,
      `data.series.ventasPorTurno`… Los arrays internos tenían guarda (`|| []`)
      pero los objetos que los contienen no. Si el endpoint no devolvía alguna
      sección —por ejemplo `salon`, cuando el local no usa mesas— el botón de
      exportar tiraba la página entera abajo.
    */
    const resumen = data.resumen || {};
    const lista = (obj, key) => (Array.isArray(obj?.[key]) ? obj[key] : []);

    const rows = [
      ['Seccion', 'Nombre', 'Valor 1', 'Valor 2', 'Valor 3'].join(','),
      ['Resumen', 'Ventas totales', resumen.totalVentas ?? 0, '', ''].join(','),
      ['Resumen', 'Pedidos', resumen.cantidadPedidos ?? 0, '', ''].join(','),
      ['Resumen', 'Ticket promedio', resumen.ticketPromedio ?? 0, '', ''].join(','),
      ['Resumen', 'Tiempo promedio', resumen.tiempoPromedio ?? 0, 'min', ''].join(','),
      ...lista(data.products, 'topProductos').map((item) =>
        [
          'Top producto',
          csvEscape(item.nombre),
          item.cantidad,
          item.total,
          csvEscape(item.categoria),
        ].join(',')
      ),
      ...lista(data.clients, 'topClientes').map((item) =>
        [
          'Top cliente',
          csvEscape(item.nombre),
          item.pedidos,
          item.total,
          csvEscape(item.telefono),
        ].join(',')
      ),
      ...lista(data.delivery, 'ranking').map((item) =>
        ['Delivery', csvEscape(item.nombre), item.entregas, item.total, ''].join(',')
      ),
      ...lista(data.series, 'ventasPorTurno').map((item) =>
        ['Turno', csvEscape(item.turno), item.pedidos, item.total, ''].join(',')
      ),
      ...lista(data.series, 'ventasPorOrigen').map((item) =>
        ['Origen', csvEscape(item.origen), item.pedidos, item.total, ''].join(',')
      ),
      ...lista(data.delivery, 'zonas').map((item) =>
        ['Zona delivery', csvEscape(item.zona), item.pedidos, item.total, item.neto].join(',')
      ),
      ...lista(data.clients, 'cumpleMes').map((item) =>
        [
          'Cumple mes',
          csvEscape(item.nombre),
          csvEscape(item.fecha_nacimiento),
          item.total_gastado,
          item.total_pedidos,
        ].join(',')
      ),
      ...lista(data.salon, 'topMesas').map((item) =>
        ['Salon', `Mesa ${csvEscape(item.mesa)}`, item.pedidos, item.total, ''].join(',')
      ),
    ].join('\n');

    // Sin BOM, Excel en español abre el archivo con los acentos rotos. Es el
    // único export del proyecto que no lo tenía.
    const blob = new Blob(['﻿' + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reportes_modo_sabor_${desde}_${hasta}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Reporte exportado');
  };

  const executiveAlerts = useMemo(() => {
    if (!data) return [];
    const alerts = [];
    const vipCount = data.highlights?.vipCustomers?.length || 0;
    const stockCount = data.highlights?.stockCritico?.length || 0;
    const puntualidad = Number(data.delivery?.puntualidadPct ?? 0);
    const entregas = Number(data.delivery?.totalEntregas ?? data.delivery?.entregas ?? 0);

    if (stockCount > 0) {
      alerts.push({
        key: 'stock',
        title: 'Insumos a reponer',
        value: stockCount,
        detail: 'Con stock crítico o sin mínimo configurado.',
        alerta: true,
        icon: Package,
      });
    }

    /*
      La condición era `puntualidadPct > 0`, así que la tarjeta desaparecía
      justo cuando el dato importa: con 0% de entregas a tiempo no se
      mostraba nada, y parecía que no había problema. Ahora se muestra
      siempre que haya entregas, y se pinta en rojo cuando está mal.
    */
    if (entregas > 0 || puntualidad > 0) {
      alerts.push({
        key: 'delivery',
        title: 'Entregas a tiempo',
        value: `${puntualidad}%`,
        detail:
          puntualidad >= 80
            ? 'Se está cumpliendo el tiempo prometido.'
            : 'Se está llegando tarde más de lo que conviene.',
        alerta: puntualidad < 80,
        tone: 'blue',
        icon: Bike,
      });
    }

    if (vipCount > 0) {
      alerts.push({
        key: 'vip',
        title: 'Clientes VIP',
        value: vipCount,
        detail: 'De alto valor, para campañas y seguimiento.',
        tone: 'purple',
        icon: Crown,
      });
    }

    return alerts;
  }, [data]);

  const personalSummary = useMemo(() => {
    const stats = data?.personal?.stats;
    const attendance = data?.personal?.attendance;
    const ranking = Array.isArray(attendance?.ranking) ? attendance.ranking : [];
    if (!stats && ranking.length === 0) return null;

    const avgAttendance = ranking.length
      ? Math.round(
          ranking.reduce((acc, item) => acc + Number(item.asistenciaPct || 0), 0) / ranking.length
        )
      : 0;
    const avgPuntualidad = ranking.length
      ? Math.round(
          ranking.reduce((acc, item) => acc + Number(item.puntualidadPct || 0), 0) / ranking.length
        )
      : 0;

    return {
      total: Number(stats?.total || 0),
      activos: Number(stats?.activos || 0),
      avgAttendance,
      avgPuntualidad,
      ranking: ranking.slice(0, 5),
      lateRisk: ranking.filter((item) => Number(item.tardanzas || 0) >= 2).length,
      absentRisk: ranking.filter((item) => Number(item.ausentes || 0) >= 1).length,
      topPerformer:
        [...ranking].sort(
          (a, b) =>
            Number(b.asistenciaPct || 0) - Number(a.asistenciaPct || 0) ||
            Number(b.puntualidadPct || 0) - Number(a.puntualidadPct || 0)
        )[0] || null,
      cumpleaneros: Array.isArray(stats?.cumpleaneros_mes)
        ? stats.cumpleaneros_mes.slice(0, 4)
        : [],
      reconocidos: Array.isArray(stats?.top_reconocimientos)
        ? stats.top_reconocimientos.slice(0, 4)
        : [],
    };
  }, [data]);

  return (
    <div className="space-y-4 py-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Reportes</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Ventas, operación, clientes, delivery y salón en una sola vista
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => aplicarPreset('hoy')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Hoy
          </button>
          <button
            onClick={() => aplicarPreset('7d')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            7 días
          </button>
          <button
            onClick={() => aplicarPreset('30d')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            30 días
          </button>
          <button
            onClick={() => aplicarPreset('mes')}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Este mes
          </button>
          <button
            onClick={exportarCsv}
            disabled={!data}
            style={{ background: BRAND }}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <Download size={15} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label
                htmlFor="field-Reportes-jsx-416-0"
                className="mb-1.5 block text-[12px] text-gray-500"
              >
                Desde
              </label>
              <input
                id="field-Reportes-jsx-416-0"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
              />
            </div>
            <div>
              <label
                htmlFor="field-Reportes-jsx-425-1"
                className="mb-1.5 block text-[12px] text-gray-500"
              >
                Hasta
              </label>
              <input
                id="field-Reportes-jsx-425-1"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => cargar()}
              disabled={loading}
              style={{ background: BRAND }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw size={15} className="animate-spin" />
              ) : (
                <CalendarRange size={15} />
              )}
              {loading ? 'Consultando...' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {loading && !data && (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-3 h-3 w-20 rounded-full bg-gray-200" />
                <div className="h-7 w-24 rounded-full bg-gray-200" />
                <div className="mt-2 h-2.5 w-16 rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                <div className="mb-4 h-4 w-32 rounded-full bg-gray-200" />
                <div className="h-48 rounded-2xl bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      )}

      {data ? (
        <>
          {executiveAlerts.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {executiveAlerts.map((item) => (
                <StatCard
                  key={item.key}
                  icon={item.icon}
                  label={item.title}
                  value={item.value}
                  helper={item.detail}
                  tone={item.tone}
                />
              ))}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <StatCard
              icon={ShoppingBag}
              label="Ventas"
              value={fmt(data.resumen.totalVentas)}
              helper={`${data.resumen.cantidadPedidos} pedidos`}
            />
            <StatCard
              icon={Wallet}
              label="Costo estimado"
              value={fmt(data.resumen.totalCosto)}
              helper="Costo directo según ficha de producto"
              tone="slate"
            />
            <StatCard
              icon={TrendingUp}
              label="Margen bruto"
              value={fmt(data.resumen.margenBruto)}
              helper={`${data.resumen.margenPct}% sobre ventas`}
              tone="emerald"
            />
            <StatCard
              icon={Clock3}
              label="Ticket promedio"
              value={fmt(data.resumen.ticketPromedio)}
              helper={`${data.resumen.tiempoPromedio} min promedio`}
              tone="blue"
            />
            <StatCard
              icon={Users}
              label="Clientes activos"
              value={data.resumen.clientesActivos}
              helper={`${data.clients.recompraPct}% recompra`}
              tone="emerald"
            />
            <StatCard
              icon={Bike}
              label="Delivery"
              value={data.resumen.deliveryCount}
              helper={`${data.delivery.puntualidadPct}% dentro de ETA`}
              tone="purple"
            />
            <StatCard
              icon={Armchair}
              label="Salón"
              value={data.resumen.mesaCount}
              helper={`${fmt(data.salon.totalVentas)} en mesas`}
              tone="slate"
            />
          </div>

          {personalSummary ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <SectionCard title="Personal en foco" subtitle="Asistencia y puntualidad del período">
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-[12px] text-gray-500">Equipo</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">
                      {personalSummary.activos}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-[12px] text-gray-500">Asistencia</p>
                    <p className="mt-1 text-2xl font-bold text-emerald-700">
                      {personalSummary.avgAttendance}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-[12px] text-gray-500">Puntualidad</p>
                    <p className="mt-1 text-2xl font-bold text-sky-700">
                      {personalSummary.avgPuntualidad}%
                    </p>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                    <p className="text-[12px] text-gray-500">Legajos</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{personalSummary.total}</p>
                  </div>
                </div>
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-3">
                    <p className="text-[12px] font-medium text-amber-700">Tardanzas a seguir</p>
                    <p className="mt-1 text-2xl font-bold text-amber-700">
                      {personalSummary.lateRisk}
                    </p>
                    <p className="mt-1 text-xs text-amber-700/80">
                      Con 2 o más tardanzas en el rango
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3">
                    <p className="text-[12px] font-medium text-rose-700">Ausencias a revisar</p>
                    <p className="mt-1 text-2xl font-bold text-rose-700">
                      {personalSummary.absentRisk}
                    </p>
                    <p className="mt-1 text-xs text-rose-700/80">Con al menos una ausencia</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-3">
                    <p className="text-[12px] font-medium text-emerald-700">Mejor desempeño</p>
                    <p className="mt-1 truncate text-base font-bold text-gray-900">
                      {personalSummary.topPerformer?.personal_nombre || 'Sin datos'}
                    </p>
                    <p className="mt-1 text-xs text-emerald-700/80">
                      {personalSummary.topPerformer
                        ? `${personalSummary.topPerformer.asistenciaPct}% asistencia`
                        : 'Sin fichadas suficientes'}
                    </p>
                  </div>
                </div>
                {personalSummary.ranking.length > 0 ? (
                  <div className="space-y-3">
                    {personalSummary.ranking.map((item, index) => (
                      <div
                        key={`personal-${item.personal_id}`}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {item.personal_nombre}
                            </p>
                            <p className="text-xs text-gray-500">
                              {item.rol_operativo} · {item.turno_preferido || 'sin turno'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-700">
                            {item.asistenciaPct}%
                          </p>
                          <p className="text-[11px] text-sky-700">
                            Puntualidad {item.puntualidadPct}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState message="Todavía no hay fichadas para este período." />
                )}
              </SectionCard>

              <SectionCard
                title="Clima del equipo"
                subtitle="Cumpleaños y reconocimientos visibles"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <p className="mb-3 text-[12px] text-gray-500">Cumpleaños del mes</p>
                    {personalSummary.cumpleaneros.length > 0 ? (
                      <div className="space-y-3">
                        {personalSummary.cumpleaneros.map((item) => (
                          <div
                            key={`cumple-personal-${item.id}`}
                            className="rounded-2xl border border-pink-100 bg-pink-50/60 px-3 py-3"
                          >
                            <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.telefono || 'Sin teléfono'}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="No hay cumpleaños cargados este mes." />
                    )}
                  </div>
                  <div>
                    <p className="mb-3 text-[12px] text-gray-500">Reconocimientos</p>
                    {personalSummary.reconocidos.length > 0 ? (
                      <div className="space-y-3">
                        {personalSummary.reconocidos.map((item) => (
                          <div
                            key={`reco-${item.id}`}
                            className="rounded-2xl border border-violet-100 bg-violet-50/60 px-3 py-3"
                          >
                            <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              {item.puntos_reconocimiento || 0} puntos acumulados
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="Todavía no hay puntos cargados en el equipo." />
                    )}
                  </div>
                </div>
              </SectionCard>
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Ventas por día"
              subtitle={`Del ${format(toDate(data.rango.desde), 'dd/MM', {
                locale: es,
              })} al ${format(toDate(data.rango.hasta), 'dd/MM', { locale: es })}`}
            >
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.series.ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                      dataKey="fecha"
                      tickFormatter={(value) => format(toDate(value), 'dd/MM', { locale: es })}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value, name) => (name === 'total' ? fmt(value) : value)}
                      labelFormatter={(value) => format(toDate(value), 'PPP', { locale: es })}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="#f97316"
                      strokeWidth={3}
                      name="Ventas"
                    />
                    <Line
                      type="monotone"
                      dataKey="pedidos"
                      stroke="#0f172a"
                      strokeWidth={2}
                      name="Pedidos"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>

            <SectionCard
              title="Picos por hora"
              subtitle="Ideal para definir promos, personal y mise en place"
            >
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.series.ventasPorHora}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="hora" />
                    <YAxis />
                    <Tooltip formatter={(value, name) => (name === 'total' ? fmt(value) : value)} />
                    <Legend />
                    <Bar dataKey="pedidos" fill="#fb923c" radius={[6, 6, 0, 0]} name="Pedidos" />
                    <Bar dataKey="total" fill="#0f172a" radius={[6, 6, 0, 0]} name="Ventas" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Ventas por turno"
              subtitle="Sirve para ver qué franja del día empuja mejor las ventas"
            >
              {data.series.ventasPorTurno.length === 0 ? (
                <EmptyState message="No hay turnos con ventas para este rango." />
              ) : (
                <div className="space-y-4">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.series.ventasPorTurno}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="turno" />
                        <YAxis />
                        <Tooltip
                          formatter={(value, name) => (name === 'total' ? fmt(value) : value)}
                        />
                        <Legend />
                        <Bar
                          dataKey="pedidos"
                          fill="#fb923c"
                          radius={[6, 6, 0, 0]}
                          name="Pedidos"
                        />
                        <Bar dataKey="total" fill="#f97316" radius={[6, 6, 0, 0]} name="Ventas" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.series.ventasPorTurno.map((item) => (
                      <div
                        key={`turno-${item.turno}`}
                        className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.turno}</p>
                            <p className="text-xs text-gray-500">
                              {item.pedidos} pedidos · ticket {fmt(item.ticketPromedio)}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">
                          Delivery {item.delivery || 0} · Retiro {item.retiro || 0} · Mesa{' '}
                          {item.mesa || 0}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard title="Origen de pedidos" subtitle="Cuánto empuja cada canal del negocio">
              {data.series.ventasPorOrigen.length === 0 ? (
                <EmptyState message="Sin orígenes registrados en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.series.ventasPorOrigen.map((item) => (
                    <div
                      key={item.origen}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold capitalize text-gray-900">
                          {item.origen.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-gray-500">{item.pedidos} pedidos</p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Zonas de delivery"
              subtitle="Te muestra dónde se concentra el reparto y la facturación"
            >
              {data.delivery.zonas.length === 0 ? (
                <EmptyState message="Todavía no hay zonas de delivery con ventas." />
              ) : (
                <div className="space-y-3">
                  {data.delivery.zonas.map((item) => (
                    <div
                      key={item.zona}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.zona}</p>
                          <p className="text-xs text-gray-500">
                            {item.pedidos} pedidos · envío {fmt(item.envio)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-sky-700">{fmt(item.total)}</p>
                        <p className="text-[11px] text-emerald-700">Neto {fmt(item.neto)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-4">
            <SectionCard title="Top productos" subtitle="Los que más mueven el negocio">
              {data.products.topProductos.length === 0 ? (
                <EmptyState message="No hay ventas para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.topProductos.map((item, index) => (
                    <div
                      key={item.nombre}
                      className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-orange-100 text-sm font-bold text-orange-700">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {item.nombre}
                        </p>
                        <p className="text-xs text-gray-500">{item.categoria}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">{item.cantidad} uds</p>
                        <p className="text-xs text-gray-900">{fmt(item.total)}</p>
                        <p className="text-[11px] text-emerald-700">Margen {fmt(item.margen)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Más rentables" subtitle="Donde estás ganando más margen bruto">
              {data.products.productosRentables.length === 0 ? (
                <EmptyState message="No hay margen calculable para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.productosRentables.map((item) => (
                    <div
                      key={`${item.nombre}-rentable`}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.categoria} - {item.cantidad} uds
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-emerald-700">{fmt(item.margen)}</p>
                          <p className="text-[11px] text-gray-500">{item.margenPct}% margen</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Margen ajustado"
              subtitle="Productos para revisar costo, precio o promo"
            >
              {data.products.productosBajoMargen.length === 0 ? (
                <EmptyState message="No hay datos de margen para este rango." />
              ) : (
                <div className="space-y-3">
                  {data.products.productosBajoMargen.map((item) => (
                    <div
                      key={`${item.nombre}-bajo`}
                      className="rounded-2xl border border-rose-100 bg-rose-50/60 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-gray-500">
                            {item.categoria} - {item.cantidad} uds
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-rose-700">{item.margenPct}%</p>
                          <p className="text-[11px] text-gray-500">Margen {fmt(item.margen)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Categorías" subtitle="Lo que más factura por rubro">
              {data.products.topCategorias.length === 0 ? (
                <EmptyState message="Sin categorías con ventas." />
              ) : (
                <div className="space-y-3">
                  {data.products.topCategorias.map((item) => (
                    <div
                      key={item.categoria}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{item.categoria}</p>
                          <p className="text-xs text-gray-500">{item.cantidad} unidades vendidas</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                          <p className="text-[11px] text-emerald-700">Margen {fmt(item.margen)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Métodos de pago"
              subtitle="Cobros confirmados y pendientes por canal"
            >
              {metodoPagoChart.length === 0 ? (
                <EmptyState message="Sin movimientos en este rango." />
              ) : (
                <>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={metodoPagoChart}
                          dataKey="total"
                          nameKey="metodo_pago"
                          innerRadius={55}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {metodoPagoChart.map((entry) => (
                            <Cell key={entry.metodo_pago} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => fmt(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {metodoPagoChart.map((item) => (
                      <div
                        key={item.metodo_pago}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700">
                              {paymentMethodLabel(item.metodo_pago)}
                            </span>
                            {item.total_pendiente > 0 ? (
                              <p className="text-[11px] text-amber-700">
                                Pendiente {fmt(item.total_pendiente)}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{fmt(item.total)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <SectionCard
              title="Radar ejecutivo"
              subtitle="Clientes clave y stock sensible para actuar rápido"
            >
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-[12px] text-gray-500">Clientes VIP</p>
                  {data.highlights?.vipCustomers?.length ? (
                    <div className="space-y-3">
                      {data.highlights.vipCustomers.map((item) => (
                        <div
                          key={`vip-${item.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/50 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {item.nombre}
                            </p>
                            <p className="text-xs text-gray-500">
                              {item.total_pedidos} pedidos · {item.nivel || 'Sin nivel'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-violet-700">
                              {fmt(item.total_gastado)}
                            </p>
                            <p className="text-[11px] text-gray-500">Score {item.score}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="Todavía no hay clientes VIP detectados." />
                  )}
                </div>

                <div>
                  <p className="mb-3 text-[12px] text-gray-500">Stock crítico</p>
                  {data.highlights?.stockCritico?.length ? (
                    <div className="space-y-3">
                      {data.highlights.stockCritico.slice(0, 5).map((item) => (
                        <div
                          key={`stock-${item.id}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">
                              {item.nombre}
                            </p>
                            <p className="text-xs text-gray-500">
                              Actual {item.stock_actual} {item.unidad} · Mínimo{' '}
                              {item.stock_minimo || 0} {item.unidad}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-amber-700">
                            {item.cobertura_pct || 0}%
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="No hay insumos críticos en este momento." />
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Segmentos CRM" subtitle="Clic en un segmento para ver los clientes">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: 'VIP',
                    key: 'vip',
                    value: data.clients.segmentos?.vip || 0,
                    color: 'bg-violet-50 border-violet-100 hover:bg-violet-100',
                    text: 'text-violet-700',
                  },
                  {
                    label: 'En riesgo',
                    key: 'riesgo',
                    value: data.clients.segmentos?.riesgo || 0,
                    color: 'bg-rose-50 border-rose-100 hover:bg-rose-100',
                    text: 'text-rose-700',
                  },
                  {
                    label: 'Perdidos',
                    key: 'perdidos',
                    value: data.clients.segmentos?.perdidos || 0,
                    color: 'bg-orange-50 border-orange-100 hover:bg-orange-100',
                    text: 'text-orange-700',
                  },
                  {
                    label: 'Inactivos',
                    key: 'inactivos',
                    value: data.clients.segmentos?.inactivos || 0,
                    color: 'bg-gray-50 border-gray-100 hover:bg-gray-100',
                    text: 'text-gray-700',
                  },
                  {
                    label: 'Recurrentes',
                    key: 'recurrentes',
                    value: data.clients.segmentos?.recurrentes || 0,
                    color: 'bg-emerald-50 border-emerald-100 hover:bg-emerald-100',
                    text: 'text-emerald-700',
                  },
                  {
                    label: 'Cumple mes',
                    key: 'cumpleMes',
                    value: data.clients.segmentos?.cumpleMes || 0,
                    color: 'bg-pink-50 border-pink-100 hover:bg-pink-100',
                    text: 'text-pink-700',
                  },
                ].map(({ label, key, value, color, text }) => (
                  <button
                    key={key}
                    onClick={() => navigate(`/admin/clientes?segmento=${key}`)}
                    className={`group rounded-2xl border px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm ${color}`}
                  >
                    <p className={`text-[12px] font-medium ${text}`}>{label}</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
                    <p className="mt-1 text-[10px] font-semibold text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
                      Ver clientes →
                    </p>
                  </button>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Clientes más valiosos"
              subtitle="Quiénes más compraron en el periodo"
            >
              {data.clients.topClientes.length === 0 ? (
                <EmptyState message="No hubo clientes en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.clients.topClientes.map((item) => (
                    <div
                      key={`${item.nombre}-${item.telefono}`}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {item.nombre}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.telefono || 'Sin teléfono'} - {item.pedidos} pedidos
                        </p>
                      </div>
                      <p className="text-sm font-bold text-gray-900">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
            <SectionCard
              title="Cumpleaños en el período"
              subtitle="Ideal para campañas afectivas y cupones de regreso"
            >
              {data.clients.cumpleMes?.length === 0 ? (
                <EmptyState message="No hay cumpleaños cargados para este período." />
              ) : (
                <div className="space-y-3">
                  {data.clients.cumpleMes.map((item) => (
                    <div
                      key={`cumple-${item.id}`}
                      className="rounded-2xl border border-pink-100 bg-pink-50/60 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-gray-500">{item.telefono || 'Sin teléfono'}</p>
                        </div>
                        <div className="flex items-center gap-2 text-pink-700">
                          <Cake size={15} />
                          <span className="text-xs font-bold">
                            {item.fecha_nacimiento
                              ? format(toDate(item.fecha_nacimiento), 'dd/MM', { locale: es })
                              : 'Este mes'}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {item.total_pedidos || 0} pedidos · {fmt(item.total_gastado)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Clientes inactivos" subtitle="Buena base para campañas de regreso">
              {data.clients.clientesInactivos.length === 0 ? (
                <EmptyState message="No se detectaron clientes inactivos." />
              ) : (
                <div className="space-y-3">
                  {data.clients.clientesInactivos.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {item.nombre}
                          </p>
                          <p className="text-xs text-gray-500">{item.telefono || 'Sin teléfono'}</p>
                        </div>
                        <p className="text-sm font-bold text-gray-900">{fmt(item.total_gastado)}</p>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Última compra:{' '}
                        {item.ultima_compra
                          ? format(toDate(item.ultima_compra), 'dd/MM/yyyy', { locale: es })
                          : 'Sin compras entregadas'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="Delivery"
              subtitle={`${data.delivery.totalPedidos} pedidos - ${data.delivery.tiempoPromedio} min promedio`}
            >
              {data.delivery.ranking.length === 0 ? (
                <EmptyState message="Sin entregas registradas en este rango." />
              ) : (
                <>
                  <div className="mb-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[12px] text-gray-500">Puntualidad</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">
                        {data.delivery.puntualidadPct}%
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[12px] text-gray-500">Desvío ETA</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">
                        {data.delivery.desviacionPromedioEta} min
                      </p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3">
                      <p className="text-[12px] text-gray-500">Entregas</p>
                      <p className="mt-1 text-2xl font-bold text-gray-900">
                        {data.delivery.totalPedidos}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {data.delivery.ranking.map((item, index) => (
                      <div
                        key={`${item.nombre}-${index}`}
                        className="rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{item.nombre}</p>
                            <p className="text-xs text-gray-500">
                              {item.entregas} entregas · ticket {fmt(item.ticketPromedio)}
                            </p>
                          </div>
                          <p className="text-sm font-bold text-purple-700">{fmt(item.total)}</p>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-3">
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] text-gray-400">Tiempo</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {item.tiempoPromedio} min
                            </p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] text-gray-400">Puntualidad</p>
                            <p className="text-sm font-semibold text-emerald-700">
                              {item.puntualidadPct}%
                            </p>
                          </div>
                          <div className="rounded-xl bg-white px-3 py-2">
                            <p className="text-[11px] text-gray-400">Foto entrega</p>
                            <p className="text-sm font-semibold text-sky-700">{item.fotoPct}%</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>

            <SectionCard
              title="Salón / mesas"
              subtitle={`${data.salon.totalPedidos} tickets - ticket promedio ${fmt(
                data.salon.ticketPromedio
              )}`}
            >
              {data.salon.topMesas.length === 0 ? (
                <EmptyState message="Sin consumo de salón en este rango." />
              ) : (
                <div className="space-y-3">
                  {data.salon.topMesas.map((item) => (
                    <div
                      key={item.mesa}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Mesa {item.mesa}</p>
                        <p className="text-xs text-gray-500">{item.pedidos} tickets</p>
                      </div>
                      <p className="text-sm font-bold text-emerald-700">{fmt(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard title="Pedidos del rango" subtitle="Filtrá y navegá el detalle operativo">
            {(() => {
              const SELECT_CLS =
                'rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';
              const filtered = (data.recentOrders || []).filter((p) => {
                if (ordersFilter.tipo && p.tipo_entrega !== ordersFilter.tipo) return false;
                if (ordersFilter.estado && p.estado !== ordersFilter.estado) return false;
                if (ordersFilter.metodo && p.metodo_pago !== ordersFilter.metodo) return false;
                return true;
              });
              const visible = filtered.slice(0, ordersPage);
              return (
                <>
                  <div className="mb-4 flex flex-wrap gap-3">
                    <select
                      className={SELECT_CLS}
                      value={ordersFilter.tipo}
                      onChange={(e) => {
                        setOrdersFilter((f) => ({ ...f, tipo: e.target.value }));
                        setOrdersPage(25);
                      }}
                    >
                      <option value="">Todos los tipos</option>
                      <option value="delivery">Delivery</option>
                      <option value="retiro">Retiro</option>
                      <option value="mesa">Mesa</option>
                    </select>
                    <select
                      className={SELECT_CLS}
                      value={ordersFilter.estado}
                      onChange={(e) => {
                        setOrdersFilter((f) => ({ ...f, estado: e.target.value }));
                        setOrdersPage(25);
                      }}
                    >
                      <option value="">Todos los estados</option>
                      <option value="nuevo">Nuevo</option>
                      <option value="confirmado">Confirmado</option>
                      <option value="preparando">Preparando</option>
                      <option value="listo">Listo</option>
                      <option value="en_camino">En camino</option>
                      <option value="entregado">Entregado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                    <select
                      className={SELECT_CLS}
                      value={ordersFilter.metodo}
                      onChange={(e) => {
                        setOrdersFilter((f) => ({ ...f, metodo: e.target.value }));
                        setOrdersPage(25);
                      }}
                    >
                      <option value="">Todos los pagos</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="mercadopago">MercadoPago</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                    {(ordersFilter.tipo || ordersFilter.estado || ordersFilter.metodo) && (
                      <button
                        onClick={() => {
                          setOrdersFilter({ tipo: '', estado: '', metodo: '' });
                          setOrdersPage(25);
                        }}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-100"
                      >
                        Limpiar filtros
                      </button>
                    )}
                    <span className="ml-auto self-center text-xs text-gray-400">
                      {filtered.length} pedidos
                    </span>
                  </div>
                  {filtered.length === 0 ? (
                    <EmptyState message="No hay pedidos con esos filtros." />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-left text-gray-500">
                              <th className="pb-3 pr-4 font-semibold">#</th>
                              <th className="pb-3 pr-4 font-semibold">Cliente</th>
                              <th className="pb-3 pr-4 font-semibold">Tipo</th>
                              <th className="pb-3 pr-4 font-semibold">Estado</th>
                              <th className="pb-3 pr-4 font-semibold">Pago</th>
                              <th className="pb-3 pr-4 font-semibold">Fecha</th>
                              <th className="pb-3 text-right font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {visible.map((pedido) => (
                              <tr key={pedido.id}>
                                <td className="py-3 pr-4 font-semibold text-gray-900">
                                  #{pedido.numero}
                                </td>
                                <td className="py-3 pr-4 text-gray-700">
                                  {pedido.cliente_nombre || 'Consumidor final'}
                                </td>
                                <td className="py-3 pr-4 capitalize text-gray-500">
                                  {pedido.tipo_entrega}
                                  {pedido.delivery_zona ? (
                                    <p className="text-[11px] text-gray-400">
                                      {pedido.delivery_zona}
                                    </p>
                                  ) : null}
                                </td>
                                <td className="py-3 pr-4 capitalize text-gray-500">
                                  {pedido.estado.replace('_', ' ')}
                                </td>
                                <td className="py-3 pr-4 text-gray-500">
                                  {paymentMethodLabel(pedido.metodo_pago)}
                                </td>
                                <td className="py-3 pr-4 text-xs text-gray-400">
                                  {format(toDate(pedido.creado_en), 'dd/MM HH:mm', { locale: es })}
                                </td>
                                <td className="py-3 text-right font-bold text-gray-900">
                                  {fmt(pedido.total)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {filtered.length > ordersPage && (
                        <button
                          onClick={() => setOrdersPage((p) => p + 25)}
                          className="mt-4 w-full rounded-xl border border-gray-200 py-3 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-50"
                        >
                          Cargar más ({filtered.length - ordersPage} restantes)
                        </button>
                      )}
                    </>
                  )}
                </>
              );
            })()}
          </SectionCard>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <Package size={34} className="mx-auto text-gray-300" />
          <h2 className="mt-4 text-lg font-bold text-gray-900">Todavía no cargaste reportes</h2>
          <p className="mt-2 text-sm text-gray-500">
            Elegí un rango y consultá ventas, clientes, delivery y salón.
          </p>
        </div>
      )}
    </div>
  );
}

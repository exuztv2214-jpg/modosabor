import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bike,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  CreditCard,
  DollarSign,
  Flame,
  Package,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Star,
  TrendingUp,
  Truck,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { paymentMethodLabel, paymentStatusLabel } from '../lib/paymentStatus.js';
import { LoadingScreen, EmptyState } from '../design-system';
import { fmtMoney } from '../lib/formatters.js';
import { socketManager } from '../lib/socket.js';

const fmtNumber = (value) => Number(value || 0).toLocaleString('es-AR');

const PAYMENT_COLORS = {
  efectivo: '#13DEB9',
  mercadopago: '#49BEFF',
  transferencia: '#5D87FF',
  default: '#94a3b8',
};

function QuickAction({ icon: Icon, label, onClick, color = 'blue' }) {
  const colors = {
    blue: 'bg-primary-50 text-primary-500 hover:bg-primary-500 hover:text-white',
    orange: 'bg-orange-50 text-orange-600 hover:bg-orange-600 hover:text-white',
    emerald: 'bg-success-50 text-success-600 hover:bg-emerald-600 hover:text-white',
    violet: 'bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white',
  };

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-3 rounded-[24px] p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg active:scale-95 ${colors[color]}`}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/60 shadow-sm backdrop-blur-sm">
        <Icon size={24} />
      </div>
      <span className="text-xs font-black uppercase tracking-wider">{label}</span>
    </button>
  );
}

function ModernMetric({
  icon: Icon,
  label,
  value,
  trend,
  trendUp,
  hasComparison = true,
  helper,
  tint = 'blue',
}) {
  const tints = {
    blue: 'bg-primary-50 text-primary-500',
    rose: 'bg-danger-50 text-danger-500',
    emerald: 'bg-success-50 text-success-500',
    amber: 'bg-warning-50 text-warning-500',
  };

  return (
    <div className="group rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-2 text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
            {label}
          </p>
          <h3 className="text-2xl font-black text-gray-900">{value}</h3>
          {trend !== undefined && !hasComparison && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-gray-400">
              Sin datos de ayer
            </div>
          )}
          {trend !== undefined && hasComparison && (
            <div
              className={`mt-2 flex items-center gap-1.5 text-xs font-bold ${trendUp ? 'text-emerald-500' : 'text-rose-500'}`}
            >
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full ${trendUp ? 'bg-success-50' : 'bg-danger-50'}`}
              >
                {trendUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              </div>
              {trend}
              <span className="ml-1 font-medium text-gray-400">vs ayer</span>
            </div>
          )}
          {helper && (
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
              {helper}
            </p>
          )}
        </div>
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-[20px] shadow-sm transition-transform duration-300 group-hover:rotate-6 ${tints[tint]}`}
        >
          <Icon size={28} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function StockAlert({ item, onClick }) {
  const hasMinimum = Number(item.stock_minimo || 0) > 0;
  const coverage = Number(item.cobertura_pct || 0);
  const coverageTone = !hasMinimum
    ? 'bg-slate-100 text-slate-600'
    : coverage <= 50
      ? 'bg-danger-100 text-danger-700'
      : coverage <= 100
        ? 'bg-warning-100 text-warning-700'
        : 'bg-success-100 text-success-700';

  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center justify-between rounded-[22px] border border-white/70 bg-white px-4 py-3 text-left text-slate-900 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-900">{item.nombre}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          {fmtNumber(item.stock_actual)} {item.unidad}
          {hasMinimum
            ? ` - Min ${fmtNumber(item.stock_minimo)} ${item.unidad}`
            : ' - Sin minimo configurado'}
        </p>
      </div>
      <div
        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${coverageTone}`}
      >
        {hasMinimum ? `${coverage}%` : 'REVISAR'}
      </div>
    </button>
  );
}

export default function DashboardModern() {
  const { user } = useAuth();
  const { isModuleEnabled } = useAppConfig();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [operationHealth, setOperationHealth] = useState(null);
  const [operationHealthError, setOperationHealthError] = useState(false);
  const [personalPulse, setPersonalPulse] = useState(null);
  const [personalPulseError, setPersonalPulseError] = useState(false);
  const [lastUpdate, setLastUpdate] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const personalEnabled = isModuleEnabled('personal');

  const loadDashboard = async ({ silent = false } = {}) => {
    if (!silent) {
      setError('');
      if (data) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
    }

    try {
      const hasta = format(new Date(), 'yyyy-MM-dd');
      const desde = format(subDays(new Date(), 6), 'yyyy-MM-dd');
      const [response, operacion] = await Promise.all([
        api.get('/reportes/dashboard'),
        api
          .get('/operacion/resumen')
          .then((value) => {
            setOperationHealthError(false);
            return value;
          })
          .catch(() => {
            setOperationHealthError(true);
            return null;
          }),
      ]);
      setData(response);
      setOperationHealth(operacion);

      if (personalEnabled) {
        const [personalStats, personalAttendance] = await Promise.allSettled([
          api.get('/personal/estadisticas'),
          api.get(`/personal/asistencia/analitica?desde=${desde}&hasta=${hasta}`),
        ]);
        const bothFailed =
          personalStats.status === 'rejected' && personalAttendance.status === 'rejected';
        setPersonalPulseError(bothFailed);
        setPersonalPulse({
          stats: personalStats.status === 'fulfilled' ? personalStats.value : null,
          attendance: personalAttendance.status === 'fulfilled' ? personalAttendance.value : null,
        });
      } else {
        setPersonalPulse(null);
        setPersonalPulseError(false);
      }

      setLastUpdate(format(new Date(), 'HH:mm'));
      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('No se pudo actualizar el tablero ahora. Reintenta en unos segundos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadDashboard();

    // Refresco de respaldo por si el socket se desconecta un rato.
    const interval = setInterval(() => {
      loadDashboard({ silent: true });
    }, 60000);

    // Refresco inmediato apenas entra o cambia un pedido, en vez de
    // esperar hasta 60s para reflejar una venta nueva.
    socketManager.connect();
    let refreshTimer = null;
    const scheduleSilentRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => loadDashboard({ silent: true }), 800);
    };
    const unsubscribeNuevo = socketManager.on('nuevo_pedido', scheduleSilentRefresh);
    const unsubscribeActualizado = socketManager.on(
      'pedido_actualizado_admin',
      scheduleSilentRefresh
    );

    return () => {
      clearInterval(interval);
      clearTimeout(refreshTimer);
      unsubscribeNuevo();
      unsubscribeActualizado();
    };
  }, [personalEnabled]);

  const ticketPromedio = useMemo(() => {
    if (!data?.ventasHoy?.pedidos) return 0;
    return Math.round(Number(data.ventasHoy.total || 0) / Number(data.ventasHoy.pedidos || 0));
  }, [data]);

  // Si ayer no hubo ventas/pedidos, el % de tendencia no es comparable
  // (podría mostrar +100% engañoso). Distinguimos "sin datos" de "0%".
  const ventasTrendInfo = useMemo(() => {
    const ayer = Number(data?.ventasAyer || 0);
    if (!ayer) return { hasComparison: false, trend: 0, trendUp: true };
    return {
      hasComparison: true,
      trend: Math.abs(data?.tendenciaVentas || 0),
      trendUp: (data?.tendenciaVentas || 0) >= 0,
    };
  }, [data]);

  const pedidosTrendInfo = useMemo(() => {
    const ayer = Number(data?.pedidosAyer || 0);
    if (!ayer) return { hasComparison: false, trend: 0, trendUp: true };
    return {
      hasComparison: true,
      trend: Math.abs(data?.tendenciaPedidos || 0),
      trendUp: (data?.tendenciaPedidos || 0) >= 0,
    };
  }, [data]);

  const margenHintText = useMemo(() => {
    if (data?.margenPctHoy == null) return null;
    if (Number(data.margenPctHoy) >= 99) {
      return 'Margen casi 100%: revisá que los costos de tus productos estén cargados en Inventario.';
    }
    return null;
  }, [data]);

  const personalHeadline = useMemo(() => {
    const ranking = Array.isArray(personalPulse?.attendance?.ranking)
      ? personalPulse.attendance.ranking
      : [];
    const stats = personalPulse?.stats;
    if (!ranking.length && !stats) return null;

    const lateCount = ranking.filter((item) => Number(item.tardanzas || 0) >= 2).length;
    const absentCount = ranking.filter((item) => Number(item.ausentes || 0) >= 1).length;
    const topEmployee =
      [...ranking].sort(
        (a, b) =>
          Number(b.asistenciaPct || 0) - Number(a.asistenciaPct || 0) ||
          Number(b.puntualidadPct || 0) - Number(a.puntualidadPct || 0)
      )[0] || null;

    return {
      activos: Number(stats?.activos || ranking.length || 0),
      lateCount,
      absentCount,
      topEmployee,
    };
  }, [personalPulse]);

  const quickActions = [
    {
      key: 'tpv',
      icon: Plus,
      label: 'Nueva venta',
      onClick: () => navigate('/admin/tpv'),
      color: 'blue',
    },
    {
      key: 'kds',
      icon: ChefHat,
      label: 'Cocina',
      onClick: () => navigate('/admin/kds'),
      color: 'orange',
    },
    {
      key: 'caja',
      icon: Wallet,
      label: 'Caja',
      onClick: () => navigate('/admin/caja'),
      color: 'emerald',
    },
    {
      key: 'inventario',
      icon: Package,
      label: 'Stock',
      onClick: () => navigate('/admin/inventario'),
      color: 'violet',
    },
  ].filter((action) => isModuleEnabled(action.key));

  if (loading && !data) {
    return <LoadingScreen message="Cargando tu dashboard..." />;
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-xl rounded-[32px] border border-rose-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[24px] bg-danger-100 text-danger-600">
            <AlertTriangle size={28} />
          </div>
          <h2 className="text-2xl font-black text-slate-900">No se pudo cargar el dashboard</h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {error || 'La información no respondió a tiempo. Intenta de nuevo.'}
          </p>
          <button
            onClick={() => loadDashboard()}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary-500 px-6 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 transition hover:bg-primary-600"
          >
            <RefreshCw size={16} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8 pb-12">
        <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-gradient-to-br from-white via-[#F7F9FF] to-[#EEF4FF] px-6 py-7 shadow-sm sm:px-8">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-500/10 blur-3xl" />
          <div className="absolute -bottom-12 left-16 h-32 w-32 rounded-full bg-success-500/10 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.25em] text-primary-500 shadow-sm">
                  <Sparkles size={12} />
                  Resumen operativo
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-primary-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary-500 shadow-sm">
                  <RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />
                  Sync {lastUpdate || '--:--'}
                </span>
              </div>
              <h1 className="text-3xl font-black tracking-tight text-gray-900">
                Hola, {user?.nombre?.split(' ')?.[0] || 'Admin'}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-gray-500">
                Así va tu negocio hoy, {format(new Date(), "eeee d 'de' MMMM", { locale: es })}.
                Tienes una vista rápida de ventas, operación y clientes clave sin salir del panel.
              </p>
              {isModuleEnabled('reportes') && (
                <button
                  onClick={() => navigate('/admin/reportes')}
                  className="mt-4 inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-primary-500 hover:text-primary-600"
                >
                  Ver reporte completo
                  <ArrowUpRight size={14} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:flex lg:gap-4">
              {quickActions.map((action) => (
                <QuickAction
                  key={action.key}
                  icon={action.icon}
                  label={action.label}
                  onClick={action.onClick}
                  color={action.color}
                />
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <div className="flex flex-col gap-3 rounded-[24px] border border-amber-200 bg-warning-50 px-5 py-4 text-amber-900 shadow-sm md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl bg-white/80 p-2 text-warning-600">
                <AlertTriangle size={18} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-warning-700">
                  Actualización parcial
                </p>
                <p className="mt-1 text-sm font-semibold">{error}</p>
              </div>
            </div>
            <button
              onClick={() => loadDashboard()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-[11px] font-black uppercase tracking-widest text-warning-700 shadow-sm transition hover:bg-warning-100"
            >
              <RefreshCw size={14} />
              Reintentar ahora
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {!data.cajaEstado?.abierta && isModuleEnabled('caja') && (
            <div className="animate-in slide-in-from-left flex items-center justify-between rounded-[24px] bg-danger-500 p-5 text-white shadow-lg shadow-danger-100 duration-500">
              <div className="flex items-center gap-4">
                <div className="rounded-xl bg-white/20 p-3">
                  <AlertTriangle size={24} className="animate-pulse" />
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider opacity-80">
                    Atención inmediata
                  </p>
                  <p className="text-lg font-bold">La caja está cerrada</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin/caja')}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-black text-danger-500 shadow-sm transition-transform hover:scale-105 active:scale-95"
              >
                ABRIR CAJA
              </button>
            </div>
          )}

          {data.stockCritico?.length > 0 && isModuleEnabled('inventario') && (
            <div className="animate-in slide-in-from-right rounded-[24px] bg-warning-500 p-5 text-white shadow-lg shadow-warning-100 duration-500">
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="rounded-xl bg-white/20 p-3">
                    <ShieldAlert size={24} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider opacity-80">
                      Stock crítico
                    </p>
                    <p className="text-lg font-bold">
                      Tienes {data.stockCritico.length} insumos para revisar
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/admin/inventario')}
                  className="rounded-xl bg-white px-5 py-2.5 text-sm font-black text-warning-500 shadow-sm transition-transform hover:scale-105 active:scale-95"
                >
                  REVISAR
                </button>
              </div>
              <div className="grid gap-3">
                {data.stockCritico.slice(0, 2).map((item) => (
                  <StockAlert
                    key={item.id}
                    item={item}
                    onClick={() => navigate('/admin/inventario')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:gap-6">
          <ModernMetric
            icon={DollarSign}
            label="Ventas del día"
            value={fmtMoney(data.ventasHoy?.total || 0)}
            trend={`${ventasTrendInfo.trend}%`}
            trendUp={ventasTrendInfo.trendUp}
            hasComparison={ventasTrendInfo.hasComparison}
            tint="blue"
          />
          <ModernMetric
            icon={ShoppingBag}
            label="Pedidos de hoy"
            value={fmtNumber(data.ventasHoy?.pedidos || 0)}
            trend={`${pedidosTrendInfo.trend}%`}
            trendUp={pedidosTrendInfo.trendUp}
            hasComparison={pedidosTrendInfo.hasComparison}
            tint="emerald"
          />
          <ModernMetric
            icon={TrendingUp}
            label="Ticket promedio"
            value={fmtMoney(ticketPromedio)}
            helper="Promedio por orden"
            tint="amber"
          />
          <ModernMetric
            icon={Wallet}
            label="Margen hoy"
            value={fmtMoney(data.margenBrutoHoy || 0)}
            trend={
              data.margenBrutoHoy != null ? `${Math.abs(data.tendenciaMargen || 0)}%` : undefined
            }
            trendUp={(data.tendenciaMargen || 0) >= 0}
            hasComparison={Number(data.ventasAyer || 0) > 0}
            helper={
              margenHintText ||
              (data.margenPctHoy != null ? `${data.margenPctHoy}% del total vendido` : undefined)
            }
            tint="blue"
          />
          <ModernMetric
            icon={Truck}
            label="Delivery activo"
            value={fmtNumber(data.pedidosEnDelivery || 0)}
            helper={`${data.pedidosActivos || 0} pedidos totales`}
            tint="rose"
          />
        </div>

        {operationHealthError ? (
          <div className="flex items-center gap-3 rounded-[22px] border border-warning-100 bg-warning-50 p-4 text-warning-700">
            <AlertTriangle size={18} className="shrink-0" />
            <p className="text-xs font-bold">
              No se pudo cargar la salud del sistema. Reintentá en unos segundos o revisá el centro
              operativo.
            </p>
          </div>
        ) : null}

        {operationHealth?.puntos?.length ? (
          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Salud del sistema
                </h3>
                <p className="text-sm font-medium text-gray-400">
                  Chequeo rápido de operación, stock, riders, backups e impresión.
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/operacion')}
                className="rounded-2xl bg-primary-50 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-500"
              >
                Ver centro operativo
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {operationHealth.puntos.map((point) => (
                <div
                  key={point.id}
                  className="rounded-[22px] border border-gray-100 bg-primary-50 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${point.ok ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}
                    >
                      {point.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black uppercase tracking-tight text-gray-900">
                        {point.title}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">{point.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {personalPulseError && personalEnabled ? (
          <div className="flex items-center gap-3 rounded-[22px] border border-warning-100 bg-warning-50 p-4 text-warning-700">
            <AlertTriangle size={18} className="shrink-0" />
            <p className="text-xs font-bold">
              No se pudo cargar el pulso del equipo. Reintentá en unos segundos o revisá el módulo
              de personal.
            </p>
          </div>
        ) : null}

        {personalHeadline ? (
          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Pulso del equipo
                </h3>
                <p className="text-sm font-medium text-gray-400">
                  Asistencia y puntualidad para decidir rápido en el turno.
                </p>
              </div>
              <button
                onClick={() => navigate('/admin/personal')}
                className="rounded-2xl bg-primary-50 px-4 py-2 text-[11px] font-black uppercase tracking-widest text-primary-500"
              >
                Ver personal
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[22px] border border-gray-100 bg-primary-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-500">
                  Equipo activo
                </p>
                <p className="mt-2 text-3xl font-black text-gray-900">{personalHeadline.activos}</p>
                <p className="mt-1 text-xs font-semibold text-gray-400">Legajos activos hoy</p>
              </div>
              <div className="rounded-[22px] border border-amber-100 bg-warning-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-warning-700">
                  Tardanzas a mirar
                </p>
                <p className="mt-2 text-3xl font-black text-warning-700">
                  {personalHeadline.lateCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-warning-700/80">
                  Con 2 o más tardanzas en 7 días
                </p>
              </div>
              <div className="rounded-[22px] border border-rose-100 bg-danger-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-danger-700">
                  Ausencias recientes
                </p>
                <p className="mt-2 text-3xl font-black text-danger-700">
                  {personalHeadline.absentCount}
                </p>
                <p className="mt-1 text-xs font-semibold text-danger-700/80">
                  Con al menos una ausencia
                </p>
              </div>
              <div className="rounded-[22px] border border-emerald-100 bg-success-50 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-success-700">
                  Mejor de la semana
                </p>
                <p className="mt-2 truncate text-base font-black text-gray-900">
                  {personalHeadline.topEmployee?.personal_nombre || 'Sin datos'}
                </p>
                <p className="mt-1 text-xs font-semibold text-success-700/80">
                  {personalHeadline.topEmployee
                    ? `${personalHeadline.topEmployee.asistenciaPct}% asistencia`
                    : 'Faltan fichadas'}
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm xl:col-span-2">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Ventas recientes
                </h3>
                <p className="text-sm font-medium text-gray-400">Historial de los últimos 7 días</p>
              </div>
              <div className="flex gap-2">
                <div className="flex items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5">
                  <div className="h-2 w-2 rounded-full bg-primary-500" />
                  <span className="text-[10px] font-black uppercase text-primary-500">
                    Ingresos
                  </span>
                </div>
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ventas7dias}>
                  <defs>
                    <linearGradient id="colorVentasModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5D87FF" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#5D87FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    tickFormatter={(val) =>
                      format(parseISO(val), 'EEE', { locale: es }).toUpperCase()
                    }
                    dy={10}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      border: 'none',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
                      fontWeight: 'bold',
                    }}
                    formatter={(val) => [fmtMoney(val), 'Ventas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#5D87FF"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorVentasModern)"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="flex flex-col rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-black uppercase tracking-tight text-gray-900">
                Últimas órdenes
              </h3>
              <button
                onClick={() => navigate('/admin/pedidos')}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-primary-500 hover:underline"
              >
                VER TODO <ChevronRight size={14} />
              </button>
            </div>
            <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto pr-1">
              {data.ultimosPedidos?.length > 0 ? (
                data.ultimosPedidos.map((order) => (
                  <div
                    key={order.id}
                    className="group flex cursor-pointer items-center gap-4"
                    onClick={() => navigate('/admin/pedidos')}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-50 transition-colors group-hover:bg-primary-50">
                      {order.tipo_entrega === 'delivery' ? (
                        <Bike size={18} className="text-gray-400 group-hover:text-primary-500" />
                      ) : order.tipo_entrega === 'mesa' ? (
                        <UtensilsCrossed
                          size={18}
                          className="text-gray-400 group-hover:text-primary-500"
                        />
                      ) : (
                        <ShoppingBag
                          size={18}
                          className="text-gray-400 group-hover:text-primary-500"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black uppercase tracking-tight text-gray-800">
                        #{order.numero} · {order.cliente_nombre || 'Cliente'}
                      </p>
                      <p className="text-[10px] font-bold uppercase text-gray-400">
                        {format(parseISO(order.creado_en), 'HH:mm')} hs ·{' '}
                        {paymentMethodLabel(order.metodo_pago)} ·{' '}
                        {paymentStatusLabel(order.pago_estado)}
                      </p>
                      {order.hora_entrega ? (
                        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">
                          Entrega {order.hora_entrega}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-gray-900">{fmtMoney(order.total)}</p>
                      <div className="flex justify-end">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase ${order.estado === 'entregado' ? 'bg-success-50 text-success-600' : order.estado === 'cancelado' ? 'bg-danger-50 text-danger-600' : 'bg-primary-50 text-primary-500'}`}
                        >
                          {String(order.estado).replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={ShoppingBag}
                  title="Sin pedidos aún"
                  description="Cuando ingresen pedidos, vas a verlos acá con el detalle de cada uno."
                  className="h-full"
                />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="flex flex-col rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <h3 className="mb-1 text-lg font-black uppercase tracking-tight text-gray-900">
              Cobros de hoy
            </h3>
            <p className="mb-8 text-xs font-bold uppercase tracking-widest text-gray-400">
              Solo pagos confirmados por canal
            </p>

            <div className="relative h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.porMetodoPago || []}
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={5}
                    dataKey="total"
                    nameKey="metodo_pago"
                    stroke="none"
                    cornerRadius={8}
                  >
                    {(data.porMetodoPago || []).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={PAYMENT_COLORS[entry.metodo_pago] || PAYMENT_COLORS.default}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 5px 15px rgba(0,0,0,0.1)',
                    }}
                    formatter={(val) => [fmtMoney(val), 'Total']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <CreditCard size={20} className="mb-1 text-gray-300" />
                <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                  Canales
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {(data.porMetodoPago || []).map((item) => (
                <div key={item.metodo_pago} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: PAYMENT_COLORS[item.metodo_pago] || PAYMENT_COLORS.default,
                      }}
                    />
                    <span className="text-[11px] font-black uppercase tracking-tight text-gray-500">
                      {paymentMethodLabel(item.metodo_pago)}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-900">{fmtMoney(item.total)}</p>
                    <p className="text-[9px] font-bold uppercase leading-none text-gray-400">
                      {item.cantidad} pedidos
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm xl:col-span-2">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Productos estrella
                </h3>
                <p className="text-sm font-medium text-gray-400">Los mas pedidos del dia</p>
              </div>
              <Flame className="text-orange-500" size={24} />
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              {data.productosEstrella?.map((prod, idx) => (
                <div
                  key={idx}
                  className="group flex items-center gap-4 rounded-2xl p-2 transition-all hover:bg-gray-50"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border border-gray-100 bg-[#F2F6FA] shadow-sm">
                      {prod.imagen ? (
                        <img
                          src={prod.imagen}
                          alt={prod.nombre}
                          className="h-full w-full object-cover transition-transform group-hover:scale-110"
                        />
                      ) : (
                        <span className="text-base font-black text-orange-400">MS</span>
                      )}
                    </div>
                    <div className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary-500 text-[10px] font-black text-white shadow-md">
                      {idx + 1}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black uppercase tracking-tight text-gray-800 transition-colors group-hover:text-primary-500">
                      {prod.nombre}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {prod.categoria}
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-orange-400 transition-all duration-1000"
                        style={{
                          width: `${(prod.cantidad / (data.productosEstrella[0]?.cantidad || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900">{prod.cantidad}u</p>
                    <p className="text-[10px] font-bold uppercase tracking-tighter text-primary-500">
                      {fmtMoney(prod.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Más vendidos general
                </h3>
                <p className="text-sm font-medium text-gray-400">Lo que más se vende en general</p>
              </div>
              <TrendingUp className="text-primary-500" size={24} />
            </div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 md:grid-cols-2">
              {(data.productosMasVendidosGeneral || []).map((prod, idx) => (
                <button
                  key={`${prod.id || prod.nombre}-${idx}`}
                  onClick={() => navigate('/admin/productos')}
                  className="group flex w-full items-center gap-4 rounded-2xl p-2 text-left transition-all hover:bg-gray-50"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border border-gray-100 bg-[#F2F6FA] shadow-sm">
                      {prod.imagen ? (
                        <img
                          src={prod.imagen}
                          alt={prod.nombre}
                          className="h-full w-full object-cover transition-transform group-hover:scale-110"
                        />
                      ) : (
                        <span className="text-base font-black text-primary-500">MS</span>
                      )}
                    </div>
                    <div className="absolute -left-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-primary-500 text-[10px] font-black text-white shadow-md">
                      {idx + 1}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black uppercase tracking-tight text-gray-800 transition-colors group-hover:text-primary-500">
                      {prod.nombre}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {prod.categoria}
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-primary-500 transition-all duration-1000"
                        style={{
                          width: `${(prod.cantidad / (data.productosMasVendidosGeneral?.[0]?.cantidad || 1)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900">{prod.cantidad}u</p>
                    <p className="text-[10px] font-bold uppercase tracking-tighter text-primary-500">
                      {fmtMoney(prod.total)}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">
                  Clientes que más compran
                </h3>
                <p className="text-sm font-medium text-gray-400">Tus mejores clientes en general</p>
              </div>
              <Star className="text-warning-500" size={24} />
            </div>
            <div className="space-y-4">
              {(data.clientesMasCompran || []).map((cli, idx) => (
                <button
                  key={`${cli.id || cli.telefono || cli.nombre}-${idx}`}
                  onClick={() => navigate('/admin/clientes')}
                  className="flex w-full items-center gap-4 rounded-[24px] border border-gray-100 bg-primary-50 px-4 py-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-sm font-black text-primary-500 shadow-sm">
                    {idx + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black uppercase tracking-tight text-gray-900">
                      {cli.nombre}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {fmtNumber(cli.total_pedidos || 0)} pedidos
                      {cli.nivel ? ` - ${cli.nivel}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-gray-900">
                      {fmtMoney(cli.total_gastado)}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary-500">
                      {cli.ultima_compra
                        ? format(parseISO(String(cli.ultima_compra).replace(' ', 'T')), 'dd/MM')
                        : 'Sin fecha'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[40px] bg-primary-500 p-10 text-white shadow-2xl shadow-primary-200">
          <div className="absolute right-0 top-0 -mr-32 -mt-32 h-96 w-96 rounded-full bg-white/10 blur-[80px]" />
          <div className="absolute bottom-0 left-0 -mb-20 -ml-20 h-64 w-64 rounded-full bg-info-500/20 blur-[60px]" />

          <div className="relative z-10">
            <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/80">
                  <Star size={12} />
                  Ranking premium
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">Comunidad VIP</h3>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-blue-100">
                  Clientes de alto valor, frecuencia y nivel
                </p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-md">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                  Lectura del panel
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  El score combina gasto, pedidos, nivel y actividad reciente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
              {data.clientesVIP?.map((cli, idx) => (
                <div
                  key={idx}
                  className="group/item flex flex-col rounded-[32px] border border-white/10 bg-white/10 p-5 text-center backdrop-blur-md transition-all hover:-translate-y-2 hover:bg-white hover:text-primary-500"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center self-center rounded-[24px] bg-white/20 text-2xl font-black shadow-lg transition-colors group-hover/item:bg-primary-500 group-hover/item:text-white">
                    {cli.nombre?.[0]}
                  </div>
                  <p className="truncate text-sm font-black uppercase tracking-tight">
                    {cli.nombre}
                  </p>
                  <div className="mt-2 inline-flex self-center rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white group-hover/item:bg-primary-50 group-hover/item:text-primary-500">
                    Score {fmtNumber(cli.score || 0)}
                  </div>
                  <p className="mt-3 text-[10px] font-bold uppercase tracking-widest opacity-75 group-hover/item:text-gray-400">
                    {cli.nivel || 'Bronce'} - {cli.total_pedidos} pedidos
                  </p>
                  <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-left group-hover/item:border-primary-500/10">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                      <span className="opacity-70 group-hover/item:text-gray-400">Gastado</span>
                      <span>{fmtMoney(cli.total_gastado)}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider">
                      <span className="opacity-70 group-hover/item:text-gray-400">Actividad</span>
                      <span>
                        {Number(cli.diasSinComprar || 0) <= 1
                          ? 'Hoy'
                          : `${fmtNumber(cli.diasSinComprar || 0)} d`}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl border border-white/50 bg-white/50 px-2 py-4 text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 shadow-sm backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-success-500 shadow-[0_0_10px_rgba(19,222,185,0.5)] animate-pulse" />
            Motor Modo Sabor en linea
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <RefreshCw size={12} className={lastUpdate ? 'animate-spin-slow' : ''} />
              Última sincronización: {lastUpdate}
            </div>
            <div className="hidden h-4 w-[1px] bg-gray-300 sm:block" />
            <p className="hidden sm:block">Actualización en tiempo real</p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
  ArrowRight,
  ArrowUpRight,
  Bike,
  CheckCircle2,
  ChefHat,
  DollarSign,
  Package,
  Plus,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';

import api from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { paymentMethodLabel, paymentStatusLabel } from '../lib/paymentStatus.js';
import { LoadingScreen, EmptyState } from '../design-system';
import { fmtMoney } from '../lib/formatters.js';
import { resolveAssetUrl } from '../lib/assets.js';
import { socketManager } from '../lib/socket.js';
import { APP_BG, BRAND, STROKE, estadoTono } from '../lib/theme.js';

import { parseFechaServidor } from '../lib/fechas.js';
const fmtNumber = (value) => Number(value || 0).toLocaleString('es-AR');

/**
 * Colores del gráfico de cobros.
 *
 * Faltaban `modo`, `uala` y `mixto` —los tres se usan y los tres caían en
 * el gris por defecto, así que en la torta eran una sola porción gris
 * imposible de distinguir. El acento de marca queda para efectivo, que es
 * la mayor parte de la caja de un local así.
 */
const PAYMENT_COLORS = {
  efectivo: BRAND,
  mercadopago: '#00A3E0',
  transferencia: '#6366F1',
  modo: '#8B5CF6',
  uala: '#F97316',
  mixto: '#0EA5E9',
  default: '#94A3B8',
};

/**
 * Fecha a prueba de datos sucios.
 *
 * `format(parseISO(x))` sin guardas tira una excepción con un valor nulo o
 * mal formado, y al ser render de React se lleva puesto el tablero entero:
 * un pedido con la fecha rota dejaba la pantalla en blanco.
 */
function safeFormat(value, pattern, fallback = '—') {
  if (!value) return fallback;
  try {
    const parsed = parseFechaServidor(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return format(parsed, pattern, { locale: es });
  } catch {
    return fallback;
  }
}

function Card({ title, helper, action, children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title ? <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3> : null}
            {helper ? <p className="mt-0.5 text-[12px] text-gray-500">{helper}</p> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function LinkAction({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-gray-500 transition hover:text-gray-900"
    >
      {label}
      <ArrowRight size={14} strokeWidth={STROKE} />
    </button>
  );
}

/**
 * Tonos de las métricas del día.
 *
 * El tablero era blanco sobre gris y no ordenaba nada: cinco números del
 * mismo peso y el mismo color. El color acá agrupa por tipo de dato —plata
 * en verde, volumen en azul, margen en violeta— así que a los tres días
 * reconocés la tarjeta por el color antes de leer la etiqueta.
 */
const METRIC_TONOS = {
  verde: { bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A', barra: '#10B981' },
  azul: { bg: '#E9F1FA', label: '#1F5FA0', valor: '#0B3A66', barra: '#3B82F6' },
  ambar: { bg: '#FDF3D3', label: '#95661A', valor: '#6B4108', barra: '#E0A924' },
  violeta: { bg: '#F1EEFE', label: '#5E43A8', valor: '#42237F', barra: '#8B7BE0' },
};

function Metric({
  label,
  value,
  trend,
  trendUp,
  hasComparison = true,
  helper,
  alerta = false,
  tono = null,
}) {
  const t = alerta ? null : METRIC_TONOS[tono] || null;
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      style={{ background: t ? t.bg : '#fff' }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: alerta ? BRAND : t ? t.barra : '#E5E7EB' }}
      />
      <div className="pl-2">
        <p className="text-[12px]" style={{ color: t ? t.label : '#6B7280' }}>
          {label}
        </p>
        <p
          className="mt-1 truncate text-[26px] font-bold leading-none tabular-nums tracking-tight"
          style={{ color: alerta ? BRAND : t ? t.valor : '#111827' }}
        >
          {value}
        </p>
        {trend !== undefined && (
          <p className="mt-1.5 text-[11px]">
            {hasComparison ? (
              <span
                className={`inline-flex items-center gap-1 ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}
              >
                {trendUp ? (
                  <ArrowUpRight size={12} strokeWidth={STROKE} />
                ) : (
                  <ArrowDownRight size={12} strokeWidth={STROKE} />
                )}
                {trend}
                <span style={{ color: t ? t.label : '#9CA3AF' }}>vs ayer</span>
              </span>
            ) : (
              <span style={{ color: t ? t.label : '#9CA3AF' }}>Sin datos de ayer</span>
            )}
          </p>
        )}
        {helper && (
          <p className="mt-1.5 text-[11px] leading-4" style={{ color: t ? t.label : '#9CA3AF' }}>
            {helper}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Barra de producto/cliente en los rankings.
 *
 * Las cuatro listas del tablero repetían el mismo markup con pequeñas
 * diferencias de color. Ahora comparten componente, así que la fila se ve
 * igual en todas y el ancho de la barra siempre se calcula contra el
 * primero de su propia lista.
 */
function RankRow({ position, image, title, subtitle, ratio, value, footnote, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition ${
        onClick ? 'hover:bg-gray-50' : ''
      }`}
    >
      <div className="relative shrink-0">
        <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-gray-100">
          {image ? (
            <img src={image} alt={title} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[13px] font-semibold text-gray-400">
              {String(title || '?')[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <span className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-gray-800 text-[10px] font-semibold text-white">
          {position}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-gray-900">{title}</p>
        {subtitle ? <p className="truncate text-[11px] text-gray-400">{subtitle}</p> : null}
        {ratio !== undefined ? (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(2, Math.min(100, ratio * 100))}%`, background: BRAND }}
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[13px] font-bold tabular-nums text-gray-900">{value}</p>
        {footnote ? <p className="text-[11px] text-gray-400">{footnote}</p> : null}
      </div>
    </Wrapper>
  );
}

function StockAlert({ item, onClick }) {
  const hasMinimum = Number(item.stock_minimo || 0) > 0;
  const coverage = Number(item.cobertura_pct || 0);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5 text-left transition hover:bg-gray-100"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-gray-900">{item.nombre}</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          {fmtNumber(item.stock_actual)} {item.unidad}
          {hasMinimum
            ? ` · mínimo ${fmtNumber(item.stock_minimo)} ${item.unidad}`
            : ' · sin mínimo configurado'}
        </p>
      </div>
      <span
        className="shrink-0 text-[12px] font-semibold tabular-nums"
        style={{ color: !hasMinimum ? '#6B7280' : coverage <= 50 ? BRAND : '#B45309' }}
      >
        {hasMinimum ? `${coverage}%` : 'Revisar'}
      </span>
    </button>
  );
}

export default function DashboardModern() {
  const { user, hasPermission } = useAuth();
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
  const personalVisible = personalEnabled && hasPermission('personal.view');

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

      if (personalVisible) {
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
      setError('No se pudo actualizar el tablero ahora. Reintentá en unos segundos.');
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
  }, [personalVisible]);

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

  // El margen se comparaba contra `ventasAyer`, que no es el mismo dato: un
  // día con ventas pero sin costos cargados mostraba "0% vs ayer" como si
  // fuera real. Ahora el backend manda `margenBrutoAyer` y se usa ese.
  const margenTrendInfo = useMemo(() => {
    const ayer = Number(data?.margenBrutoAyer || 0);
    if (ayer <= 0) return { hasComparison: false, trend: 0, trendUp: true };
    return {
      hasComparison: true,
      trend: Math.abs(data?.tendenciaMargen || 0),
      trendUp: (data?.tendenciaMargen || 0) >= 0,
    };
  }, [data]);

  const margenHelper = useMemo(() => {
    if (data?.margenPctHoy == null) return undefined;
    if (Number(data.margenPctHoy) >= 99) {
      return 'Margen casi 100%: revisá que los costos estén cargados en Inventario.';
    }
    return `${data.margenPctHoy}% de lo vendido`;
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
    { key: 'tpv', icon: Plus, label: 'Nueva venta', to: '/admin/tpv' },
    { key: 'kds', icon: ChefHat, label: 'Cocina', to: '/admin/kds' },
    { key: 'caja', icon: Wallet, label: 'Caja', to: '/admin/caja' },
    { key: 'inventario', icon: Package, label: 'Stock', to: '/admin/inventario' },
  ].filter((action) => isModuleEnabled(action.key));

  const cajaCerrada = !data?.cajaEstado?.abierta && isModuleEnabled('caja');
  const stockCritico = isModuleEnabled('inventario') ? data?.stockCritico || [] : [];
  const puntosSalud = operationHealth?.puntos || [];
  const puntosConProblema = puntosSalud.filter((point) => !point.ok);

  if (loading && !data) {
    return <LoadingScreen message="Cargando tu dashboard..." />;
  }

  if (!data) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: APP_BG }}
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{ background: '#FEF2F2', color: BRAND }}
          >
            <AlertTriangle size={22} strokeWidth={STROKE} />
          </div>
          <h2 className="text-[17px] font-semibold text-gray-900">
            No se pudo cargar el dashboard
          </h2>
          <p className="mt-1 text-[13px] text-gray-500">
            {error || 'La información no respondió a tiempo. Intentá de nuevo.'}
          </p>
          <button
            type="button"
            onClick={() => loadDashboard()}
            style={{ background: BRAND }}
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <RefreshCw size={15} strokeWidth={STROKE} />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        {/* ── Encabezado ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
              Hola, {user?.nombre?.split(' ')?.[0] || 'Admin'}
            </h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {format(new Date(), "eeee d 'de' MMMM", { locale: es })}
              {lastUpdate ? ` · actualizado ${lastUpdate}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                type="button"
                key={action.key}
                onClick={() => navigate(action.to)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
              >
                <action.icon size={16} strokeWidth={STROKE} className="text-gray-400" />
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => loadDashboard()}
              title="Actualizar"
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              {/* El ícono giraba siempre que hubiera un `lastUpdate`, o sea
                  siempre. Ahora gira sólo mientras realmente carga. */}
              <RefreshCw
                size={16}
                strokeWidth={STROKE}
                className={refreshing ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={17} strokeWidth={STROKE} className="mt-0.5 text-amber-500" />
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Actualización parcial</p>
                <p className="mt-0.5 text-[12px] text-gray-500">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="h-10 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Reintentar
            </button>
          </div>
        ) : null}

        {/*
          Antes eran dos bloques enteros pintados de rojo y naranja fuerte,
          uno al lado del otro. Cuando los dos aparecían juntos competían y
          ninguno ganaba. Ahora es una sola franja con el acento en el borde:
          se lee primero por posición, no por saturación.
        */}
        {cajaCerrada || stockCritico.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {cajaCerrada ? (
              <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: BRAND }} />
                <div className="pl-2">
                  <p className="text-[14px] font-semibold text-gray-900">La caja está cerrada</p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    El TPV no puede cobrar hasta que la abras
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/admin/caja')}
                  style={{ background: BRAND }}
                  className="h-10 shrink-0 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
                >
                  Abrir caja
                </button>
              </div>
            ) : null}

            {stockCritico.length > 0 ? (
              <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
                <div className="pl-2">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">
                        {stockCritico.length} {stockCritico.length === 1 ? 'insumo' : 'insumos'} en
                        stock crítico
                      </p>
                      <p className="mt-0.5 text-[12px] text-gray-500">
                        Revisalos antes del próximo servicio
                      </p>
                    </div>
                    <LinkAction label="Ver stock" onClick={() => navigate('/admin/inventario')} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {stockCritico.slice(0, 2).map((item) => (
                      <StockAlert
                        key={item.id}
                        item={item}
                        onClick={() => navigate('/admin/inventario')}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Métricas ── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Ventas del día"
            value={fmtMoney(data.ventasHoy?.total || 0)}
            trend={`${ventasTrendInfo.trend}%`}
            trendUp={ventasTrendInfo.trendUp}
            hasComparison={ventasTrendInfo.hasComparison}
            tono="verde"
          />
          <Metric
            label="Pedidos de hoy"
            value={fmtNumber(data.ventasHoy?.pedidos || 0)}
            trend={`${pedidosTrendInfo.trend}%`}
            trendUp={pedidosTrendInfo.trendUp}
            hasComparison={pedidosTrendInfo.hasComparison}
            tono="azul"
          />
          <Metric
            label="Ticket promedio"
            value={fmtMoney(ticketPromedio)}
            helper="Promedio por orden"
            tono="ambar"
          />
          <Metric
            label="Margen de hoy"
            value={fmtMoney(data.margenBrutoHoy || 0)}
            trend={`${margenTrendInfo.trend}%`}
            trendUp={margenTrendInfo.trendUp}
            hasComparison={margenTrendInfo.hasComparison}
            helper={margenHelper}
            tono="violeta"
          />
          <Metric
            label="Delivery en la calle"
            value={fmtNumber(data.pedidosEnDelivery || 0)}
            helper={`${data.pedidosActivos || 0} pedidos activos en total`}
            tono="azul"
          />
        </div>

        {/* ── Gráfico + últimas órdenes ── */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card
            title="Ventas de los últimos 7 días"
            action={
              isModuleEnabled('reportes') ? (
                <LinkAction label="Reportes" onClick={() => navigate('/admin/reportes')} />
              ) : null
            }
            className="xl:col-span-2"
          >
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.ventas7dias || []}>
                  <defs>
                    <linearGradient id="colorVentasModern" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={BRAND} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={BRAND} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickFormatter={(val) => safeFormat(val, 'EEE', '')}
                    dy={10}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: '1px solid #E5E7EB',
                      boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
                      fontSize: '13px',
                    }}
                    labelFormatter={(val) => safeFormat(val, "eeee d 'de' MMMM", '')}
                    formatter={(val) => [fmtMoney(val), 'Ventas']}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={BRAND}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorVentasModern)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card
            title="Últimas órdenes"
            action={<LinkAction label="Ver todas" onClick={() => navigate('/admin/pedidos')} />}
          >
            <div className="space-y-1">
              {data.ultimosPedidos?.length > 0 ? (
                data.ultimosPedidos.map((order) => {
                  const tono = estadoTono(order.estado);
                  return (
                    <button
                      type="button"
                      key={order.id}
                      onClick={() => navigate('/admin/pedidos')}
                      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-gray-50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
                        {order.tipo_entrega === 'delivery' ? (
                          <Bike size={16} strokeWidth={STROKE} />
                        ) : order.tipo_entrega === 'mesa' ? (
                          <UtensilsCrossed size={16} strokeWidth={STROKE} />
                        ) : (
                          <ShoppingBag size={16} strokeWidth={STROKE} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          #{order.numero} · {order.cliente_nombre || 'Cliente'}
                        </p>
                        <p className="truncate text-[11px] text-gray-400">
                          {safeFormat(order.creado_en, 'HH:mm', '--:--')} hs ·{' '}
                          {paymentMethodLabel(order.metodo_pago)} ·{' '}
                          {paymentStatusLabel(order.pago_estado)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-bold tabular-nums text-gray-900">
                          {fmtMoney(order.total)}
                        </p>
                        <span
                          className="mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: tono.bg, color: tono.fg }}
                        >
                          {tono.label}
                        </span>
                      </div>
                    </button>
                  );
                })
              ) : (
                <EmptyState
                  icon={ShoppingBag}
                  title="Sin pedidos aún"
                  description="Cuando ingresen pedidos, vas a verlos acá."
                />
              )}
            </div>
          </Card>
        </div>

        {/* ── Cobros + productos del día ── */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title="Cobros de hoy" helper="Solo pagos confirmados, por canal">
            {(data.porMetodoPago || []).length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="Todavía no hay cobros"
                description="Apenas se confirme el primer pago vas a ver el desglose por canal."
              />
            ) : (
              <>
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.porMetodoPago}
                        innerRadius={55}
                        outerRadius={78}
                        paddingAngle={3}
                        dataKey="total"
                        nameKey="metodo_pago"
                        stroke="none"
                        cornerRadius={6}
                      >
                        {data.porMetodoPago.map((entry) => (
                          <Cell
                            key={entry.metodo_pago}
                            fill={PAYMENT_COLORS[entry.metodo_pago] || PAYMENT_COLORS.default}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: '12px',
                          border: '1px solid #E5E7EB',
                          boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
                          fontSize: '13px',
                        }}
                        formatter={(val, name) => [fmtMoney(val), paymentMethodLabel(name)]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 space-y-2">
                  {data.porMetodoPago.map((item) => (
                    <div key={item.metodo_pago} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            background: PAYMENT_COLORS[item.metodo_pago] || PAYMENT_COLORS.default,
                          }}
                        />
                        <span className="truncate text-[13px] text-gray-700">
                          {paymentMethodLabel(item.metodo_pago)}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[13px] font-bold tabular-nums text-gray-900">
                          {fmtMoney(item.total)}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {item.cantidad} {item.cantidad === 1 ? 'pedido' : 'pedidos'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card
            title="Lo más pedido hoy"
            helper="Ordenado por unidades vendidas"
            className="xl:col-span-2"
          >
            {(data.productosEstrella || []).length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Todavía no se vendió nada hoy"
                description="El ranking del día se arma con los pedidos de la jornada."
              />
            ) : (
              <div className="grid gap-1 md:grid-cols-2">
                {data.productosEstrella.map((prod, idx) => (
                  <RankRow
                    key={`${prod.id || prod.nombre}-${idx}`}
                    position={idx + 1}
                    image={resolveAssetUrl(prod.imagen)}
                    title={prod.nombre}
                    subtitle={prod.categoria}
                    ratio={prod.cantidad / (data.productosEstrella[0]?.cantidad || 1)}
                    value={`${fmtNumber(prod.cantidad)}u`}
                    footnote={fmtMoney(prod.total)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ── Rankings históricos ── */}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card
            title="Más vendidos de siempre"
            action={<LinkAction label="Productos" onClick={() => navigate('/admin/productos')} />}
          >
            {(data.productosMasVendidosGeneral || []).length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Sin historial todavía"
                description="Con las primeras ventas se arma el ranking general."
              />
            ) : (
              <div className="space-y-1">
                {data.productosMasVendidosGeneral.map((prod, idx) => (
                  <RankRow
                    key={`${prod.id || prod.nombre}-${idx}`}
                    position={idx + 1}
                    image={resolveAssetUrl(prod.imagen)}
                    title={prod.nombre}
                    subtitle={prod.categoria}
                    ratio={prod.cantidad / (data.productosMasVendidosGeneral[0]?.cantidad || 1)}
                    value={`${fmtNumber(prod.cantidad)}u`}
                    footnote={fmtMoney(prod.total)}
                    onClick={() => navigate('/admin/productos')}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card
            title="Clientes que más compran"
            action={<LinkAction label="Clientes" onClick={() => navigate('/admin/clientes')} />}
          >
            {(data.clientesMasCompran || []).length === 0 ? (
              <EmptyState
                icon={ShoppingBag}
                title="Sin clientes registrados"
                description="Cargá clientes desde el TPV o la web para verlos acá."
              />
            ) : (
              <div className="space-y-1">
                {data.clientesMasCompran.map((cli, idx) => (
                  <RankRow
                    key={`${cli.id || cli.nombre}-${idx}`}
                    position={idx + 1}
                    title={cli.nombre}
                    subtitle={`${fmtNumber(cli.total_pedidos || 0)} pedidos${cli.nivel ? ` · ${cli.nivel}` : ''}`}
                    value={fmtMoney(cli.total_gastado)}
                    footnote={safeFormat(cli.ultima_compra, 'dd/MM', 'Sin fecha')}
                    onClick={() => navigate('/admin/clientes')}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        {/*
          El panel VIP era un bloque azul a pantalla completa con blur y
          tarjetas de vidrio. Ocupaba más que las ventas del día siendo un
          dato de consulta. Ahora es una tarjeta más, con la misma jerarquía
          que el resto.
        */}
        {(data.clientesVIP || []).length > 0 ? (
          <Card
            title="Clientes VIP"
            helper="Score combinado de gasto, frecuencia, nivel y actividad reciente"
            action={<LinkAction label="Fidelización" onClick={() => navigate('/admin/clientes')} />}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {data.clientesVIP.map((cli, idx) => (
                <div
                  key={`${cli.id || cli.nombre}-${idx}`}
                  className="rounded-xl border border-gray-100 p-3"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-[14px] font-semibold text-gray-600">
                      {cli.nombre?.[0]?.toUpperCase() || '?'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">{cli.nombre}</p>
                      <p className="text-[11px] text-gray-400">{cli.nivel || 'Bronce'}</p>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-1.5 border-t border-gray-100 pt-2.5 text-[12px]">
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Gastado</dt>
                      <dd className="font-bold tabular-nums text-gray-900">
                        {fmtMoney(cli.total_gastado)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Pedidos</dt>
                      <dd className="tabular-nums text-gray-700">{fmtNumber(cli.total_pedidos)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-gray-400">Última compra</dt>
                      <dd className="tabular-nums text-gray-700">
                        {Number(cli.diasSinComprar || 0) <= 1
                          ? 'Hoy'
                          : `hace ${fmtNumber(cli.diasSinComprar || 0)} d`}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {/* ── Salud del sistema ── */}
        {operationHealthError ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <AlertTriangle size={17} strokeWidth={STROKE} className="shrink-0 text-amber-500" />
            <p className="text-[13px] text-gray-600">
              No se pudo cargar la salud del sistema. Reintentá o revisá el centro operativo.
            </p>
          </div>
        ) : null}

        {puntosSalud.length ? (
          <Card
            title="Salud del sistema"
            helper={
              puntosConProblema.length === 0
                ? 'Operación, stock, riders, backups e impresión: todo en orden'
                : `${puntosConProblema.length} ${puntosConProblema.length === 1 ? 'punto necesita' : 'puntos necesitan'} atención`
            }
            action={
              <LinkAction label="Centro operativo" onClick={() => navigate('/admin/operacion')} />
            }
          >
            {/*
              Los puntos OK ocupaban lo mismo que los que fallan, así que
              había que leer los seis para encontrar el que importa. Ahora
              los que fallan van primero y con el ícono en ámbar.
            */}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {[...puntosSalud]
                .sort((a, b) => Number(a.ok) - Number(b.ok))
                .map((point) => (
                  <div
                    key={point.id}
                    className="flex items-start gap-2.5 rounded-xl border border-gray-100 p-3"
                  >
                    {point.ok ? (
                      <CheckCircle2
                        size={16}
                        strokeWidth={STROKE}
                        className="mt-0.5 shrink-0 text-emerald-500"
                      />
                    ) : (
                      <AlertTriangle
                        size={16}
                        strokeWidth={STROKE}
                        className="mt-0.5 shrink-0 text-amber-500"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-900">{point.title}</p>
                      <p className="mt-0.5 text-[12px] leading-4 text-gray-500">{point.detail}</p>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ) : null}

        {/* ── Pulso del equipo ── */}
        {personalPulseError && personalVisible ? (
          <div className="flex items-center gap-2.5 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <AlertTriangle size={17} strokeWidth={STROKE} className="shrink-0 text-amber-500" />
            <p className="text-[13px] text-gray-600">
              No se pudo cargar el pulso del equipo. Reintentá o revisá el módulo de personal.
            </p>
          </div>
        ) : null}

        {personalHeadline ? (
          <Card
            title="Pulso del equipo"
            helper="Asistencia y puntualidad de los últimos 7 días"
            action={<LinkAction label="Personal" onClick={() => navigate('/admin/personal')} />}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[12px] text-gray-500">Equipo activo</p>
                <p className="mt-1 text-[24px] font-bold tabular-nums leading-none text-gray-900">
                  {personalHeadline.activos}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">Legajos activos hoy</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[12px] text-gray-500">Tardanzas a mirar</p>
                <p
                  className="mt-1 text-[24px] font-bold tabular-nums leading-none"
                  style={{ color: personalHeadline.lateCount > 0 ? '#B45309' : '#111827' }}
                >
                  {personalHeadline.lateCount}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">Con 2 o más en 7 días</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[12px] text-gray-500">Ausencias recientes</p>
                <p
                  className="mt-1 text-[24px] font-bold tabular-nums leading-none"
                  style={{ color: personalHeadline.absentCount > 0 ? BRAND : '#111827' }}
                >
                  {personalHeadline.absentCount}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">Con al menos una falta</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3">
                <p className="text-[12px] text-gray-500">Mejor de la semana</p>
                <p className="mt-1 truncate text-[15px] font-semibold leading-tight text-gray-900">
                  {personalHeadline.topEmployee?.personal_nombre || 'Sin datos'}
                </p>
                <p className="mt-1.5 text-[11px] text-gray-400">
                  {personalHeadline.topEmployee
                    ? `${personalHeadline.topEmployee.asistenciaPct}% de asistencia`
                    : 'Faltan fichadas'}
                </p>
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

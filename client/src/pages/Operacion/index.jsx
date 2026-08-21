import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Bike,
  RefreshCw,
  Settings2,
  ShoppingBag,
  TrendingUp,
  WalletCards,
} from 'lucide-react';

import api from '../../lib/api.js';
import { APP_BG, BRAND, STROKE } from '../../lib/theme.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAppConfig } from '../../context/AppConfigContext.jsx';
import { Card, CardHeader, fmt, Stat } from './ui.jsx';
import ChecklistPanel from './ChecklistPanel.jsx';
import StockDiarioPanel from './StockDiarioPanel.jsx';

export default function Operacion() {
  const { hasPermission } = useAuth();
  const { isModuleEnabled } = useAppConfig();
  const [data, setData] = useState(null);
  const [stock, setStock] = useState({ insumos: [], productos: [] });
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);

  /**
   * Esta pantalla tiene dos formularios largos con botones de guardar
   * separados. Antes nada avisaba si quedaban cambios pendientes: se
   * cargaban veinte campos, se guardaba sólo uno de los dos y el resto se
   * perdía sin una señal.
   */
  const [stockSucio, setStockSucio] = useState(false);
  const haySinGuardar = stockSucio;
  const puedeEditarStock = hasPermission('productos.edit') && isModuleEnabled('inventario');
  const puedeEditarMenu = hasPermission('productos.edit');
  const puedeVerCaja = hasPermission('caja.view') && isModuleEnabled('caja');
  const puedeConfigurar = hasPermission('config.manage');
  const deliveryActivo = isModuleEnabled('delivery');

  const cargar = async () => {
    setLoading(true);
    try {
      const resumen = await api.get('/operacion/resumen');
      setData(resumen);
      setStock({
        insumos: resumen?.stockDiario?.insumos || [],
        productos: resumen?.stockDiario?.productosDirectos || [],
      });
      setStockSucio(false);
    } catch {
      toast.error('No se pudo cargar el control diario');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Refresca sólo el resumen. Después de guardar ya tenemos la respuesta del
   * servidor: volver a pedir todo era un viaje de más que además hacía
   * parpadear el spinner y perdía la posición del scroll.
   */
  const refrescarResumen = async () => {
    try {
      const resumen = await api.get('/operacion/resumen');
      setData(resumen);
    } catch {
      // El resumen es informativo: si falla, lo guardado ya está guardado.
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    if (!haySinGuardar) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [haySinGuardar]);

  // ── Stock ───────────────────────────────────────────────────────
  const cambiarInsumo = (id, valor) => {
    setStockSucio(true);
    setStock((prev) => ({
      ...prev,
      insumos: prev.insumos.map((item) =>
        item.id === id ? { ...item, stock_actual: valor } : item
      ),
    }));
  };

  const cambiarProducto = (id, valor) => {
    setStockSucio(true);
    setStock((prev) => ({
      ...prev,
      productos: prev.productos.map((item) =>
        item.id === id ? { ...item, stock_directo: valor } : item
      ),
    }));
  };

  const guardarStock = async () => {
    setSavingStock(true);
    try {
      const response = await api.post('/operacion/stock-diario', {
        insumos: stock.insumos,
        productos: stock.productos,
      });
      setStock({
        insumos: response?.stockDiario?.insumos || [],
        productos: response?.stockDiario?.productosDirectos || [],
      });
      setStockSucio(false);
      toast.success('Stock del día actualizado');
      await refrescarResumen();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el stock');
    } finally {
      setSavingStock(false);
    }
  };

  const cierre = data?.cierreDiario || {};
  const arranque = data?.arranque || { riders: [], menuDelDia: [] };

  const hoy = useMemo(
    () =>
      new Date().toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    []
  );

  /**
   * Saludo según la hora. El local abre al mediodía y cierra tarde, así que
   * los cortes están puestos sobre esa jornada y no sobre el reloj estándar.
   */
  const saludo = useMemo(() => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buen día, a preparar el turno';
    if (hora < 19) return 'Buenas tardes, ¿cómo viene el mediodía?';
    return 'Buenas noches, a full con el turno';
  }, []);

  const activosHoy = arranque.menuDelDia.length;

  if (loading && !data) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center" style={{ background: APP_BG }}>
        <RefreshCw size={26} strokeWidth={STROKE} className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-[1400px] space-y-4">
        {/* ── Encabezado ── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium capitalize" style={{ color: BRAND }}>
              {hoy}
            </p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-900">{saludo}</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {activosHoy > 0
                ? `${activosHoy} ${activosHoy === 1 ? 'plato' : 'platos'} en el menú del día · ${cierre.pedidos || 0} pedidos hasta ahora`
                : 'Todavía no armaste el menú del día'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/*
              Abrir la caja es el primer paso de la jornada y sin eso el TPV
              no vende. Va primero y en color de marca: es la única acción de
              esta pantalla que bloquea al resto del local si no se hace.
            */}
            {puedeVerCaja ? (
              <Link
                to="/admin/caja"
                style={{ background: BRAND }}
                className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                <WalletCards size={16} strokeWidth={STROKE} />
                Caja
              </Link>
            ) : null}
            <Link
              to="/"
              target="_blank"
              rel="noreferrer"
              title="Ver la carta como la ve el cliente"
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <ShoppingBag size={16} strokeWidth={STROKE} />
              Ver web
            </Link>
            {puedeConfigurar ? (
              <Link
                to="/admin/configuracion"
                className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
              >
                <Settings2 size={16} strokeWidth={STROKE} />
                Configuración
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (
                  haySinGuardar &&
                  !window.confirm('Tenés cambios sin guardar. ¿Recargar y descartarlos?')
                ) {
                  return;
                }
                cargar();
              }}
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
        </div>

        {/* ── Cambios sin guardar ── */}
        {haySinGuardar ? (
          <div
            className="sticky top-2 z-30 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 shadow-lg"
            style={{ background: BRAND }}
          >
            <AlertTriangle size={17} strokeWidth={STROKE} className="shrink-0 text-white" />
            <p className="min-w-0 flex-1 text-[13px] font-semibold text-white">
              Cambios sin guardar en el stock
            </p>
            {stockSucio ? (
              <button
                type="button"
                onClick={guardarStock}
                disabled={savingStock}
                className="h-9 rounded-lg bg-white px-4 text-[12px] font-semibold text-gray-900 transition hover:bg-white/90 disabled:opacity-60"
              >
                Guardar stock
              </button>
            ) : null}
          </div>
        ) : null}

        {/* ── Números del día ── */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            index={0}
            label="Ventas de hoy"
            value={fmt(cierre.totalVentas)}
            helper={`${cierre.pedidos || 0} pedidos · ticket ${fmt(cierre.ticketPromedio)}`}
            icon={ShoppingBag}
            tone={{ bg: '#FEF2F2', fg: BRAND }}
          />
          <Stat
            index={1}
            label="Efectivo en caja"
            value={fmt(cierre.efectivo)}
            helper={`Digitales ${fmt(cierre.digitales)}`}
            icon={WalletCards}
            tone={{ bg: '#ECFDF5', fg: '#059669' }}
          />
          <Stat
            index={2}
            label="Pendiente de cobro"
            value={fmt(cierre.pendiente)}
            helper={Number(cierre.pendiente || 0) > 0 ? 'Revisar antes de cerrar' : 'Todo cobrado'}
            icon={AlertTriangle}
            tone={
              Number(cierre.pendiente || 0) > 0
                ? { bg: '#FEF6E7', fg: '#B45309' }
                : { bg: '#F3F4F6', fg: '#6B7280' }
            }
          />
          <Stat
            index={3}
            label="Ganancia operativa"
            value={fmt(cierre.gananciaOperativa)}
            helper={`Gastos ${fmt(cierre.gastos)} · delivery ${fmt(cierre.deliveryDiario)}`}
            icon={TrendingUp}
            tone={{ bg: '#EFF6FF', fg: '#2563EB' }}
          />
        </div>

        <ChecklistPanel puntos={data?.puntos || []} />

        {/* ── Trabajo del día ── */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Card>
              <CardHeader
                icon={ShoppingBag}
                title="Menú del día"
                subtitle={
                  activosHoy > 0
                    ? `${activosHoy} ${activosHoy === 1 ? 'plato publicado' : 'platos publicados'} hoy`
                    : 'Todavía no hay platos publicados hoy'
                }
                action={
                  puedeEditarMenu ? (
                    <Link
                      to="/admin/menu-del-dia"
                      style={{ background: BRAND }}
                      className="flex h-10 items-center rounded-xl px-4 text-[12px] font-semibold text-white transition hover:brightness-110"
                    >
                      Administrar menú
                    </Link>
                  ) : null
                }
              />
            </Card>
          </div>

          <div className="space-y-4">
            {puedeEditarStock ? (
              <StockDiarioPanel
                insumos={stock.insumos}
                productos={stock.productos}
                sucio={stockSucio}
                guardando={savingStock}
                onChangeInsumo={cambiarInsumo}
                onChangeProducto={cambiarProducto}
                onGuardar={guardarStock}
              />
            ) : null}

            {/* Riders */}
            {deliveryActivo ? (
              <Card>
                <CardHeader
                  icon={Bike}
                  title="Riders del turno"
                  subtitle={
                    arranque.riders.length > 0
                      ? `${arranque.riders.length} activos · ${arranque.ridersGpsAtrasado || 0} con GPS atrasado`
                      : 'No hay riders activos'
                  }
                  action={
                    <Link
                      to="/admin/delivery"
                      className="flex h-10 items-center rounded-xl bg-gray-100 px-3.5 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
                    >
                      Ver delivery
                    </Link>
                  }
                />
                {arranque.riders.length > 0 ? (
                  <div className="border-t border-gray-100 px-5 py-3">
                    <div className="space-y-1">
                      {arranque.riders.map((rider) => (
                        <div
                          key={rider.id}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-gray-50"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: Number(rider.disponible) === 1 ? '#10B981' : '#F59E0B',
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-800">
                            {rider.nombre}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                            {rider.telefono || 'Sin teléfono'}
                          </span>
                          <span className="shrink-0 text-[11px] font-medium text-gray-500">
                            {Number(rider.disponible) === 1 ? 'Libre' : 'Ocupado'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Archive,
  Bike,
  Database,
  FileText,
  PackageCheck,
  RefreshCw,
  Settings2,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';

import api from '../../lib/api.js';
import { APP_BG, BRAND, STROKE } from '../../lib/theme.js';
import { Card, CardHeader, fmt, Stat } from './ui.jsx';
import ChecklistPanel from './ChecklistPanel.jsx';
import StockDiarioPanel from './StockDiarioPanel.jsx';
import MenuDiaPanel from './MenuDiaPanel.jsx';
import ConfigMenuDiaModal from './ConfigMenuDiaModal.jsx';
import NuevoPlatoModal from './NuevoPlatoModal.jsx';

const MENU_DIA_VACIO = { fecha: '', items: [], ultimaFechaDisponible: null };

export default function Operacion() {
  const [data, setData] = useState(null);
  const [stock, setStock] = useState({ insumos: [], productos: [] });
  const [menuDia, setMenuDia] = useState(MENU_DIA_VACIO);
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);
  const [working, setWorking] = useState('');
  const [configAbierta, setConfigAbierta] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  /**
   * Esta pantalla tiene dos formularios largos con botones de guardar
   * separados. Antes nada avisaba si quedaban cambios pendientes: se
   * cargaban veinte campos, se guardaba sólo uno de los dos y el resto se
   * perdía sin una señal.
   */
  const [stockSucio, setStockSucio] = useState(false);
  const [menuSucio, setMenuSucio] = useState(false);
  const haySinGuardar = stockSucio || menuSucio;

  const cargar = async () => {
    setLoading(true);
    try {
      const [resumen, menu] = await Promise.all([
        api.get('/operacion/resumen'),
        api.get('/operacion/menu-dia'),
      ]);
      setData(resumen);
      setStock({
        insumos: resumen?.stockDiario?.insumos || [],
        productos: resumen?.stockDiario?.productosDirectos || [],
      });
      setMenuDia(menu || MENU_DIA_VACIO);
      setStockSucio(false);
      setMenuSucio(false);
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

  // ── Menú del día ────────────────────────────────────────────────
  const cambiarItem = (id, campo, valor) => {
    setMenuSucio(true);
    setMenuDia((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) =>
        item.id === id ? { ...item, [campo]: valor } : item
      ),
    }));
  };

  const cambiarTipoItem = (id, tipo) => {
    const sugerido = menuDia.precioSugerido?.[tipo];
    setMenuSucio(true);
    setMenuDia((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) =>
        item.id === id
          ? {
              ...item,
              tipo_hoy: tipo,
              precio_hoy: sugerido ?? item.precio_hoy,
              // El combo bebida + postre es exclusivo del ejecutivo. Si el
              // plato baja a económico hay que apagarlo: si no, queda un
              // interruptor encendido que el backend descarta en silencio.
              ofrece_bebida_postre_hoy: tipo === 'ejecutivo' ? item.ofrece_bebida_postre_hoy : 0,
            }
          : item
      ),
    }));
  };

  /**
   * Mueve un plato dentro del orden de la carta.
   *
   * `orden_hoy` se guardaba siempre como el índice del array, así que el
   * orden en la web pública no se podía controlar desde ningún lado. Ahora
   * el array se reordena de verdad y el índice sale de esa posición.
   *
   * Sólo se reordenan entre sí los platos que salen hoy: los guardados no
   * tienen orden visible en ningún lado.
   */
  const moverItem = (id, delta) => {
    setMenuSucio(true);
    setMenuDia((prev) => {
      const items = [...(prev.items || [])];
      const activos = items.filter((item) => Number(item.disponible_hoy) === 1);
      const posicion = activos.findIndex((item) => item.id === id);
      const destino = posicion + delta;
      if (posicion < 0 || destino < 0 || destino >= activos.length) return prev;

      const reordenados = [...activos];
      const [movido] = reordenados.splice(posicion, 1);
      reordenados.splice(destino, 0, movido);

      const guardados = items.filter((item) => Number(item.disponible_hoy) !== 1);
      return { ...prev, items: [...reordenados, ...guardados] };
    });
  };

  const guardarMenuDia = async () => {
    setWorking('menu-dia');
    try {
      const response = await api.post('/operacion/menu-dia', {
        items: (menuDia.items || []).map((item, index) => ({
          id: item.id,
          disponible_hoy: Number(item.disponible_hoy) === 1 ? 1 : 0,
          precio_hoy: item.precio_hoy,
          stock_hoy: item.stock_hoy,
          descripcion_hoy: item.descripcion_hoy,
          destacado_hoy: Number(item.destacado_hoy) === 1 ? 1 : 0,
          orden_hoy: index,
          tipo_hoy: item.tipo_hoy === 'ejecutivo' ? 'ejecutivo' : 'economico',
          // Estos tres faltaban en el payload. El backend preserva el valor
          // anterior cuando el campo no llega, así que las guarniciones y los
          // extras se editaban en pantalla, se guardaban sin ellos y volvían
          // al estado viejo en el siguiente refresco: el editor no servía.
          guarniciones_hoy: Array.isArray(item.guarniciones_hoy) ? item.guarniciones_hoy : [],
          ofrece_postre_hoy: Number(item.ofrece_postre_hoy) === 1 ? 1 : 0,
          ofrece_bebida_postre_hoy: Number(item.ofrece_bebida_postre_hoy) === 1 ? 1 : 0,
        })),
      });
      setMenuDia(response);
      setMenuSucio(false);
      toast.success('Menú del día guardado');
      await refrescarResumen();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el menú del día');
    } finally {
      setWorking('');
    }
  };

  const copiarAyer = async () => {
    // Copiar pisa precio, stock y descripción de todos los platos.
    const aviso = menuSucio
      ? 'Tenés cambios sin guardar en el menú de hoy y se van a perder.\n\n¿Copiar igual el menú anterior?'
      : `¿Copiar el menú del ${menuDia.ultimaFechaDisponible}? Reemplaza lo que haya cargado hoy.`;
    if (!window.confirm(aviso)) return;

    setWorking('copiar');
    try {
      const response = await api.post('/operacion/menu-dia/copiar-ayer', {});
      setMenuDia(response);
      setMenuSucio(false);
      toast.success(response?.fuente ? `Copiado desde ${response.fuente}` : 'Menú copiado');
      await refrescarResumen();
    } catch (error) {
      toast.error(error?.error || 'No se pudo copiar el menú anterior');
    } finally {
      setWorking('');
    }
  };

  const archivarPlato = async (item) => {
    if (
      !window.confirm(
        `¿Archivar "${item.nombre}"?\n\nDesaparece del panel y de la web, pero se conserva en los pedidos y reportes donde ya aparece.`
      )
    ) {
      return;
    }
    try {
      const response = await api.delete(`/operacion/menu-dia/${item.id}`);
      setMenuDia(response);
      toast.success(`"${item.nombre}" archivado`);
      await refrescarResumen();
    } catch (error) {
      toast.error(error?.error || 'No se pudo archivar el plato');
    }
  };

  // ── Mantenimiento ───────────────────────────────────────────────
  const ejecutar = async (clave, accion, mensaje) => {
    setWorking(clave);
    try {
      const resultado = await accion();
      toast.success(typeof mensaje === 'function' ? mensaje(resultado) : mensaje);
      await refrescarResumen();
    } catch (error) {
      toast.error(error?.error || 'No se pudo completar la acción');
    } finally {
      setWorking('');
    }
  };

  const sincronizarBases = () =>
    ejecutar(
      'bases',
      async () => {
        const endpoints = [
          '/inventario/productos/sync/pizzas-prepizza',
          '/inventario/productos/sync/empanadas-insumos',
          '/inventario/productos/sync/milanesas-base',
          '/inventario/productos/sync/hamburguesas-base',
          '/inventario/productos/sync/papas-full-cheddar',
        ];
        for (const endpoint of endpoints) {
          await api.post(endpoint, {});
        }
      },
      'Bases compartidas sincronizadas'
    );

  const cierre = data?.cierreDiario || {};
  const arranque = data?.arranque || { riders: [], menuDelDia: [] };
  const backups = data?.backups || [];

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

  const activosHoy = (menuDia.items || []).filter(
    (item) => Number(item.disponible_hoy) === 1
  ).length;

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
            <Link
              to="/admin/caja"
              style={{ background: BRAND }}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <WalletCards size={16} strokeWidth={STROKE} />
              Caja
            </Link>
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
            <Link
              to="/admin/configuracion"
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <Settings2 size={16} strokeWidth={STROKE} />
              Configuración
            </Link>
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
              Cambios sin guardar
              {stockSucio && menuSucio
                ? ' en el stock y en el menú'
                : stockSucio
                  ? ' en el stock'
                  : ' en el menú'}
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
            {menuSucio ? (
              <button
                type="button"
                onClick={guardarMenuDia}
                disabled={working === 'menu-dia'}
                className="h-9 rounded-lg bg-white px-4 text-[12px] font-semibold text-gray-900 transition hover:bg-white/90 disabled:opacity-60"
              >
                Guardar menú
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
            <MenuDiaPanel
              menuDia={menuDia}
              sucio={menuSucio}
              guardando={working === 'menu-dia'}
              copiando={working === 'copiar'}
              onChangeItem={cambiarItem}
              onChangeTipo={cambiarTipoItem}
              onMover={moverItem}
              onArchivar={archivarPlato}
              onGuardar={guardarMenuDia}
              onCopiarAyer={copiarAyer}
              onAbrirConfig={() => setConfigAbierta(true)}
              onAbrirNuevo={() => setNuevoAbierto(true)}
            />
          </div>

          <div className="space-y-4">
            <StockDiarioPanel
              insumos={stock.insumos}
              productos={stock.productos}
              sucio={stockSucio}
              guardando={savingStock}
              onChangeInsumo={cambiarInsumo}
              onChangeProducto={cambiarProducto}
              onGuardar={guardarStock}
            />

            {/* Riders */}
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

            {/* Mantenimiento */}
            <Card>
              <CardHeader
                icon={Database}
                title="Mantenimiento"
                subtitle={
                  backups.length > 0
                    ? `Último backup: ${new Date(backups[0].created_at).toLocaleString('es-AR')}`
                    : 'Sin backups todavía'
                }
              />
              <div className="grid gap-2 border-t border-gray-100 px-5 py-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    ejecutar('backup', () => api.post('/operacion/backup', {}), 'Backup creado')
                  }
                  disabled={working === 'backup'}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  <Archive size={15} strokeWidth={STROKE} />
                  {working === 'backup' ? 'Creando…' : 'Crear backup'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    ejecutar(
                      'clientes',
                      () => api.post('/operacion/clientes/sincronizar', {}),
                      (r) => `${r?.total || 0} clientes recalculados`
                    )
                  }
                  disabled={working === 'clientes'}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  <Users size={15} strokeWidth={STROKE} />
                  {working === 'clientes' ? 'Recalculando…' : 'Sincronizar clientes'}
                </button>
                <button
                  type="button"
                  onClick={sincronizarBases}
                  disabled={working === 'bases'}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                >
                  <PackageCheck size={15} strokeWidth={STROKE} />
                  {working === 'bases' ? 'Sincronizando…' : 'Sincronizar bases'}
                </button>
                <Link
                  to="/admin/reportes"
                  className="flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
                >
                  <FileText size={15} strokeWidth={STROKE} />
                  Ver reportes
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {configAbierta ? (
        <ConfigMenuDiaModal
          config={{
            precioEconomico: menuDia.precioSugerido?.economico ?? 5000,
            precioEjecutivo: menuDia.precioSugerido?.ejecutivo ?? 7000,
            extraPostrePrecio: menuDia.extraPostrePrecio ?? 1000,
            extraBebidaPostrePrecio: menuDia.extraBebidaPostrePrecio ?? 1000,
            guarnicionesLista: menuDia.guarnicionesLista || [],
          }}
          onClose={() => setConfigAbierta(false)}
          onSaved={cargar}
        />
      ) : null}

      {nuevoAbierto ? (
        <NuevoPlatoModal
          menuDia={menuDia}
          onClose={() => setNuevoAbierto(false)}
          onCreado={async (response) => {
            setMenuDia(response);
            await refrescarResumen();
          }}
        />
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Archive,
  Bike,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileText,
  PackageCheck,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  ShoppingBag,
  Users,
  WalletCards,
} from 'lucide-react';

import api from '../lib/api.js';

const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

function Stat({ label, value, helper, icon: Icon, tone = 'blue' }) {
  const tones = {
    blue: 'bg-primary-50 text-primary-500',
    emerald: 'bg-success-50 text-success-600',
    amber: 'bg-warning-50 text-warning-600',
    rose: 'bg-danger-50 text-danger-600',
    slate: 'bg-slate-100 text-slate-600',
  };
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black text-gray-900">{value}</p>
          {helper ? <p className="mt-1 text-xs font-bold text-gray-400">{helper}</p> : null}
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tones[tone] || tones.blue}`}
        >
          <Icon size={20} strokeWidth={2.6} />
        </div>
      </div>
    </div>
  );
}

function PointCard({ point, index }) {
  return (
    <div className="flex items-start gap-3 rounded-[20px] border border-gray-100 bg-white p-4 shadow-sm">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${point.ok ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600'}`}
      >
        {point.ok ? <CheckCircle2 size={18} /> : index + 1}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-black uppercase tracking-tight text-gray-900">{point.title}</p>
        <p className="mt-1 text-xs font-semibold text-gray-500">{point.detail}</p>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, action }) {
  return (
    <section className="rounded-[28px] border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-black uppercase tracking-tight text-gray-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm font-medium text-gray-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function Operacion() {
  const [data, setData] = useState(null);
  const [stock, setStock] = useState({ insumos: [], productos: [] });
  const [menuDia, setMenuDia] = useState({ fecha: '', items: [], ultimaFechaDisponible: null });
  const [menuDiaNuevo, setMenuDiaNuevo] = useState({
    nombre: '',
    descripcion: 'Menu del dia.',
    precio: 5000,
    stock_directo: 20,
    tiempo_preparacion: 15,
    tipo: 'economico',
    promo: 0,
  });
  const [loading, setLoading] = useState(true);
  const [savingStock, setSavingStock] = useState(false);
  const [working, setWorking] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const [response, menuDiaResponse] = await Promise.all([
        api.get('/operacion/resumen'),
        api.get('/operacion/menu-dia'),
      ]);
      setData(response);
      setStock({
        insumos: response?.stockDiario?.insumos || [],
        productos: response?.stockDiario?.productosDirectos || [],
      });
      setMenuDia(menuDiaResponse || { fecha: '', items: [], ultimaFechaDisponible: null });
    } catch {
      toast.error('No se pudo cargar operación');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cierre = data?.cierreDiario || {};
  const points = data?.puntos || [];
  const arranque = data?.arranque || { riders: [], menuDelDia: [] };
  const menuDiaActivos = useMemo(
    () => (menuDia.items || []).filter((item) => Number(item.disponible_hoy) === 1),
    [menuDia.items]
  );

  const groupedProducts = useMemo(() => {
    const map = new Map();
    (stock.productos || []).forEach((product) => {
      const key = product.categoria || 'Otros';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(product);
    });
    return Array.from(map.entries()).filter(([, products]) => products.length > 0);
  }, [stock.productos]);

  const updateInsumo = (id, value) => {
    setStock((prev) => ({
      ...prev,
      insumos: prev.insumos.map((item) =>
        item.id === id ? { ...item, stock_actual: value } : item
      ),
    }));
  };

  const updateProducto = (id, value) => {
    setStock((prev) => ({
      ...prev,
      productos: prev.productos.map((item) =>
        item.id === id ? { ...item, stock_directo: value } : item
      ),
    }));
  };

  const updateMenuDiaItem = (id, key, value) => {
    setMenuDia((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    }));
  };

  const updateMenuDiaTipo = (id, tipo) => {
    const precioSugerido = menuDia.precioSugerido?.[tipo];
    setMenuDia((prev) => ({
      ...prev,
      items: (prev.items || []).map((item) =>
        item.id === id
          ? { ...item, tipo_hoy: tipo, precio_hoy: precioSugerido ?? item.precio_hoy }
          : item
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
      toast.success('Stock diario actualizado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar stock');
    } finally {
      setSavingStock(false);
    }
  };

  const crearBackup = async () => {
    setWorking('backup');
    try {
      await api.post('/operacion/backup', {});
      toast.success('Backup creado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear backup');
    } finally {
      setWorking('');
    }
  };

  const sincronizarClientes = async () => {
    setWorking('clientes');
    try {
      const response = await api.post('/operacion/clientes/sincronizar', {});
      toast.success(`Clientes recalculados: ${response.total}`);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar clientes');
    } finally {
      setWorking('');
    }
  };

  const sincronizarBasesCompartidas = async () => {
    setWorking('bases');
    try {
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

      toast.success('Bases compartidas sincronizadas');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudieron sincronizar las bases');
    } finally {
      setWorking('');
    }
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
          orden_hoy: Number(item.orden_hoy ?? index),
          tipo_hoy: item.tipo_hoy === 'ejecutivo' ? 'ejecutivo' : 'economico',
          promo_hoy: Number(item.promo_hoy) === 1 ? 1 : 0,
        })),
      });
      setMenuDia(response);
      toast.success('Menú del día guardado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el menú del día');
    } finally {
      setWorking('');
    }
  };

  const copiarMenuDiaAnterior = async () => {
    setWorking('menu-dia-copiar');
    try {
      const response = await api.post('/operacion/menu-dia/copiar-ayer', {});
      setMenuDia(response);
      toast.success(
        response?.fuente ? `Copiado desde ${response.fuente}` : 'Menú anterior copiado'
      );
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo copiar el menú anterior');
    } finally {
      setWorking('');
    }
  };

  const crearProductoMenuDia = async () => {
    setWorking('menu-dia-nuevo');
    try {
      const response = await api.post('/operacion/menu-dia/nuevo', menuDiaNuevo);
      setMenuDia(response);
      setMenuDiaNuevo({
        nombre: '',
        descripcion: 'Menu del dia.',
        precio: response?.precioSugerido?.economico ?? 5000,
        stock_directo: 20,
        tiempo_preparacion: 15,
        tipo: 'economico',
        promo: 0,
      });
      toast.success('Plato del día agregado');
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo crear el plato del día');
    } finally {
      setWorking('');
    }
  };

  if (loading && !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="animate-spin text-primary-500" size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-500 text-white shadow-lg shadow-primary-100">
                <ClipboardCheck size={20} />
              </div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-primary-500">
                Modo operación
              </p>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">
              Control diario del local
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500">
              Los 8 puntos importantes para que el sistema trabaje ordenado todos los días.
            </p>
          </div>
          <button
            onClick={cargar}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-widest text-gray-600 shadow-sm transition hover:bg-primary-50 hover:text-primary-500"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Ventas hoy"
            value={fmt(cierre.totalVentas)}
            helper={`${cierre.pedidos || 0} pedidos`}
            icon={ShoppingBag}
          />
          <Stat
            label="Efectivo"
            value={fmt(cierre.efectivo)}
            helper="Cobrado en caja"
            icon={WalletCards}
            tone="emerald"
          />
          <Stat
            label="Pendiente"
            value={fmt(cierre.pendiente)}
            helper="A cobrar o revisar"
            icon={AlertTriangle}
            tone={Number(cierre.pendiente || 0) > 0 ? 'amber' : 'slate'}
          />
          <Stat
            label="Operativo"
            value={fmt(cierre.gananciaOperativa)}
            helper="Ventas menos gastos y delivery"
            icon={PackageCheck}
            tone="blue"
          />
        </div>

        <Section
          title="Checklist de 8 puntos"
          subtitle="Vista rápida de lo que ya está cubierto y lo que conviene revisar."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {points.map((point, index) => (
              <PointCard key={point.id} point={point} index={index} />
            ))}
          </div>
        </Section>

        <Section
          title="Centro rápido del turno"
          subtitle="Accesos para abrir el día, revisar delivery, stock base y la carta online."
          action={
            <Link
              to="/admin/configuracion"
              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-xs font-black uppercase tracking-widest text-gray-600 shadow-sm transition hover:bg-primary-50 hover:text-primary-500"
            >
              <ExternalLink size={15} />
              Configuración
            </Link>
          }
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                to: '/admin/caja',
                icon: WalletCards,
                title: 'Abrir caja',
                detail: 'Controlar turno y efectivo inicial',
              },
              {
                to: '/admin/inventario',
                icon: Archive,
                title: 'Bases de cocina',
                detail: 'Prepizzas, panes, medallones y milanesas',
              },
              {
                to: '/admin/delivery',
                icon: Bike,
                title: 'Delivery',
                detail: `${arranque.riders.length} riders activos · ${arranque.ridersGpsAtrasado || 0} GPS a revisar`,
              },
              {
                to: '/',
                icon: ShoppingBag,
                title: 'Web pública',
                detail: `${arranque.menuDelDia.length} platos en menú del día`,
              },
            ].map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="rounded-[20px] border border-gray-100 bg-primary-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black uppercase tracking-tight text-gray-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-gray-500">{item.detail}</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-primary-500 shadow-sm">
                    <item.icon size={18} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section
            title="Stock diario rápido"
            subtitle="Cargá acá lo que hay al empezar el día. Pizzas, hamburguesas y milanesas comparten estos insumos."
            action={
              <button
                onClick={guardarStock}
                disabled={savingStock}
                className="flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50"
              >
                <Save size={16} /> Guardar stock
              </button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(stock.insumos || []).map((item) => (
                <label
                  key={item.id}
                  className="rounded-[18px] border border-gray-100 bg-primary-50 p-4"
                >
                  <span className="block text-xs font-black uppercase text-gray-800">
                    {item.nombre}
                  </span>
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {item.rubro} · {item.unidad}
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={item.stock_actual}
                    onChange={(event) => updateInsumo(item.id, event.target.value)}
                    className="mt-3 h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              ))}
            </div>

            <div className="mt-6 space-y-4">
              {groupedProducts.map(([category, products]) => (
                <div key={category}>
                  <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-gray-400">
                    {category} con stock directo
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {products.map((product) => (
                      <label
                        key={product.id}
                        className="rounded-[18px] border border-gray-100 bg-white p-4"
                      >
                        <span className="block text-xs font-black uppercase text-gray-800">
                          {product.nombre}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={product.stock_directo}
                          onChange={(event) => updateProducto(product.id, event.target.value)}
                          className="mt-3 h-10 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm font-black text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <div className="space-y-6">
            <Section title="Riders del turno" subtitle="Estado rápido del equipo de reparto.">
              <div className="space-y-3">
                {(arranque.riders || []).length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-400">
                    No hay riders activos.
                  </div>
                ) : (
                  arranque.riders.map((rider) => (
                    <div
                      key={rider.id}
                      className="flex items-center justify-between gap-3 rounded-[18px] border border-gray-100 bg-primary-50 p-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">{rider.nombre}</p>
                        <p className="mt-1 text-[11px] font-semibold text-gray-500">
                          {rider.telefono || 'Sin teléfono'} · PIN{' '}
                          {rider.codigo_acceso || 'sin clave'}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${Number(rider.disponible) === 1 ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}
                      >
                        {Number(rider.disponible) === 1 ? 'Libre' : 'Ocupado'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </Section>

            <Section
              title="Menú del día de hoy"
              subtitle="Armalo una vez por jornada: activás, cambiás precio/stock y copiás ayer cuando se repite."
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={copiarMenuDiaAnterior}
                    disabled={working === 'menu-dia-copiar' || !menuDia.ultimaFechaDisponible}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-100 px-4 text-[11px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-50"
                  >
                    <Copy size={15} /> Copiar ayer
                  </button>
                  <button
                    onClick={guardarMenuDia}
                    disabled={working === 'menu-dia'}
                    className="inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50"
                  >
                    <Save size={15} /> Guardar hoy
                  </button>
                </div>
              }
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] bg-primary-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                    Activos hoy
                  </p>
                  <p className="mt-2 text-2xl font-black text-gray-900">{menuDiaActivos.length}</p>
                </div>
                <div className="rounded-[18px] bg-primary-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                    Fecha
                  </p>
                  <p className="mt-2 text-sm font-black text-gray-900">{menuDia.fecha || '-'}</p>
                </div>
                <div className="rounded-[18px] bg-primary-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
                    Último guardado
                  </p>
                  <p className="mt-2 text-sm font-black text-gray-900">
                    {menuDia.ultimaFechaDisponible || 'Sin historial'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                {(menuDia.items || []).length === 0 ? (
                  <div className="rounded-[20px] border border-dashed border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-400">
                    No hay una biblioteca de platos para menú del día todavía.
                  </div>
                ) : (
                  (menuDia.items || []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[20px] border border-gray-100 bg-white p-4"
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-black text-gray-900">{item.nombre}</p>
                              <span
                                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${Number(item.disponible_hoy) === 1 ? 'bg-success-100 text-success-700' : 'bg-slate-100 text-slate-500'}`}
                              >
                                {Number(item.disponible_hoy) === 1 ? 'Sale hoy' : 'Guardado'}
                              </span>
                              {Number(item.destacado_hoy) === 1 ? (
                                <span className="rounded-full bg-warning-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-warning-700">
                                  Destacado
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-gray-500">
                              {item.variantes && item.variantes !== '[]'
                                ? 'Tiene opciones configuradas'
                                : 'Plato directo'}
                            </p>
                          </div>
                          <label className="inline-flex items-center gap-2 rounded-2xl bg-primary-50 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-gray-600">
                            <input
                              type="checkbox"
                              checked={Number(item.disponible_hoy) === 1}
                              onChange={(event) =>
                                updateMenuDiaItem(
                                  item.id,
                                  'disponible_hoy',
                                  event.target.checked ? 1 : 0
                                )
                              }
                            />
                            Sale hoy
                          </label>
                        </div>

                        <div className="inline-flex w-fit rounded-2xl border border-gray-200 bg-gray-50 p-1">
                          <button
                            type="button"
                            onClick={() => updateMenuDiaTipo(item.id, 'economico')}
                            className={`h-9 rounded-xl px-4 text-[11px] font-black uppercase tracking-widest transition ${item.tipo_hoy !== 'ejecutivo' ? 'bg-white text-primary-500 shadow-sm' : 'text-gray-400'}`}
                          >
                            Económico
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMenuDiaTipo(item.id, 'ejecutivo')}
                            className={`h-9 rounded-xl px-4 text-[11px] font-black uppercase tracking-widest transition ${item.tipo_hoy === 'ejecutivo' ? 'bg-white text-primary-500 shadow-sm' : 'text-gray-400'}`}
                          >
                            Ejecutivo
                          </button>
                        </div>

                        <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
                          <label className="rounded-[18px] bg-primary-50 p-3">
                            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                              Precio
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={item.precio_hoy}
                              onChange={(event) =>
                                updateMenuDiaItem(item.id, 'precio_hoy', event.target.value)
                              }
                              className="mt-2 h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm font-black text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                            />
                          </label>
                          <label className="rounded-[18px] bg-primary-50 p-3">
                            <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                              Stock hoy
                            </span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.stock_hoy}
                              onChange={(event) =>
                                updateMenuDiaItem(item.id, 'stock_hoy', event.target.value)
                              }
                              className="mt-2 h-10 w-full rounded-2xl border border-gray-200 bg-white px-3 text-sm font-black text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                            />
                          </label>
                          <label className="flex items-center gap-2 rounded-[18px] bg-primary-50 p-3 text-[10px] font-black uppercase tracking-wider text-gray-600">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0"
                              checked={Number(item.destacado_hoy) === 1}
                              onChange={(event) =>
                                updateMenuDiaItem(
                                  item.id,
                                  'destacado_hoy',
                                  event.target.checked ? 1 : 0
                                )
                              }
                            />
                            <span className="leading-tight">Destacado</span>
                          </label>
                          <label className="flex items-center gap-2 rounded-[18px] bg-warning-50 p-3 text-[10px] font-black uppercase tracking-wider text-warning-700">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0"
                              checked={Number(item.promo_hoy) === 1}
                              onChange={(event) =>
                                updateMenuDiaItem(
                                  item.id,
                                  'promo_hoy',
                                  event.target.checked ? 1 : 0
                                )
                              }
                            />
                            <span className="leading-tight">+ Jugo y postre $1.000</span>
                          </label>
                        </div>

                        <label className="rounded-[18px] bg-primary-50 p-3">
                          <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                            Descripción del día
                          </span>
                          <textarea
                            rows={2}
                            value={item.descripcion_hoy || ''}
                            onChange={(event) =>
                              updateMenuDiaItem(item.id, 'descripcion_hoy', event.target.value)
                            }
                            className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                          />
                        </label>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-5 rounded-[20px] border border-dashed border-gray-200 bg-primary-50 p-4">
                <p className="text-sm font-black uppercase tracking-tight text-gray-900">
                  Agregar plato eventual
                </p>
                <p className="mt-1 text-xs font-semibold text-gray-500">
                  Para cuando aparece algo nuevo solo por hoy o por unos días.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <input
                    value={menuDiaNuevo.nombre}
                    onChange={(event) =>
                      setMenuDiaNuevo((prev) => ({ ...prev, nombre: event.target.value }))
                    }
                    placeholder="Nombre del plato"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <select
                    value={menuDiaNuevo.tipo}
                    onChange={(event) => {
                      const tipo = event.target.value;
                      const precioSugerido = menuDia.precioSugerido?.[tipo];
                      setMenuDiaNuevo((prev) => ({
                        ...prev,
                        tipo,
                        precio: precioSugerido ?? prev.precio,
                      }));
                    }}
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="economico">Económico</option>
                    <option value="ejecutivo">Ejecutivo</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={menuDiaNuevo.precio}
                    onChange={(event) =>
                      setMenuDiaNuevo((prev) => ({ ...prev, precio: event.target.value }))
                    }
                    placeholder="Precio"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={menuDiaNuevo.stock_directo}
                    onChange={(event) =>
                      setMenuDiaNuevo((prev) => ({ ...prev, stock_directo: event.target.value }))
                    }
                    placeholder="Stock"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={menuDiaNuevo.tiempo_preparacion}
                    onChange={(event) =>
                      setMenuDiaNuevo((prev) => ({
                        ...prev,
                        tiempo_preparacion: event.target.value,
                      }))
                    }
                    placeholder="Tiempo"
                    className="h-11 rounded-2xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <textarea
                    rows={2}
                    value={menuDiaNuevo.descripcion}
                    onChange={(event) =>
                      setMenuDiaNuevo((prev) => ({ ...prev, descripcion: event.target.value }))
                    }
                    placeholder="Descripción"
                    className="md:col-span-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-blue-100"
                  />
                  <label className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-gray-600 md:col-span-2">
                    <input
                      type="checkbox"
                      checked={Number(menuDiaNuevo.promo) === 1}
                      onChange={(event) =>
                        setMenuDiaNuevo((prev) => ({
                          ...prev,
                          promo: event.target.checked ? 1 : 0,
                        }))
                      }
                    />
                    Incluir promo + Jugo y postre ($1.000 extra)
                  </label>
                </div>
                <button
                  onClick={crearProductoMenuDia}
                  disabled={
                    working === 'menu-dia-nuevo' || !String(menuDiaNuevo.nombre || '').trim()
                  }
                  className="mt-4 inline-flex h-11 items-center gap-2 rounded-2xl bg-primary-500 px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50"
                >
                  <Plus size={15} /> Crear y sumar hoy
                </button>
              </div>
            </Section>

            <Section title="Cierre diario" subtitle="Resumen operativo de hoy.">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">Digitales</span>
                  <strong>{fmt(cierre.digitales)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">Gastos</span>
                  <strong>{fmt(cierre.gastos)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold text-gray-500">Pago delivery diario</span>
                  <strong>{fmt(cierre.deliveryDiario)}</strong>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-3">
                  <span className="font-black text-gray-900">Ticket promedio</span>
                  <strong>{fmt(cierre.ticketPromedio)}</strong>
                </div>
              </div>
              <Link
                to="/admin/reportes"
                className="mt-5 flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary-500 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100"
              >
                <FileText size={16} /> Ver reportes
              </Link>
            </Section>

            <Section title="Acciones rápidas" subtitle="Herramientas para mantenimiento diario.">
              <div className="grid gap-3">
                <button
                  onClick={crearBackup}
                  disabled={working === 'backup'}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary-50 text-xs font-black uppercase tracking-widest text-primary-500 disabled:opacity-50"
                >
                  <Archive size={16} /> Crear backup ahora
                </button>
                <button
                  onClick={sincronizarClientes}
                  disabled={working === 'clientes'}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-success-50 text-xs font-black uppercase tracking-widest text-success-700 disabled:opacity-50"
                >
                  <Users size={16} /> Sincronizar clientes
                </button>
                <button
                  onClick={sincronizarBasesCompartidas}
                  disabled={working === 'bases'}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary-50 text-xs font-black uppercase tracking-widest text-primary-500 disabled:opacity-50"
                >
                  <PackageCheck size={16} /> Sincronizar bases
                </button>
                <Link
                  to="/admin/delivery"
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-orange-50 text-xs font-black uppercase tracking-widest text-orange-700"
                >
                  <Bike size={16} /> Revisar delivery
                </Link>
                <Link
                  to="/admin/configuracion"
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 text-xs font-black uppercase tracking-widest text-slate-700"
                >
                  <Printer size={16} /> Ajustar impresión
                </Link>
              </div>
            </Section>

            <Section title="Backups" subtitle="Últimas copias de seguridad.">
              <div className="space-y-2">
                {(data?.backups || []).length ? (
                  data.backups.map((backup) => (
                    <div key={backup.file} className="rounded-2xl bg-primary-50 px-4 py-3">
                      <p className="truncate text-xs font-black text-gray-800">{backup.file}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                        {new Date(backup.created_at).toLocaleString('es-AR')}
                      </p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-6 text-center text-xs font-bold text-gray-400">
                    Sin backups todavía
                  </div>
                )}
              </div>
            </Section>
          </div>
        </div>

        <Section title="Guía de uso" subtitle="Qué cubre cada punto en el día a día.">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Inventario fino', 'Las recetas descuentan insumos compartidos en cada pedido.'],
              ['Stock diario', 'Cargás cantidades reales antes de vender.'],
              ['Cierre', 'Ves ventas, pagos, gastos y delivery diario.'],
              ['Online', 'El menú público respeta productos sin stock.'],
              ['Delivery', 'Cristian trabaja con clave rider y pedidos asignados.'],
              ['Clientes', 'Se recalculan compras, puntos e historial.'],
              ['Backups', 'Hay copia automática y backup manual.'],
              ['Impresión', 'Comanda, ticket y delivery se ajustan desde configuración.'],
            ].map(([title, text]) => (
              <div key={title} className="rounded-[18px] bg-primary-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-primary-500">
                  <ShieldCheck size={16} />
                  <p className="text-xs font-black uppercase">{title}</p>
                </div>
                <p className="text-xs font-semibold leading-relaxed text-gray-500">{text}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

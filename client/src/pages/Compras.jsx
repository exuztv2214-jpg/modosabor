import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Calendar,
  ChevronRight,
  Download,
  Package,
  Plus,
  Search,
  Truck,
  Wallet,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';
import { Stat as StatCard } from './Clientes/clientesUi.jsx';
import NuevaCompraModal from '../components/Compras/NuevaCompraModal.jsx';

const fmtMoney = (v) => `$${Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 0 })}`;

const METODO_LABEL = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cuenta_corriente: 'Cuenta corriente',
  otro: 'Otro',
};

// Se entrecomillaban sólo dos columnas y sin escapar las comillas internas.
const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
};
const normalizeText = (v) =>
  String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

function ModalDetalle({ compra, onClose }) {
  if (!compra) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Compra #{compra.id}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{fmtDate(compra.creado_en)}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Info cabecera */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Proveedor', value: compra.proveedor || 'Sin especificar' },
              { label: 'Método de pago', value: compra.metodo_pago || '-' },
              { label: 'Total', value: fmtMoney(compra.total) },
              { label: 'Registró', value: compra.actor_nombre || '-' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 px-4 py-3">
                <p className="text-[10px] font-semibold text-gray-400">{item.label}</p>
                <p className="mt-1 text-sm font-bold text-gray-800 truncate">{item.value}</p>
              </div>
            ))}
          </div>

          {compra.referencia_pago && (
            <div className="rounded-2xl bg-brand-50 px-4 py-3">
              <p className="text-[10px] font-semibold text-brand-400">Referencia de pago</p>
              <p className="mt-1 text-sm font-bold text-brand-800">{compra.referencia_pago}</p>
            </div>
          )}

          {compra.notas && (
            <div className="rounded-2xl bg-amber-50 px-4 py-3">
              <p className="text-[10px] font-semibold text-amber-500">Notas</p>
              <p className="mt-1 text-sm text-amber-800">{compra.notas}</p>
            </div>
          )}

          {/* Items */}
          <div>
            <p className="mb-3 text-[10px] font-semibold text-gray-400">
              Insumos ({(compra.items || []).length})
            </p>
            <div className="space-y-2">
              {(compra.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-800 truncate">{item.insumo_nombre}</p>
                    <p className="text-xs text-gray-500">
                      {Number(item.cantidad || 0).toLocaleString('es-AR')} {item.unidad} ×{' '}
                      {fmtMoney(item.costo_unitario)}
                    </p>
                  </div>
                  <p className="ml-4 text-sm font-semibold text-gray-900">
                    {fmtMoney(item.subtotal)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
          <p className="text-sm text-gray-500">{(compra.items || []).length} ítems</p>
          <p className="text-lg font-semibold text-gray-900">Total: {fmtMoney(compra.total)}</p>
        </div>
      </div>
    </div>
  );
}

/*
  El alta de compra se mudó a `components/Compras/NuevaCompraModal.jsx`.
  Estaba escrita dos veces —acá y en Inventario— con implementaciones
  distintas: la de allá mutaba el estado y no mostraba el total. Ahora las dos
  pantallas usan la misma, y abrirla desde Inventario precarga los faltantes.
*/
export default function Compras() {
  const [compras, setCompras] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [modalNueva, setModalNueva] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const [comprasData, insumosData] = await Promise.all([
        api.get('/compras'),
        api.get('/inventario/insumos'),
      ]);
      setCompras(Array.isArray(comprasData) ? comprasData : []);
      setInsumos(Array.isArray(insumosData) ? insumosData : []);
    } catch (error) {
      toast.error(error?.error || 'Error al cargar compras');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const verDetalle = async (id) => {
    setDetalleId(id);
    setDetalle(null);
    setLoadingDetalle(true);
    try {
      const data = await api.get(`/compras/${id}`);
      setDetalle(data);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el detalle');
      setDetalleId(null);
    } finally {
      setLoadingDetalle(false);
    }
  };

  const closeDetalle = () => {
    setDetalleId(null);
    setDetalle(null);
  };

  const comprasFiltradas = useMemo(() => {
    let result = compras;
    if (busqueda.trim()) {
      const term = normalizeText(busqueda);
      result = result.filter(
        (c) =>
          normalizeText(c.proveedor).includes(term) ||
          normalizeText(c.metodo_pago).includes(term) ||
          normalizeText(c.actor_nombre).includes(term) ||
          String(c.id).includes(term)
      );
    }
    if (fechaDesde) {
      const desde = new Date(fechaDesde + 'T00:00:00');
      result = result.filter((c) => new Date(c.creado_en) >= desde);
    }
    if (fechaHasta) {
      const hasta = new Date(fechaHasta + 'T23:59:59');
      result = result.filter((c) => new Date(c.creado_en) <= hasta);
    }
    return result;
  }, [compras, busqueda, fechaDesde, fechaHasta]);

  const proveedoresList = useMemo(
    () => [...new Set(compras.map((c) => c.proveedor).filter(Boolean))].sort(),
    [compras]
  );

  /**
   * Las tarjetas de arriba se calculaban sobre `compras` —todo el historial—
   * mientras la tabla mostraba `comprasFiltradas`. Filtrabas por un rango de
   * fechas, la lista cambiaba y los números de arriba seguían iguales.
   *
   * Además "Gastado total" era la suma de todas las compras desde que existe
   * el negocio: un número enorme que no sirve para decidir nada. Ahora los
   * totales acompañan al filtro y se suma aparte lo que quedó a pagar.
   */
  const stats = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const gastadoEnVista = comprasFiltradas.reduce((acc, c) => acc + Number(c.total || 0), 0);
    const comprasHoy = compras.filter((c) => new Date(c.creado_en) >= hoy);
    const gastadoHoy = comprasHoy.reduce((acc, c) => acc + Number(c.total || 0), 0);

    // `cuenta_corriente` significa que la mercadería entró pero todavía no se
    // pagó. Era el único método sin ninguna lectura en pantalla.
    const aPagar = comprasFiltradas
      .filter((c) => String(c.metodo_pago || '') === 'cuenta_corriente')
      .reduce((acc, c) => acc + Number(c.total || 0), 0);

    return {
      enVista: comprasFiltradas.length,
      gastadoEnVista,
      comprasHoy: comprasHoy.length,
      gastadoHoy,
      aPagar,
      proveedoresUnicos: proveedoresList.length,
    };
  }, [compras, comprasFiltradas, proveedoresList]);

  const exportarComprasCSV = () => {
    if (!comprasFiltradas.length) return toast.error('No hay compras para exportar');
    const headers = ['ID', 'Fecha', 'Proveedor', 'Método de pago', 'Total', 'Registró'];
    const rows = comprasFiltradas.map((c) => [
      c.id,
      fmtDate(c.creado_en),
      c.proveedor || 'Sin especificar',
      METODO_LABEL[c.metodo_pago] || c.metodo_pago || '',
      Number(c.total || 0).toFixed(2),
      c.actor_nombre || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compras_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${comprasFiltradas.length} compras exportadas`);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  const hayFiltros = Boolean(busqueda.trim() || fechaDesde || fechaHasta);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        {/*
          El encabezado era `sticky top-[65px]`: tenía cableada la altura del
          topbar. Ese topbar cambiaba entre 80px y 65px al hacer scroll, así
          que la barra quedaba flotando a destiempo. Ahora acompaña la página.
        */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Compras</h1>
            <p className="mt-0.5 text-[13px] text-gray-500">
              {compras.length === 0
                ? 'Todavía no hay compras registradas'
                : `${compras.length} compras · ${stats.proveedoresUnicos} proveedores`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModalNueva(true)}
              style={{ background: BRAND }}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <Plus size={16} strokeWidth={STROKE} />
              Nueva compra
            </button>
            <button
              type="button"
              onClick={exportarComprasCSV}
              disabled={!comprasFiltradas.length}
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 disabled:opacity-40"
            >
              <Download size={16} strokeWidth={STROKE} />
              CSV
            </button>
          </div>
        </div>

        {/*
          Las tarjetas se calculaban sobre todo el historial mientras la tabla
          mostraba el filtro: cambiabas el rango de fechas y los números de
          arriba quedaban iguales. Ahora acompañan lo que estás mirando.
        */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label={hayFiltros ? 'Gastado en lo filtrado' : 'Gastado en total'}
            value={fmtMoney(stats.gastadoEnVista)}
            helper={`${stats.enVista} ${stats.enVista === 1 ? 'compra' : 'compras'}`}
            tono="verde"
          />
          <StatCard
            label="Queda a pagar"
            value={fmtMoney(stats.aPagar)}
            helper={stats.aPagar > 0 ? 'Compras en cuenta corriente' : 'Nada pendiente'}
            alerta={stats.aPagar > 0}
          />
          <StatCard
            label="Gastado hoy"
            value={fmtMoney(stats.gastadoHoy)}
            helper={`${stats.comprasHoy} ${stats.comprasHoy === 1 ? 'compra' : 'compras'} hoy`}
            tono="ambar"
          />
          <StatCard
            label="Proveedores"
            value={stats.proveedoresUnicos}
            helper="Distintos en el historial"
            tono="azul"
          />
        </div>

        {/* Buscador y filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por proveedor, método de pago, usuario..."
              className="h-11 w-full rounded-2xl border border-gray-200 bg-white pl-10 pr-4 text-sm font-medium text-gray-700 outline-none transition focus:border-brand-300 focus:ring-4 focus:ring-brand-100 shadow-sm"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 hover:text-gray-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="h-11 bg-transparent text-sm font-medium text-gray-700 outline-none"
              />
            </div>
            <span className="text-xs font-bold text-gray-400">—</span>
            <div className="flex items-center gap-1 rounded-2xl border border-gray-200 bg-white px-3 shadow-sm">
              <Calendar size={14} className="text-gray-400 shrink-0" />
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="h-11 bg-transparent text-sm font-medium text-gray-700 outline-none"
              />
            </div>
            {(fechaDesde || fechaHasta) && (
              <button
                onClick={() => {
                  setFechaDesde('');
                  setFechaHasta('');
                }}
                className="rounded-xl p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Limpiar fechas"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Lista */}
        <div className="rounded-[24px] border border-gray-100 bg-white shadow-sm overflow-hidden">
          {comprasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
                <Package size={28} className="text-gray-400" />
              </div>
              <p className="text-sm font-semibold text-gray-400">
                {busqueda ? 'Sin resultados' : 'Sin compras registradas'}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                {busqueda
                  ? `No hay compras que coincidan con "${busqueda}"`
                  : 'Registrá la primera compra para actualizar el stock.'}
              </p>
              {!busqueda && (
                <button
                  onClick={() => setModalNueva(true)}
                  className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-200 hover:bg-brand-600 transition-all"
                >
                  <Plus size={16} />
                  Registrar primera compra
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {/* Header tabla */}
              <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 px-6 py-3 bg-gray-50/80">
                {['Proveedor', 'Método', 'Total', 'Registró', 'Fecha', ''].map((h) => (
                  <p key={h} className="text-[10px] font-semibold text-gray-400">
                    {h}
                  </p>
                ))}
              </div>

              {comprasFiltradas.map((compra) => (
                <button
                  key={compra.id}
                  onClick={() => verDetalle(compra.id)}
                  className="w-full text-left px-6 py-4 hover:bg-brand-50/30 transition-colors group"
                >
                  {/* Mobile */}
                  <div className="md:hidden flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                        <Truck size={18} className="text-brand-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {compra.proveedor || 'Sin proveedor'}{' '}
                          <span className="text-gray-400 font-medium">#{compra.id}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {compra.metodo_pago} · {fmtDate(compra.creado_en)}
                        </p>
                        <p className="text-xs text-gray-400">{compra.actor_nombre}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {fmtMoney(compra.total)}
                      </p>
                      <ChevronRight
                        size={16}
                        className="text-gray-400 group-hover:text-brand-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Desktop */}
                  <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-4 items-center">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                        <Truck size={16} className="text-brand-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">
                          {compra.proveedor || 'Sin proveedor'}
                        </p>
                        <p className="text-xs text-gray-400">#{compra.id}</p>
                      </div>
                    </div>
                    <div>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 capitalize">
                        <Wallet size={12} />
                        {compra.metodo_pago?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">{fmtMoney(compra.total)}</p>
                    <p className="text-sm text-gray-600 truncate">{compra.actor_nombre || '-'}</p>
                    <p className="text-xs text-gray-500">{fmtDate(compra.creado_en)}</p>
                    <ChevronRight
                      size={16}
                      className="text-gray-300 group-hover:text-brand-500 transition-colors"
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {comprasFiltradas.length > 0 && (
          <p className="text-center text-xs text-gray-400">
            Mostrando {comprasFiltradas.length} de {compras.length} compras (últimas 100)
          </p>
        )}
      </div>

      {/* Modal detalle */}
      {detalleId &&
        (loadingDetalle ? (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent"></div>
          </div>
        ) : (
          <ModalDetalle compra={detalle} onClose={closeDetalle} />
        ))}

      {/* Modal nueva compra */}
      {modalNueva && (
        <NuevaCompraModal
          insumos={insumos}
          proveedores={proveedoresList}
          onClose={() => setModalNueva(false)}
          onSaved={() => {
            setModalNueva(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

import { format, parseISO } from 'date-fns';
import { Download, Filter, Package, Search, X } from 'lucide-react';

import { fmtMoney } from '../../lib/formatters.js';
import { BRAND, estadoTono, STROKE } from '../../lib/theme.js';
import { paymentMethodLabel } from '../../lib/paymentStatus.js';
import { HIST_ESTADOS, HIST_TIPOS, TIPO_LABELS } from './constants.js';

const campo =
  'h-10 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-700 outline-none transition focus:border-gray-300';

/**
 * Historial de pedidos: filtros, búsqueda, tabla y export.
 *
 * La búsqueda por texto y el filtro de tipo se resuelven en el cliente
 * sobre el resultado ya traído. Para el volumen de un local es lo más
 * rápido: evita un viaje al servidor por cada letra que se tipea. El
 * rango de fechas y el estado sí van al backend, porque son los que
 * acotan de verdad el conjunto.
 */
export default function HistorialPanel({
  filtros,
  onFiltrosChange,
  busqueda,
  onBusquedaChange,
  pedidos,
  loading,
  page,
  onVerMas,
  onAplicar,
  onExportar,
  onAbrirPedido,
}) {
  return (
    <div className="space-y-3">
      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-end gap-2.5 rounded-2xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-400">Desde</span>
          <input
            type="date"
            value={filtros.desde}
            onChange={(event) => onFiltrosChange({ ...filtros, desde: event.target.value })}
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-400">Hasta</span>
          <input
            type="date"
            value={filtros.hasta}
            onChange={(event) => onFiltrosChange({ ...filtros, hasta: event.target.value })}
            className={campo}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-400">Estado</span>
          <select
            value={filtros.estado}
            onChange={(event) => onFiltrosChange({ ...filtros, estado: event.target.value })}
            className={campo}
          >
            {HIST_ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado ? estadoTono(estado).label : 'Todos los estados'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-400">Tipo</span>
          <select
            value={filtros.tipo}
            onChange={(event) => onFiltrosChange({ ...filtros, tipo: event.target.value })}
            className={campo}
          >
            {HIST_TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {tipo ? TIPO_LABELS[tipo] : 'Todos los tipos'}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onAplicar}
          disabled={loading}
          style={{ background: BRAND }}
          className="flex h-10 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition disabled:opacity-50"
        >
          <Filter size={14} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Buscando…' : 'Aplicar'}
        </button>
        <button
          type="button"
          onClick={onExportar}
          disabled={!pedidos.length}
          title="Exportar a CSV"
          className="flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200 disabled:opacity-40"
        >
          <Download size={14} strokeWidth={STROKE} />
          CSV
        </button>
      </div>

      {/* ── Búsqueda ── */}
      <div className="relative">
        <Search
          size={15}
          strokeWidth={STROKE}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="text"
          value={busqueda}
          onChange={(event) => onBusquedaChange(event.target.value)}
          placeholder="Buscar por cliente, número de pedido o teléfono…"
          className="h-11 w-full rounded-xl border border-transparent bg-white pl-11 pr-10 text-[13px] font-medium text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] outline-none transition focus:border-gray-200"
        />
        {busqueda ? (
          <button
            type="button"
            onClick={() => onBusquedaChange('')}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-400 transition hover:text-gray-700"
          >
            <X size={14} strokeWidth={STROKE} />
          </button>
        ) : null}
      </div>

      {/* ── Tabla ── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {loading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-11 animate-pulse rounded-lg bg-gray-50" />
            ))}
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Package size={36} strokeWidth={1.4} className="mb-3 text-gray-200" />
            <p className="text-[13px] font-medium text-gray-400">Sin pedidos en ese rango</p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[70px_110px_1fr_90px_110px_120px_100px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-2.5 md:grid">
              {['#', 'Fecha', 'Cliente', 'Tipo', 'Estado', 'Método', 'Total'].map((titulo) => (
                <p key={titulo} className="text-[11px] font-medium text-gray-400">
                  {titulo}
                </p>
              ))}
            </div>
            <div className="divide-y divide-gray-50">
              {pedidos.slice(0, page).map((pedido) => {
                const tono = estadoTono(pedido.estado);
                return (
                  <button
                    key={pedido.id}
                    type="button"
                    onClick={() => onAbrirPedido(pedido)}
                    className="grid w-full grid-cols-[70px_110px_1fr_90px_110px_120px_100px] items-center gap-4 px-5 py-2.5 text-left transition hover:bg-gray-50"
                  >
                    <span
                      className="text-[13px] font-semibold tabular-nums"
                      style={{ color: BRAND }}
                    >
                      #{pedido.numero}
                    </span>
                    <span className="text-[12px] tabular-nums text-gray-500">
                      {pedido.creado_en
                        ? format(
                            parseISO(String(pedido.creado_en).replace(' ', 'T')),
                            'dd/MM HH:mm'
                          )
                        : '—'}
                    </span>
                    <span className="truncate text-[13px] font-medium text-gray-800">
                      {pedido.cliente_nombre || 'Consumidor final'}
                    </span>
                    <span className="text-[12px] text-gray-500">
                      {TIPO_LABELS[pedido.tipo_entrega] || pedido.tipo_entrega}
                    </span>
                    <span
                      className="justify-self-start rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: tono.bg, color: tono.fg }}
                    >
                      {tono.label}
                    </span>
                    <span className="truncate text-[12px] text-gray-500">
                      {paymentMethodLabel(pedido.metodo_pago)}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-gray-900">
                      {fmtMoney(pedido.total)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-5 py-3">
              <p className="text-[12px] text-gray-400">
                Mostrando {Math.min(page, pedidos.length)} de {pedidos.length}
              </p>
              {pedidos.length > page ? (
                <button
                  type="button"
                  onClick={onVerMas}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-200"
                >
                  Ver más ({pedidos.length - page} restantes)
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

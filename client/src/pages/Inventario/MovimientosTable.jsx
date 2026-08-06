import { Download, X } from 'lucide-react';

import { STROKE } from '../../lib/theme.js';
import { parseFechaServidor } from '../../lib/fechas.js';
import { MOVIMIENTOS_LIMIT } from './constants';

const VERDE = '#047857';
const ROJO = '#DC1F2D';

function fmtFecha(value) {
  if (!value) return '';
  // Fecha del movimiento: viene en UTC sin marcar. Ver lib/fechas.js.
  const parsed = parseFechaServidor(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MovimientosTable({
  movFiltrados,
  movimientosCount,
  historialTruncado,
  movFechaDesde,
  movFechaHasta,
  onSetMovFechaDesde,
  onSetMovFechaHasta,
  onExportarHistorialMovimientosCSV,
}) {
  const hayFiltro = Boolean(movFechaDesde || movFechaHasta);
  const truncado = historialTruncado ?? movimientosCount >= MOVIMIENTOS_LIMIT;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">Movimientos</h3>
          <p className="mt-0.5 text-[12px] text-gray-500">Entradas y salidas de stock</p>
        </div>
        <button
          type="button"
          onClick={onExportarHistorialMovimientosCSV}
          title="Exportar CSV"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
        >
          <Download size={15} strokeWidth={STROKE} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[11px] text-gray-500">Desde</label>
          <input
            type="date"
            value={movFechaDesde}
            onChange={(e) => onSetMovFechaDesde(e.target.value)}
            className="mt-1 h-9 w-full rounded-xl border border-gray-200 bg-white px-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500">Hasta</label>
          <input
            type="date"
            value={movFechaHasta}
            onChange={(e) => onSetMovFechaHasta(e.target.value)}
            className="mt-1 h-9 w-full rounded-xl border border-gray-200 bg-white px-2 text-[13px] text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
          />
        </div>
      </div>

      {hayFiltro ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[12px] text-gray-500">
            {movFiltrados.length} {movFiltrados.length === 1 ? 'movimiento' : 'movimientos'}
          </span>
          <button
            type="button"
            onClick={() => {
              onSetMovFechaDesde('');
              onSetMovFechaHasta('');
            }}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
          >
            <X size={12} strokeWidth={STROKE} />
            Limpiar
          </button>
        </div>
      ) : null}

      {/*
        El filtro de fechas trabaja sobre lo que ya está cargado en pantalla,
        no sobre toda la base. Buscar un rango viejo devolvía vacío sin
        explicar por qué. Ahora se dice cuando el historial está cortado.
      */}
      {truncado ? (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-900">
          Se cargaron los últimos {MOVIMIENTOS_LIMIT} movimientos. Un rango de fechas más viejo
          puede aparecer vacío aunque haya datos.
        </p>
      ) : null}

      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {movFiltrados.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-gray-400">
            {hayFiltro ? 'Sin movimientos en ese rango' : 'Todavía no hay movimientos'}
          </p>
        ) : (
          movFiltrados.map((m) => {
            const entra = Number(m.cantidad) > 0;
            return (
              <div key={m.id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
                <span
                  className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums"
                  style={
                    entra
                      ? { background: '#E7F5EF', color: VERDE }
                      : { background: '#FEF2F2', color: ROJO }
                  }
                >
                  {entra ? '+' : ''}
                  {m.cantidad}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-gray-900">
                    {m.insumo_nombre || m.producto_nombre || 'Sin nombre'}
                  </p>
                  {/* La fecha no se mostraba en ningún lado: era un historial
                      sin fechas, sólo un orden implícito. */}
                  <p className="truncate text-[11px] text-gray-400">
                    {fmtFecha(m.creado_en)}
                    {m.motivo || m.tipo ? ` · ${m.motivo || m.tipo}` : ''}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

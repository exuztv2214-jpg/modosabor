import { useState } from 'react';
import { Bookmark, Clock, MessageSquare, Percent, Receipt, Trash2 } from 'lucide-react';

import { fmt, Popover, SectionLabel, STROKE, UtilityButton } from './tpvUi.jsx';
import { paymentBrand } from './paymentBrands.jsx';

const QUICK_NOTES = [
  'Sin cebolla',
  'Llamar al llegar',
  'Cobrar con cambio',
  'Cliente retira',
  'Enviar servilletas',
  'Sin picante',
];

/**
 * Barra de utilidades del TPV.
 *
 * Reemplaza cinco bloques que antes vivían desplegados en la columna
 * (venta en espera, notas, descuento, horario y última venta) por cinco
 * íconos de 44px con badge. La información que el operador necesitaba
 * de un vistazo — cuántos pedidos hay guardados, si hay descuento, si
 * hay horario cargado — sigue visible en el badge; el detalle se abre
 * al tocar.
 *
 * El panel se ancla a la barra completa y no a cada botón: la columna
 * mide 380px y un popover colgado del cuarto ícono se saldría de la
 * pantalla. Como consecuencia sólo puede haber uno abierto a la vez,
 * que además es lo que uno quiere: son opciones excluyentes.
 */
export default function TpvUtilityBar({
  // Venta en espera
  parkedOrders = [],
  parkedLabel,
  onParkedLabelChange,
  onParkCurrent,
  onRestoreParked,
  onDuplicateParked,
  onDeleteParked,
  hasItems,
  // Notas
  notas,
  onNotasChange,
  // Descuento
  descuento,
  descuentoTipo,
  descuentoAplicado,
  onDescuentoChange,
  onDescuentoTipoChange,
  // Horario
  programarHora,
  horaEntrega,
  onToggleProgramarHora,
  onHoraEntregaChange,
  permiteHorario = true,
  // Última venta
  lastSale,
  onRepeatLastSale,
  onReprintLastSale,
  onOpenPedidos,
}) {
  const [abierto, setAbierto] = useState(null);
  const toggle = (key) => setAbierto((previo) => (previo === key ? null : key));
  const cerrar = () => setAbierto(null);

  const notasCargadas = String(notas || '').trim().length > 0;

  return (
    <div className="relative flex gap-2">
      <UtilityButton
        icon={Bookmark}
        label="Ventas en espera"
        badge={parkedOrders.length}
        active={abierto === 'espera'}
        onClick={() => toggle('espera')}
      />
      <UtilityButton
        icon={MessageSquare}
        label="Notas del pedido"
        badge={notasCargadas ? '·' : null}
        active={abierto === 'notas'}
        onClick={() => toggle('notas')}
      />
      <UtilityButton
        icon={Percent}
        label="Descuento"
        badge={descuentoAplicado > 0 ? '·' : null}
        active={abierto === 'descuento'}
        onClick={() => toggle('descuento')}
      />
      {permiteHorario ? (
        <UtilityButton
          icon={Clock}
          label="Horario de entrega"
          badge={programarHora && horaEntrega ? horaEntrega.slice(0, 5) : null}
          active={abierto === 'hora'}
          onClick={() => toggle('hora')}
        />
      ) : null}
      <UtilityButton
        icon={Receipt}
        label="Última venta"
        badge={lastSale ? `#${lastSale.numero}` : null}
        active={abierto === 'ultima'}
        onClick={() => toggle('ultima')}
      />

      {/* ── Panel único, ancho de la barra ── */}
      <Popover open={Boolean(abierto)} onClose={cerrar} className="!w-full">
        {abierto === 'espera' ? (
          <>
            <SectionLabel className="mb-3">Venta en espera</SectionLabel>
            <input
              type="text"
              value={parkedLabel}
              onChange={(event) => onParkedLabelChange(event.target.value)}
              placeholder="Mesa 4 parcial, cliente vuelve..."
              className="h-11 w-full rounded-xl border-none bg-gray-50 px-3 text-sm font-bold text-gray-700 focus:bg-white"
            />
            <button
              type="button"
              onClick={() => {
                onParkCurrent();
                cerrar();
              }}
              disabled={!hasItems}
              className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-[11px] font-semibold text-white transition disabled:opacity-30"
            >
              <Bookmark size={14} strokeWidth={STROKE} />
              Guardar este pedido
            </button>

            {parkedOrders.length > 0 ? (
              <div className="mt-3 max-h-[240px] space-y-2 overflow-y-auto">
                {parkedOrders.map((item) => (
                  <div key={item.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-700">
                          {item.label}
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-gray-900">
                          {fmt(item.total)}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400">
                          {item.totalItems} item{item.totalItems === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteParked(item.id)}
                        aria-label={`Borrar ${item.label}`}
                        className="shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-white hover:text-rose-500"
                      >
                        <Trash2 size={14} strokeWidth={STROKE} />
                      </button>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreParked(item.id);
                          cerrar();
                        }}
                        className="h-9 flex-1 rounded-lg bg-brand-500 text-[10px] font-semibold text-white"
                      >
                        Abrir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDuplicateParked(item.id);
                          cerrar();
                        }}
                        className="h-9 flex-1 rounded-lg bg-white text-[10px] font-semibold text-slate-600 shadow-sm"
                      >
                        Duplicar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-center text-[11px] font-bold text-gray-400">
                Todavía no guardaste ningún pedido.
              </p>
            )}
          </>
        ) : null}

        {abierto === 'notas' ? (
          <>
            <SectionLabel className="mb-3">Notas para cocina y reparto</SectionLabel>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {QUICK_NOTES.map((quickNote) => (
                <button
                  key={quickNote}
                  type="button"
                  onClick={() =>
                    onNotasChange(
                      notas?.includes(quickNote)
                        ? notas
                        : [notas, quickNote].filter(Boolean).join(' · ')
                    )
                  }
                  className="rounded-full bg-gray-100 px-3 py-1.5 text-[10px] font-medium text-gray-600 transition hover:bg-brand-50 hover:text-brand-600"
                >
                  {quickNote}
                </button>
              ))}
            </div>
            <textarea
              value={notas}
              onChange={(event) => onNotasChange(event.target.value)}
              placeholder="Indicaciones para cocina, caja o reparto"
              rows={3}
              className="w-full rounded-xl border-none bg-gray-50 p-3 text-sm font-bold text-gray-700 focus:bg-white"
            />
            {notasCargadas ? (
              <button
                type="button"
                onClick={() => onNotasChange('')}
                className="mt-2 w-full text-[10px] font-semibold text-rose-500"
              >
                Borrar notas
              </button>
            ) : null}
          </>
        ) : null}

        {abierto === 'descuento' ? (
          <>
            <SectionLabel className="mb-3">Descuento especial</SectionLabel>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDescuentoTipoChange('monto')}
                className={`h-11 w-12 rounded-xl text-sm font-semibold transition ${descuentoTipo === 'monto' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                $
              </button>
              <button
                type="button"
                onClick={() => onDescuentoTipoChange('porcentaje')}
                className={`h-11 w-12 rounded-xl text-sm font-semibold transition ${descuentoTipo === 'porcentaje' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                %
              </button>
              <input
                type="number"
                min="0"
                value={descuento}
                onChange={(event) => onDescuentoChange(event.target.value)}
                placeholder="0"
                className="h-11 min-w-0 flex-1 rounded-xl border-none bg-gray-50 px-3 text-right text-sm font-semibold tabular-nums text-gray-800 focus:bg-white"
              />
            </div>
            {descuentoAplicado > 0 ? (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5">
                <span className="text-[10px] font-semibold text-emerald-600">Se descuenta</span>
                <span className="text-sm font-semibold tabular-nums text-emerald-700">
                  -{fmt(descuentoAplicado)}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {abierto === 'hora' ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SectionLabel>Hora de entrega</SectionLabel>
                <p className="mt-1 text-[11px] font-bold text-gray-400">
                  {programarHora ? 'Pedido para un horario puntual' : 'Sale apenas esté listo'}
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleProgramarHora}
                aria-pressed={programarHora}
                aria-label="Programar horario"
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${programarHora ? 'bg-brand-500' : 'bg-gray-200'}`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${programarHora ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
                />
              </button>
            </div>
            {programarHora ? (
              <input
                type="time"
                value={horaEntrega}
                onChange={(event) => onHoraEntregaChange(event.target.value)}
                className="mt-3 h-12 w-full rounded-xl border border-gray-100 bg-gray-50 px-4 text-base font-semibold tabular-nums text-gray-800 focus:bg-white"
              />
            ) : null}
          </>
        ) : null}

        {abierto === 'ultima' ? (
          <>
            <SectionLabel className="mb-3">Última venta</SectionLabel>
            {lastSale ? (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-semibold text-gray-900">#{lastSale.numero}</span>
                  <span className="text-lg font-semibold tabular-nums text-emerald-600">
                    {fmt(lastSale.total)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(() => {
                    const brand = paymentBrand(lastSale.metodoPago);
                    const BrandIcon = brand.icon;
                    return (
                      <span
                        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                        style={{ background: brand.soft, color: brand.color }}
                      >
                        <BrandIcon size={11} strokeWidth={2.6} />
                        {brand.short}
                      </span>
                    );
                  })()}
                  {[lastSale.tipoEntrega, lastSale.cliente, lastSale.printed ? 'Impreso' : null]
                    .filter(Boolean)
                    .map((chip) => (
                      <span
                        key={chip}
                        className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-semibold text-gray-500"
                      >
                        {chip}
                      </span>
                    ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onRepeatLastSale();
                      cerrar();
                    }}
                    className="h-11 rounded-xl bg-brand-500 text-[10px] font-semibold text-white"
                  >
                    Repetir
                  </button>
                  <button
                    type="button"
                    onClick={onReprintLastSale}
                    className="h-11 rounded-xl bg-gray-100 text-[10px] font-semibold text-gray-600"
                  >
                    Reimprimir
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onOpenPedidos}
                  className="mt-2 w-full text-[10px] font-semibold text-brand-600"
                >
                  Ver todos los pedidos
                </button>
              </>
            ) : (
              <p className="text-center text-[11px] font-bold text-gray-400">
                Todavía no vendiste en este turno.
              </p>
            )}
          </>
        ) : null}
      </Popover>
    </div>
  );
}

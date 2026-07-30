import {
  AlertTriangle,
  Armchair,
  Bike,
  Bookmark,
  CheckCircle2,
  Gift,
  MapPin,
  MessageSquare,
  Minus,
  Plus,
  Receipt,
  ShoppingCart,
  Star,
  Store,
  Trash2,
  UserSearch,
  Wallet,
  X,
} from 'lucide-react';

const fmt = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

const PAYMENT_LABELS = {
  efectivo: 'Efvo',
  mercadopago: 'MP',
  transferencia: 'Transf',
  modo: 'Modo',
  uala: 'Uala',
  mixto: 'Mixto',
};

const DELIVERY_MODES = [
  { value: 'retiro', label: 'Retira', icon: Store },
  { value: 'delivery', label: 'Delivery', icon: Bike },
  { value: 'mesa', label: 'Mesa', icon: Armchair },
];

function SectionLabel({ children }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-gray-400">
      {children}
    </p>
  );
}

function checklistTone(status) {
  if (status === 'ok') {
    return {
      card: 'border-emerald-100 bg-emerald-50',
      icon: 'bg-emerald-100 text-emerald-600',
      text: 'text-emerald-800',
    };
  }
  if (status === 'warn') {
    return {
      card: 'border-amber-100 bg-amber-50',
      icon: 'bg-amber-100 text-amber-600',
      text: 'text-amber-800',
    };
  }
  return {
    card: 'border-rose-100 bg-rose-50',
    icon: 'bg-rose-100 text-rose-600',
    text: 'text-rose-800',
  };
}

export default function TpvSidebar({
  cartItemsRef,
  cartMobileOpen,
  cajaAbierta,
  cliente,
  confirmDisabled,
  deliveryQuote,
  descuento,
  descuentoAplicado,
  descuentoTipo,
  efectivoRecibido,
  envio,
  horaEntrega,
  items,
  lastAddedId,
  loading,
  mesa,
  metodoPago,
  notas,
  onAbrirSelectorClientes,
  onCambiarCantidad,
  onCanjearRecompensa,
  onCerrarCartMobile,
  onClearCliente,
  onClearOrder,
  onConfirm,
  onConfirmPrint,
  onDescuentoChange,
  onDescuentoTipoChange,
  onEfectivoRecibidoChange,
  onHoraEntregaChange,
  onImprimirMesa,
  onMetodoPagoChange,
  onNotasChange,
  onParkCurrent,
  onParkedLabelChange,
  onRestoreParked,
  parkedLabel,
  onDuplicateParked,
  onQuitarItem,
  onReprintLastSale,
  onRepeatLastSale,
  onRepeatClientePedido,
  onRepeatPedidoHistorico,
  onSeleccionarRider,
  onSetCliente,
  onSetMesa,
  onSplitPaymentChange,
  onTipoEntregaChange,
  onUbicacionCliente,
  parkedOrders,
  pagos,
  printingMesa,
  preflightChecklist,
  repartidoresActivos,
  repartidoresDisponibles,
  selectedRiderId,
  sharingLocation,
  splitCashTarget,
  splitPayments,
  splitRemaining,
  subtotal,
  tipoEntrega,
  total,
  totalItems,
  vuelto,
  config,
  onDeleteParked,
  lastSale,
  clienteResumen,
  onOpenPedidos,
  clientesDelDia,
  onQuickPickCliente,
}) {
  return (
    <aside
      className={`fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-gray-100 bg-white shadow-[0_0_40px_rgba(0,0,0,0.02)] transition-transform duration-300 lg:static lg:z-auto lg:w-[380px] lg:translate-x-0 xl:w-[440px] ${cartMobileOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 lg:hidden">
        <h2 className="text-lg font-black uppercase tracking-tight text-gray-900">Tu Pedido</h2>
        <button
          type="button"
          onClick={onCerrarCartMobile}
          className="rounded-xl bg-gray-100 p-2 text-gray-500"
        >
          <X size={20} />
        </button>
      </div>

      <div ref={cartItemsRef} className="no-scrollbar flex-1 overflow-y-auto scroll-smooth">
        <div className="p-4">
          <div className="flex gap-1 rounded-2xl bg-gray-100 p-1.5">
            {DELIVERY_MODES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => onTipoEntregaChange(value)}
                className={`flex-1 rounded-xl py-2.5 text-xs font-black transition-all ${tipoEntrega === value ? 'bg-white text-primary-500 shadow-md shadow-primary-100/50' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon
                    size={14}
                    className={tipoEntrega === value ? 'text-primary-500' : 'text-gray-400'}
                  />
                  {label.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-4">
          <div className="mb-6 rounded-[24px] border border-blue-50 bg-[#F2F6FA] p-5">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel>
                {tipoEntrega === 'mesa' ? 'Asignar Mesa' : 'Datos del Cliente'}
              </SectionLabel>
              {tipoEntrega !== 'mesa' && (cliente.nombre || cliente.telefono) ? (
                <button
                  type="button"
                  onClick={onClearCliente}
                  className="text-[10px] font-black uppercase text-rose-500 hover:text-danger-600"
                >
                  Limpiar
                </button>
              ) : null}
            </div>

            {tipoEntrega === 'mesa' ? (
              <div className="flex gap-2">
                <input
                  value={mesa}
                  onChange={(event) => onSetMesa(event.target.value)}
                  placeholder="N Mesa"
                  className="h-12 flex-1 rounded-xl border-none bg-white px-4 text-sm font-bold shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                />
                <button
                  type="button"
                  onClick={onImprimirMesa}
                  disabled={printingMesa || !String(mesa || '').trim()}
                  className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  <Receipt size={20} />
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    value={cliente.telefono}
                    onChange={(event) => onSetCliente({ ...cliente, telefono: event.target.value })}
                    placeholder="Teléfono"
                    className="h-12 w-full rounded-xl border-none bg-white px-4 text-sm font-bold shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                  />
                  <button
                    type="button"
                    onClick={onAbrirSelectorClientes}
                    className="absolute right-3 top-1/2 rounded-lg p-1.5 text-primary-500 transition-colors hover:bg-primary-50"
                  >
                    <UserSearch size={18} />
                  </button>
                </div>
                <input
                  value={cliente.nombre}
                  onChange={(event) => onSetCliente({ ...cliente, nombre: event.target.value })}
                  placeholder="Nombre completo"
                  className="h-12 w-full rounded-xl border-none bg-white px-4 text-sm font-bold shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                />

                <div className="rounded-2xl border border-white/70 bg-white p-3 shadow-sm">
                  <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    Hora de entrega
                  </p>
                  <input
                    type="time"
                    value={horaEntrega}
                    onChange={(event) => onHoraEntregaChange(event.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 text-sm font-black text-slate-800 shadow-sm outline-none transition focus:border-primary-200 focus:bg-white focus:ring-2 focus:ring-primary-100"
                  />
                </div>

                {cliente.id ? (
                  <div className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                          Tarjeta de fidelidad
                        </p>
                        <p className="mt-1 text-xs font-black text-gray-800">
                          {cliente.codigo_tarjeta || `Cliente #${cliente.id}`}
                        </p>
                      </div>
                      {Number(cliente.recompensas_pendientes || 0) > 0 ? (
                        <button
                          type="button"
                          onClick={onCanjearRecompensa}
                          className="rounded-full bg-success-500 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-md transition hover:bg-emerald-600"
                        >
                          Canjear premio
                        </button>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl bg-primary-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-500">
                          Puntos
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-sm font-black text-primary-500">
                          <Star size={12} /> {Number(cliente.puntos || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-warning-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                          Sellos
                        </p>
                        <p className="mt-1 text-sm font-black text-warning-700">
                          {Number(cliente.sellos_actuales || 0)}
                        </p>
                      </div>
                      <div className="rounded-xl bg-success-50 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500">
                          Premios
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-sm font-black text-success-700">
                          <Gift size={12} /> {Number(cliente.recompensas_pendientes || 0)}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {clienteResumen?.id ? (
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Historial express
                        </p>
                        <p className="mt-1 text-xs font-black text-gray-800">
                          {Number(clienteResumen.total_pedidos || 0)} pedidos ·{' '}
                          {fmt(clienteResumen.total_gastado || 0)}
                        </p>
                      </div>
                      <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">
                        {clienteResumen.nivel || 'Bronce'}
                      </div>
                    </div>
                    {Array.isArray(clienteResumen.pedidos) && clienteResumen.pedidos.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={onRepeatClientePedido}
                            className="rounded-xl bg-primary-50 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary-600"
                          >
                            Repetir último
                          </button>
                        </div>
                        {clienteResumen.pedidos.slice(0, 3).map((pedido) => (
                          <div
                            key={pedido.id}
                            className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-black text-gray-900">#{pedido.numero}</p>
                                <p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                  {pedido.estado} · {pedido.tipo_entrega}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-black text-primary-600">
                                  {fmt(pedido.total)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => onRepeatPedidoHistorico?.(pedido)}
                                className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm transition hover:bg-slate-100"
                              >
                                Repetir
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] font-bold text-slate-400">
                        Este cliente todavía no tiene historial entregado.
                      </div>
                    )}
                  </div>
                ) : null}

                {Array.isArray(clientesDelDia) && clientesDelDia.length > 0 ? (
                  <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Clientes del día
                        </p>
                        <p className="mt-1 text-xs font-bold text-gray-500">
                          Toques rápidos para volver a cargar clientes frecuentes.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {clientesDelDia.map((item, index) => (
                        <button
                          key={`${item.id || item.telefono || item.nombre}-${index}`}
                          type="button"
                          onClick={() => onQuickPickCliente?.(item)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-primary-200 hover:bg-primary-50"
                        >
                          <p className="text-[11px] font-black text-slate-800">{item.nombre}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                            {item.telefono || 'Sin teléfono'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {tipoEntrega === 'delivery' ? (
                  <div className="space-y-4 border-t border-gray-200/50 pt-2">
                    <input
                      value={cliente.direccion}
                      onChange={(event) =>
                        onSetCliente({
                          ...cliente,
                          direccion: event.target.value,
                          latitud: null,
                          longitud: null,
                        })
                      }
                      placeholder="Dirección de entrega"
                      className="h-12 w-full rounded-xl border-none bg-white px-4 text-sm font-bold shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                    />

                    <div className="rounded-2xl border border-gray-50 bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-between">
                        <SectionLabel>Asignar Rider</SectionLabel>
                        {config.delivery_autoasignar_activo === '1' &&
                        !selectedRiderId &&
                        (repartidoresDisponibles.length === 1 ||
                          repartidoresActivos.length === 1) ? (
                          <span className="rounded-md bg-success-50 px-2 py-0.5 text-[9px] font-black uppercase text-success-600">
                            Auto
                          </span>
                        ) : null}
                      </div>
                      <div className="mb-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => onSeleccionarRider('')}
                          className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${!selectedRiderId ? 'bg-primary-500 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}
                        >
                          Sistema
                        </button>
                        {repartidoresActivos.map((repartidor) => (
                          <button
                            key={`chip-${repartidor.id}`}
                            type="button"
                            onClick={() => onSeleccionarRider(String(repartidor.id))}
                            className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${String(selectedRiderId) === String(repartidor.id) ? 'bg-success-500 text-white shadow-md' : Number(repartidor.disponible) === 1 ? 'bg-slate-100 text-slate-600' : 'bg-warning-100 text-warning-700'}`}
                          >
                            {repartidor.nombre}
                            {Number(repartidor.disponible) === 1 ? '' : ' · ocupado'}
                          </button>
                        ))}
                      </div>
                      {repartidoresActivos.length > 0 && repartidoresDisponibles.length === 0 ? (
                        <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-warning-600">
                          No hay riders libres ahora, pero podés fijar uno ocupado si el turno
                          trabaja con un solo reparto.
                        </p>
                      ) : null}
                      <select
                        value={selectedRiderId}
                        onChange={(event) => onSeleccionarRider(event.target.value)}
                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 text-xs font-bold text-gray-700 focus:ring-2 focus:ring-[#5D87FF]/20"
                      >
                        <option value="">Sin fijar / autoasignar</option>
                        {repartidoresActivos.map((repartidor) => (
                          <option key={repartidor.id} value={repartidor.id}>
                            {repartidor.nombre}
                            {Number(repartidor.disponible) === 1 ? '' : ' (ocupado)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={onUbicacionCliente}
                      disabled={sharingLocation}
                      className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${cliente.latitud ? 'bg-success-500 text-white' : 'bg-primary-100 text-blue-700'}`}
                    >
                      <MapPin size={14} />
                      {sharingLocation
                        ? 'Tomando GPS...'
                        : cliente.latitud
                          ? 'GPS vinculado'
                          : 'Guardar ubicación GPS'}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="px-4">
          <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel>Pre-chequeo</SectionLabel>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                {preflightChecklist.filter((item) => item.status === 'block').length} bloqueos
              </span>
            </div>
            <div className="space-y-2">
              {preflightChecklist.map((item) => {
                const tone = checklistTone(item.status);
                return (
                  <div
                    key={item.key}
                    className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${tone.card}`}
                  >
                    <div className={`rounded-xl p-2 ${tone.icon}`}>
                      {item.status === 'ok' ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        <AlertTriangle size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${tone.text}`}
                      >
                        {item.label}
                      </p>
                      <p className="truncate text-xs font-bold text-gray-600">{item.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel>Venta en espera</SectionLabel>
              <button
                type="button"
                onClick={onParkCurrent}
                disabled={items.length === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white disabled:opacity-40"
              >
                <Bookmark size={14} />
                Guardar
              </button>
            </div>
            <input
              type="text"
              value={parkedLabel}
              onChange={(event) => onParkedLabelChange(event.target.value)}
              placeholder="Nombre rapido: Mesa 4 parcial, Cliente vuelve..."
              className="mb-3 h-11 w-full rounded-xl border-none bg-slate-50 px-3 text-sm font-bold text-gray-700 shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
            />
            {parkedOrders.length > 0 ? (
              <div className="space-y-2">
                {parkedOrders.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-gray-100 bg-slate-50 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-black uppercase tracking-[0.16em] text-slate-700">
                          {item.label}
                        </p>
                        <p className="mt-1 text-sm font-black text-gray-900">{fmt(item.total)}</p>
                        <p className="text-[10px] font-bold text-gray-500">
                          {item.totalItems} item{item.totalItems === 1 ? '' : 's'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onRestoreParked(item.id)}
                          className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-primary-600 shadow-sm"
                        >
                          Abrir
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateParked(item.id)}
                          className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 shadow-sm"
                        >
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteParked(item.id)}
                          className="rounded-xl bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-rose-600 shadow-sm"
                        >
                          Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-slate-50 px-4 py-5 text-center text-xs font-bold text-gray-400">
                Aquí aparecen los pedidos guardados para retomar luego.
              </div>
            )}
          </div>

          <div className="mb-6 rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <SectionLabel>Notas rápidas</SectionLabel>
              <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
                Ticket
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                'Sin cebolla',
                'Llamar al llegar',
                'Cobrar con cambio',
                'Cliente retira',
                'Enviar servilletas',
                'Sin picante',
              ].map((quickNote) => (
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
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600 transition hover:bg-primary-50 hover:text-primary-600"
                >
                  {quickNote}
                </button>
              ))}
            </div>
            <div className="relative">
              <MessageSquare size={15} className="absolute left-3 top-3.5 text-slate-400" />
              <textarea
                value={notas}
                onChange={(event) => onNotasChange(event.target.value)}
                placeholder="Indicaciones para cocina, caja o reparto"
                rows={3}
                className="w-full rounded-2xl border-none bg-slate-50 py-3 pl-9 pr-3 text-sm font-bold text-gray-700 shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
              />
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between px-1">
            <SectionLabel>Mi Pedido</SectionLabel>
            <span className="rounded-lg bg-primary-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
              {totalItems} items
            </span>
          </div>

          <div className="mb-8 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-[32px] border-2 border-dashed border-gray-100 bg-[#F2F6FA]/50 px-4 py-12 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <ShoppingCart size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-bold text-gray-400">El pedido esta vacio</p>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className={`group relative rounded-[24px] border bg-white p-4 shadow-sm transition-all duration-500 ${lastAddedId === item.id ? 'scale-[1.02] border-primary-500 bg-primary-50/50 shadow-md ring-2 ring-[#5D87FF]/20' : 'border-gray-100 hover:border-primary-100'}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold leading-tight text-gray-800">{item.nombre}</p>
                      {item.descripcion ? (
                        <p className="mt-1 line-clamp-1 text-[10px] font-medium italic text-gray-400">
                          {item.descripcion}
                        </p>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <p className="text-sm font-black text-primary-500">
                          {fmt(item.precio_unitario * item.cantidad)}
                        </p>
                        <span className="text-[10px] font-bold text-gray-300">
                          {fmt(item.precio_unitario)} c/u
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onQuitarItem(item.id)}
                        className="p-1.5 text-rose-400 opacity-0 transition-all group-hover:opacity-100 hover:text-danger-600"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-1">
                        <button
                          type="button"
                          onClick={() => onCambiarCantidad(item.id, -1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm transition-colors hover:text-rose-500"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="min-w-[16px] text-center text-xs font-black text-gray-800">
                          {item.cantidad}
                        </span>
                        <button
                          type="button"
                          onClick={() => onCambiarCantidad(item.id, 1)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-gray-500 shadow-sm transition-colors hover:text-emerald-500"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-t-[32px] border-t border-gray-100 bg-white p-6 shadow-[0_-10px_30px_rgba(0,0,0,0.02)]">
          {lastSale ? (
            <div className="mb-4 rounded-[24px] border border-emerald-100 bg-emerald-50 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                    Última venta
                  </p>
                  <p className="mt-1 text-lg font-black text-emerald-900">#{lastSale.numero}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2 text-right shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                    Total
                  </p>
                  <p className="text-sm font-black text-gray-900">{fmt(lastSale.total)}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  {lastSale.tipoEntrega}
                </span>
                <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  {lastSale.metodoPago}
                </span>
                {lastSale.printed ? (
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    Impreso
                  </span>
                ) : null}
                {lastSale.cliente ? (
                  <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                    {lastSale.cliente}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 flex justify-end">
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={onRepeatLastSale}
                    className="rounded-xl bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                  >
                    Repetir venta
                  </button>
                  <button
                    type="button"
                    onClick={onReprintLastSale}
                    className="rounded-xl bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                  >
                    Reimprimir
                  </button>
                  <button
                    type="button"
                    onClick={onOpenPedidos}
                    className="rounded-xl bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                  >
                    Ver pedidos
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mb-4 rounded-[24px] bg-[#F2F6FA] p-4">
            <div className="mb-4 flex items-center justify-between gap-4 border-b border-gray-200/50 pb-4">
              <div className="flex-1">
                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Descuento Especial
                </p>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onDescuentoTipoChange('monto')}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black transition-all ${descuentoTipo === 'monto' ? 'bg-primary-500 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-500'}`}
                  >
                    $
                  </button>
                  <button
                    type="button"
                    onClick={() => onDescuentoTipoChange('porcentaje')}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-black transition-all ${descuentoTipo === 'porcentaje' ? 'bg-primary-500 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-500'}`}
                  >
                    %
                  </button>
                  <input
                    type="number"
                    value={descuento}
                    onChange={(event) => onDescuentoChange(event.target.value)}
                    placeholder="0"
                    className="ml-2 h-8 flex-1 rounded-lg border-none bg-white px-3 text-right text-xs font-black text-gray-700 shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                  />
                </div>
              </div>
              <div className="text-right">
                <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Total a Pagar
                </p>
                <p className="text-2xl font-black leading-tight text-primary-500">{fmt(total)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-gray-400">Subtotal ({totalItems})</span>
                <span className="text-gray-700">{fmt(subtotal)}</span>
              </div>
              {envio > 0 ? (
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-400">Envio ({deliveryQuote.zone_name})</span>
                  <span className="text-gray-700">+{fmt(envio)}</span>
                </div>
              ) : null}
              {descuentoAplicado > 0 ? (
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-emerald-500">Descuento</span>
                  <span className="text-emerald-500">-{fmt(descuentoAplicado)}</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
            {pagos.map((pago) => (
              <button
                key={pago}
                type="button"
                onClick={() => onMetodoPagoChange(pago)}
                className={`h-10 shrink-0 rounded-xl px-4 text-[10px] font-black transition-all ${metodoPago === pago ? 'bg-primary-500 text-white shadow-lg' : 'border border-gray-100 bg-white text-gray-500'}`}
              >
                {PAYMENT_LABELS[pago].toUpperCase()}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {metodoPago === 'mixto' ? (
              <div className="rounded-[24px] border border-gray-100 bg-[#F8FAFD] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <SectionLabel>Pago mixto</SectionLabel>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${Math.abs(splitRemaining) <= 0.5 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}
                  >
                    {Math.abs(splitRemaining) <= 0.5
                      ? 'Completo'
                      : `Restan ${fmt(Math.abs(splitRemaining))}`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {['efectivo', 'transferencia', 'mercadopago', 'modo', 'uala'].map((method) => (
                    <label key={method} className="space-y-1">
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
                        {PAYMENT_LABELS[method]}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={splitPayments[method] || ''}
                        onChange={(event) => onSplitPaymentChange(method, event.target.value)}
                        placeholder="0"
                        className="h-11 w-full rounded-xl border-none bg-white px-3 text-sm font-black text-gray-800 shadow-sm focus:ring-2 focus:ring-[#5D87FF]/20"
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-white px-3 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-black text-gray-700">
                    <Wallet size={14} className="text-primary-500" />
                    Reparto cargado
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-black text-gray-800">
                      {fmt(total - splitRemaining)}
                    </p>
                    <p className="text-[10px] font-bold text-gray-400">Total {fmt(total)}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {metodoPago === 'efectivo' || splitCashTarget > 0 ? (
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-black text-primary-500">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={efectivoRecibido}
                    onChange={(event) => onEfectivoRecibidoChange(event.target.value)}
                    placeholder={
                      metodoPago === 'mixto'
                        ? `Efectivo recibido para cubrir ${fmt(splitCashTarget)}`
                        : 'Efectivo recibido'
                    }
                    className="h-12 w-full rounded-2xl border-none bg-[#F2F6FA] pl-8 pr-4 text-sm font-black text-gray-800 focus:ring-2 focus:ring-[#5D87FF]/20"
                  />
                </div>
                {vuelto > 0 ? (
                  <div className="rounded-2xl bg-success-500 px-4 py-2.5 text-white shadow-lg">
                    <p className="text-[9px] font-black uppercase opacity-80">Vuelto</p>
                    <p className="text-sm font-black">{fmt(vuelto)}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClearOrder}
                disabled={items.length === 0}
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-100 bg-gray-50 text-gray-400 transition-all hover:text-rose-500 disabled:opacity-30"
              >
                <Trash2 size={20} />
              </button>
              <button
                type="button"
                onClick={onConfirmPrint}
                disabled={confirmDisabled}
                className="h-14 flex-1 rounded-2xl border-2 border-gray-100 bg-white text-sm font-black text-gray-700 transition-all disabled:opacity-30"
              >
                TICKET
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirmDisabled || loading}
                className="h-14 flex-[2] rounded-2xl bg-primary-500 text-sm font-black text-white shadow-[0_10px_25px_rgba(93,135,255,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30"
              >
                {cajaAbierta ? 'VENDER' : 'ABRIR CAJA'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

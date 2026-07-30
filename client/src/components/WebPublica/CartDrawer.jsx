import {
  X,
  ShoppingCart,
  ArrowRight,
  Minus,
  Plus,
  AlertTriangle,
  Bike,
  Store,
  LocateFixed,
  Clock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { fmt } from '../../lib/webPublicaHelpers.js';

export default function CartDrawer({
  carrito,
  setCarrito,
  open,
  setOpen,
  checkout,
  setCheckout,
  form,
  setForm,
  cupon,
  setCupon,
  deliveryQuote,
  summary,
  envio,
  colorPrimario,
  config,
  metodosDisponibles,
  tiposEntregaDisponibles,
  deliveryActivo,
  retiroActivo,
  zonasCobertura,
  pedidoMinimo,
  faltaParaMinimo,
  tiempoEstimado,
  loading,
  hacerPedido,
  aplicarCupon,
  quitarCupon,
  captureCustomerLocation,
  customerGeo,
  categoriasVisibles,
  productosPorCategoria,
  setCatActiva,
  setBusqueda,
}) {
  const { totalItems, subtotal, total } = summary;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[200] flex">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="flex w-full max-w-md flex-col bg-white/95 shadow-2xl rounded-l-2xl overflow-hidden backdrop-blur-xl border-l border-gray-100"
          >
            <div
              className="p-6 flex items-center justify-between"
              style={{
                background: `linear-gradient(135deg, ${colorPrimario} 0%, ${colorPrimario}dd 100%)`,
              }}
            >
              <div>
                <h2 className="text-lg font-bold text-white">Tu pedido</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-xs font-medium text-white/80">{totalItems} productos</p>
                  {carrito.length > 0 && (
                    <button
                      onClick={() => setCarrito([])}
                      className="text-xs font-medium text-white/60 hover:text-white transition-colors"
                    >
                      · Vaciar
                    </button>
                  )}
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition"
              >
                <X size={20} />
              </button>
            </div>

            {!checkout ? (
              <>
                <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4">
                  {carrito.length === 0 ? (
                    <div className="flex flex-col items-center pt-8 text-center">
                      <ShoppingCart size={56} strokeWidth={1} className="text-gray-200 mb-4" />
                      <p className="text-base font-bold text-gray-400 mb-6">
                        El carrito está vacío
                      </p>
                      {categoriasVisibles.length > 0 && (
                        <div className="w-full text-left">
                          <p className="text-xs font-semibold text-gray-300 mb-3 text-center">
                            Explorá el menú
                          </p>
                          <div className="space-y-2">
                            {categoriasVisibles.slice(0, 4).map((cat) => (
                              <button
                                key={cat.id}
                                onClick={() => {
                                  setCatActiva(cat.id);
                                  setBusqueda('');
                                  setOpen(false);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-[0.98] transition-all text-left"
                              >
                                <span className="text-xl">{cat.icono}</span>
                                <span className="flex-1 text-sm font-medium text-gray-700">
                                  {cat.nombre}
                                </span>
                                {productosPorCategoria[cat.id] > 0 && (
                                  <span className="text-xs font-medium text-gray-400">
                                    {productosPorCategoria[cat.id]} items
                                  </span>
                                )}
                                <ArrowRight size={14} className="text-gray-300" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    carrito.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center gap-4 p-4 rounded-xl border border-gray-100/50 bg-gray-50 hover:bg-white transition-all shadow-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {item.nombre}
                          </p>
                          {item.descripcion && (
                            <p className="text-xs text-gray-400 truncate mt-1">
                              {item.descripcion}
                            </p>
                          )}
                          <p
                            className="text-sm font-semibold mt-1"
                            style={{ color: colorPrimario }}
                          >
                            {fmt(item.precio_unitario * item.cantidad)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-gray-100">
                          <button
                            onClick={() =>
                              setCarrito((prev) =>
                                prev
                                  .map((i) =>
                                    i.id === item.id
                                      ? { ...i, cantidad: Math.max(0, i.cantidad - 1) }
                                      : i
                                  )
                                  .filter((i) => i.cantidad > 0)
                              )
                            }
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="text-sm font-bold text-gray-900 w-5 text-center">
                            {item.cantidad}
                          </span>
                          <button
                            onClick={() =>
                              setCarrito((prev) =>
                                prev.map((i) =>
                                  i.id === item.id ? { ...i, cantidad: i.cantidad + 1 } : i
                                )
                              )
                            }
                            className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-green-50 hover:text-green-500 transition"
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {carrito.length > 0 && (
                  <div className="p-6 border-t border-gray-100/50 bg-white/50 space-y-4 backdrop-blur-sm">
                    <div className="text-sm font-semibold text-gray-400 flex justify-between">
                      <span>Subtotal</span>
                      <span className="text-gray-700 font-bold">{fmt(subtotal)}</span>
                    </div>
                    {pedidoMinimo > 0 && (
                      <div>
                        {faltaParaMinimo > 0 ? (
                          <p className="text-xs font-semibold text-gray-400 mb-2">
                            Faltan {fmt(faltaParaMinimo)} para el mínimo
                          </p>
                        ) : (
                          <p className="text-xs font-semibold text-green-600 mb-2">
                            ¡Mínimo alcanzado!
                          </p>
                        )}
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, (subtotal / pedidoMinimo) * 100)}%`,
                              backgroundColor: colorPrimario,
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setCheckout(true)}
                      disabled={faltaParaMinimo > 0}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50 transition hover:brightness-110"
                      style={{ backgroundColor: colorPrimario }}
                    >
                      Completar Pedido <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
                <button
                  onClick={() => setCheckout(false)}
                  className="flex items-center gap-2 text-xs font-semibold mb-2 hover:underline"
                  style={{ color: colorPrimario }}
                >
                  <X size={14} /> Editar carrito
                </button>

                {!config?.abierto_ahora && (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">Estamos cerrados</p>
                      <p className="text-xs font-semibold text-amber-600 mt-1">
                        Podés dejar tu pedido y lo procesamos cuando abramos.
                      </p>
                    </div>
                  </div>
                )}

                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-2">
                      Tu nombre
                    </label>
                    <input
                      value={form.nombre}
                      onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      className="h-12 w-full rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-semibold focus:ring-2 outline-none focus:border-transparent transition"
                      style={{ '--tw-ring-color': `${colorPrimario}30` }}
                      placeholder="Ej: Juan Perez"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-2">Teléfono</label>
                    <input
                      type="tel"
                      inputMode="tel"
                      value={form.telefono}
                      onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                      className="h-12 w-full rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-semibold focus:ring-2 outline-none focus:border-transparent transition"
                      placeholder="Ej: 3811234567"
                    />
                    <p className="text-xs text-gray-400 mt-1 font-medium">
                      Solo números, sin espacios ni guiones
                    </p>
                  </div>

                  {tiposEntregaDisponibles.length > 1 ? (
                    <div className="grid grid-cols-2 gap-3">
                      {deliveryActivo && (
                        <button
                          onClick={() => setForm({ ...form, tipo_entrega: 'delivery' })}
                          className={`h-12 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold border-2 transition-all ${form.tipo_entrega === 'delivery' ? 'border-current' : 'border-gray-200 text-gray-400'}`}
                          style={
                            form.tipo_entrega === 'delivery'
                              ? { color: colorPrimario, backgroundColor: `${colorPrimario}12` }
                              : {}
                          }
                        >
                          <Bike size={16} /> Delivery
                        </button>
                      )}
                      {retiroActivo && (
                        <button
                          onClick={() => setForm({ ...form, tipo_entrega: 'retiro' })}
                          className={`h-12 rounded-xl flex items-center justify-center gap-2 text-xs font-semibold border-2 transition-all ${form.tipo_entrega === 'retiro' ? 'border-current' : 'border-gray-200 text-gray-400'}`}
                          style={
                            form.tipo_entrega === 'retiro'
                              ? { color: colorPrimario, backgroundColor: `${colorPrimario}12` }
                              : {}
                          }
                        >
                          <Store size={16} /> Retiro
                        </button>
                      )}
                    </div>
                  ) : (
                    <div
                      className="h-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center gap-2 text-xs font-semibold"
                      style={{ color: colorPrimario }}
                    >
                      {form.tipo_entrega === 'delivery' ? (
                        <>
                          <Bike size={16} /> Solo delivery
                        </>
                      ) : (
                        <>
                          <Store size={16} /> Solo retiro en local
                        </>
                      )}
                    </div>
                  )}

                  {form.tipo_entrega === 'delivery' && (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-2">
                          Dirección
                        </label>
                        {zonasCobertura.length > 0 && (
                          <p className="text-xs text-gray-400 mb-2 font-medium">
                            Entregamos en: {zonasCobertura.join(' · ')}
                          </p>
                        )}
                        <input
                          value={form.direccion}
                          onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                          className="h-12 w-full rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-semibold focus:ring-2 outline-none focus:border-transparent transition"
                          placeholder="Calle y número"
                        />
                        {form.direccion.trim() && deliveryQuote.pending && (
                          <p className="text-xs font-semibold text-gray-400 mt-1 animate-pulse">
                            Calculando costo de envío...
                          </p>
                        )}
                        {form.direccion.trim() &&
                          !deliveryQuote.pending &&
                          deliveryQuote.message && (
                            <p
                              className={`text-xs font-semibold mt-1 ${deliveryQuote.available ? 'text-green-600' : 'text-red-500'}`}
                            >
                              {deliveryQuote.message}
                            </p>
                          )}
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-semibold" style={{ color: colorPrimario }}>
                              Ubicación exacta
                            </p>
                            <p className="mt-1 text-xs text-gray-500 leading-relaxed font-medium">
                              Sirve para que el delivery navegue mejor y el seguimiento sea más
                              preciso.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={captureCustomerLocation}
                            disabled={customerGeo.loading}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold shadow-sm disabled:opacity-60"
                            style={{ color: colorPrimario }}
                          >
                            <LocateFixed size={16} />
                            {customerGeo.loading
                              ? 'Ubicando...'
                              : customerGeo.ready
                                ? 'Actualizar GPS'
                                : 'Usar mi ubicación'}
                          </button>
                        </div>
                        {customerGeo.ready && (
                          <p className="mt-3 text-xs font-semibold text-green-600">
                            Ubicación cargada para el tracking
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {metodosDisponibles.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-2">
                        Forma de pago
                      </label>
                      <div
                        className={`grid gap-2 ${metodosDisponibles.length === 1 ? 'grid-cols-1' : metodosDisponibles.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}
                      >
                        {metodosDisponibles.map(({ key, label }) => (
                          <button
                            key={key}
                            onClick={() => setForm({ ...form, metodo_pago: key })}
                            className={`h-11 rounded-xl text-xs font-semibold border-2 transition-all ${form.metodo_pago === key ? 'border-current shadow-sm' : 'border-gray-200 text-gray-400'}`}
                            style={
                              form.metodo_pago === key
                                ? { color: colorPrimario, backgroundColor: `${colorPrimario}12` }
                                : {}
                            }
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-2">
                      Cupón de descuento
                    </label>
                    {cupon.aplicado ? (
                      <div className="flex items-center justify-between rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                        <div>
                          <p className="text-xs font-semibold text-green-700">
                            {cupon.aplicado.cupon.codigo}
                          </p>
                          <p className="text-xs text-green-600 font-semibold">
                            -{fmt(cupon.aplicado.monto_descuento)}
                          </p>
                        </div>
                        <button
                          onClick={quitarCupon}
                          className="text-green-500 hover:text-green-700"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input
                          value={cupon.codigo}
                          onChange={(e) =>
                            setCupon((prev) => ({
                              ...prev,
                              codigo: e.target.value.toUpperCase(),
                              error: '',
                            }))
                          }
                          onKeyDown={(e) => e.key === 'Enter' && aplicarCupon()}
                          className="h-11 flex-1 rounded-xl bg-gray-50 border border-gray-200 px-4 text-sm font-semibold outline-none"
                          placeholder="Código"
                        />
                        <button
                          onClick={aplicarCupon}
                          disabled={cupon.loading || !cupon.codigo.trim()}
                          className="h-11 px-5 rounded-xl text-xs font-semibold text-white shadow-sm disabled:opacity-50 shrink-0 transition hover:brightness-110"
                          style={{ backgroundColor: colorPrimario }}
                        >
                          {cupon.loading ? '...' : 'Aplicar'}
                        </button>
                      </div>
                    )}
                    {cupon.error && (
                      <p className="mt-2 text-xs font-semibold text-red-500">{cupon.error}</p>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-2">
                      Instrucciones especiales{' '}
                      <span className="text-gray-300 font-normal">(opcional)</span>
                    </label>
                    <textarea
                      value={form.notas}
                      onChange={(e) => setForm({ ...form, notas: e.target.value })}
                      className="w-full rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-sm font-semibold focus:ring-2 outline-none resize-none focus:border-transparent transition"
                      rows={2}
                      placeholder="Ej: sin cebolla, tocar timbre 3B..."
                    />
                  </div>

                  <div className="rounded-xl bg-gray-50 p-5 space-y-3">
                    <div className="flex justify-between text-sm font-semibold text-gray-400">
                      <span>Subtotal</span>
                      <span className="text-gray-700 font-bold">{fmt(subtotal)}</span>
                    </div>
                    {envio > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-gray-400">
                        <span>Envío</span>
                        <span className="text-gray-700 font-bold">+{fmt(envio)}</span>
                      </div>
                    )}
                    {cupon.aplicado && (
                      <div className="flex justify-between text-sm font-semibold text-green-600">
                        <span>Descuento</span>
                        <span>-{fmt(cupon.aplicado.monto_descuento)}</span>
                      </div>
                    )}
                    {tiempoEstimado > 0 && (
                      <div className="flex justify-between text-sm font-semibold text-gray-400">
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} />
                          {form.tipo_entrega === 'retiro' ? 'Retiro en' : 'Entrega en'}
                        </span>
                        <span className="text-gray-700 font-bold">~{tiempoEstimado} min</span>
                      </div>
                    )}
                    <div
                      className="flex justify-between border-t border-gray-200 pt-3 text-lg font-bold"
                      style={{ color: colorPrimario }}
                    >
                      <span>Total</span>
                      <span>{fmt(total)}</span>
                    </div>
                  </div>

                  <button
                    onClick={hacerPedido}
                    disabled={
                      loading ||
                      !config?.abierto_ahora ||
                      (form.tipo_entrega === 'delivery' && deliveryQuote.pending)
                    }
                    className="w-full h-12 rounded-xl text-white font-semibold shadow-lg active:scale-95 transition-all disabled:opacity-60 hover:brightness-110"
                    style={{ backgroundColor: colorPrimario }}
                  >
                    {loading
                      ? 'Procesando...'
                      : !config?.abierto_ahora
                        ? 'Tienda cerrada'
                        : form.tipo_entrega === 'delivery' && deliveryQuote.pending
                          ? 'Calculando envío...'
                          : 'Confirmar mi pedido'}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

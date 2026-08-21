import { Link } from 'react-router-dom';
import { CheckCircle, Clock, MessageCircle, Bike } from 'lucide-react';
import { motion } from 'framer-motion';
import { fmt, buildWhatsAppUrl, buildTrackingLink } from '../../lib/webPublicaHelpers.js';

export default function OrderConfirmation({
  confirmado,
  config,
  colorPrimario,
  onReset,
  modoKiosco = false,
}) {
  const waConsultaUrl = buildWhatsAppUrl(
    config,
    `Hola! Hice el pedido #${confirmado.numero || ''} y quiero consultar sobre el estado.`
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-xl sm:p-10"
      >
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-green-50 text-green-500">
          <CheckCircle size={40} strokeWidth={2} />
        </div>
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900">
            {modoKiosco ? '¡Pedido enviado!' : '¡Pedido recibido!'}
          </h2>
          <p className="mt-2 text-lg font-semibold text-gray-400">Orden #{confirmado.numero}</p>
          {modoKiosco && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Conservá este número y acercate a caja para pagar.
            </p>
          )}
        </div>

        {Array.isArray(confirmado._items) && confirmado._items.length > 0 && (
          <div className="mb-5 space-y-2.5 rounded-xl bg-gray-50 px-5 py-4">
            {confirmado._items.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-900">
                  {item.cantidad}× {item.nombre}
                  {item.descripcion ? (
                    <span className="block text-xs font-medium text-gray-400">
                      {item.descripcion}
                    </span>
                  ) : null}
                </span>
                <span className="ml-4 shrink-0 text-sm font-bold" style={{ color: colorPrimario }}>
                  {fmt(item.precio_unitario * item.cantidad)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="mb-8 space-y-3 rounded-xl bg-gray-50 p-6">
          <div className="flex justify-between text-sm font-medium text-gray-500">
            <span>Subtotal</span>
            <span className="font-bold text-gray-900">{fmt(confirmado.subtotal)}</span>
          </div>
          {Number(confirmado.costo_envio) > 0 && (
            <div className="flex justify-between text-sm font-medium text-gray-500">
              <span>Envío</span>
              <span className="font-bold text-gray-900">+{fmt(confirmado.costo_envio)}</span>
            </div>
          )}
          {confirmado._tiempoEstimado > 0 && (
            <div className="flex justify-between text-sm font-medium text-gray-500">
              <span className="flex items-center gap-1.5">
                <Clock size={12} />
                Tiempo estimado
              </span>
              <span className="font-bold text-gray-900">~{confirmado._tiempoEstimado} min</span>
            </div>
          )}
          <div
            className="flex justify-between border-t border-gray-200 pt-3 text-xl font-bold"
            style={{ color: colorPrimario }}
          >
            <span>Total</span>
            <span>{fmt(confirmado.total)}</span>
          </div>
        </div>

        <div className="space-y-3">
          {!modoKiosco && (
            <Link
              to={buildTrackingLink(confirmado)}
              className="flex items-center justify-center gap-3 w-full rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-[0.98]"
              style={{ backgroundColor: colorPrimario }}
            >
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white"></span>
              </span>
              <Bike size={18} />
              Seguir mi pedido en vivo
            </Link>
          )}
          {!modoKiosco && config?.negocio_telefono && (
            <a
              href={waConsultaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full rounded-xl border border-gray-200 py-3.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              <MessageCircle size={18} />
              Consultar por WhatsApp
            </a>
          )}
          <button
            onClick={onReset}
            className="w-full pt-2 text-sm font-medium text-gray-400 transition hover:text-gray-600"
          >
            {modoKiosco ? 'Hacer otro pedido' : 'Volver al menú'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

import {
  X,
  Pencil,
  Trash2,
  MessageCircle,
  Copy,
  Star,
  CreditCard,
  History,
  Gift,
  MapPin,
  Cake,
  Phone,
  CheckCircle2,
  QrCode,
  Download,
  ExternalLink,
  User,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import HistorialPedidosPanel from './HistorialPedidosPanel.jsx';
import FidelizacionPanel from './FidelizacionPanel.jsx';
import DireccionesPanel from './DireccionesPanel.jsx';

export function AvatarDisplay({ url, nombre, size = 'h-24 w-24' }) {
  if (url) {
    return <img src={url} className={`${size} rounded-2xl object-cover shadow-lg`} alt={nombre} />;
  }
  return (
    <div
      className={`${size} rounded-2xl flex items-center justify-center font-black text-3xl text-white shadow-lg bg-gray-400`}
    >
      {nombre?.[0]?.toUpperCase() || <User size={24} />}
    </div>
  );
}

export default function ClienteDetailModal({
  detalle,
  onClose,
  detalleEstado,
  detalleTimeline,
  detalleDirecciones,
  detalleDireccionPrincipal,
  detalleCardCode,
  detalleClubUrl,
  branding,
  brandingLogoUrl,
  publicAppDiagnostics,
  sellosParaPremio,
  isProfileIncomplete,
  getTimelineTone,
  formatPedidoDate,
  fmtMoney,
  getPrimaryPhoneLink,
  getWhatsAppLink,
  getRecoveryMessage,
  handleEdit,
  deleteCliente,
  canjearPremio,
  copyToClipboard,
  printLoyaltyCard,
  openWhatsAppCardShare,
  buildPublicAppUrl,
}) {
  if (!detalle) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-7xl max-h-[95vh] overflow-y-auto rounded-[40px] bg-[#f7faff] shadow-2xl animate-in zoom-in-95 duration-200 no-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative overflow-hidden rounded-t-[40px] bg-[radial-gradient(circle_at_top_right,rgba(93,135,255,0.28),transparent_28%),linear-gradient(135deg,#eef4ff_0%,#ffffff_52%,#f4fbff_100%)] px-6 pb-8 pt-8 lg:px-8 xl:px-10">
          <div className="absolute right-6 top-6">
            <button
              onClick={onClose}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/90 text-gray-500 shadow-sm hover:bg-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-6 pt-8 md:flex-row md:items-end md:justify-between">
            <div className="flex items-end gap-4">
              <div className="h-24 w-24 overflow-hidden rounded-[30px] border-4 border-white bg-gray-100 shadow-lg">
                <AvatarDisplay
                  url={detalle.avatar_url}
                  nombre={detalle.nombre}
                  size="w-full h-full"
                />
              </div>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary-500">
                  Ficha de cliente
                </p>
                <h3 className="mt-2 text-3xl font-black tracking-tight text-gray-900">
                  {detalle.nombre || 'Cliente Modo Sabor'}
                </h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${detalleEstado.className}`}
                  >
                    {detalleEstado.label}
                  </span>
                  <span className="rounded-full border border-primary-100 bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary-500">
                    {detalle.codigo_tarjeta || `MS-${String(detalle.id).padStart(6, '0')}`}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <button
                onClick={() =>
                  window.open(
                    getWhatsAppLink(detalle.telefono, getRecoveryMessage(detalle)),
                    '_blank'
                  )
                }
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-emerald-100 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-success-500 shadow-sm hover:bg-success-50"
              >
                <MessageCircle size={16} className="mr-2" />
                WhatsApp
              </button>
              <button
                onClick={() => copyToClipboard(detalle.telefono || '')}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-primary-100 bg-white px-4 text-[10px] font-black uppercase tracking-widest text-primary-500 shadow-sm hover:bg-primary-50"
              >
                <Copy size={16} className="mr-2" />
                Copiar teléfono
              </button>
              <button
                onClick={() => handleEdit(detalle)}
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-primary-500 px-5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 hover:bg-primary-600"
              >
                <Pencil size={16} className="mr-2" />
                Editar
              </button>
              <button
                onClick={() => deleteCliente(detalle.id)}
                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-rose-100 bg-danger-50 text-rose-500 hover:bg-danger-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 pb-8 lg:px-8 xl:px-10">
          <div className="-mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-white bg-white p-5 text-center shadow-sm">
              <Star className="mx-auto mb-2 text-amber-500" size={24} fill="#FFAE1F" />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Puntos
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">{detalle.puntos || 0} pts</p>
            </div>
            <div className="rounded-[24px] border border-white bg-white p-5 text-center shadow-sm">
              <CreditCard className="mx-auto mb-2 text-primary-500" size={24} />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Canjes
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">{detalle.canjes_premio || 0}</p>
            </div>
            <div className="rounded-[24px] border border-white bg-white p-5 text-center shadow-sm">
              <History className="mx-auto mb-2 text-rose-500" size={24} />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Frecuencia
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                ~{detalle.frecuencia_dias || 7} días
              </p>
            </div>
            <div className="rounded-[24px] border border-white bg-white p-5 text-center shadow-sm">
              <Gift className="mx-auto mb-2 text-success-500" size={24} />
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Premios listos
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {detalle.recompensas_pendientes || 0}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
            <div className="space-y-6">
              <div className="rounded-[32px] border border-white bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                    Ficha 360
                  </h4>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                    Cliente activo
                  </span>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-[24px] bg-background p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Contacto principal
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-success-500 shadow-sm">
                        <Phone size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-900">
                          {detalle.telefono || 'Sin teléfono'}
                        </p>
                        <div className="mt-1 flex gap-3">
                          <button
                            onClick={() =>
                              window.open(getPrimaryPhoneLink(detalle.telefono), '_blank')
                            }
                            className="text-[10px] font-black uppercase tracking-widest text-primary-500 hover:underline"
                          >
                            Llamar
                          </button>
                          {detalle.telefono && (
                            <button
                              onClick={() =>
                                window.open(getWhatsAppLink(detalle.telefono), '_blank')
                              }
                              className="text-[10px] font-black uppercase tracking-widest text-success-500 hover:underline"
                            >
                              WhatsApp
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-background p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Cumpleaños
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-500 shadow-sm">
                        <Cake size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-gray-900">
                          {detalle.fecha_nacimiento || 'No registrado'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          Campañas y beneficios
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[24px] bg-background p-4 lg:col-span-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Dirección principal
                    </p>
                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary-500 shadow-sm">
                        <MapPin size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900">
                          {detalleDireccionPrincipal?.direccion ||
                            detalle.direccion ||
                            'Sin dirección cargada'}
                        </p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          {detalleDireccionPrincipal?.etiqueta || 'Principal'}
                          {detalleDireccionPrincipal?.referencia
                            ? ` · ${detalleDireccionPrincipal.referencia}`
                            : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {detalle.notas ? (
                  <div className="mt-4 rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Notas internas
                    </p>
                    <p className="mt-2 text-sm font-medium leading-6 text-gray-700">
                      {detalle.notas}
                    </p>
                  </div>
                ) : null}
              </div>
              <HistorialPedidosPanel
                pedidos={detalle.pedidos}
                formatPedidoDate={formatPedidoDate}
                fmtMoney={fmtMoney}
              />
            </div>

            <div className="space-y-6">
              <FidelizacionPanel
                detalle={detalle}
                sellosParaPremio={sellosParaPremio}
                canjearPremio={canjearPremio}
                detalleClubUrl={detalleClubUrl}
                branding={branding}
                brandingLogoUrl={brandingLogoUrl}
                publicAppDiagnostics={publicAppDiagnostics}
                isProfileIncomplete={isProfileIncomplete}
                copyToClipboard={copyToClipboard}
                printLoyaltyCard={printLoyaltyCard}
                openWhatsAppCardShare={openWhatsAppCardShare}
                getRecoveryMessage={getRecoveryMessage}
                fmtMoney={fmtMoney}
                buildPublicAppUrl={buildPublicAppUrl}
              />
              <div className="rounded-[32px] border border-white bg-white p-6 shadow-sm">
                <h4 className="mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                  Actividad y retención
                </h4>
                <div className="space-y-3">
                  {detalleTimeline.length > 0 ? (
                    detalleTimeline.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-[22px] border px-4 py-4 ${getTimelineTone(item.tone)}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-black uppercase tracking-widest">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm font-bold leading-relaxed">
                              {item.subtitle}
                            </p>
                          </div>
                          {item.fecha ? (
                            <span className="shrink-0 text-[9px] font-black uppercase tracking-widest opacity-70">
                              {formatPedidoDate(item.fecha)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                      <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                        Sin actividad destacada
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <DireccionesPanel direcciones={detalleDirecciones} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Cake, Copy, MapPin, MessageCircle, Pencil, Phone, Trash2, X } from 'lucide-react';

import { APP_BG, BRAND, STROKE } from '../../lib/theme.js';
import {
  AvatarDisplay,
  Card,
  Empty,
  EstadoPill,
  METRICA_TONOS,
  nivelEstilo,
} from './clientesUi.jsx';
import HistorialPedidosPanel from './HistorialPedidosPanel.jsx';
import FidelizacionPanel from './FidelizacionPanel.jsx';
import DireccionesPanel from './DireccionesPanel.jsx';

const TONOS_TIMELINE = {
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: BRAND,
  sky: '#0EA5E9',
  blue: '#3B82F6',
};

function Dato({ icon: Icon, label, value, children }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-[11px] text-gray-400">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <Icon size={14} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gray-900">{value}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ClienteDetailModal({
  detalle,
  onClose,
  detalleTimeline,
  detalleDirecciones,
  detalleDireccionPrincipal,
  detalleClubUrl,
  branding,
  brandingLogoUrl,
  publicAppDiagnostics,
  sellosParaPremio,
  isProfileIncomplete,
  getClienteEstado,
  formatPedidoDate,
  fmtMoney,
  getPrimaryPhoneLink,
  getWhatsAppLink,
  getRecoveryMessage,
  handleEdit,
  handleRefreshDetail,
  deleteCliente,
  canjearPremio,
  copyToClipboard,
  printLoyaltyCard,
  openWhatsAppCardShare,
}) {
  if (!detalle) return null;

  const sinTelefono = !String(detalle.telefono || '').trim();
  const codigo = detalle.codigo_tarjeta || `MS-${String(detalle.id).padStart(6, '0')}`;
  const nivel = nivelEstilo(detalle.nivel);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${detalle.nombre || 'cliente'}`}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: APP_BG }}
      >
        {/* ── Cabecera, pintada con el color del nivel ── */}
        <div
          className="shrink-0 border-b border-black/5 px-6 py-4"
          style={{ background: nivel.banda }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="shrink-0 rounded-[16px] p-[3px]"
                style={{ background: nivel.fuerte }}
              >
                <AvatarDisplay
                  url={detalle.avatar_url}
                  fallbackId={detalle.id}
                  nombre={detalle.nombre}
                  size="h-14 w-14 text-[20px]"
                />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-[19px] font-semibold" style={{ color: nivel.texto }}>
                  {detalle.nombre || 'Cliente sin nombre'}
                </h3>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold"
                    style={{ color: nivel.fg }}
                  >
                    {detalle.nivel || 'Bronce'}
                  </span>
                  <EstadoPill segmento={getClienteEstado(detalle)} />
                  <span className="font-mono text-[12px]" style={{ color: nivel.apagado }}>
                    {codigo}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={sinTelefono}
                onClick={() =>
                  window.open(
                    getWhatsAppLink(detalle.telefono, getRecoveryMessage(detalle)),
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
                style={sinTelefono ? undefined : { background: nivel.fuerte }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:bg-gray-200 disabled:text-gray-400"
              >
                <MessageCircle size={14} strokeWidth={STROKE} />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => handleEdit(detalle)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/80 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-white"
              >
                <Pencil size={14} strokeWidth={STROKE} />
                Editar
              </button>
              <button
                type="button"
                onClick={() => deleteCliente(detalle.id)}
                title="Eliminar cliente"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-white hover:text-rose-600"
              >
                <Trash2 size={16} strokeWidth={STROKE} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition hover:bg-white hover:text-gray-900"
              >
                <X size={18} strokeWidth={STROKE} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
            <div className="space-y-4">
              <Card title="Datos de contacto">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Dato
                    icon={Phone}
                    label="Teléfono"
                    value={detalle.telefono || 'Sin teléfono cargado'}
                  >
                    {!sinTelefono ? (
                      <div className="mt-1 flex gap-3">
                        <a
                          href={getPrimaryPhoneLink(detalle.telefono)}
                          className="text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
                        >
                          Llamar
                        </a>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(detalle.telefono)}
                          className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
                        >
                          <Copy size={11} strokeWidth={STROKE} />
                          Copiar
                        </button>
                      </div>
                    ) : null}
                  </Dato>

                  <Dato
                    icon={Cake}
                    label="Cumpleaños"
                    value={detalle.fecha_nacimiento || 'No registrado'}
                  />

                  <div className="sm:col-span-2">
                    <Dato
                      icon={MapPin}
                      label="Dirección principal"
                      value={
                        detalleDireccionPrincipal?.direccion ||
                        detalle.direccion ||
                        'Sin dirección cargada'
                      }
                    >
                      {detalleDireccionPrincipal?.referencia ? (
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {detalleDireccionPrincipal.referencia}
                        </p>
                      ) : null}
                    </Dato>
                  </div>
                </div>

                {detalle.notas ? (
                  <div className="mt-3 rounded-xl border border-dashed border-gray-200 p-3">
                    <p className="text-[11px] text-gray-400">Notas internas</p>
                    <p className="mt-1 text-[13px] leading-5 text-gray-700">{detalle.notas}</p>
                  </div>
                ) : null}
              </Card>

              <Card title="Resumen">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    {
                      label: 'Gastado',
                      valor: fmtMoney(detalle.total_gastado),
                      tono: METRICA_TONOS.gastado,
                    },
                    {
                      label: 'Pedidos',
                      valor: detalle.total_pedidos || 0,
                      tono: METRICA_TONOS.pedidos,
                    },
                    { label: 'Puntos', valor: `${detalle.puntos || 0}` },
                    { label: 'Premios canjeados', valor: detalle.canjes_premio || 0 },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-xl p-3"
                      style={{ background: item.tono?.bg || '#F3F4F6' }}
                    >
                      <p className="text-[11px]" style={{ color: item.tono?.label || '#6B7280' }}>
                        {item.label}
                      </p>
                      <p
                        className="mt-1 truncate text-[18px] font-bold tabular-nums"
                        style={{ color: item.tono?.valor || '#111827' }}
                      >
                        {item.valor}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>

              <HistorialPedidosPanel
                pedidos={detalle.pedidos}
                formatPedidoDate={formatPedidoDate}
                fmtMoney={fmtMoney}
              />
            </div>

            <div className="space-y-4">
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
              />

              <Card title="Actividad">
                {detalleTimeline.length ? (
                  <div className="space-y-2">
                    {detalleTimeline.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5">
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: TONOS_TIMELINE[item.tone] || '#9CA3AF' }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] font-medium text-gray-900">{item.title}</p>
                            {item.fecha ? (
                              <span className="shrink-0 text-[11px] text-gray-400">
                                {formatPedidoDate(item.fecha)}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[12px] leading-4 text-gray-500">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty title="Sin actividad destacada" />
                )}
              </Card>

              <DireccionesPanel
                clienteId={detalle.id}
                direcciones={detalleDirecciones}
                onChanged={() => handleRefreshDetail?.(detalle)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

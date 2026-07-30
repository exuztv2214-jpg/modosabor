import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Gift, QrCode, Download, ExternalLink, Copy } from 'lucide-react';
import { getPublicBrandTheme } from '../../lib/webPublicaHelpers.js';
import { shadeColor } from '../../lib/colorUtils.js';

export default function FidelizacionPanel({
  detalle,
  sellosParaPremio,
  canjearPremio,
  detalleClubUrl,
  branding,
  brandingLogoUrl,
  publicAppDiagnostics,
  isProfileIncomplete,
  copyToClipboard,
  printLoyaltyCard,
  openWhatsAppCardShare,
  getRecoveryMessage,
  fmtMoney,
  buildPublicAppUrl,
}) {
  const colorPrimario = getPublicBrandTheme(branding).primary;

  return (
    <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
      <div className="overflow-hidden rounded-[32px] border border-primary-100 bg-white shadow-sm">
        <div
          className="px-6 py-5 text-white"
          style={{
            background: `linear-gradient(135deg, ${colorPrimario} 0%, ${shadeColor(colorPrimario, -10)} 55%, ${shadeColor(colorPrimario, -25)} 100%)`,
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={brandingLogoUrl}
                className="h-11 w-11 rounded-2xl bg-white/90 object-contain p-1.5"
                alt="logo"
              />
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
                  Tarjeta fidelidad
                </p>
                <p className="mt-1 text-lg font-black uppercase tracking-tight">
                  {branding.negocio_nombre || 'Modo Sabor'}
                </p>
              </div>
            </div>
            <div className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              {detalle.codigo_tarjeta || `MS-${String(detalle.id).padStart(6, '0')}`}
            </div>
          </div>
        </div>

        <div className="p-6">
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${sellosParaPremio + 1}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: sellosParaPremio }, (_, index) => index + 1).map((num) => {
              const isStamped = (detalle.sellos_actuales || 0) >= num;
              return (
                <div key={num} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed transition-all ${isStamped ? 'scale-105 border-primary-500 bg-primary-50 text-primary-500 shadow-md' : 'border-gray-200 bg-gray-50 text-gray-300'}`}
                  >
                    {isStamped ? (
                      <CheckCircle2 size={22} strokeWidth={3} />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-gray-200" />
                    )}
                  </div>
                  <span
                    className={`text-[8px] font-black uppercase ${isStamped ? 'text-primary-500' : 'text-gray-300'}`}
                  >
                    {num}
                  </span>
                </div>
              );
            })}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-full border-4 transition-all ${detalle.recompensas_pendientes > 0 ? 'border-emerald-100 bg-success-500 text-white shadow-lg' : 'border-success-500/15 bg-success-500/5 text-success-500/20'}`}
              >
                <Gift size={22} strokeWidth={3} />
              </div>
              <span className="text-[8px] font-black uppercase text-success-500">Premio</span>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Sellos
              </p>
              <p className="mt-1 text-xl font-black text-gray-900">
                {detalle.sellos_actuales || 0}
              </p>
            </div>
            <div className="rounded-2xl bg-background p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Premios
              </p>
              <p className="mt-1 text-xl font-black text-gray-900">
                {detalle.recompensas_pendientes || 0}
              </p>
            </div>
          </div>

          {detalle.recompensas_pendientes > 0 ? (
            <button
              onClick={() => canjearPremio(detalle.id)}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-success-500 text-[10px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-success-100 hover:bg-[#0EB795]"
            >
              Canjear ahora
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-[32px] border border-primary-100 bg-gradient-to-br from-primary-50 via-[#fff8f5] to-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-[168px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-3 rounded-[28px] border border-primary-100/70 bg-white px-4 py-5 shadow-sm">
            <QRCodeSVG
              value={detalleClubUrl || buildPublicAppUrl('/club', branding)}
              size={136}
              bgColor="#ffffff"
              fgColor="#111827"
              includeMargin
            />
            <span className="rounded-full bg-primary-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary-500">
              Tarjeta virtual
            </span>
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-500">
                Tarjeta virtual del cliente
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-gray-800">
                Este QR abre la ficha pública para ver la tarjeta, completar datos faltantes y
                guardar el acceso desde cualquier celular.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-[24px] border border-primary-100 bg-white px-4 py-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                  Link del cliente
                </p>
                <p className="mt-2 break-all text-[11px] font-bold leading-5 text-gray-700">
                  {detalleClubUrl}
                </p>
              </div>

              <div
                className={`rounded-[24px] border px-4 py-4 shadow-sm ${isProfileIncomplete(detalle) ? 'border-amber-100 bg-warning-50' : 'border-emerald-100 bg-success-50'}`}
              >
                <p
                  className={`text-[10px] font-black uppercase tracking-[0.18em] ${isProfileIncomplete(detalle) ? 'text-amber-500' : 'text-emerald-500'}`}
                >
                  {isProfileIncomplete(detalle) ? 'Perfil incompleto' : 'Ficha completa'}
                </p>
                <p
                  className={`mt-2 text-xs font-bold leading-5 ${isProfileIncomplete(detalle) ? 'text-warning-700' : 'text-success-700'}`}
                >
                  {isProfileIncomplete(detalle)
                    ? 'Conviene que el cliente complete dirección, cumpleaños o email desde su tarjeta virtual.'
                    : 'La tarjeta virtual ya quedó lista con los datos clave del cliente.'}
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-primary-100 bg-white px-4 py-4 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-primary-500">
                Uso en mostrador y WhatsApp
              </p>
              <p className="mt-2 text-sm font-bold leading-6 text-gray-800">
                Podés imprimir la tarjeta física, copiar el link o enviarlo por WhatsApp para que el
                cliente complete su ficha sin pasar por caja.
              </p>
            </div>

            {publicAppDiagnostics.warning ? (
              <div className="rounded-[24px] border border-amber-100 bg-warning-50 px-4 py-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-warning-600">
                  Revisar URL pública
                </p>
                <p className="mt-2 text-xs font-bold leading-5 text-amber-800">
                  {publicAppDiagnostics.warning}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => copyToClipboard(detalleClubUrl)}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-white bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-primary-500"
          >
            <QrCode size={16} />
            Copiar link
          </button>
          <button
            onClick={() => printLoyaltyCard(detalle)}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-white bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-primary-500"
          >
            <Download size={16} />
            Imprimir tarjeta
          </button>
          <button
            onClick={() => copyToClipboard(getRecoveryMessage(detalle))}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-white bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-success-500"
          >
            <Copy size={16} />
            Copiar mensaje
          </button>
          <button
            onClick={() => openWhatsAppCardShare(detalle)}
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border border-white bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700 hover:text-success-500"
          >
            <ExternalLink size={16} />
            Enviar WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

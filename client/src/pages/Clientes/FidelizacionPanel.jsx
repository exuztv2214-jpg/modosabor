import { QRCodeSVG } from 'qrcode.react';
import { AlertTriangle, Copy, Gift, Printer, Send } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, SellosProgreso, nivelEstilo } from './clientesUi.jsx';

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
}) {
  const sellos = Number(detalle.sellos_actuales || 0);
  const premios = Number(detalle.recompensas_pendientes || 0);
  const faltan = Math.max(0, sellosParaPremio - (sellos % sellosParaPremio || 0));
  const perfilIncompleto = isProfileIncomplete(detalle);
  const codigo = detalle.codigo_tarjeta || `MS-${String(detalle.id).padStart(6, '0')}`;
  const nivel = nivelEstilo(detalle.nivel);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        {/* La tarjeta del cliente lleva el color de su nivel, igual que la
            cabecera de la ficha y la de la lista. */}
        <div className="flex items-center gap-3 px-5 py-4" style={{ background: nivel.banda }}>
          <img
            src={brandingLogoUrl}
            className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1"
            alt={branding.negocio_nombre || 'Modo Sabor'}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold" style={{ color: nivel.texto }}>
              Tarjeta de fidelidad
            </p>
            <p className="truncate font-mono text-[12px]" style={{ color: nivel.apagado }}>
              {codigo}
            </p>
          </div>
          <span
            className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[12px] font-semibold"
            style={{ color: nivel.fg }}
          >
            {detalle.nivel || 'Bronce'}
          </span>
        </div>

        <div className="p-5">
          {/*
          Los sellos se dibujaban con `gridTemplateColumns: repeat(n+1, 1fr)`
          forzados en una fila dentro de una columna de 380px. Con la config
          por defecto de 7 sellos los círculos de 44px ya no entraban y se
          apretaban unos contra otros; con 10 quedaba ilegible. Ahora envuelve.
        */}
          <SellosProgreso actuales={sellos} total={sellosParaPremio} color={nivel.fuerte} />
          <p className="mt-2.5 text-[12px] text-gray-500">
            {premios > 0
              ? `Tiene ${premios} ${premios === 1 ? 'premio listo' : 'premios listos'} para canjear.`
              : sellos === 0
                ? `Todavía no tiene sellos. Faltan ${sellosParaPremio} para el primer premio.`
                : `${sellos} de ${sellosParaPremio} sellos · faltan ${faltan} para el próximo premio.`}
          </p>

          {premios > 0 ? (
            <button
              type="button"
              onClick={() => canjearPremio(detalle.id)}
              className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
            >
              <Gift size={15} strokeWidth={STROKE} />
              Canjear premio
            </button>
          ) : null}

          {!detalle.fidelizacion_activa ? (
            <p className="mt-3 rounded-xl bg-gray-50 p-3 text-[12px] leading-4 text-gray-500">
              La fidelización está pausada para este cliente: no suma sellos aunque compre.
            </p>
          ) : null}
        </div>
      </div>

      <Card
        title="Tarjeta virtual"
        helper="El QR abre la ficha pública para que complete sus datos"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="mx-auto shrink-0 rounded-xl border border-gray-100 p-2 sm:mx-0">
            <QRCodeSVG value={detalleClubUrl} size={112} bgColor="#ffffff" fgColor="#111827" />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-[11px] text-gray-400">Link del cliente</p>
              <p className="mt-0.5 break-all text-[12px] leading-4 text-gray-700">
                {detalleClubUrl}
              </p>
            </div>

            <div
              className="rounded-xl p-3"
              style={
                perfilIncompleto
                  ? { background: '#FEF6E7', color: '#92400E' }
                  : { background: '#ECFDF5', color: '#065F46' }
              }
            >
              <p className="text-[12px] font-semibold">
                {perfilIncompleto ? 'Perfil incompleto' : 'Ficha completa'}
              </p>
              <p className="mt-0.5 text-[12px] leading-4 opacity-90">
                {perfilIncompleto
                  ? 'Le faltan dirección, cumpleaños o email. Mandale el link para que los complete.'
                  : 'Ya tiene cargados todos los datos clave.'}
              </p>
            </div>

            {publicAppDiagnostics.warning ? (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3">
                <AlertTriangle
                  size={14}
                  strokeWidth={STROKE}
                  className="mt-0.5 shrink-0 text-amber-600"
                />
                <p className="text-[12px] leading-4 text-amber-900">
                  {publicAppDiagnostics.warning}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => openWhatsAppCardShare(detalle)}
            style={{ background: BRAND }}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold text-white transition hover:brightness-110"
          >
            <Send size={13} strokeWidth={STROKE} />
            Enviar por WhatsApp
          </button>
          <button
            type="button"
            onClick={() => printLoyaltyCard(detalle)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Printer size={13} strokeWidth={STROKE} />
            Imprimir tarjeta
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(detalleClubUrl)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Copy size={13} strokeWidth={STROKE} />
            Copiar link
          </button>
          <button
            type="button"
            onClick={() => copyToClipboard(getRecoveryMessage(detalle))}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Copy size={13} strokeWidth={STROKE} />
            Copiar mensaje
          </button>
        </div>
      </Card>
    </div>
  );
}

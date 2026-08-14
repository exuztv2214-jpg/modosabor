import { Check, Copy, ExternalLink, Send, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { AvatarDisplay, Card, Empty, Stat } from '../../pages/Clientes/clientesUi.jsx';

/**
 * Campañas de WhatsApp por segmento.
 *
 * Esto vivía arriba de todo en el módulo: cuatro tarjetas de segmento, cuatro
 * métricas de CRM y dos paneles de analítica antes de ver un solo cliente. En
 * una pantalla que se llama "Clientes" había que scrollear un tablero de
 * marketing para encontrar a alguien. Ahora es una pestaña aparte.
 */
export default function ClientesCampaignsSection({
  segmentHighlights,
  setFiltroEstado,
  launchSegmentCampaign,
  campaignDashboardStats,
  campaignSegmentStats,
  campaignTopCampaign,
  formatPedidoDate,
  fmtMoney,
  campaignModal,
  getSegmentMessage,
  setCampaignMessage,
  sendCampaign,
  campaignSending,
  setCampaignModal,
  campaignVariables,
  insertCampaignVariable,
  campaignMessage,
  copyToClipboard,
  openCampaignPreview,
  saveCampaignTemplate,
  registerCampaignHistory,
  getWhatsAppLink,
  campaignMetrics,
  campaignHistoryFilter,
  setCampaignHistoryFilter,
  campaignHistoryFilters,
  filteredCampaignHistory,
  reopenCampaignFromHistory,
}) {
  const seleccionados = campaignModal?.selectedIds?.length || 0;
  const totalDestinatarios = campaignModal?.clients?.length || 0;

  return (
    <div className="space-y-4">
      {/* ── Segmentos accionables ── */}
      <Card
        title="Segmentos"
        helper="Cada grupo abre una campaña de WhatsApp con un mensaje ya escrito"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {segmentHighlights.map((segment) => {
            const Icon = segment.icon;
            const vacio = segment.count === 0;
            return (
              <div key={segment.key} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[12px] text-gray-500">{segment.label}</p>
                    <p
                      className="mt-1 text-[26px] font-bold leading-none tabular-nums"
                      style={{ color: vacio ? '#9CA3AF' : '#111827' }}
                    >
                      {segment.count}
                    </p>
                  </div>
                  <Icon size={18} strokeWidth={STROKE} className="mt-0.5 text-gray-300" />
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroEstado(segment.filter)}
                    disabled={vacio}
                    className="h-9 flex-1 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    onClick={() => launchSegmentCampaign(segment.key)}
                    disabled={vacio}
                    style={vacio ? undefined : { background: BRAND }}
                    className="h-9 flex-1 rounded-xl text-[12px] font-semibold text-white transition hover:brightness-110 disabled:bg-gray-200 disabled:text-gray-400"
                  >
                    {segment.cta}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ── Campaña activa ── */}
      {campaignModal ? (
        <Card
          title={`Campaña: ${campaignModal.title}`}
          helper={`${seleccionados} de ${totalDestinatarios} destinatarios seleccionados`}
          action={
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setCampaignMessage(getSegmentMessage(campaignModal.segment))}
                className="h-10 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Restaurar texto
              </button>
              <button
                type="button"
                onClick={sendCampaign}
                disabled={campaignSending || seleccionados === 0}
                style={{ background: BRAND }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                <Send size={13} strokeWidth={STROKE} />
                {campaignSending ? 'Enviando…' : 'Enviar'}
              </button>
              <button
                type="button"
                onClick={() => setCampaignModal(null)}
                title="Cerrar campaña"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={16} strokeWidth={STROKE} />
              </button>
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div>
              <label
                htmlFor="field-ClientesCampaignsSection-jsx-134-0"
                className="text-[12px] font-medium text-gray-600"
              >
                Mensaje
              </label>
              <textarea
                id="field-ClientesCampaignsSection-jsx-134-0"
                value={campaignMessage}
                onChange={(e) => setCampaignMessage(e.target.value)}
                className="mt-1 min-h-[180px] w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-[14px] leading-6 text-gray-800 outline-none transition focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
              />

              {campaignVariables.length > 0 ? (
                <div className="mt-2">
                  <p className="text-[11px] text-gray-400">Tocá para insertar en el mensaje</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {campaignVariables.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => insertCampaignVariable(item.key)}
                        title={item.example || item.label}
                        className="rounded-lg bg-gray-100 px-2.5 py-1 font-mono text-[11px] font-medium text-gray-700 transition hover:bg-gray-200"
                      >
                        {`{{${item.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openCampaignPreview}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  <ExternalLink size={13} strokeWidth={STROKE} />
                  Previsualizar
                </button>
                <button
                  type="button"
                  onClick={() => copyToClipboard(campaignMessage)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  <Copy size={13} strokeWidth={STROKE} />
                  Copiar mensaje
                </button>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(
                      campaignModal.clients
                        .filter((cliente) => campaignModal.selectedIds.includes(cliente.id))
                        .map((cliente) => cliente.telefono)
                        .filter(Boolean)
                        .join(', ')
                    )
                  }
                  className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Copiar teléfonos
                </button>
                <button
                  type="button"
                  onClick={saveCampaignTemplate}
                  className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Guardar plantilla
                </button>
                <button
                  type="button"
                  onClick={registerCampaignHistory}
                  className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                >
                  Registrar sin enviar
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium text-gray-600">Destinatarios</p>
                <button
                  type="button"
                  onClick={() =>
                    setCampaignModal((prev) => ({
                      ...prev,
                      selectedIds:
                        prev.selectedIds.length === prev.clients.length
                          ? []
                          : prev.clients.map((cliente) => cliente.id),
                    }))
                  }
                  className="text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
                >
                  {seleccionados === totalDestinatarios ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>

              <div className="mt-1 max-h-[260px] space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-1.5">
                {campaignModal.clients.map((cliente) => {
                  const selected = campaignModal.selectedIds.includes(cliente.id);
                  return (
                    <div
                      key={cliente.id}
                      className={`flex items-center gap-2.5 rounded-lg px-2 py-2 transition ${
                        selected ? 'bg-gray-50' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setCampaignModal((prev) => ({
                            ...prev,
                            selectedIds: prev.selectedIds.includes(cliente.id)
                              ? prev.selectedIds.filter((id) => id !== cliente.id)
                              : [...prev.selectedIds, cliente.id],
                          }))
                        }
                        style={selected ? { background: BRAND, borderColor: BRAND } : undefined}
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${
                          selected ? 'text-white' : 'border-gray-300 text-transparent'
                        }`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </button>
                      <AvatarDisplay
                        url={cliente.avatar_url}
                        fallbackId={cliente.id}
                        nombre={cliente.nombre}
                        size="h-8 w-8"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] text-gray-800">{cliente.nombre}</p>
                        <p className="text-[11px] tabular-nums text-gray-400">{cliente.telefono}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          window.open(
                            getWhatsAppLink(cliente.telefono, campaignMessage),
                            '_blank',
                            'noopener,noreferrer'
                          )
                        }
                        title="Abrir WhatsApp con este cliente"
                        className="shrink-0 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700"
                      >
                        <ExternalLink size={13} strokeWidth={STROKE} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {campaignModal.lastResult?.length ? (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <p className="text-[12px] font-medium text-gray-600">
                Resultado del último envío · {campaignMetrics.enviados_ok || 0} ok,{' '}
                {campaignMetrics.enviados_error || 0} con error
              </p>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {campaignModal.lastResult.slice(0, 8).map((result) => {
                  const cliente = campaignModal.clients.find(
                    (item) => Number(item.id) === Number(result.id)
                  );
                  return (
                    <div
                      key={`${campaignModal.historyId || campaignModal.segment}-${result.id}`}
                      className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-gray-800">
                          {cliente?.nombre || `Cliente #${result.id}`}
                        </p>
                        <p className="truncate text-[11px] text-gray-400">
                          {result.url
                            ? 'Listo para abrir manualmente'
                            : result.error || `Vía ${result.mode || 'manual'}`}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-semibold"
                        style={{ color: result.ok ? '#047857' : BRAND }}
                      >
                        {result.ok ? 'OK' : 'Error'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* ── Resultados acumulados ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Campañas enviadas"
          value={campaignDashboardStats.campanas || 0}
          helper="Historial registrado"
        />
        <Stat
          label="Tasa de entrega"
          value={`${campaignDashboardStats.tasa_envio || 0}%`}
          helper={`${campaignDashboardStats.enviados_ok || 0} mensajes salieron bien`}
        />
        <Stat
          label="Volvieron a comprar"
          value={`${campaignDashboardStats.tasa_conversion || 0}%`}
          helper={`${campaignDashboardStats.convertidos || 0} clientes en 30 días`}
        />
        <Stat
          label="Facturado atribuido"
          value={fmtMoney(campaignDashboardStats.ingreso || 0)}
          helper="Pedidos dentro de los 30 días"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Qué segmento responde mejor">
          {campaignSegmentStats.length ? (
            <div className="space-y-1.5">
              {campaignSegmentStats.slice(0, 5).map((item) => (
                <div
                  key={item.segmento}
                  className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-gray-900">
                      {item.segmento}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {item.campanas} campañas · {item.clientes} clientes
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[14px] font-bold tabular-nums text-gray-900">
                      {item.tasa_conversion || 0}%
                    </p>
                    <p className="text-[11px] tabular-nums text-gray-400">
                      {fmtMoney(item.ingreso || 0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="Sin datos todavía"
              description="Después de un par de campañas vas a ver qué segmento conviene trabajar."
            />
          )}
        </Card>

        <Card
          title="Historial"
          action={
            <select
              value={campaignHistoryFilter}
              onChange={(e) => setCampaignHistoryFilter(e.target.value)}
              className="h-9 shrink-0 rounded-xl border border-gray-200 bg-white px-2 text-[12px] font-medium text-gray-700 outline-none"
            >
              {campaignHistoryFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          }
        >
          {filteredCampaignHistory.length ? (
            <div className="space-y-1.5">
              {filteredCampaignHistory.slice(0, 6).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => reopenCampaignFromHistory(item)}
                  className="w-full rounded-xl bg-gray-50 px-3 py-2.5 text-left transition hover:bg-gray-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate text-[13px] font-medium text-gray-900">
                      {item.titulo || item.segmento}
                    </p>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {formatPedidoDate(item.creado_en)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {item.enviados_ok || 0} ok · {item.enviados_error || 0} error ·{' '}
                    {fmtMoney(item.metricas?.ingreso_generado || 0)} atribuidos
                  </p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-gray-500">
                    {item.mensaje}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No hay campañas para ese filtro"
              description="Probá cambiando el filtro o lanzá una campaña desde los segmentos."
            />
          )}
        </Card>
      </div>

      {campaignTopCampaign ? (
        <Card title="Mejor campaña hasta ahora">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-gray-900">
                {campaignTopCampaign.titulo || campaignTopCampaign.segmento}
              </p>
              <p className="mt-0.5 text-[12px] text-gray-400">
                {campaignTopCampaign.segmento} · {formatPedidoDate(campaignTopCampaign.creado_en)}
              </p>
              <p className="mt-2 max-w-xl text-[13px] leading-5 text-gray-600">
                {campaignTopCampaign.mensaje}
              </p>
            </div>
            <div className="flex shrink-0 gap-6">
              <div>
                <p className="text-[12px] text-gray-500">Conversión</p>
                <p className="mt-1 text-[22px] font-bold tabular-nums text-gray-900">
                  {campaignTopCampaign.metricas?.tasa_conversion || 0}%
                </p>
              </div>
              <div>
                <p className="text-[12px] text-gray-500">Facturado</p>
                <p className="mt-1 text-[22px] font-bold tabular-nums text-gray-900">
                  {fmtMoney(campaignTopCampaign.metricas?.ingreso_generado || 0)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

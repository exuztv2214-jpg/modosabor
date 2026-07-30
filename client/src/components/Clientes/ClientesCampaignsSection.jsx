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
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {segmentHighlights.map((segment) => {
          const Icon = segment.icon;
          return (
            <div
              key={segment.key}
              className={`rounded-[28px] border p-5 shadow-sm ${segment.tone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-70">
                    {segment.label}
                  </p>
                  <p className="mt-2 text-3xl font-black">{segment.count}</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                  <Icon size={20} />
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setFiltroEstado(segment.filter)}
                  className="flex-1 rounded-[18px] bg-white px-4 py-3 text-[10px] font-black uppercase tracking-widest shadow-sm transition-all hover:opacity-90"
                >
                  Ver
                </button>
                <button
                  onClick={() => launchSegmentCampaign(segment.key)}
                  className="flex-1 rounded-[18px] border border-white/70 px-4 py-3 text-[10px] font-black uppercase tracking-widest transition-all hover:bg-white/40"
                >
                  {segment.cta}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Campañas CRM
          </p>
          <p className="mt-3 text-3xl font-black text-gray-900">
            {campaignDashboardStats.campanas || 0}
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Historial premium activo
          </p>
        </div>
        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Tasa de conversión
          </p>
          <p className="mt-3 text-3xl font-black text-gray-900">
            {campaignDashboardStats.tasa_conversion || 0}%
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {campaignDashboardStats.convertidos || 0} clientes recuperados
          </p>
        </div>
        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Ingresos atribuidos
          </p>
          <p className="mt-3 text-3xl font-black text-gray-900">
            {fmtMoney(campaignDashboardStats.ingreso || 0)}
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Pedidos posteriores en 30 dias
          </p>
        </div>
        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
            Tasa de envío
          </p>
          <p className="mt-3 text-3xl font-black text-gray-900">
            {campaignDashboardStats.tasa_envio || 0}%
          </p>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            {campaignDashboardStats.enviados_ok || 0} impactos exitosos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
              Segmentos que mejor convierten
            </p>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
              {campaignSegmentStats.length} segmentos
            </span>
          </div>
          <div className="space-y-3">
            {campaignSegmentStats.slice(0, 4).map((item) => (
              <div key={item.segmento} className="rounded-[22px] bg-background p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-gray-900">
                      {item.segmento}
                    </p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {item.campanas} campañas · {item.clientes} clientes
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-gray-900">{item.tasa_conversion || 0}%</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-success-600">
                      {fmtMoney(item.ingreso || 0)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
              Mejor campaña
            </p>
            <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
              Top performance
            </span>
          </div>
          {campaignTopCampaign ? (
            <div className="rounded-[24px] bg-background p-5">
              <p className="text-sm font-black uppercase tracking-widest text-gray-900">
                {campaignTopCampaign.titulo || campaignTopCampaign.segmento}
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {campaignTopCampaign.segmento} · {formatPedidoDate(campaignTopCampaign.creado_en)}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[18px] bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Conversión
                  </p>
                  <p className="mt-2 text-xl font-black text-gray-900">
                    {campaignTopCampaign.metricas?.tasa_conversion || 0}%
                  </p>
                </div>
                <div className="rounded-[18px] bg-white p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                    Ingresos
                  </p>
                  <p className="mt-2 text-xl font-black text-gray-900">
                    {fmtMoney(campaignTopCampaign.metricas?.ingreso_generado || 0)}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs font-medium text-gray-600 line-clamp-3">
                {campaignTopCampaign.mensaje}
              </p>
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-gray-200 bg-background px-4 py-8 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
              Sin datos suficientes todavia
            </div>
          )}
        </div>
      </div>

      {campaignModal && (
        <div className="rounded-[32px] border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary-500">
                Campaña rápida
              </p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-gray-900">
                {campaignModal.title}
              </h3>
              <p className="mt-1 text-sm font-medium text-gray-500">
                {campaignModal.selectedIds?.length || 0} clientes seleccionados de{' '}
                {campaignModal.clients.length}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCampaignMessage(getSegmentMessage(campaignModal.segment))}
                className="rounded-[18px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
              >
                Reset
              </button>
              <button
                onClick={sendCampaign}
                disabled={campaignSending}
                className="rounded-[18px] bg-primary-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100 disabled:opacity-50"
              >
                {campaignSending ? 'Enviando...' : 'Enviar campaña'}
              </button>
              <button
                onClick={() => setCampaignModal(null)}
                className="rounded-[18px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
              >
                Cerrar
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[28px] bg-background p-5">
              <p className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Mensaje editable
              </p>
              <textarea
                value={campaignMessage}
                onChange={(e) => setCampaignMessage(e.target.value)}
                className="min-h-[220px] w-full resize-none rounded-[24px] border-none bg-white p-5 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-[#5D87FF]/20"
              />
              {!!campaignVariables.length && (
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                      Variables premium
                    </p>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                      Click para insertar
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {campaignVariables.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => insertCampaignVariable(item.key)}
                        className="rounded-full border border-gray-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-gray-600 transition-all hover:border-primary-100 hover:text-primary-500"
                        title={item.example || item.label}
                      >
                        {`{{${item.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  onClick={() => copyToClipboard(campaignMessage)}
                  className="rounded-[20px] bg-primary-500 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-primary-100"
                >
                  Copiar mensaje
                </button>
                <button
                  onClick={openCampaignPreview}
                  className="rounded-[20px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  Abrir preview
                </button>
                <button
                  onClick={() =>
                    copyToClipboard(
                      campaignModal.clients
                        .filter((cliente) => campaignModal.selectedIds.includes(cliente.id))
                        .map((cliente) => cliente.telefono)
                        .join(', ')
                    )
                  }
                  className="rounded-[20px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  Copiar telefonos
                </button>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  onClick={saveCampaignTemplate}
                  className="rounded-[20px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  Guardar plantilla
                </button>
                <button
                  onClick={registerCampaignHistory}
                  className="rounded-[20px] border border-gray-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-gray-700"
                >
                  Registrar campaña
                </button>
              </div>
            </div>

            <div className="rounded-[28px] border border-gray-100 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                  Destinatarios
                </p>
                <button
                  onClick={() =>
                    setCampaignModal((prev) => ({
                      ...prev,
                      selectedIds:
                        prev.selectedIds.length === prev.clients.length
                          ? []
                          : prev.clients.map((cliente) => cliente.id),
                    }))
                  }
                  className="text-[10px] font-black uppercase tracking-widest text-primary-500"
                >
                  {campaignModal.selectedIds?.length === campaignModal.clients.length
                    ? 'Limpiar'
                    : 'Seleccionar todo'}
                </button>
              </div>
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {campaignModal.clients.map((cliente) => {
                  const selected = campaignModal.selectedIds.includes(cliente.id);
                  return (
                    <div
                      key={cliente.id}
                      className={`rounded-[24px] border p-4 transition-all ${selected ? 'border-primary-100 bg-primary-50/60' : 'border-transparent bg-background'}`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() =>
                            setCampaignModal((prev) => ({
                              ...prev,
                              selectedIds: prev.selectedIds.includes(cliente.id)
                                ? prev.selectedIds.filter((id) => id !== cliente.id)
                                : [...prev.selectedIds, cliente.id],
                            }))
                          }
                          className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-gray-300 bg-white text-transparent'}`}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black text-gray-900">
                            {cliente.nombre}
                          </p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                            {cliente.telefono}
                          </p>
                        </div>
                        <button
                          onClick={() =>
                            window.open(
                              getWhatsAppLink(cliente.telefono, campaignMessage),
                              '_blank'
                            )
                          }
                          className="rounded-[16px] border border-gray-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-success-500"
                        >
                          Abrir
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-gray-100 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Tasa de envio
              </p>
              <p className="mt-3 text-3xl font-black text-gray-900">
                {campaignMetrics.tasa_envio || 0}%
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {campaignMetrics.enviados_ok || 0} exitosos
              </p>
            </div>
            <div className="rounded-[24px] border border-gray-100 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Cobertura
              </p>
              <p className="mt-3 text-3xl font-black text-gray-900">
                {campaignMetrics.cobertura || 0}%
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {campaignMetrics.procesados || 0} procesados
              </p>
            </div>
            <div className="rounded-[24px] border border-gray-100 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Conversión
              </p>
              <p className="mt-3 text-3xl font-black text-gray-900">
                {campaignMetrics.tasa_conversion || 0}%
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {campaignMetrics.clientes_convertidos || 0} clientes volvieron
              </p>
            </div>
            <div className="rounded-[24px] border border-gray-100 bg-white p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Ingreso atribuido
              </p>
              <p className="mt-3 text-3xl font-black text-gray-900">
                {fmtMoney(campaignMetrics.ingreso_generado || 0)}
              </p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {campaignMetrics.pedidos_generados || 0} pedidos en{' '}
                {campaignMetrics.ventana_dias || 30} dias
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-[28px] border border-gray-100 bg-background p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                Historial reciente
              </p>
              <div className="flex items-center gap-3">
                <select
                  value={campaignHistoryFilter}
                  onChange={(e) => setCampaignHistoryFilter(e.target.value)}
                  className="h-10 rounded-2xl bg-white px-4 text-[10px] font-black uppercase tracking-widest text-gray-600 outline-none"
                >
                  {campaignHistoryFilters.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                  {filteredCampaignHistory.length} registros
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {filteredCampaignHistory.length > 0 ? (
                filteredCampaignHistory.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => reopenCampaignFromHistory(item)}
                    className="rounded-[24px] border border-transparent bg-white p-4 text-left transition-all hover:border-primary-100"
                  >
                    <p className="text-xs font-black uppercase tracking-widest text-gray-900">
                      {item.titulo || item.segmento}
                    </p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {formatPedidoDate(item.creado_en)}
                    </p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-primary-500">
                      {item.enviados_ok || 0} ok / {item.enviados_error || 0} error
                    </p>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      {item.metricas?.tasa_envio || 0}% exito ·{' '}
                      {item.metricas?.tasa_conversion || 0}% conversion
                    </p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-success-600">
                      {fmtMoney(item.metricas?.ingreso_generado || 0)} atribuidos
                    </p>
                    <p className="mt-2 text-xs font-medium text-gray-600 line-clamp-3">
                      {item.mensaje}
                    </p>
                  </button>
                ))
              ) : (
                <p className="rounded-[24px] border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 lg:col-span-3">
                  No hay campañas para ese filtro
                </p>
              )}
            </div>
          </div>
          {!!campaignModal.lastResult?.length && (
            <div className="mt-6 rounded-[28px] border border-gray-100 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                  Resultado del ultimo envio
                </p>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                  {campaignModal.lastResult.length} registros
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {campaignModal.lastResult.slice(0, 8).map((result) => {
                  const cliente = campaignModal.clients.find(
                    (item) => Number(item.id) === Number(result.id)
                  );
                  return (
                    <div
                      key={`${campaignModal.historyId || campaignModal.segment}-${result.id}`}
                      className={`rounded-[22px] border p-4 ${result.ok ? 'border-emerald-100 bg-success-50/70' : 'border-rose-100 bg-danger-50/70'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-gray-900">
                            {cliente?.nombre || `Cliente #${result.id}`}
                          </p>
                          <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                            {cliente?.telefono || 'Sin telefono'}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${result.ok ? 'bg-white text-success-600' : 'bg-white text-rose-500'}`}
                        >
                          {result.ok ? 'OK' : 'Error'}
                        </span>
                      </div>
                      <p className="mt-3 text-xs font-medium text-gray-600">
                        {result.url
                          ? 'Listo para abrir el contacto manualmente.'
                          : result.error || `Procesado por ${result.mode || 'manual'}`}
                      </p>
                      {result.url && (
                        <button
                          onClick={() => window.open(result.url, '_blank')}
                          className="mt-3 rounded-[16px] border border-gray-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-success-500"
                        >
                          Abrir contacto
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

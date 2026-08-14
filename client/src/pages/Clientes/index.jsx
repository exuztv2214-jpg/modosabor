import { useState } from 'react';

import { APP_BG } from '../../lib/theme.js';
import ClientesGrid from '../../components/Clientes/ClientesGrid.jsx';
import ClientesCampaignsSection from '../../components/Clientes/ClientesCampaignsSection.jsx';
import ActionDialog from '../../components/ActionDialog.jsx';
import { useClientes } from './useClientes.jsx';
import ClientesHeader from './ClientesHeader.jsx';
import FidelizacionConfigModal from './FidelizacionConfigModal.jsx';
import ClienteFormModal from './ClienteFormModal.jsx';
import ClienteDetailModal from './ClienteDetailModal.jsx';
// `DeleteDialog` era un wrapper que recibía ocho props y las pasaba tal cual
// a `ActionDialog`, sin agregar nada. Se usa el componente directo.

export default function Clientes() {
  const hook = useClientes();
  const [tab, setTab] = useState('clientes');

  const hayFiltros =
    Boolean(hook.search.trim()) ||
    hook.filtroNivel !== 'Todos' ||
    hook.filtroEstado !== 'Todos' ||
    hook.filtroBeneficio !== 'Todos';

  const limpiarFiltros = () => {
    hook.setSearch('');
    hook.setFiltroNivel('Todos');
    hook.setFiltroEstado('Todos');
    hook.setFiltroBeneficio('Todos');
  };

  /**
   * Al lanzar una campaña desde un segmento, el hook cambia el filtro de
   * estado para que la lista quede acompañando. Si el usuario está en la
   * pestaña de campañas eso no se ve, así que la abrimos nosotros.
   */
  const lanzarCampana = (segmento) => {
    hook.launchSegmentCampaign(segmento);
    setTab('campanas');
  };

  const verSegmento = (filtro) => {
    hook.setFiltroEstado(filtro);
    setTab('clientes');
  };

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        <ClientesHeader
          search={hook.search}
          setSearch={hook.setSearch}
          filtroNivel={hook.filtroNivel}
          setFiltroNivel={hook.setFiltroNivel}
          filtroEstado={hook.filtroEstado}
          setFiltroEstado={hook.setFiltroEstado}
          filtroBeneficio={hook.filtroBeneficio}
          setFiltroBeneficio={hook.setFiltroBeneficio}
          stats={hook.stats}
          resultados={hook.filtered.length}
          loading={hook.loading}
          canManageFidelidadConfig={hook.canManageFidelidadConfig}
          onConfig={hook.onConfig}
          onExport={hook.onExport}
          onNuevo={hook.onNuevo}
          onRefresh={hook.onRefresh}
          fmtMoney={hook.fmtMoney}
        />

        {/*
          Las campañas ocupaban la mitad superior del módulo. Acá son una
          pestaña: lo primero que ves en "Clientes" son los clientes.
        */}
        <div className="flex w-fit rounded-xl bg-gray-200/70 p-1">
          {[
            { key: 'clientes', label: `Clientes (${hook.filtered.length})` },
            { key: 'campanas', label: 'Campañas' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition ${
                tab === item.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'clientes' ? (
          <ClientesGrid
            filtered={hook.filtered}
            abrirDetalle={hook.abrirDetalle}
            getClienteEstado={hook.getClienteEstado}
            getCardQuickAction={hook.getCardQuickAction}
            fmtMoney={hook.fmtMoney}
            formatPedidoDate={hook.formatPedidoDate}
            sellosParaPremio={hook.sellosParaPremio}
            hayFiltros={hayFiltros}
            onLimpiarFiltros={limpiarFiltros}
            onNuevo={hook.onNuevo}
            toast={hook.toast}
          />
        ) : (
          <ClientesCampaignsSection
            segmentHighlights={hook.segmentHighlights}
            setFiltroEstado={verSegmento}
            launchSegmentCampaign={lanzarCampana}
            campaignDashboardStats={hook.campaignDashboardStats}
            campaignSegmentStats={hook.campaignSegmentStats}
            campaignTopCampaign={hook.campaignTopCampaign}
            formatPedidoDate={hook.formatPedidoDate}
            fmtMoney={hook.fmtMoney}
            campaignModal={hook.campaignModal}
            getSegmentMessage={hook.getSegmentMessage}
            setCampaignMessage={hook.setCampaignMessage}
            sendCampaign={hook.sendCampaign}
            campaignSending={hook.campaignSending}
            setCampaignModal={hook.setCampaignModal}
            campaignVariables={hook.campaignVariables}
            insertCampaignVariable={hook.insertCampaignVariable}
            campaignMessage={hook.campaignMessage}
            copyToClipboard={hook.copyToClipboard}
            openCampaignPreview={hook.openCampaignPreview}
            saveCampaignTemplate={hook.saveCampaignTemplate}
            registerCampaignHistory={hook.registerCampaignHistory}
            getWhatsAppLink={hook.getWhatsAppLink}
            campaignMetrics={hook.campaignMetrics}
            campaignHistoryFilter={hook.campaignHistoryFilter}
            setCampaignHistoryFilter={hook.setCampaignHistoryFilter}
            campaignHistoryFilters={hook.CAMPAIGN_HISTORY_FILTERS}
            filteredCampaignHistory={hook.filteredCampaignHistory}
            reopenCampaignFromHistory={hook.reopenCampaignFromHistory}
          />
        )}
      </div>

      <FidelizacionConfigModal
        open={hook.configModal}
        onClose={hook.onCloseConfig}
        fidelidadConfig={hook.fidelidadConfig}
        setFidelidadConfig={hook.setFidelidadConfig}
        saveConfig={hook.saveConfig}
        saving={hook.saving}
        canManageFidelidadConfig={hook.canManageFidelidadConfig}
        fmtMoney={hook.fmtMoney}
      />

      <ClienteFormModal
        modal={hook.modal}
        onClose={hook.onCloseForm}
        form={hook.form}
        setForm={hook.setForm}
        save={hook.save}
        saving={hook.saving}
        handleFileChange={hook.handleFileChange}
        fileInputRef={hook.fileInputRef}
        localAvatars={hook.LOCAL_AVATARS}
      />

      <ClienteDetailModal
        detalle={hook.detalle}
        onClose={hook.onCloseDetail}
        detalleTimeline={hook.detalleTimeline}
        detalleDirecciones={hook.detalleDirecciones}
        detalleDireccionPrincipal={hook.detalleDireccionPrincipal}
        detalleClubUrl={hook.detalleClubUrl}
        branding={hook.branding}
        brandingLogoUrl={hook.brandingLogoUrl}
        publicAppDiagnostics={hook.publicAppDiagnostics}
        sellosParaPremio={hook.sellosParaPremio}
        isProfileIncomplete={hook.isProfileIncomplete}
        getClienteEstado={hook.getClienteEstado}
        formatPedidoDate={hook.formatPedidoDate}
        fmtMoney={hook.fmtMoney}
        getPrimaryPhoneLink={hook.getPrimaryPhoneLink}
        getWhatsAppLink={hook.getWhatsAppLink}
        getRecoveryMessage={hook.getRecoveryMessage}
        handleEdit={hook.handleEdit}
        deleteCliente={hook.deleteCliente}
        canjearPremio={hook.canjearPremio}
        copyToClipboard={hook.copyToClipboard}
        printLoyaltyCard={hook.printLoyaltyCard}
        openWhatsAppCardShare={hook.openWhatsAppCardShare}
      />

      <ActionDialog
        open={Boolean(hook.deleteDialog)}
        title="Eliminar cliente"
        description="Se borra el cliente del sistema junto con sus sellos y premios acumulados. Los pedidos que ya hizo quedan en el historial de ventas."
        confirmLabel="Eliminar cliente"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={hook.confirmarEliminarCliente}
        onClose={() => hook.setDeleteDialog(null)}
      />

      <ActionDialog
        open={Boolean(hook.rewardDialog)}
        title="Canjear premio"
        description="Se descuenta un premio del cliente y queda listo para aplicar en la venta. No se puede deshacer."
        confirmLabel="Canjear premio"
        cancelLabel="Cancelar"
        tone="primary"
        onConfirm={hook.confirmarCanjePremio}
        onClose={() => hook.setRewardDialog(null)}
      />
    </div>
  );
}

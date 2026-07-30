import { useClientes } from './useClientes.jsx';
import ClientesHeader from './ClientesHeader.jsx';
import ClientesTable from './ClientesTable.jsx';
import FidelizacionConfigModal from './FidelizacionConfigModal.jsx';
import ClienteFormModal from './ClienteFormModal.jsx';
import ClienteDetailModal from './ClienteDetailModal.jsx';
import { AvatarDisplay } from './ClienteDetailModal.jsx';
import DeleteDialog from './DeleteDialog.jsx';

export default function Clientes() {
  const hook = useClientes();

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
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
          loading={hook.loading}
          canManageFidelidadConfig={hook.canManageFidelidadConfig}
          onConfig={hook.onConfig}
          onExport={hook.onExport}
          onNuevo={hook.onNuevo}
          onRefresh={hook.onRefresh}
          fmtMoney={hook.fmtMoney}
          control={hook.CONTROL}
        />
        <ClientesTable
          filtered={hook.filtered}
          segmentHighlights={hook.segmentHighlights}
          setFiltroEstado={hook.setFiltroEstado}
          launchSegmentCampaign={hook.launchSegmentCampaign}
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
          CAMPAIGN_HISTORY_FILTERS={hook.CAMPAIGN_HISTORY_FILTERS}
          filteredCampaignHistory={hook.filteredCampaignHistory}
          reopenCampaignFromHistory={hook.reopenCampaignFromHistory}
          abrirDetalle={hook.abrirDetalle}
          AvatarDisplay={AvatarDisplay}
          getEstadoBadge={hook.getEstadoBadge}
          sellosParaPremio={hook.sellosParaPremio}
          getCardQuickAction={hook.getCardQuickAction}
          toast={hook.toast}
        />
      </div>

      <FidelizacionConfigModal
        open={hook.configModal}
        onClose={hook.onCloseConfig}
        fidelidadConfig={hook.fidelidadConfig}
        setFidelidadConfig={hook.setFidelidadConfig}
        saveConfig={hook.saveConfig}
        saving={hook.saving}
        canManageFidelidadConfig={hook.canManageFidelidadConfig}
        control={hook.CONTROL}
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
        emptyForm={hook.EMPTY_FORM}
        localAvatars={hook.LOCAL_AVATARS}
        control={hook.CONTROL}
        AvatarDisplay={AvatarDisplay}
      />

      <ClienteDetailModal
        detalle={hook.detalle}
        onClose={hook.onCloseDetail}
        detalleEstado={hook.detalleEstado}
        detalleTimeline={hook.detalleTimeline}
        detalleDirecciones={hook.detalleDirecciones}
        detalleDireccionPrincipal={hook.detalleDireccionPrincipal}
        detalleCardCode={hook.detalleCardCode}
        detalleClubUrl={hook.detalleClubUrl}
        branding={hook.branding}
        brandingLogoUrl={hook.brandingLogoUrl}
        publicAppDiagnostics={hook.publicAppDiagnostics}
        sellosParaPremio={hook.sellosParaPremio}
        isProfileIncomplete={hook.isProfileIncomplete}
        getTimelineTone={hook.getTimelineTone}
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
        buildPublicAppUrl={hook.buildPublicAppUrl}
      />

      <DeleteDialog
        open={Boolean(hook.deleteDialog)}
        title="Eliminar cliente"
        description="Se borrará este cliente del sistema. Conviene hacerlo solo si es un registro de prueba o duplicado."
        confirmLabel="Eliminar cliente"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={hook.confirmarEliminarCliente}
        onClose={() => hook.setDeleteDialog(null)}
      />

      <DeleteDialog
        open={Boolean(hook.rewardDialog)}
        title="Canjear recompensa"
        description="Se descontará una recompensa por sellos del cliente y quedará lista para usar en venta."
        confirmLabel="Canjear recompensa"
        cancelLabel="Cancelar"
        tone="primary"
        onConfirm={hook.confirmarCanjePremio}
        onClose={() => hook.setRewardDialog(null)}
      />
    </div>
  );
}

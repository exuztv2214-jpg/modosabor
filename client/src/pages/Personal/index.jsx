import { usePersonal } from './usePersonal.js';
import { PersonalHeader } from './PersonalHeader.jsx';
import { PersonalList } from './PersonalList.jsx';
import { ProfileCard } from './ProfileCard.jsx';
import { TabsNav } from './TabsNav.jsx';
import { ResumenTab } from './tabs/ResumenTab.jsx';
import { EquipoTab } from './tabs/EquipoTab.jsx';
import { PlanillaTab } from './tabs/PlanillaTab.jsx';
import { MovimientosTab } from './tabs/MovimientosTab.jsx';
import { TrayectoriaTab } from './tabs/TrayectoriaTab.jsx';
import { PuntosTab } from './tabs/PuntosTab.jsx';
import { FormModal } from './modals/FormModal.jsx';
import { MovementModal } from './modals/MovementModal.jsx';
import { SettlementModal } from './modals/SettlementModal.jsx';
import { DeleteDialog } from './modals/DeleteDialog.jsx';
import { ReconocimientoModal } from './modals/ReconocimientoModal.jsx';
import { PremiosModal } from './modals/PremiosModal.jsx';
import { AvatarPickerModal } from './modals/AvatarPickerModal.jsx';
import { Users, RefreshCw } from 'lucide-react';

export default function Personal() {
  const p = usePersonal();

  const handleOpenSettlement = () => {
    p.setSettlementForm((prev) => ({
      ...prev,
      unidades: String(p.detail?.resumen_laboral?.unidades_sugeridas || '1'),
      periodo_desde: p.detail?.resumen_laboral?.periodo_desde || '',
      periodo_hasta: p.detail?.resumen_laboral?.periodo_hasta || '',
      metodo_pago: p.selectedPerson?.medio_pago_preferido || prev.metodo_pago || 'efectivo',
    }));
    p.setSettlementModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      <PersonalHeader
        stats={p.stats}
        turnoActual={p.turnoActual}
        onRefresh={() => p.cargar()}
        onNuevo={p.abrirNuevo}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <PersonalList
          personal={p.personal}
          selectedId={p.selectedId}
          onSelectId={p.setSelectedId}
        />

        <div className="lg:col-span-8 space-y-6">
          {p.detailLoading ? (
            <div className="flex flex-col items-center justify-center py-24 bg-white rounded-xl border border-gray-100 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
              <RefreshCw className="animate-spin text-primary-500 mb-4" size={32} />
              <p className="text-sm font-bold text-gray-500">Cargando ficha...</p>
            </div>
          ) : p.detail ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="rounded-xl bg-white shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 overflow-hidden">
                <div className="h-24 bg-primary-500/10 flex items-center px-8">
                  {p.detail.item.categoria_nombre && (
                    <span className="px-3 py-1 rounded-full bg-white/80 backdrop-blur-sm text-[10px] font-bold text-primary-500 border border-primary-500/20 flex items-center gap-1.5 shadow-sm">
                      {p.detail.item.categoria_icono} {p.detail.item.categoria_nombre.toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="px-8 pb-4">
                  <ProfileCard
                    detail={p.detail}
                    selectedPerson={p.selectedPerson}
                    onEditar={p.abrirEditar}
                    onLiquidar={handleOpenSettlement}
                    onEliminar={p.eliminar}
                  />
                  <TabsNav activeTab={p.activeTab} onTabChange={p.setActiveTab} />
                </div>
              </div>

              <div className="animate-in fade-in duration-300">
                {p.activeTab === 'resumen' && (
                  <ResumenTab
                    detail={p.detail}
                    publicAppDiagnostics={p.publicAppDiagnostics}
                    getClockUrl={p.getClockUrl}
                    copyText={p.copyText}
                    onOpenMovementModal={() => p.setMovementModal(true)}
                    onOpenSettlementModal={handleOpenSettlement}
                  />
                )}
                {p.activeTab === 'equipo' && (
                  <EquipoTab
                    attendanceSummary={p.attendanceSummary}
                    turnoActual={p.turnoActual}
                    saving={p.saving}
                    registrarAsistencia={p.registrarAsistencia}
                    attendanceForm={p.attendanceForm}
                    setAttendanceForm={p.setAttendanceForm}
                    currentAttendance={p.currentAttendance}
                    shiftMetrics={p.shiftMetrics}
                    attendanceRange={p.attendanceRange}
                    setAttendanceRange={p.setAttendanceRange}
                    cargarAnaliticaAsistencia={p.cargarAnaliticaAsistencia}
                    attendanceAnalytics={p.attendanceAnalytics}
                    goalForm={p.goalForm}
                    setGoalForm={p.setGoalForm}
                    guardarObjetivo={p.guardarObjetivo}
                    detail={p.detail}
                    marcarObjetivoCumplido={p.marcarObjetivoCumplido}
                    productCatalog={p.productCatalog}
                    productConsumptionForm={p.productConsumptionForm}
                    setProductConsumptionForm={p.setProductConsumptionForm}
                    registrarConsumoProducto={p.registrarConsumoProducto}
                  />
                )}
                {p.activeTab === 'planilla' && (
                  <PlanillaTab
                    weeklyBoard={p.weeklyBoard}
                    cargarPlanillaSemanal={p.cargarPlanillaSemanal}
                    weeklySummary={p.weeklySummary}
                    weeklyRow={p.weeklyRow}
                    selectedId={p.selectedId}
                    onSelectId={p.setSelectedId}
                    seleccionarDiaPlanilla={p.seleccionarDiaPlanilla}
                    weeklyEditor={p.weeklyEditor}
                    setWeeklyEditor={p.setWeeklyEditor}
                    guardarAsistenciaManual={p.guardarAsistenciaManual}
                    saving={p.saving}
                    weeklyEditorDay={p.weeklyEditorDay}
                  />
                )}
                {p.activeTab === 'movimientos' && <MovimientosTab detail={p.detail} />}
                {p.activeTab === 'trayectoria' && <TrayectoriaTab detail={p.detail} />}
                {p.activeTab === 'puntos' && (
                  <PuntosTab
                    detail={p.detail}
                    onOpenPremios={() => p.setPremiosModal(true)}
                    onOpenReconocimiento={() => p.setReconocimientoModal(true)}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 bg-white rounded-xl border border-dashed border-gray-200 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
              <Users size={48} strokeWidth={1} className="text-gray-200 mb-4" />
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                Selecciona un miembro para ver su ficha
              </p>
            </div>
          )}
        </div>
      </div>

      <FormModal
        modal={p.modal}
        onClose={() => p.setModal(null)}
        form={p.form}
        onFormChange={p.setForm}
        onGuardar={p.guardar}
        saving={p.saving}
        categorias={p.categorias}
        avatarPickerOpen={p.avatarPickerOpen}
        onAvatarPickerOpen={() => p.setAvatarPickerOpen(true)}
        onSelectAvatar={(url) => {
          p.setForm((prev) => ({ ...prev, avatar_url: url }));
          p.setAvatarPickerOpen(false);
        }}
        fileInputRef={p.fileInputRef}
        handleFileUpload={p.handleFileUpload}
      />

      <AvatarPickerModal
        open={p.avatarPickerOpen}
        onClose={() => p.setAvatarPickerOpen(false)}
        form={p.form}
        onSelectAvatar={(url) => {
          p.setForm((prev) => ({ ...prev, avatar_url: url }));
          p.setAvatarPickerOpen(false);
        }}
        fileInputRef={p.fileInputRef}
        handleFileUpload={p.handleFileUpload}
      />

      <MovementModal
        open={p.movementModal}
        onClose={() => p.setMovementModal(false)}
        movementForm={p.movementForm}
        onMovementFormChange={p.setMovementForm}
        selectedPerson={p.selectedPerson}
        saving={p.saving}
        onConfirm={p.registrarMovimiento}
      />

      <SettlementModal
        open={p.settlementModal}
        onClose={() => p.setSettlementModal(false)}
        settlementForm={p.settlementForm}
        onSettlementFormChange={p.setSettlementForm}
        selectedPerson={p.selectedPerson}
        detail={p.detail}
        liquidacionPreview={p.liquidacionPreview}
        onConfirmar={p.confirmarLiquidacion}
        onAuto={p.liquidarAutomatico}
        saving={p.saving}
      />

      <ReconocimientoModal
        open={p.reconocimientoModal}
        onClose={() => p.setReconocimientoModal(false)}
        detail={p.detail}
        form={p.reconocimientoForm}
        onFormChange={p.setReconocimientoForm}
        saving={p.reconocimientoSaving}
        onConfirm={p.submitReconocimiento}
      />

      <PremiosModal
        open={p.premiosModal}
        onClose={() => p.setPremiosModal(false)}
        detail={p.detail}
      />

      <DeleteDialog
        open={Boolean(p.deleteDialog)}
        item={p.deleteDialog}
        onClose={() => p.setDeleteDialog(null)}
        onConfirm={p.confirmarEliminar}
      />
    </div>
  );
}

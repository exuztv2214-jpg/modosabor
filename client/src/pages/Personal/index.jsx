import { Users, RefreshCw } from 'lucide-react';
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
    <div className="space-y-4 py-6">
      <PersonalHeader
        stats={p.stats}
        turnoActual={p.turnoActual}
        onRefresh={() => p.cargar()}
        onNuevo={p.abrirNuevo}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <PersonalList
          personal={p.personalFiltrado}
          totalSinFiltrar={p.personal.length}
          selectedId={p.selectedId}
          onSelectId={p.setSelectedId}
          busqueda={p.busqueda}
          onBusquedaChange={p.setBusqueda}
          filtroEstado={p.filtroEstado}
          onFiltroChange={p.setFiltroEstado}
        />

        <div className="space-y-4 lg:col-span-8">
          {p.detailLoading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-24 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <RefreshCw className="mb-3 animate-spin text-gray-300" size={26} strokeWidth={2} />
              <p className="text-[13px] text-gray-500">Cargando ficha…</p>
            </div>
          ) : p.detail ? (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
                {/* La banda usa el color de la categoría cargada en el sistema;
                    antes era un celeste fijo derivado del tema viejo. */}
                <div
                  className="flex h-20 items-center px-6"
                  style={{ background: p.detail.item.categoria_color || '#F1F5F9' }}
                >
                  {p.detail.item.categoria_nombre ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm">
                      {p.detail.item.categoria_icono} {p.detail.item.categoria_nombre}
                    </span>
                  ) : null}
                </div>
                <div className="px-6 pb-2">
                  <ProfileCard
                    detail={p.detail}
                    onEditar={p.abrirEditar}
                    onLiquidar={handleOpenSettlement}
                    onEliminar={p.eliminar}
                  />
                  <TabsNav activeTab={p.activeTab} onTabChange={p.setActiveTab} />
                </div>
              </div>

              <div>
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
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-32 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <Users size={40} strokeWidth={1.4} className="mb-3 text-gray-200" />
              <p className="text-[14px] font-medium text-gray-600">Elegí a alguien de la lista</p>
              <p className="mt-1 text-[12px] text-gray-400">
                Vas a ver su asistencia, sueldo y movimientos.
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
        onAvatarPickerOpen={() => p.setAvatarPickerOpen(true)}
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
        config={p.reconocimientosConfig}
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

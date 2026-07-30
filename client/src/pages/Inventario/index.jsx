import { X, AlertTriangle, Copy, Printer } from 'lucide-react';
import useInventario from './useInventario';
import InventarioHeader from './InventarioHeader';
import StockTable from './StockTable';
import MovimientosTable from './MovimientosTable';
import RecetasPanel from './RecetasPanel';
import InsumoFormModal from './InsumoFormModal';
import AjusteStockModal from './AjusteStockModal';
import DeleteDialog from './DeleteDialog';
import { CONTROL } from './constants';

export default function Inventario() {
  const {
    insumos,
    productos,
    movimientos,
    saving,
    selectedProductId,
    busqueda,
    insumoModal,
    insumoForm,
    movementModal,
    movementForm,
    compraModal,
    compraForm,
    deleteDialog,
    movFechaDesde,
    movFechaHasta,
    productConfig,
    recipeRows,
    selectedProduct,
    stats,
    filteredInsumos,
    movFiltrados,
    faltantes,
    sharedBases,
    setBusqueda,
    setSelectedProductId,
    setMovFechaDesde,
    setMovFechaHasta,
    setProductConfig,
    setRecipeRows,
    setInsumoForm,
    setCompraForm,
    setCompraModal,
    setMovementForm,
    setMovementModal,
    openNewInsumo,
    openEditInsumo,
    closeInsumoModal,
    saveInsumo,
    openDeleteInsumo,
    closeDeleteDialog,
    confirmDeleteInsumo,
    openCompraModal,
    addCompraItem,
    updateCompraItem,
    registrarCompra,
    saveRecipe,
    saveProductConfig,
    syncPizzasWithPrepizza,
    syncEmpanadasWithStock,
    syncMilanesasWithStock,
    syncHamburguesasWithStock,
    syncPapasWithStock,
    copyShoppingList,
    exportarInsumosCSV,
    exportarHistorialMovimientosCSV,
    printFaltantes,
    closeMovementModal,
    registrarMovimiento,
  } = useInventario();

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <InventarioHeader
          stats={stats}
          faltantes={faltantes}
          onOpenCompraModal={openCompraModal}
          onOpenNewInsumo={openNewInsumo}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <StockTable
              filteredInsumos={filteredInsumos}
              busqueda={busqueda}
              sharedBases={sharedBases}
              onSetBusqueda={setBusqueda}
              onOpenEditInsumo={openEditInsumo}
              onExportarInsumosCSV={exportarInsumosCSV}
              onSetMovementModal={setMovementModal}
              onDeleteInsumo={openDeleteInsumo}
            />
            <RecetasPanel
              productos={productos}
              selectedProductId={selectedProductId}
              selectedProduct={selectedProduct}
              productConfig={productConfig}
              recipeRows={recipeRows}
              insumos={insumos}
              saving={saving}
              onSetSelectedProductId={setSelectedProductId}
              onSetProductConfig={setProductConfig}
              onSaveProductConfig={saveProductConfig}
              onSyncPizzas={syncPizzasWithPrepizza}
              onSyncEmpanadas={syncEmpanadasWithStock}
              onSyncMilanesas={syncMilanesasWithStock}
              onSyncHamburguesas={syncHamburguesasWithStock}
              onSyncPapas={syncPapasWithStock}
              onSetRecipeRows={setRecipeRows}
              onSaveRecipe={saveRecipe}
            />
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] bg-white p-6 shadow-sm border border-gray-100 h-fit">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                  Faltantes
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={copyShoppingList}
                    className="h-9 w-9 rounded-xl bg-primary-50 flex items-center justify-center text-primary-500 hover:bg-[#DDE8FF]"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    onClick={printFaltantes}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500 text-white hover:bg-primary-600"
                  >
                    <Printer size={16} />
                  </button>
                </div>
              </div>

              <div className="space-y-2.5">
                {faltantes.length === 0 ? (
                  <div className="py-6 text-center bg-[#E6FFFA] rounded-[20px] border border-success-500/20">
                    <p className="text-xs font-black text-success-500 uppercase tracking-widest">
                      Todo bajo control
                    </p>
                  </div>
                ) : (
                  faltantes.map((i) => (
                    <div
                      key={i.id}
                      className="flex items-center gap-3 p-3 rounded-[18px] bg-danger-50 border border-rose-100"
                    >
                      <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-rose-900 truncate uppercase tracking-tight">
                          {i.nombre}
                        </p>
                        <p className="text-[10px] font-bold text-danger-600">
                          FALTAN {i.faltante} {i.unidad}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <MovimientosTable
              movFiltrados={movFiltrados}
              movimientosCount={movimientos.length}
              movFechaDesde={movFechaDesde}
              movFechaHasta={movFechaHasta}
              onSetMovFechaDesde={setMovFechaDesde}
              onSetMovFechaHasta={setMovFechaHasta}
              onExportarHistorialMovimientosCSV={exportarHistorialMovimientosCSV}
            />
          </div>
        </div>
      </div>

      {/* MODAL NUEVA COMPRA */}
      {compraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-6 w-1 bg-primary-500 rounded-full"></div>
                  <p className="text-xs font-black text-primary-500 uppercase tracking-[0.2em]">
                    Ingreso de Mercadería
                  </p>
                </div>
                <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
                  Registrar Compra
                </h3>
              </div>
              <button
                onClick={() => setCompraModal(false)}
                className="rounded-full p-2 hover:bg-gray-100 transition-colors"
              >
                <X size={24} className="text-gray-400" />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-2 no-scrollbar space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Proveedor
                  </label>
                  <input
                    value={compraForm.proveedor}
                    onChange={(e) => setCompraForm((p) => ({ ...p, proveedor: e.target.value }))}
                    placeholder="Nombre del proveedor"
                    className={CONTROL + ' mt-1'}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                    Método de Pago
                  </label>
                  <select
                    value={compraForm.metodo_pago}
                    onChange={(e) => setCompraForm((p) => ({ ...p, metodo_pago: e.target.value }))}
                    className={CONTROL + ' mt-1'}
                  >
                    <option value="efectivo">Efectivo de Caja</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cuenta_corriente">Cuenta Corriente (Deuda)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                  Detalle de Productos
                </p>
                {compraForm.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-[1fr_100px_140px_40px] gap-3 bg-gray-50 p-4 rounded-[24px] border border-gray-100"
                  >
                    <select
                      value={item.insumo_id}
                      onChange={(e) => updateCompraItem(idx, 'insumo_id', e.target.value)}
                      className={CONTROL + ' h-10 px-3 bg-white'}
                    >
                      <option value="">Elegir Insumo...</option>
                      {insumos.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={(e) => updateCompraItem(idx, 'cantidad', e.target.value)}
                      placeholder="Cant."
                      className={CONTROL + ' h-10 px-3 bg-white'}
                    />
                    <input
                      type="number"
                      value={item.costo_unitario}
                      onChange={(e) => updateCompraItem(idx, 'costo_unitario', e.target.value)}
                      placeholder="Costo u."
                      className={CONTROL + ' h-10 px-3 bg-white'}
                    />
                    <button
                      onClick={() =>
                        setCompraForm((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))
                      }
                      className="h-10 w-10 rounded-xl bg-white text-rose-400 flex items-center justify-center hover:bg-danger-50 transition-all border border-gray-100"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addCompraItem}
                  className="w-full h-12 rounded-[24px] border-2 border-dashed border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-all"
                >
                  + AGREGAR OTRO ITEM
                </button>
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={() => setCompraModal(false)}
                className="flex-1 h-14 rounded-2xl border border-gray-200 text-sm font-black text-gray-500 uppercase tracking-widest hover:bg-gray-50 transition-all"
              >
                CANCELAR
              </button>
              <button
                onClick={registrarCompra}
                disabled={saving}
                className="flex-[2] h-14 rounded-2xl bg-primary-500 text-sm font-black text-white uppercase tracking-widest shadow-lg shadow-primary-100 hover:bg-primary-600 active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? 'REGISTRANDO...' : 'CONFIRMAR COMPRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      <InsumoFormModal
        insumoModal={insumoModal}
        insumoForm={insumoForm}
        saving={saving}
        onCloseInsumoModal={closeInsumoModal}
        onSaveInsumo={saveInsumo}
        onSetInsumoForm={setInsumoForm}
      />

      <AjusteStockModal
        movementModal={movementModal}
        movementForm={movementForm}
        saving={saving}
        onCloseMovementModal={closeMovementModal}
        onRegistrarMovimiento={registrarMovimiento}
        onSetMovementForm={setMovementForm}
      />

      <DeleteDialog
        open={Boolean(deleteDialog)}
        title="Eliminar insumo"
        message={
          deleteDialog
            ? `¿Seguro que querés eliminar "${deleteDialog.nombre}"? Esta acción no se puede deshacer.`
            : ''
        }
        saving={saving}
        onConfirm={confirmDeleteInsumo}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}

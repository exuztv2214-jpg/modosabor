import { AlertTriangle, Copy, Printer } from 'lucide-react';

import { APP_BG, BRAND, STROKE } from '../../lib/theme.js';
// Una sola implementación del alta de compra, compartida con el módulo
// Compras. Inventario tenía la suya, peor y desactualizada.
import NuevaCompraModal from '../../components/Compras/NuevaCompraModal.jsx';
import useInventario from './useInventario';
import InventarioHeader from './InventarioHeader';
import StockTable from './StockTable';
import MovimientosTable from './MovimientosTable';
import RecetasPanel from './RecetasPanel';
import InsumoFormModal from './InsumoFormModal';
import AjusteStockModal from './AjusteStockModal';
import DeleteDialog from './DeleteDialog';

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
    deleteDialog,
    movFechaDesde,
    movFechaHasta,
    productConfig,
    recipeRows,
    selectedProduct,
    stats,
    filteredInsumos,
    movFiltrados,
    historialTruncado,
    faltantes,
    sharedBases,
    setBusqueda,
    setSelectedProductId,
    setMovFechaDesde,
    setMovFechaHasta,
    setProductConfig,
    setRecipeRows,
    setInsumoForm,
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
    cargar,
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
    <div className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-7xl space-y-4 pb-10">
        <InventarioHeader
          stats={stats}
          faltantes={faltantes}
          onOpenCompraModal={openCompraModal}
          onOpenNewInsumo={openNewInsumo}
        />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
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

          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">Faltantes</h3>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    {faltantes.length === 0
                      ? 'Nada por debajo del mínimo'
                      : `${faltantes.length} ${faltantes.length === 1 ? 'insumo' : 'insumos'} para reponer`}
                  </p>
                </div>
                {faltantes.length > 0 ? (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={copyShoppingList}
                      title="Copiar lista de compras"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
                    >
                      <Copy size={15} strokeWidth={STROKE} />
                    </button>
                    <button
                      type="button"
                      onClick={printFaltantes}
                      title="Imprimir lista"
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
                    >
                      <Printer size={15} strokeWidth={STROKE} />
                    </button>
                  </div>
                ) : null}
              </div>

              {faltantes.length === 0 ? (
                <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[13px] text-gray-500">
                  Todo el stock está por encima del mínimo.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {faltantes.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
                      style={{ background: '#FEF2F2' }}
                    >
                      <AlertTriangle
                        size={15}
                        strokeWidth={STROKE}
                        className="shrink-0"
                        style={{ color: BRAND }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[13px] font-medium"
                          style={{ color: '#7F1D1D' }}
                        >
                          {item.nombre}
                        </p>
                        <p className="text-[11px]" style={{ color: '#9E141E' }}>
                          Faltan {item.faltante} {item.unidad} · hay {item.stock_actual}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMovementModal(item)}
                        title="Cargar entrada"
                        className="shrink-0 rounded-lg bg-white/70 px-2 py-1 text-[11px] font-semibold transition hover:bg-white"
                        style={{ color: '#9E141E' }}
                      >
                        Cargar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <MovimientosTable
              movFiltrados={movFiltrados}
              movimientosCount={movimientos.length}
              historialTruncado={historialTruncado}
              movFechaDesde={movFechaDesde}
              movFechaHasta={movFechaHasta}
              onSetMovFechaDesde={setMovFechaDesde}
              onSetMovFechaHasta={setMovFechaHasta}
              onExportarHistorialMovimientosCSV={exportarHistorialMovimientosCSV}
            />
          </div>
        </div>
      </div>

      {/*
        Abrir la compra desde acá precarga los insumos que están por debajo
        del mínimo con la cantidad que falta: es la razón por la que existe
        este acceso además del módulo Compras.
      */}
      {compraModal && (
        <NuevaCompraModal
          insumos={insumos}
          faltantes={faltantes}
          onClose={() => setCompraModal(false)}
          onSaved={() => {
            setCompraModal(false);
            cargar();
          }}
        />
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
            ? `Se elimina "${deleteDialog.nombre}" del inventario. Si alguna receta lo usa, esa receta queda incompleta. No se puede deshacer.`
            : ''
        }
        saving={saving}
        onConfirm={confirmDeleteInsumo}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}

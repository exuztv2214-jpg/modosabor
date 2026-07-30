import useProductos from './useProductos';
import ProductosHeader from './ProductosHeader';
import ProductosGrid from './ProductosGrid';
import ProductoFormModal from './ProductoFormModal';
import ProductoDetailModal from './ProductoDetailModal';
import DeleteDialog from './DeleteDialog';

export default function Productos() {
  const hook = useProductos();

  return (
    <div className="mx-auto max-w-7xl animate-fade-in space-y-6 px-4 pb-8 pt-6 sm:px-6 lg:px-8">
      <ProductosHeader
        stats={hook.stats}
        busqueda={hook.busqueda}
        onBusquedaChange={hook.setBusqueda}
        filtroCategoria={hook.filtroCategoria}
        onFiltroCategoriaChange={hook.setFiltroCategoria}
        filtroEstado={hook.filtroEstado}
        onFiltroEstadoChange={hook.setFiltroEstado}
        sortBy={hook.sortBy}
        onSortByChange={hook.setSortBy}
        viewMode={hook.viewMode}
        onViewModeChange={hook.setViewMode}
        categorias={hook.categorias}
        loading={hook.loading}
        onRecargar={hook.cargar}
        onNuevo={hook.abrirNuevo}
        filteredCount={hook.filtered.length}
        isAllSelected={hook.isAllSelected}
        onToggleSelectAll={hook.toggleSelectAll}
        selectedCount={hook.selectedIds.length}
        onBulkActivo={hook.bulkSetActivo}
        onClearSelected={() => hook.setSelectedIds([])}
      />

      <ProductosGrid
        loading={hook.loading}
        viewMode={hook.viewMode}
        filtered={hook.filtered}
        selectedIds={hook.selectedIds}
        onView={hook.setDetalle}
        onEdit={hook.abrirEditar}
        onDuplicate={hook.duplicarProducto}
        onToggle={hook.toggleActivo}
        onDelete={hook.eliminar}
        onSelect={hook.toggleSelect}
        isAllSelected={hook.isAllSelected}
        onToggleSelectAll={hook.toggleSelectAll}
      />

      <ProductoFormModal
        modal={hook.modal}
        form={hook.form}
        onFormChange={hook.handleFormChange}
        categorias={hook.categorias}
        selectedCategoryInfo={hook.selectedCategoryInfo}
        structuredPricingConfig={hook.structuredPricingConfig}
        formPriceOptions={hook.formPriceOptions}
        variantesEditor={hook.variantesEditor}
        extrasEditor={hook.extrasEditor}
        imagePreview={hook.imagePreview}
        recipeManagedStock={hook.recipeManagedStock}
        saving={hook.saving}
        categoryDialog={hook.categoryDialog}
        productosLength={hook.productos.length}
        fileInputRef={hook.fileInputRef}
        onClose={hook.cerrarModal}
        onGuardar={hook.guardar}
        onChangeCategory={hook.changeCategory}
        onImageChange={hook.handleImageChange}
        onClearImage={hook.clearImage}
        onApplyTemplate={hook.applySuggestedTemplate}
        onAddVariantGroup={hook.addVariantGroup}
        onUpdateVariantGroup={hook.updateVariantGroup}
        onRemoveVariantGroup={hook.removeVariantGroup}
        onAddVariantOption={hook.addVariantOption}
        onUpdateVariantOption={hook.updateVariantOption}
        onRemoveVariantOption={hook.removeVariantOption}
        onAddExtra={hook.addExtra}
        onUpdateExtra={hook.updateExtra}
        onRemoveExtra={hook.removeExtra}
        onToggleActivo={hook.toggleFormActivo}
        onToggleDestacado={hook.toggleFormDestacado}
        onStructuredPriceChange={hook.handleStructuredPriceChange}
        onConfirmCategoryChange={hook.confirmarCambioCategoria}
        onCloseCategoryDialog={() => hook.setCategoryDialog(null)}
      />

      <ProductoDetailModal
        detalle={hook.detalle}
        onClose={() => hook.setDetalle(null)}
        onEdit={hook.abrirEditar}
      />

      <DeleteDialog
        deleteDialog={hook.deleteDialog}
        onConfirm={hook.confirmarEliminar}
        onClose={() => hook.setDeleteDialog(null)}
      />
    </div>
  );
}

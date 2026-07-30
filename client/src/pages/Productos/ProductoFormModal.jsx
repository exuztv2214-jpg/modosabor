import { X, Plus, Trash2, ImagePlus, TimerReset } from 'lucide-react';
import ActionDialog from '../../components/ActionDialog.jsx';
import { CONTROL, fmtMoney, rgba, codeFor, normalizeExtras, getTemplateHint } from './utils';
import PriceSummary from './PriceSummary';

export default function ProductoFormModal({
  modal,
  form,
  onFormChange,
  categorias,
  selectedCategoryInfo,
  structuredPricingConfig,
  formPriceOptions,
  variantesEditor,
  extrasEditor,
  imagePreview,
  recipeManagedStock,
  saving,
  categoryDialog,
  productosLength,
  fileInputRef,
  onClose,
  onGuardar,
  onChangeCategory,
  onImageChange,
  onClearImage,
  onApplyTemplate,
  onAddVariantGroup,
  onUpdateVariantGroup,
  onRemoveVariantGroup,
  onAddVariantOption,
  onUpdateVariantOption,
  onRemoveVariantOption,
  onAddExtra,
  onUpdateExtra,
  onRemoveExtra,
  onToggleActivo,
  onToggleDestacado,
  onStructuredPriceChange,
  onConfirmCategoryChange,
  onCloseCategoryDialog,
}) {
  if (!modal) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex max-h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.26)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">
                {modal === 'nuevo' ? 'Nuevo producto' : 'Editar producto'}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-gray-950">
                {modal === 'nuevo' ? 'Crear producto' : 'Ajustar producto'}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-gray-200 text-gray-500 transition hover:bg-gray-50"
            >
              <X size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-0 lg:grid-cols-[1fr_0.95fr]">
              <div className="space-y-4 p-5">
                <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Información base
                      </p>
                      <input
                        value={form.nombre}
                        onChange={(event) => onFormChange('nombre', event.target.value)}
                        placeholder="Nombre del producto"
                        className={`${CONTROL} w-full`}
                      />
                    </div>

                    <textarea
                      value={form.descripcion}
                      onChange={(event) => onFormChange('descripcion', event.target.value)}
                      rows={3}
                      placeholder="Descripción breve para el admin, TPV y web"
                      className="min-h-[112px] rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 outline-none transition focus:border-primary-500 focus:bg-white focus:ring-4 focus:ring-[#5D87FF]/10 sm:col-span-2"
                    />

                    <select
                      value={String(form.categoria_id || '')}
                      onChange={(event) => onChangeCategory(event.target.value)}
                      className={`${CONTROL} w-full`}
                    >
                      <option value="">Selecciona una categoría</option>
                      {categorias.map((categoria) => (
                        <option key={categoria.id} value={categoria.id}>
                          {categoria.nombre}
                        </option>
                      ))}
                    </select>

                    <input
                      type="number"
                      value={form.tiempo_preparacion}
                      onChange={(event) =>
                        onFormChange('tiempo_preparacion', Number(event.target.value || 0))
                      }
                      placeholder="Tiempo de preparación"
                      className={`${CONTROL} w-full`}
                    />
                  </div>
                </section>

                <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                  <div
                    className={`grid gap-3 ${structuredPricingConfig ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}
                  >
                    {structuredPricingConfig ? (
                      formPriceOptions.map((option) => (
                        <input
                          key={`price-${option.nombre}`}
                          type="number"
                          value={option.finalPrice}
                          onChange={(event) => {
                            onStructuredPriceChange?.(option.nombre, event.target.value);
                          }}
                          placeholder={option.label}
                          className={`${CONTROL} w-full`}
                        />
                      ))
                    ) : (
                      <input
                        type="number"
                        value={form.precio}
                        onChange={(event) => onFormChange('precio', event.target.value)}
                        placeholder="Precio de venta"
                        className={`${CONTROL} w-full`}
                      />
                    )}
                    <input
                      type="number"
                      value={form.precio_anterior}
                      onChange={(event) => onFormChange('precio_anterior', event.target.value)}
                      placeholder="Precio anterior (tachado, opcional)"
                      className={`${CONTROL} w-full`}
                    />
                    <input
                      type="number"
                      value={form.costo}
                      onChange={(event) => onFormChange('costo', event.target.value)}
                      placeholder="Costo"
                      className={`${CONTROL} w-full`}
                    />
                    <input
                      type="number"
                      value={form.stock || 0}
                      onChange={(event) => onFormChange('stock', event.target.value)}
                      placeholder="Stock"
                      disabled={recipeManagedStock}
                      className={`${CONTROL} w-full disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                    />
                  </div>
                  {structuredPricingConfig && (
                    <p className="mt-3 text-xs font-semibold text-gray-500">
                      {structuredPricingConfig.helper}
                    </p>
                  )}
                  {recipeManagedStock && (
                    <p className="mt-3 text-xs font-semibold text-gray-500">
                      Este producto usa stock por receta. El ajuste de stock se hace desde
                      Inventario.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={onToggleActivo}
                      className={`inline-flex h-11 items-center rounded-2xl px-4 text-sm font-bold transition ${form.activo === 1 ? 'bg-success-50 text-success-700' : 'bg-gray-200 text-gray-600'}`}
                    >
                      {form.activo === 1 ? 'Activo' : 'Inactivo'}
                    </button>
                    <button
                      type="button"
                      onClick={onToggleDestacado}
                      className={`inline-flex h-11 items-center rounded-2xl px-4 text-sm font-bold transition ${form.destacado === 1 ? 'bg-warning-50 text-warning-700' : 'bg-gray-200 text-gray-600'}`}
                    >
                      {form.destacado === 1 ? 'Destacado' : 'Normal'}
                    </button>
                  </div>
                </section>

                <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Variantes
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        {structuredPricingConfig
                          ? 'Las presentaciones y sus precios finales se manejan arriba. Acá solo ajusta variantes avanzadas si realmente las necesitas.'
                          : 'Se usan en TPV y en la web pública con grupos y opciones.'}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-gray-400">
                        {getTemplateHint(selectedCategoryInfo?.nombre)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={onApplyTemplate}
                        className="inline-flex h-10 items-center rounded-2xl border border-gray-200 bg-white px-4 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                      >
                        Usar plantilla
                      </button>
                      <button
                        type="button"
                        onClick={onAddVariantGroup}
                        className="inline-flex h-10 items-center rounded-2xl bg-primary-500 px-4 text-xs font-bold text-white transition hover:bg-[#4A74EF]"
                      >
                        <Plus size={14} className="mr-1.5" />
                        Agregar grupo
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {variantesEditor.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-400">
                        Este producto no tiene variantes cargadas todavía.
                      </div>
                    ) : (
                      variantesEditor.map((group, groupIndex) => (
                        <div
                          key={`group-${groupIndex}`}
                          className="rounded-[22px] border border-white bg-white p-3 shadow-sm"
                        >
                          <div className="flex items-center gap-2">
                            <input
                              value={group.nombre}
                              onChange={(event) =>
                                onUpdateVariantGroup(groupIndex, event.target.value)
                              }
                              placeholder={`Grupo ${groupIndex + 1} - ej: Tamaño`}
                              className={`${CONTROL} h-10 flex-1 border-0 bg-gray-50 px-3 focus:bg-white`}
                            />
                            <button
                              type="button"
                              onClick={() => onRemoveVariantGroup(groupIndex)}
                              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 text-danger-600 transition hover:bg-danger-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="mt-3 space-y-2">
                            {(group.opciones || []).map((option, optionIndex) => (
                              <div
                                key={`option-${groupIndex}-${optionIndex}`}
                                className="grid gap-2 sm:grid-cols-[1fr_140px_40px]"
                              >
                                <input
                                  value={option.nombre}
                                  onChange={(event) =>
                                    onUpdateVariantOption(
                                      groupIndex,
                                      optionIndex,
                                      'nombre',
                                      event.target.value
                                    )
                                  }
                                  placeholder="Nombre de opción"
                                  className={`${CONTROL} h-10 border-0 bg-gray-50 px-3 focus:bg-white`}
                                />
                                <input
                                  type="number"
                                  value={option.precio_extra}
                                  onChange={(event) =>
                                    onUpdateVariantOption(
                                      groupIndex,
                                      optionIndex,
                                      'precio_extra',
                                      event.target.value
                                    )
                                  }
                                  placeholder="0"
                                  className={`${CONTROL} h-10 border-0 bg-gray-50 px-3 focus:bg-white`}
                                />
                                <button
                                  type="button"
                                  onClick={() => onRemoveVariantOption(groupIndex, optionIndex)}
                                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 text-danger-600 transition hover:bg-danger-50"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => onAddVariantOption(groupIndex)}
                            className="mt-3 inline-flex h-9 items-center rounded-2xl border border-gray-200 px-3 text-xs font-bold text-gray-600 transition hover:bg-gray-50"
                          >
                            <Plus size={13} className="mr-1.5" />
                            Agregar opción
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[24px] border border-gray-200 bg-gray-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Extras
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Opcionales como borde relleno, salsas o agregados.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={onAddExtra}
                      className="inline-flex h-10 items-center rounded-2xl bg-primary-500 px-4 text-xs font-bold text-white transition hover:bg-[#4A74EF]"
                    >
                      <Plus size={14} className="mr-1.5" />
                      Agregar extra
                    </button>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {extrasEditor.length === 0 ? (
                      <div className="rounded-[20px] border border-dashed border-gray-200 bg-white px-4 py-5 text-sm text-gray-400">
                        No hay extras cargados para este producto.
                      </div>
                    ) : (
                      extrasEditor.map((extra, index) => (
                        <div
                          key={`extra-${index}`}
                          className="grid gap-2 rounded-[20px] border border-white bg-white p-2 shadow-sm sm:grid-cols-[1fr_140px_40px]"
                        >
                          <input
                            value={extra.nombre}
                            onChange={(event) => onUpdateExtra(index, 'nombre', event.target.value)}
                            placeholder={`Extra ${index + 1}`}
                            className={`${CONTROL} h-10 border-0 bg-gray-50 px-3 focus:bg-white`}
                          />
                          <input
                            type="number"
                            value={extra.precio}
                            onChange={(event) => onUpdateExtra(index, 'precio', event.target.value)}
                            placeholder="0"
                            className={`${CONTROL} h-10 border-0 bg-gray-50 px-3 focus:bg-white`}
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveExtra(index)}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 text-danger-600 transition hover:bg-danger-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/80 p-5 lg:border-l lg:border-t-0">
                <section className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Imagen
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Carga una foto real para tarjetas, TPV y web pública.
                      </p>
                    </div>
                    {imagePreview && (
                      <button
                        type="button"
                        onClick={onClearImage}
                        className="inline-flex h-9 items-center justify-center rounded-2xl border border-rose-200 px-3 text-xs font-bold text-danger-600 transition hover:bg-danger-50"
                      >
                        Quitar
                      </button>
                    )}
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[132px_1fr]">
                    <div className="flex h-32 items-center justify-center overflow-hidden rounded-[22px] border border-white bg-gray-50 shadow-sm">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <div
                            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl"
                            style={{
                              backgroundColor: rgba(selectedCategoryInfo?.color, 0.14),
                              color: selectedCategoryInfo?.color || '#f97316',
                            }}
                          >
                            <ImagePlus size={20} />
                          </div>
                          <p className="mt-2 text-xs font-semibold text-gray-500">Sin imagen</p>
                        </div>
                      )}
                    </div>

                    <label className="flex min-h-[128px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed border-gray-300 bg-gray-50 px-5 text-center transition hover:border-primary-500/35 hover:bg-primary-50">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-500">
                        <ImagePlus size={20} />
                      </div>
                      <span className="mt-3 text-sm font-bold text-gray-800">
                        {imagePreview ? 'Reemplazar imagen' : 'Subir imagen real'}
                      </span>
                      <span className="mt-1 max-w-[240px] text-xs leading-5 text-gray-500">
                        JPG, PNG o WebP. Ideal para que el catálogo se vea más rico y profesional.
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => onImageChange(event.target.files?.[0])}
                      />
                    </label>
                  </div>
                </section>

                <section className="mt-4 rounded-[24px] border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                        Preview
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Así se va a ver dentro del panel.
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-500">
                      <TimerReset size={13} />
                      {form.tiempo_preparacion || 0} min
                    </div>
                  </div>

                  <div className="mt-3 rounded-[24px] border border-white bg-white shadow-sm">
                    <div
                      className="h-28 rounded-t-[24px] px-4 py-4"
                      style={{
                        background: `linear-gradient(135deg, ${rgba(selectedCategoryInfo?.color, 0.28)}, ${rgba(selectedCategoryInfo?.color, 0.06)})`,
                      }}
                    >
                      <div className="inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-gray-500 backdrop-blur">
                        {codeFor(modal?.id, productosLength)}
                      </div>
                    </div>
                    <div className="-mt-8 px-4 pb-4">
                      <div
                        className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-[20px] border border-white text-3xl shadow-sm"
                        style={{ backgroundColor: rgba(selectedCategoryInfo?.color, 0.14) }}
                      >
                        {imagePreview ? (
                          <img
                            src={imagePreview}
                            alt="preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          selectedCategoryInfo?.icono || '🍽️'
                        )}
                      </div>
                      <h3 className="mt-3 text-lg font-black tracking-tight text-gray-950">
                        {form.nombre || 'Nombre del producto'}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        {form.descripcion || 'Sin descripción cargada.'}
                      </p>

                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                            Precio
                          </p>
                          <PriceSummary
                            options={formPriceOptions}
                            basePrice={form.precio || 0}
                            singleClassName="mt-1 font-semibold text-primary-500"
                            multiClassName="mt-1 space-y-1 text-xs font-semibold text-primary-500"
                            itemClassName=""
                          />
                        </div>
                        <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                            Stock
                          </p>
                          <p className="mt-1 font-semibold text-gray-900">
                            {recipeManagedStock
                              ? 'Se calcula en inventario'
                              : `${form.stock || 0} uds`}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span
                          className="rounded-full px-3 py-1.5 text-xs font-semibold"
                          style={{
                            backgroundColor: rgba(selectedCategoryInfo?.color, 0.12),
                            color: selectedCategoryInfo?.color || '#f97316',
                          }}
                        >
                          {selectedCategoryInfo?.icono || '🍽️'}{' '}
                          {selectedCategoryInfo?.nombre || 'Sin categoría'}
                        </span>
                        <span
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${form.activo === 1 ? 'bg-success-100 text-success-700' : 'bg-gray-200 text-gray-600'}`}
                        >
                          {form.activo === 1 ? 'Activo' : 'Inactivo'}
                        </span>
                        {form.destacado === 1 && (
                          <span className="rounded-full bg-warning-50 px-3 py-1.5 text-xs font-semibold text-warning-700">
                            Destacado
                          </span>
                        )}
                      </div>

                      {normalizeExtras(extrasEditor).length > 0 && (
                        <div className="mt-4">
                          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">
                            Extras visibles
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {normalizeExtras(extrasEditor).map((extra, index) => (
                              <span
                                key={`preview-extra-${index}`}
                                className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-600"
                              >
                                {extra.nombre} +{fmtMoney(extra.precio)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 rounded-[20px] border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                    Consejo: si este producto va a la web pública, intenta que la foto sea final y
                    que las variantes queden bien nombradas para el selector del cliente.
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-gray-100 bg-white px-5 py-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-2xl border border-gray-200 px-5 text-sm font-bold text-gray-600 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onGuardar}
              disabled={saving}
              className="h-11 rounded-2xl bg-primary-500 px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(93,135,255,0.26)] transition hover:-translate-y-0.5 hover:bg-[#4a74ef] disabled:opacity-60"
            >
              {saving ? 'Guardando...' : modal === 'nuevo' ? 'Crear producto' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      <ActionDialog
        open={Boolean(categoryDialog)}
        title="Cambiar categoría"
        description="Cambiar la categoría puede reemplazar las variantes sugeridas del producto. Conviene revisarlo antes de guardar."
        confirmLabel="Cambiar igual"
        cancelLabel="Cancelar"
        tone="warning"
        onConfirm={onConfirmCategoryChange}
        onClose={onCloseCategoryDialog}
      />
    </>
  );
}

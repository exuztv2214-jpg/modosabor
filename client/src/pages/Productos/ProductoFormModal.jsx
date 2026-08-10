import { useMemo } from 'react';
import { Check, ImageOff, ImagePlus, Plus, Trash2, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import ActionDialog from '../../components/ActionDialog.jsx';
import { CONTROL, fmtMoney, rgba, normalizeExtras, getTemplateHint } from './utils';
import PriceSummary from './PriceSummary';

const CATEGORIA_FALLBACK = '#6B7280';

/**
 * Todos los campos eran `placeholder` sin etiqueta.
 *
 * Mientras estaban vacíos se leía "Precio de venta", "Costo", "Stock"… pero
 * apenas cargabas los números quedaban cuatro cajas iguales con cifras y sin
 * forma de saber cuál era cuál. En un formulario de precios eso es un
 * problema real, no una cuestión de gusto.
 */
function Campo({ label, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-[12px] font-medium text-gray-600">{label}</label>
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] leading-4 text-gray-400">{hint}</p> : null}
    </div>
  );
}

function Seccion({ title, description, action, children }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900">{title}</h3>
          {description ? (
            <p className="mt-0.5 max-w-lg text-[12px] leading-4 text-gray-500">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function BotonQuitar({ onClick, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
    >
      <Trash2 size={15} strokeWidth={STROKE} />
    </button>
  );
}

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
  listasDisponibles = [],
  listasElegidas = [],
  onToggleLista,
  imagePreview,
  recipeManagedStock,
  saving,
  categoryDialog,
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
  // Se llamaba dos veces por render: una para saber si mostrar el bloque y
  // otra para recorrerlo.
  const extrasVisibles = useMemo(() => normalizeExtras(extrasEditor), [extrasEditor]);

  if (!modal) return null;

  const color = selectedCategoryInfo?.color || CATEGORIA_FALLBACK;
  const esNuevo = modal === 'nuevo';

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-5 py-4">
            <div>
              {/* Decía "Nuevo producto" arriba y "Crear producto" abajo: el
                  mismo dato dos veces, uno en gris y otro en negrita. */}
              <h2 className="text-[17px] font-semibold text-gray-900">
                {esNuevo ? 'Nuevo producto' : `Editar ${form.nombre || 'producto'}`}
              </h2>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Lo que cargues acá se ve en el TPV y en la web pública
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              <X size={18} strokeWidth={STROKE} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#F6F7F9] p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="space-y-4">
                <Seccion title="Datos del producto">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Campo label="Nombre" className="sm:col-span-2">
                      <input
                        value={form.nombre}
                        onChange={(event) => onFormChange('nombre', event.target.value)}
                        placeholder="Ej: Milanesa napolitana"
                        className={`${CONTROL} w-full`}
                      />
                    </Campo>

                    <Campo label="Descripción" className="sm:col-span-2">
                      <textarea
                        value={form.descripcion}
                        onChange={(event) => onFormChange('descripcion', event.target.value)}
                        rows={3}
                        placeholder="Qué lleva, para cuántos alcanza, cómo viene…"
                        className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5"
                      />
                    </Campo>

                    <Campo label="Categoría">
                      <select
                        value={String(form.categoria_id || '')}
                        onChange={(event) => onChangeCategory(event.target.value)}
                        className={`${CONTROL} w-full`}
                      >
                        <option value="">Elegí una categoría</option>
                        {categorias.map((categoria) => (
                          <option key={categoria.id} value={categoria.id}>
                            {categoria.nombre}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    <Campo label="Tiempo de preparación" hint="En minutos, para la cocina">
                      <input
                        type="number"
                        min="0"
                        value={form.tiempo_preparacion}
                        onChange={(event) =>
                          onFormChange('tiempo_preparacion', Number(event.target.value || 0))
                        }
                        className={`${CONTROL} w-full tabular-nums`}
                      />
                    </Campo>
                  </div>
                </Seccion>

                <Seccion title="Precio y stock" description={structuredPricingConfig?.helper}>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {structuredPricingConfig ? (
                      formPriceOptions.map((option) => (
                        <Campo key={`price-${option.nombre}`} label={option.label}>
                          <input
                            type="number"
                            min="0"
                            value={option.finalPrice}
                            onChange={(event) =>
                              onStructuredPriceChange?.(option.nombre, event.target.value)
                            }
                            className={`${CONTROL} w-full tabular-nums`}
                          />
                        </Campo>
                      ))
                    ) : (
                      <Campo label="Precio de venta">
                        <input
                          type="number"
                          min="0"
                          value={form.precio}
                          onChange={(event) => onFormChange('precio', event.target.value)}
                          className={`${CONTROL} w-full tabular-nums`}
                        />
                      </Campo>
                    )}

                    <Campo label="Precio anterior" hint="Opcional, se muestra tachado">
                      <input
                        type="number"
                        min="0"
                        value={form.precio_anterior}
                        onChange={(event) => onFormChange('precio_anterior', event.target.value)}
                        className={`${CONTROL} w-full tabular-nums`}
                      />
                    </Campo>

                    <Campo label="Costo" hint="Sin esto el margen del día sale mal">
                      <input
                        type="number"
                        min="0"
                        value={form.costo}
                        onChange={(event) => onFormChange('costo', event.target.value)}
                        className={`${CONTROL} w-full tabular-nums`}
                      />
                    </Campo>

                    <Campo
                      label="Stock"
                      hint={recipeManagedStock ? 'Se calcula desde Inventario' : undefined}
                    >
                      <input
                        type="number"
                        value={form.stock || 0}
                        onChange={(event) => onFormChange('stock', event.target.value)}
                        disabled={recipeManagedStock}
                        className={`${CONTROL} w-full tabular-nums disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400`}
                      />
                    </Campo>
                  </div>

                  <div className="mt-4 grid gap-2 border-t border-gray-100 pt-3 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-gray-50 p-3">
                      <input
                        type="checkbox"
                        checked={form.activo === 1}
                        onChange={onToggleActivo}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                        style={{ accentColor: BRAND }}
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-gray-900">
                          Publicado
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                          Si lo apagás desaparece del TPV y de la web.
                        </span>
                      </span>
                    </label>

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl bg-gray-50 p-3">
                      <input
                        type="checkbox"
                        checked={form.destacado === 1}
                        onChange={onToggleDestacado}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                        style={{ accentColor: BRAND }}
                      />
                      <span>
                        <span className="block text-[13px] font-medium text-gray-900">
                          Destacado
                        </span>
                        <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                          Aparece primero en la web pública.
                        </span>
                      </span>
                    </label>
                  </div>
                </Seccion>

                <Seccion
                  title="Variantes"
                  description={
                    structuredPricingConfig
                      ? 'Las presentaciones y sus precios se manejan arriba. Acá sólo si necesitás algo distinto.'
                      : getTemplateHint(selectedCategoryInfo?.nombre) ||
                        'Grupos de opciones que el cliente elige al pedir.'
                  }
                  action={
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={onApplyTemplate}
                        className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                      >
                        Usar plantilla
                      </button>
                      <button
                        type="button"
                        onClick={onAddVariantGroup}
                        className="inline-flex h-9 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                      >
                        <Plus size={13} strokeWidth={STROKE} />
                        Grupo
                      </button>
                    </div>
                  }
                >
                  {variantesEditor.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-[13px] text-gray-400">
                      Sin variantes. Este producto se pide tal cual.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {variantesEditor.map((group, groupIndex) => (
                        <div key={`group-${groupIndex}`} className="rounded-xl bg-gray-50 p-3">
                          <div className="flex items-center gap-2">
                            <input
                              value={group.nombre}
                              onChange={(event) =>
                                onUpdateVariantGroup(groupIndex, event.target.value)
                              }
                              placeholder={`Grupo ${groupIndex + 1} — ej: Tamaño`}
                              className={`${CONTROL} flex-1`}
                            />
                            <BotonQuitar
                              onClick={() => onRemoveVariantGroup(groupIndex)}
                              titulo="Quitar grupo"
                            />
                          </div>

                          <div className="mt-2 space-y-2">
                            {(group.opciones || []).map((option, optionIndex) => (
                              <div
                                key={`option-${groupIndex}-${optionIndex}`}
                                className="flex items-center gap-2"
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
                                  placeholder="Opción"
                                  className={`${CONTROL} flex-1`}
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
                                  placeholder="+ $"
                                  title="Cuánto suma al precio base"
                                  className={`${CONTROL} w-[110px] tabular-nums`}
                                />
                                <BotonQuitar
                                  onClick={() => onRemoveVariantOption(groupIndex, optionIndex)}
                                  titulo="Quitar opción"
                                />
                              </div>
                            ))}
                          </div>

                          <button
                            type="button"
                            onClick={() => onAddVariantOption(groupIndex)}
                            className="mt-2 inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-100"
                          >
                            <Plus size={13} strokeWidth={STROKE} />
                            Agregar opción
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </Seccion>

                <Seccion
                  title="Extras"
                  description="Agregados opcionales: borde relleno, salsas, porción extra."
                  action={
                    <button
                      type="button"
                      onClick={onAddExtra}
                      className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      <Plus size={13} strokeWidth={STROKE} />
                      Extra
                    </button>
                  }
                >
                  {extrasEditor.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-[13px] text-gray-400">
                      Sin extras cargados.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {extrasEditor.map((extra, index) => (
                        <div key={`extra-${index}`} className="flex items-center gap-2">
                          <input
                            value={extra.nombre}
                            onChange={(event) => onUpdateExtra(index, 'nombre', event.target.value)}
                            placeholder={`Extra ${index + 1}`}
                            className={`${CONTROL} flex-1`}
                          />
                          <input
                            type="number"
                            min="0"
                            value={extra.precio}
                            onChange={(event) => onUpdateExtra(index, 'precio', event.target.value)}
                            placeholder="$"
                            className={`${CONTROL} w-[110px] tabular-nums`}
                          />
                          <BotonQuitar onClick={() => onRemoveExtra(index)} titulo="Quitar extra" />
                        </div>
                      ))}
                    </div>
                  )}
                </Seccion>

                {/*
                  Listas compartidas.

                  Lo de arriba —variantes y extras— es lo que vive adentro de
                  este plato. Esto es lo que se carga una vez en "Listas de
                  opciones" y se le presta a los platos que lo llevan: las
                  guarniciones, las salsas, los agregados de hamburguesa.

                  Acá sólo se tilda cuáles lleva. Los nombres y los precios se
                  editan allá, y cambian en todos los platos a la vez. Por eso
                  no hay campos para escribir en esta sección: si se pudiera
                  editar desde acá, volveríamos a tener una copia por plato.
                */}
                <Seccion
                  title="Listas compartidas"
                  description="Guarniciones, salsas y agregados que se cargan una vez y se usan en varios platos."
                >
                  {listasDisponibles.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-[13px] text-gray-400">
                      Todavía no hay listas cargadas. Se crean en Catálogo → Listas de opciones.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {listasDisponibles.map((lista) => {
                        const elegida = listasElegidas.includes(lista.id);
                        return (
                          <button
                            key={lista.id}
                            type="button"
                            aria-pressed={elegida}
                            onClick={() => onToggleLista(lista.id)}
                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                              elegida
                                ? 'border-transparent bg-brand-50 ring-2 ring-brand-500'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <span
                              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border ${elegida ? 'border-transparent text-white' : 'border-gray-300 bg-white'}`}
                              style={elegida ? { backgroundColor: BRAND } : undefined}
                            >
                              {elegida ? <Check size={12} strokeWidth={3} /> : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-medium text-gray-900">
                                {lista.nombre}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-gray-500">
                                {lista.opciones.map((opcion) => opcion.nombre).join(' · ')}
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-semibold text-gray-400">
                              {lista.tipo === 'extra' ? 'Se agregan' : 'Se elige una'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Seccion>
              </div>

              {/* ── Rail derecha ── */}
              <div className="space-y-4">
                <Seccion title="Foto">
                  <label className="flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 transition hover:border-gray-400">
                    {imagePreview ? (
                      <img src={imagePreview} alt="" className="h-40 w-full object-cover" />
                    ) : (
                      <span className="flex h-40 w-full flex-col items-center justify-center gap-2">
                        <ImagePlus size={22} strokeWidth={STROKE} className="text-gray-400" />
                        <span className="text-[13px] font-medium text-gray-600">Subir foto</span>
                        <span className="text-[11px] text-gray-400">JPG, PNG o WebP</span>
                      </span>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => onImageChange(event.target.files?.[0])}
                    />
                  </label>

                  {imagePreview ? (
                    <button
                      type="button"
                      onClick={onClearImage}
                      className="mt-2 h-9 w-full rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      Quitar foto
                    </button>
                  ) : null}
                </Seccion>

                {/*
                  La vista previa dibujaba una tarjeta con degradado y el ícono
                  montado con margen negativo — un diseño que la grilla ya no
                  usa. Mostraba algo que no existe. Ahora replica la tarjeta
                  real: banda con el color de la categoría y las dos métricas.
                */}
                <Seccion title="Cómo se va a ver">
                  <div className="overflow-hidden rounded-xl border border-gray-100">
                    <div
                      className="flex items-center gap-2.5 px-3 py-2.5"
                      style={{ background: rgba(color, 0.13) }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
                        {imagePreview ? (
                          <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                        ) : selectedCategoryInfo?.icono ? (
                          <span className="text-[18px]">{selectedCategoryInfo.icono}</span>
                        ) : (
                          <ImageOff size={15} strokeWidth={STROKE} style={{ color }} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-gray-900">
                          {form.nombre || 'Nombre del producto'}
                        </span>
                        <span className="block truncate text-[11px]" style={{ color }}>
                          {selectedCategoryInfo?.nombre || 'Sin categoría'}
                        </span>
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 p-3">
                      <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                        <p className="text-[11px] text-gray-500">Precio</p>
                        <PriceSummary
                          options={formPriceOptions}
                          basePrice={form.precio || 0}
                          singleClassName="mt-0.5 text-[15px] font-bold tabular-nums text-gray-900"
                          multiClassName="mt-0.5 space-y-0.5"
                          itemClassName="text-[12px] font-bold tabular-nums text-gray-900"
                        />
                      </div>
                      <div className="rounded-lg bg-gray-50 px-2.5 py-2">
                        <p className="text-[11px] text-gray-500">Stock</p>
                        <p className="mt-0.5 text-[15px] font-bold tabular-nums text-gray-900">
                          {recipeManagedStock ? '—' : form.stock || 0}
                        </p>
                      </div>
                    </div>

                    {extrasVisibles.length > 0 ? (
                      <div className="flex flex-wrap gap-1 px-3 pb-3">
                        {extrasVisibles.map((extra, index) => (
                          <span
                            key={`preview-extra-${index}`}
                            className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
                          >
                            {extra.nombre} +{fmtMoney(extra.precio)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Seccion>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onGuardar}
              disabled={saving}
              style={{ background: BRAND }}
              className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      <ActionDialog
        open={Boolean(categoryDialog)}
        title="Cambiar categoría"
        description="Cambiar la categoría reemplaza las variantes sugeridas del producto. Revisalas antes de guardar."
        confirmLabel="Cambiar igual"
        cancelLabel="Cancelar"
        tone="warning"
        onConfirm={onConfirmCategoryChange}
        onClose={onCloseCategoryDialog}
      />
    </>
  );
}

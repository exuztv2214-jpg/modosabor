import { useMemo } from 'react';
import { ChefHat, ImageOff, Pencil, Star, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import { fmtMoney, rgba, getPricingOptionTotals, getStructuredPricingConfig } from './utils';
import PriceSummary from './PriceSummary';

const CATEGORIA_FALLBACK = '#6B7280';

function Dato({ label, children, tono }) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: tono?.bg || '#F3F4F6' }}>
      <p className="text-[11px]" style={{ color: tono?.label || '#6B7280' }}>
        {label}
      </p>
      <div style={{ color: tono?.valor || '#111827' }}>{children}</div>
    </div>
  );
}

export default function ProductoDetailModal({ detalle, onClose, onEdit }) {
  // `getPricingOptionTotals` y `getStructuredPricingConfig` se llamaban en
  // pleno render, y el segundo además dentro de un map anidado: una vez por
  // cada opción de cada variante, en cada repintado.
  const priceOptions = useMemo(
    () =>
      detalle
        ? getPricingOptionTotals(
            detalle.categoriaInfo?.nombre,
            detalle.precio,
            detalle.variantGroups
          )
        : [],
    [detalle]
  );
  const pricingConfig = useMemo(
    () => (detalle ? getStructuredPricingConfig(detalle.categoriaInfo?.nombre) : null),
    [detalle]
  );

  if (!detalle) return null;

  const color = detalle.categoriaInfo?.color || CATEGORIA_FALLBACK;
  // La foto se pasaba cruda: en la grilla se veía y al abrir la ficha
  // desaparecía, porque las rutas de /uploads necesitan resolverse.
  const imagen = resolveAssetUrl(detalle.imagen);
  const activo = Number(detalle.activo) === 1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/*
          Era una banda decorativa de 224px de alto con degradado y la foto
          montada encima con margen negativo. Ocupaba un tercio del modal sin
          decir nada. Ahora la banda es la cabecera y trae la información.
        */}
        <div
          className="flex shrink-0 items-center gap-3 px-5 py-4"
          style={{ background: rgba(color, 0.13) }}
        >
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white"
            style={{ boxShadow: `0 0 0 2px ${rgba(color, 0.25)}` }}
          >
            {imagen ? (
              <img src={imagen} alt={detalle.nombre} className="h-full w-full object-cover" />
            ) : detalle.categoriaInfo?.icono ? (
              <span className="text-[24px]">{detalle.categoriaInfo.icono}</span>
            ) : (
              <ImageOff size={20} strokeWidth={STROKE} style={{ color }} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[19px] font-semibold text-gray-900">{detalle.nombre}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]" style={{ color }}>
              <span>
                {detalle.categoriaInfo?.icono ? `${detalle.categoriaInfo.icono} ` : ''}
                {detalle.categoriaInfo?.nombre || 'Sin categoría'}
              </span>
              <span className="font-mono text-gray-500">{detalle.codigo}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-white hover:text-gray-900"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={
                activo
                  ? { background: '#E7F5EF', color: '#0F6E56' }
                  : { background: '#E5E7EB', color: '#4B5563' }
              }
            >
              {activo ? 'Activo' : 'Inactivo'}
            </span>
            {Number(detalle.destacado) === 1 ? (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: '#FDF3D3', color: '#6B4108' }}
              >
                <Star size={10} strokeWidth={STROKE} />
                Destacado
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {detalle.stock_mode === 'recipe' ? (
                <>
                  <ChefHat size={10} strokeWidth={STROKE} />
                  Stock por receta
                </>
              ) : (
                'Stock directo'
              )}
            </span>
          </div>

          <p className="mt-3 text-[13px] leading-6 text-gray-600">
            {detalle.descripcion || 'Sin descripción cargada.'}
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            <Dato label="Precio" tono={{ bg: '#E7F5EF', label: '#0F6E56', valor: '#08453A' }}>
              <PriceSummary
                options={priceOptions}
                basePrice={detalle.precio}
                singleClassName="mt-0.5 text-[17px] font-bold tabular-nums"
                multiClassName="mt-0.5 space-y-0.5"
                itemClassName="text-[13px] font-bold tabular-nums"
              />
            </Dato>
            <Dato label="Costo">
              <p className="mt-0.5 text-[17px] font-bold tabular-nums">
                {Number(detalle.costo || 0) > 0 ? (
                  fmtMoney(detalle.costo)
                ) : (
                  <span className="text-[13px] font-medium" style={{ color: '#B45309' }}>
                    Sin cargar
                  </span>
                )}
              </p>
            </Dato>
            <Dato label="Stock">
              <p
                className="mt-0.5 text-[17px] font-bold tabular-nums"
                style={{ color: detalle.stockBajo ? BRAND : undefined }}
              >
                {detalle.stock || 0}
              </p>
            </Dato>
            <Dato label="Preparación">
              <p className="mt-0.5 text-[17px] font-bold tabular-nums">
                {detalle.tiempo_preparacion || 0}
                <span className="ml-1 text-[12px] font-medium text-gray-500">min</span>
              </p>
            </Dato>
          </div>

          {detalle.variantGroups.length > 0 ? (
            <div className="mt-4">
              <p className="text-[12px] font-medium text-gray-600">Variantes</p>
              <div className="mt-2 space-y-2">
                {detalle.variantGroups.map((group, index) => (
                  <div key={`detail-group-${index}`} className="rounded-xl bg-gray-50 p-3">
                    <p className="text-[13px] font-medium text-gray-900">{group.nombre}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {(group.opciones || []).map((option, optionIndex) => (
                        <span
                          key={`detail-option-${index}-${optionIndex}`}
                          className="rounded-full bg-white px-2.5 py-1 text-[12px] text-gray-700"
                        >
                          {option.nombre}
                          {pricingConfig ? (
                            <span className="ml-1 font-semibold tabular-nums">
                              {fmtMoney(detalle.precio + Number(option.precio_extra || 0))}
                            </span>
                          ) : Number(option.precio_extra) > 0 ? (
                            <span className="ml-1 font-semibold tabular-nums">
                              +{fmtMoney(option.precio_extra)}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {detalle.extrasList.length > 0 ? (
            <div className="mt-4">
              <p className="text-[12px] font-medium text-gray-600">Extras</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {detalle.extrasList.map((extra, index) => (
                  <span
                    key={`detail-extra-${index}`}
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-[12px] text-gray-700"
                  >
                    {extra.nombre}
                    <span className="ml-1 font-semibold tabular-nums">
                      +{fmtMoney(extra.precio)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => {
              const current = detalle;
              onClose();
              onEdit(current);
            }}
            style={{ background: BRAND }}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <Pencil size={14} strokeWidth={STROKE} />
            Editar producto
          </button>
        </div>
      </div>
    </div>
  );
}

import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assets.js';
import { fmt, getVariantHint, isVisibleOnPublicMenu } from '../../lib/webPublicaHelpers.js';
import {
  getPrimaryDisplayPrice,
  getStructuredDisplayPrices,
  normalizeText,
  safeParseArray,
} from '../../lib/pedidoForm.js';

// Paleta de degradés para el placeholder cuando un producto no tiene foto
// propia. Se elige de forma determinística según el nombre de la categoría,
// así cada rubro se ve consistente sin repetir el logo del negocio en
// decenas de tarjetas distintas.
const PLACEHOLDER_GRADIENTS = [
  'from-[#ffe3d1] to-[#fff3e6]',
  'from-[#ffd9d9] to-[#fff0f0]',
  'from-[#fce8c8] to-[#fffaf0]',
  'from-[#f6dce8] to-[#fff5fa]',
  'from-[#ffe8c2] to-[#fffdf5]',
  'from-[#e6e0ff] to-[#f8f6ff]',
];

function pickPlaceholderGradient(seed) {
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_GRADIENTS[hash % PLACEHOLDER_GRADIENTS.length];
}

export default function ProductoCard({
  producto,
  onAgregar,
  colorPrimario,
  theme,
  cantidadSimple = 0,
  onIncrementar,
  onDecrementar,
  onVerDetalle,
}) {
  const primaryPrice = getPrimaryDisplayPrice(producto);
  const structuredPrices = getStructuredDisplayPrices(producto);
  const isPizza = normalizeText(producto?.categoria_nombre || '').includes('pizza');
  const tieneVariantes =
    safeParseArray(producto.variantes).length > 0 || safeParseArray(producto.extras).length > 0;
  const disponible = producto.disponible_para_venta !== false;
  const variantHint = getVariantHint(producto);
  const visible = isVisibleOnPublicMenu(producto);
  const imageUrl = producto?.imagen ? resolveAssetUrl(producto.imagen) : null;
  const placeholderGradient = pickPlaceholderGradient(
    producto?.categoria_nombre || producto?.nombre
  );
  const esMenuDelDia = normalizeText(producto?.categoria_nombre || '') === 'menu del dia';
  const tienePromoJugoPostre = safeParseArray(producto.extras).some(
    (extra) =>
      normalizeText(extra?.nombre || '').includes('jugo') &&
      normalizeText(extra?.nombre || '').includes('postre')
  );

  if (!visible) return null;

  // Solo un badge principal por producto
  let badge = null;
  if (!disponible) {
    badge = { text: 'Sin stock', style: 'bg-gray-500' };
  } else if (producto.destacado === 1) {
    badge = { text: 'Recomendado', style: 'bg-brand-500' };
  } else if (
    producto.precio_anterior &&
    Number(producto.precio_anterior) > Number(producto.precio)
  ) {
    badge = { text: 'Oferta', style: 'bg-red-500' };
  }

  return (
    <div
      id={`producto-${producto.id}`}
      className={`ms-aparecer group relative flex flex-col overflow-hidden rounded-[24px] backdrop-blur-sm border transition-all duration-300 hover:-translate-y-1 hover:scale-[1.01] ${
        !disponible ? 'opacity-60 grayscale' : ''
      }`}
      style={{
        backgroundColor: theme?.panel || 'rgba(255,255,255,0.95)',
        borderColor: theme?.border || '#f1dfd7',
        boxShadow: '0 18px 42px rgba(20,20,20,0.06)',
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') event.currentTarget.click();
        }}
        className={`relative aspect-[4/3] overflow-hidden bg-gray-100 rounded-t-[24px] ${
          disponible ? 'cursor-pointer' : ''
        }`}
        onClick={() => disponible && onVerDetalle && onVerDetalle(producto)}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={producto.nombre}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`flex h-full w-full flex-col items-center justify-center gap-1.5 bg-gradient-to-br ${placeholderGradient}`}
          >
            {producto?.categoria_icono ? (
              <span className="text-3xl leading-none opacity-80">{producto.categoria_icono}</span>
            ) : (
              <UtensilsCrossed size={28} className="text-gray-400" strokeWidth={1.75} />
            )}
            <span className="text-[12px] font-medium text-gray-500">
              {producto?.categoria_nombre || 'Sin foto'}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />

        {badge && (
          <div className="absolute top-3 left-3">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-white text-[12px] font-semibold shadow-md ${badge.style}`}
              style={badge.style === 'bg-brand-500' ? { backgroundColor: colorPrimario } : {}}
            >
              {badge.text}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        {producto.categoria_nombre ? (
          <p
            className="mb-1 flex flex-wrap items-center gap-1.5 text-[13px] font-medium"
            style={{ color: colorPrimario }}
          >
            {producto.categoria_nombre}
            {esMenuDelDia && (
              <span
                className="rounded-full px-2 py-0.5 text-[12px]"
                style={{ backgroundColor: theme?.accentSoft || '#fff2d9', color: '#9a5b05' }}
              >
                {producto.menu_dia_tipo === 'ejecutivo' ? 'Ejecutivo' : 'Económico'}
              </span>
            )}
            {tienePromoJugoPostre && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700">
                +Jugo y postre
              </span>
            )}
          </p>
        ) : null}
        <h3 className="mb-1 text-[17px] font-semibold leading-snug text-gray-900">
          {producto.nombre}
        </h3>

        {producto.descripcion && (
          <p className="mb-2 line-clamp-2 text-[14px] leading-snug text-gray-600">
            {producto.descripcion}
          </p>
        )}

        {variantHint ? (
          <p
            className="mb-2 inline-flex w-fit items-center rounded-lg px-2.5 py-1 text-[13px] font-medium"
            style={{ backgroundColor: theme?.accentSoft || '#fff2d9', color: '#9a5b05' }}
          >
            {variantHint}
          </p>
        ) : null}

        <div className="mt-auto flex items-end justify-between pt-3">
          <div className="flex flex-col gap-0.5">
            {!isPizza && structuredPrices.items.length >= 2 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {structuredPrices.items.map((item) => (
                  <div key={item.label} className="flex flex-col">
                    <span className="text-[12px] font-medium leading-none text-gray-500">
                      {item.label}
                    </span>
                    <span
                      className="text-[22px] font-bold leading-none"
                      style={{ color: colorPrimario }}
                    >
                      {fmt(item.price)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {primaryPrice.label ? (
                  <span className="text-[12px] font-medium leading-none text-gray-500">
                    {primaryPrice.label}
                  </span>
                ) : null}
                {producto.precio_anterior &&
                  Number(producto.precio_anterior) > Number(producto.precio) && (
                    <span className="text-[13px] font-medium leading-none text-gray-400 line-through">
                      {fmt(producto.precio_anterior)}
                    </span>
                  )}
                <span
                  className="text-[22px] font-bold leading-none"
                  style={{ color: colorPrimario }}
                >
                  {fmt(primaryPrice.price)}
                </span>
              </div>
            )}
          </div>

          {!tieneVariantes && cantidadSimple > 0 && disponible ? (
            <div className="flex items-center gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/5">
              <button
                onClick={() => onDecrementar && onDecrementar(producto)}
                className="h-9 w-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-white hover:shadow-sm transition-all"
              >
                <Minus size={16} strokeWidth={2.5} />
              </button>
              <span className="w-6 text-center text-[15px] font-semibold text-gray-900">
                {cantidadSimple}
              </span>
              <button
                onClick={() => onIncrementar && onIncrementar(producto)}
                className="h-9 w-9 rounded-lg flex items-center justify-center text-white shadow-sm transition-all active:scale-95"
                style={{ backgroundColor: colorPrimario }}
              >
                <Plus size={16} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAgregar(producto)}
              disabled={!disponible}
              // Era `text-xs font-black uppercase tracking-[0.18em]` con la
              // palabra "Sumar", que no dice nada. El botón de agregar es el
              // que decide la venta: ahora es legible y dice qué hace.
              className="flex h-11 min-w-[104px] items-center justify-center gap-1.5 rounded-xl px-4 text-[14px] font-semibold shadow-sm transition-all hover:shadow-md active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: colorPrimario, color: 'white' }}
            >
              {tieneVariantes ? (
                'Elegir'
              ) : (
                <>
                  <Plus size={16} strokeWidth={2.5} />
                  Agregar
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

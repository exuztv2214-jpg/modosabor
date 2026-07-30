import { ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { resolveAssetUrl } from '../../lib/assets.js';
import { DEFAULT_BRAND_LOGO } from '../../lib/webPublicaHelpers.js';

export default function PromoSection({
  promosBanner,
  promoPrincipal,
  promoSecundarias,
  colorPrimario,
  theme,
  onAction,
}) {
  if (promosBanner.length === 0) return null;
  const promoPrincipalImage = resolveAssetUrl(promoPrincipal?.imagen || DEFAULT_BRAND_LOGO);

  return (
    <section className="relative z-20 px-4 pb-2 md:px-6">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p
              className="text-xs font-black uppercase tracking-[0.22em]"
              style={{ color: colorPrimario }}
            >
              Promos activas
            </p>
            <h2 className="mt-1 text-3xl font-black text-gray-900">Ofertas para pedir ahora</h2>
          </div>
          <button
            onClick={() => onAction('cart')}
            className="hidden rounded-xl border px-5 py-2.5 text-xs font-bold text-gray-700 shadow-sm transition hover:border-gray-300 md:inline-flex"
            style={{
              backgroundColor: theme?.panel || '#fffdfb',
              borderColor: theme?.border || '#f1dfd7',
            }}
          >
            Ver pedido
          </button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.15fr,0.85fr]">
          {promoPrincipal && (
            <motion.button
              whileHover={{ y: -2 }}
              onClick={() => onAction(promoPrincipal.accion_tipo, promoPrincipal.accion_valor)}
              className="group overflow-hidden rounded-[28px] border text-left text-gray-900 shadow-[0_24px_50px_rgba(20,20,20,0.08)] transition hover:shadow-[0_28px_60px_rgba(20,20,20,0.12)]"
              style={{
                backgroundColor: theme?.panel || '#fffdfb',
                borderColor: theme?.border || '#f1dfd7',
              }}
            >
              <div className="grid h-full gap-0 md:grid-cols-[0.95fr,1.05fr]">
                <div className="relative min-h-[260px] bg-gray-100">
                  {promoPrincipalImage ? (
                    <img
                      src={promoPrincipalImage}
                      alt={promoPrincipal.titulo}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full min-h-[240px] items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                      <span className="text-5xl font-bold text-gray-200">MS</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
                </div>
                <div className="flex flex-col justify-center p-6 md:p-8">
                  <p
                    className="text-xs font-black uppercase tracking-[0.18em]"
                    style={{ color: theme?.accent || '#f59e0b' }}
                  >
                    {promoPrincipal.etiqueta || 'Promo'}
                  </p>
                  <h3 className="mt-2 text-2xl font-black leading-tight md:text-3xl">
                    {promoPrincipal.titulo}
                  </h3>
                  {promoPrincipal.precio_texto ? (
                    <p
                      className="mt-3 text-2xl font-black"
                      style={{ color: theme?.accent || '#f59e0b' }}
                    >
                      {promoPrincipal.precio_texto}
                    </p>
                  ) : null}
                  {promoPrincipal.descripcion ? (
                    <p className="mt-3 text-sm font-medium leading-relaxed text-gray-600">
                      {promoPrincipal.descripcion}
                    </p>
                  ) : null}
                  <div
                    className="mt-5 inline-flex h-12 w-fit items-center gap-2 rounded-xl px-5 text-sm font-black text-white shadow-lg transition active:scale-95"
                    style={{ backgroundColor: colorPrimario }}
                  >
                    {promoPrincipal.boton_texto || 'Ver promo'}
                    <ArrowRight size={16} />
                  </div>
                </div>
              </div>
            </motion.button>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {promoSecundarias.map((promo) => {
              const promoImage = resolveAssetUrl(promo.imagen || DEFAULT_BRAND_LOGO);
              return (
                <motion.button
                  key={promo.id}
                  whileHover={{ y: -2 }}
                  onClick={() => onAction(promo.accion_tipo, promo.accion_valor)}
                  className="group grid min-h-[170px] overflow-hidden rounded-[24px] text-left shadow-[0_16px_40px_rgba(20,20,20,0.07)] transition hover:shadow-[0_20px_48px_rgba(20,20,20,0.1)] md:grid-cols-[112px,1fr]"
                  style={{ backgroundColor: theme?.panel || '#fffdfb' }}
                >
                  <div className="bg-gray-100">
                    {promoImage ? (
                      <img
                        src={promoImage}
                        alt={promo.titulo}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
                        <span className="text-xl font-bold text-gray-200">MS</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p
                      className="text-[10px] font-black uppercase tracking-[0.16em]"
                      style={{ color: colorPrimario }}
                    >
                      {promo.etiqueta || 'Promo'}
                    </p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-black text-gray-900">
                      {promo.titulo}
                    </h3>
                    {promo.precio_texto ? (
                      <p className="mt-2 text-lg font-black text-gray-900">{promo.precio_texto}</p>
                    ) : null}
                    <p className="mt-2 line-clamp-2 text-xs font-medium leading-relaxed text-gray-500">
                      {promo.descripcion}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

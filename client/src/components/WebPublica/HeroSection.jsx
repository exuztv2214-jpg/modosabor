import { Star, ArrowRight, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import { DEFAULT_HERO, buildWhatsAppUrl } from '../../lib/webPublicaHelpers.js';
import { resolveAssetUrl } from '../../lib/assets.js';

export default function HeroSection({
  config,
  theme,
  colorPrimario,
  heroHighlights,
  categoriasVisibles,
  onAction,
}) {
  const nombre = config?.negocio_nombre || 'Modo Sabor';
  const heroImage = resolveAssetUrl(config.web_hero_imagen || DEFAULT_HERO);
  const featuredCategories = categoriasVisibles.slice(0, 4);

  return (
    <section className="relative flex min-h-[620px] items-center overflow-hidden border-b border-black/5 bg-[#140808] md:min-h-[720px]">
      <div className="absolute inset-0">
        {heroImage ? <img src={heroImage} className="w-full h-full object-cover" alt="" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-[#090303] via-[#140505]/88 to-[#1b0808]/40" />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(112deg, rgba(5,4,4,0.9) 8%, rgba(18,9,9,0.84) 28%, ${colorPrimario}CC 52%, rgba(0,0,0,0.28) 100%)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(circle at 78% 34%, rgba(255,186,73,0.18) 0%, transparent 26%), radial-gradient(circle at 22% 30%, rgba(255,255,255,0.08) 0%, transparent 22%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            background:
              'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 22%, transparent 78%, rgba(255,255,255,0.06) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full px-4 md:px-8 py-20 md:py-28 max-w-[1400px]">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="max-w-3xl rounded-[30px] border border-white/10 bg-black/28 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-md md:p-8 lg:p-10">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-md shadow-lg"
            >
              <Star size={16} fill="currentColor" />
              {heroHighlights[0]?.title || 'Vive el sabor'}
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-5 max-w-2xl text-4xl font-black leading-[0.98] text-white md:text-6xl"
              style={{ textShadow: '0 18px 44px rgba(0,0,0,0.42)' }}
            >
              {config.web_hero_titulo || nombre}
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mb-10 max-w-2xl text-lg font-semibold leading-relaxed text-white md:text-2xl"
              style={{ textShadow: '0 10px 28px rgba(0,0,0,0.28)' }}
            >
              {config.web_hero_subtitulo ||
                config.negocio_descripcion ||
                'Pedí directo desde nuestra carta online.'}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-4"
            >
              <button
                onClick={() =>
                  onAction(config.web_hero_accion_tipo || 'categoria', config.web_hero_accion_valor)
                }
                className="inline-flex h-12 items-center gap-2 rounded-xl px-7 text-base font-black text-white shadow-[0_16px_36px_rgba(200,29,37,0.35)] transition active:scale-95 hover:brightness-110"
                style={{ backgroundColor: colorPrimario }}
              >
                {config.web_hero_boton_texto || 'Pedir ahora'}
                <ArrowRight size={20} />
              </button>
              <button
                onClick={() => window.open(buildWhatsAppUrl(config), '_blank')}
                className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-7 text-base font-bold text-white backdrop-blur-md transition hover:bg-white/18 shadow-lg"
              >
                <Phone size={20} />
                WhatsApp
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.38 }}
              className="mt-10 grid gap-3 sm:grid-cols-3"
            >
              {heroHighlights.slice(0, 3).map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-white/10 bg-white/10 px-4 py-4 text-white backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.14)]"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: theme?.accent || '#f59e0b' }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black">{item.title}</p>
                        <p className="mt-1 text-xs font-medium text-white/74">{item.detail}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="hidden lg:block"
          >
            <div className="overflow-hidden rounded-[30px] border border-white/12 bg-white/10 shadow-2xl backdrop-blur-xl">
              <div className="relative h-[240px]">
                {heroImage ? (
                  <img src={heroImage} alt="" className="h-full w-full object-cover" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 text-white">
                  <p className="text-[11px] font-black uppercase tracking-[0.28em] text-white/70">
                    Recomendado hoy
                  </p>
                  <p className="mt-2 text-2xl font-black leading-tight">Entrá por tu antojo</p>
                  <p className="mt-2 text-sm font-medium leading-6 text-white/78">
                    Carta directa, promos visibles y pedido simple para delivery o retiro.
                  </p>
                </div>
              </div>
              <div className="space-y-4 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-white/72">
                  Categorías rápidas
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  {featuredCategories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => onAction('categoria', cat.id)}
                      className="rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-left text-sm font-bold text-white transition hover:bg-white/14"
                    >
                      <span className="mr-1.5">{cat.icono}</span>
                      {cat.nombre}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {heroHighlights.slice(0, 3).map((item) => (
                    <div
                      key={`mini-${item.title}`}
                      className="rounded-2xl border border-white/10 bg-black/18 px-3 py-3 text-white"
                    >
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/64">
                        {item.title}
                      </p>
                      <p className="mt-2 text-xs font-medium leading-5 text-white/84">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

import { ArrowRight, Bike, Clock, MessageCircle } from 'lucide-react';
import { DEFAULT_HERO, buildWhatsAppUrl } from '../../lib/webPublicaHelpers.js';
import { resolveAssetUrl } from '../../lib/assets.js';

/**
 * Portada de la carta.
 *
 * ── Por qué se rehízo ──────────────────────────────────────────────────────
 *
 * El hero anterior medía 620px de alto en celular (720 en escritorio). La
 * pantalla útil de un celular común ronda los 650px, así que el cliente abría
 * la carta y **no veía un solo plato hasta hacer scroll**. El 45% de las
 * visitas a una web de restaurante busca fotos de comida primero: les estábamos
 * mostrando un cartel.
 *
 * Ni Pedix ni OlaClick —que viven de esto— usan portadas de pantalla completa.
 * Van directo a las categorías. El banner no vende comida.
 *
 * Ahora mide ~280px en celular y sólo contiene lo que alguien necesita saber
 * en los primeros dos segundos: si están abiertos, cuánto tardan, que el envío
 * es gratis, y dónde tocar para pedir.
 *
 * ── Rendimiento ────────────────────────────────────────────────────────────
 *
 * Se sacaron: framer-motion (las animaciones de entrada ahora son CSS), tres
 * de las cuatro capas de degradado superpuestas, y los `backdrop-blur` de las
 * tarjetas. Esa combinación hacía tirones al scrollear en celulares de gama
 * baja, que son la mayoría de los que entran.
 */
export default function HeroSection({ config, colorPrimario, onAction, abierto, demoraTexto }) {
  const nombre = config?.negocio_nombre || 'Modo Sabor';
  const heroImage = resolveAssetUrl(config.web_hero_imagen || DEFAULT_HERO);

  return (
    <section className="relative isolate overflow-hidden bg-[#140808]">
      {heroImage ? (
        <img
          src={heroImage}
          className="absolute inset-0 h-full w-full object-cover"
          alt=""
          fetchPriority="high"
        />
      ) : null}
      {/* Una sola capa de oscurecido: alcanza para que el texto se lea y no
          castiga el scroll como las cuatro superpuestas de antes. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/60 to-black/30" />

      <div className="relative mx-auto w-full max-w-[1200px] px-4 pb-6 pt-8 md:px-8 md:pb-10 md:pt-14">
        {/* Estado del local: es lo primero que alguien quiere saber. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
              abierto ? 'bg-emerald-500 text-white' : 'bg-white/15 text-white'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${abierto ? 'bg-white' : 'bg-white/60'}`}
              aria-hidden="true"
            />
            {abierto ? 'Abierto ahora' : 'Cerrado'}
          </span>

          {demoraTexto ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-medium text-white">
              <Clock size={14} />
              {demoraTexto}
            </span>
          ) : null}

          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[13px] font-medium text-white">
            <Bike size={14} />
            Envío gratis
          </span>
        </div>

        <h1 className="max-w-2xl text-[30px] font-bold leading-[1.05] text-white md:text-5xl">
          {config.web_hero_titulo || nombre}
        </h1>

        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-white/85 md:text-lg">
          {config.web_hero_subtitulo ||
            config.negocio_descripcion ||
            'Pedí directo desde nuestra carta online.'}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            onClick={() =>
              onAction(config.web_hero_accion_tipo || 'categoria', config.web_hero_accion_valor)
            }
            className="inline-flex h-12 items-center gap-2 rounded-xl px-6 text-[15px] font-semibold text-white shadow-lg transition active:scale-95 hover:brightness-110"
            style={{ backgroundColor: colorPrimario }}
          >
            {config.web_hero_boton_texto || 'Ver la carta'}
            <ArrowRight size={18} />
          </button>
          <button
            onClick={() => window.open(buildWhatsAppUrl(config), '_blank')}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 text-[15px] font-medium text-white transition hover:bg-white/20"
          >
            <MessageCircle size={18} />
            WhatsApp
          </button>
        </div>
      </div>
    </section>
  );
}

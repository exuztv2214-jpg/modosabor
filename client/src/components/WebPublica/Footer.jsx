import { Phone, MapPin, Clock, Instagram, Facebook } from 'lucide-react';
import {
  buildWhatsAppUrl,
  DEFAULT_BRAND_LOGO,
  getProximaAperturaText,
} from '../../lib/webPublicaHelpers.js';
import { resolveAssetUrl } from '../../lib/assets.js';

export default function Footer({ config, colorPrimario, theme }) {
  const nombre = config?.negocio_nombre || 'Modo Sabor';
  const proxima = getProximaAperturaText(config);
  const logoUrl = resolveAssetUrl(config?.negocio_logo || DEFAULT_BRAND_LOGO);

  return (
    <footer
      className="mt-16 border-t text-gray-900"
      style={{ backgroundColor: '#13090b', borderColor: 'rgba(255,255,255,0.06)' }}
    >
      <div className="mx-auto max-w-[1400px] px-4 py-14 md:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <img
                src={logoUrl}
                className="h-12 w-12 object-contain rounded-xl bg-white p-1 shadow-sm"
                alt="logo"
              />
              <div>
                <p
                  className="text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: theme?.accent || '#f59e0b' }}
                >
                  Vive el sabor
                </p>
                <span className="text-lg font-black text-white">{nombre}</span>
              </div>
            </div>
            {config?.negocio_descripcion && (
              <p className="max-w-md text-sm font-medium leading-relaxed text-white/68">
                {config.negocio_descripcion}
              </p>
            )}
          </div>

          <div>
            <p className="mb-4 text-xs font-black text-white/45 uppercase tracking-[0.22em]">
              Contacto
            </p>
            <div className="space-y-3">
              {config?.negocio_telefono && (
                <a
                  href={buildWhatsAppUrl(config)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-white/72 transition-colors hover:text-white"
                >
                  <Phone size={14} />
                  {config.negocio_telefono}
                </a>
              )}
              {config?.negocio_direccion && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(config.negocio_direccion)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-white/72 transition-colors hover:text-white"
                >
                  <MapPin size={14} />
                  {config.negocio_direccion}
                </a>
              )}
              {config?.negocio_instagram && (
                <a
                  href={`https://instagram.com/${config.negocio_instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-white/72 transition-colors hover:text-white"
                >
                  <Instagram size={14} />@{config.negocio_instagram}
                </a>
              )}
              {config?.negocio_facebook && (
                <a
                  href={config.negocio_facebook}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm font-medium text-white/72 transition-colors hover:text-white"
                >
                  <Facebook size={14} />
                  Facebook
                </a>
              )}
            </div>
          </div>

          <div>
            <p className="mb-4 text-xs font-black text-white/45 uppercase tracking-[0.22em]">
              Horario
            </p>
            <div
              className={`inline-flex items-center gap-2 text-sm font-bold ${config?.abierto_ahora ? 'text-emerald-300' : 'text-amber-300'}`}
            >
              <Clock size={14} />
              {config?.abierto_ahora
                ? `Abierto${config?.turno_actual?.hasta ? ` hasta ${config.turno_actual.hasta}` : ''}`
                : proxima || 'Cerrado ahora'}
            </div>
            {config?.negocio_horario && (
              <p className="mt-3 text-sm font-medium leading-relaxed text-white/60">
                {config.negocio_horario}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="border-t px-4 py-5 md:px-6" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs font-medium text-white/40">
            {new Date().getFullYear()} · {nombre}
          </p>
          <p className="text-xs font-medium text-white/40">Pedidos online con Modo Sabor</p>
        </div>
      </div>
    </footer>
  );
}

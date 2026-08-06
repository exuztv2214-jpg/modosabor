import { Copy, ExternalLink, Image as ImageIcon, Palette, Smartphone, Type, X } from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../../lib/api.js';
import { buildPublicAppUrl } from '../../lib/publicUrls.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import { BRAND, STROKE } from '../../lib/theme.js';

import { SectionCard, InputField, TextareaField, ToggleSwitch } from './ConfigComponents.jsx';

export default function SeccionRider({ config, f, setConfig }) {
  const riderBaseUrl = buildPublicAppUrl('/rider', config);
  const riderLogoUrl = resolveAssetUrl(config.rider_app_logo || config.negocio_logo || '');
  const usaLogoPropio = Boolean(config.rider_app_logo);
  const showLogo = String(config.rider_app_mostrar_logo ?? '1') === '1';
  const colorPrimario = config.rider_app_color_primario || BRAND;

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('asset', file);
    try {
      const res = await api.post('/configuracion/web-publica/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setConfig((prev) => ({ ...prev, rider_app_logo: res.url }));
      // El archivo ya quedó en el servidor, pero la referencia se guarda con
      // el resto de la configuración: hasta que no se guarde, el rider sigue
      // viendo el logo anterior.
      toast.success('Logo cargado. Guardá para que lo vea el rider.');
    } catch {
      toast.error('No se pudo subir el logo');
    }
    event.target.value = '';
  };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SectionCard
            icon={Smartphone}
            title="Acceso de los riders"
            subtitle="Cómo entra el repartidor desde su celular"
          >
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-medium text-gray-400">Dirección de la app</p>
              <p className="mt-1 break-all font-mono text-[13px] text-gray-800">{riderBaseUrl}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(riderBaseUrl)
                    .then(() => toast.success('Link copiado'))
                    .catch(() => toast.error('No se pudo copiar'))
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200"
              >
                <Copy size={15} strokeWidth={STROKE} />
                Copiar link
              </button>
              <a
                href={riderBaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-900 px-4 text-[13px] font-semibold text-white transition hover:bg-gray-800"
              >
                <ExternalLink size={15} strokeWidth={STROKE} />
                Abrir
              </a>
            </div>

            {/*
              Este texto decía que la app "ya puede instalarse como PWA". Quedó
              viejo: los riders usan la aplicación Android firmada, que se
              actualiza sola desde el panel. El link de arriba sirve para
              probar desde una computadora o para un rider ocasional que no
              tenga la app instalada.
            */}
            <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
              Los riders del equipo usan la aplicación Android instalada, que avisa sola cuando hay
              una versión nueva. Este link es el respaldo: sirve para probar desde la computadora o
              para alguien que reparta por única vez.
            </p>
          </SectionCard>

          <SectionCard icon={Type} title="Textos" subtitle="Lo que lee el rider al abrir la app">
            <div className="space-y-3">
              <InputField
                label="Nombre de la app"
                {...f('rider_app_nombre')}
                placeholder="Modo Sabor Delivery"
              />
              <TextareaField
                label="Mensaje de bienvenida"
                description="Aparece en la pantalla de inicio, antes de ponerse en línea."
                rows={3}
                {...f('rider_app_bienvenida')}
                placeholder="Buen turno. Acordate de poner el GPS en alta precisión."
              />
            </div>
          </SectionCard>

          <SectionCard icon={Palette} title="Colores" subtitle="Identidad de la app en el celular">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: 'rider_app_color_primario', label: 'Principal', fallback: BRAND },
                { key: 'rider_app_color_secundario', label: 'Secundario', fallback: '#111827' },
              ].map((campo) => (
                <div key={campo.key} className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
                  <input
                    type="color"
                    value={config[campo.key] || campo.fallback}
                    onChange={f(campo.key).onChange}
                    aria-label={campo.label}
                    className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-gray-200 bg-white p-1"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-gray-900">{campo.label}</p>
                    <input
                      {...f(campo.key)}
                      placeholder={campo.fallback}
                      className="mt-1 h-9 w-full rounded-lg border border-gray-200 bg-white px-2.5 font-mono text-[12px] uppercase text-gray-700 outline-none transition focus:border-gray-400"
                    />
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            icon={ImageIcon}
            title="Logo"
            subtitle="Lo que ve el rider al iniciar sesión"
          >
            <ToggleSwitch
              checked={showLogo}
              onChange={(checked) =>
                setConfig((prev) => ({ ...prev, rider_app_mostrar_logo: checked ? '1' : '0' }))
              }
              label="Mostrar el logo en la app"
              description="Se puede ocultar sin borrar la imagen cargada."
            />

            <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-gray-50 p-4">
              <div className="relative">
                {riderLogoUrl ? (
                  <img
                    src={riderLogoUrl}
                    alt=""
                    className="h-20 w-20 rounded-xl bg-white object-contain p-2"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white">
                    <ImageIcon size={26} strokeWidth={1.5} className="text-gray-300" />
                  </div>
                )}
                {usaLogoPropio ? (
                  <button
                    type="button"
                    onClick={() => setConfig((prev) => ({ ...prev, rider_app_logo: '' }))}
                    title="Volver al logo del negocio"
                    aria-label="Volver al logo del negocio"
                    className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gray-900 text-white transition hover:bg-gray-700"
                  >
                    <X size={13} strokeWidth={2.6} />
                  </button>
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-gray-900">
                  {usaLogoPropio ? 'Logo propio de la app' : 'Usando el logo del negocio'}
                </p>
                <p className="mt-0.5 text-[12px] text-gray-500">
                  Cuadrado, 512 × 512 px. Si no cargás uno, se usa el logo general.
                </p>
                <label className="mt-3 inline-flex h-10 cursor-pointer items-center rounded-xl bg-gray-900 px-4 text-[12px] font-semibold text-white transition hover:bg-gray-800">
                  {usaLogoPropio ? 'Cambiar' : 'Subir logo propio'}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                </label>
              </div>
            </div>
          </SectionCard>
        </div>

        {/* ── Vista previa ── */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <p className="text-[13px] font-semibold text-gray-900">Vista previa</p>
            <p className="mt-0.5 text-[12px] text-gray-500">Así arranca la app en el celular.</p>

            <div className="mx-auto mt-4 w-full max-w-[220px] overflow-hidden rounded-[28px] border-[6px] border-gray-900 bg-white">
              <div className="h-11 px-4 pt-3" style={{ background: colorPrimario }}>
                <div className="mx-auto h-1.5 w-12 rounded-full bg-white/30" />
              </div>
              <div className="space-y-3 p-4">
                <div className="flex h-14 items-center justify-center rounded-xl bg-gray-50">
                  {showLogo && riderLogoUrl ? (
                    <img src={riderLogoUrl} alt="" className="h-9 max-w-[75%] object-contain" />
                  ) : (
                    <Smartphone size={20} strokeWidth={1.6} className="text-gray-300" />
                  )}
                </div>
                <p className="truncate text-center text-[12px] font-semibold text-gray-800">
                  {config.rider_app_nombre || 'Modo Sabor Delivery'}
                </p>
                {config.rider_app_bienvenida ? (
                  <p className="line-clamp-2 text-center text-[10px] leading-snug text-gray-400">
                    {config.rider_app_bienvenida}
                  </p>
                ) : null}
                <div className="h-9 rounded-lg bg-gray-100" />
                <div
                  className="flex h-10 items-center justify-center rounded-lg text-[11px] font-semibold text-white"
                  style={{ background: colorPrimario }}
                >
                  Entrar
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

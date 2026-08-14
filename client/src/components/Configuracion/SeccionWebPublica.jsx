import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Eye, ImagePlus, Megaphone, Plus, Trash2 } from 'lucide-react';

import api from '../../lib/api.js';
import { resolveAssetUrl } from '../../lib/assets.js';

import {
  SectionCard,
  InputField,
  SelectField,
  TextareaField,
  ToggleSwitch,
} from './ConfigComponents.jsx';

const ACTION_OPTIONS = [
  { value: 'none', label: 'Sin acción' },
  { value: 'categoria', label: 'Ir a categoría' },
  { value: 'producto', label: 'Abrir producto' },
  { value: 'whatsapp', label: 'Abrir WhatsApp' },
  { value: 'url', label: 'Abrir link' },
  { value: 'cart', label: 'Abrir carrito' },
];

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toDateTimeLocal(value) {
  if (!value) return '';
  return String(value).slice(0, 16);
}

function normalizePromo(promo = {}) {
  return {
    id: promo.id || `promo_${Date.now()}`,
    titulo: promo.titulo || '',
    descripcion: promo.descripcion || '',
    imagen: promo.imagen || '',
    etiqueta: promo.etiqueta || 'PROMO',
    precio_texto: promo.precio_texto || '',
    desde: toDateTimeLocal(promo.desde),
    hasta: toDateTimeLocal(promo.hasta),
    activa: promo.activa !== false,
    mostrar_banner: promo.mostrar_banner !== false,
    mostrar_popup: promo.mostrar_popup === true,
    accion_tipo: promo.accion_tipo || 'categoria',
    accion_valor: promo.accion_valor || '',
    boton_texto: promo.boton_texto || 'Pedir ahora',
  };
}

function isActive(value) {
  return String(value || '0') === '1' || value === true;
}

async function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen'));
    };
    image.src = objectUrl;
  });
}

async function optimizeWebImage(file) {
  if (!file?.type?.startsWith('image/')) return file;
  const image = await loadImageElement(file);
  const maxDimension = 2400;
  const maxTargetSize = 4.5 * 1024 * 1024;
  const shouldResize = image.width > maxDimension || image.height > maxDimension;
  const shouldCompress = file.size > 2.5 * 1024 * 1024 || shouldResize;
  if (!shouldCompress) return file;

  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

  const qualities = [0.9, 0.84, 0.76, 0.68, 0.58];
  let bestBlob = null;
  for (const quality of qualities) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) continue;
    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }
    if (blob.size <= maxTargetSize) break;
  }

  if (!bestBlob) return file;
  if (bestBlob.size >= file.size && bestBlob.size > maxTargetSize) return file;

  const safeName = String(file.name || 'imagen')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w-]+/g, '-');
  return new File([bestBlob], `${safeName || 'imagen'}-optimizada.jpg`, {
    type: 'image/jpeg',
  });
}

function FileButton({ label, onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const optimizedFile = await optimizeWebImage(file).catch(() => file);
    const formData = new FormData();
    formData.append('asset', optimizedFile);
    setUploading(true);
    try {
      const response = await api.post('/configuracion/web-publica/upload', formData);
      onUploaded(response.url);
      if (optimizedFile !== file) {
        toast.success('Imagen cargada y optimizada');
      } else {
        toast.success('Imagen cargada');
      }
    } catch (error) {
      toast.error(error?.error || 'No se pudo subir la imagen');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={uploadFile} className="hidden" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 text-[12px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50"
      >
        <ImagePlus size={14} strokeWidth={1.9} />
        {uploading ? 'Subiendo…' : label}
      </button>
    </>
  );
}

/**
 * Campo de imagen con vista previa.
 *
 * Antes cada imagen de esta pantalla —hero, popup y cada promo— tenía un
 * campo de texto para pegar la ruta y, aparte, un botón para subirla. Dos
 * formas de hacer lo mismo, sin ver nunca el resultado. Ahora se sube y se
 * ve; la ruta queda como dato secundario.
 *
 * La vista previa pasa por `resolveAssetUrl` porque las rutas se guardan
 * relativas (`/uploads/promo.jpg`) y la API vive en otro dominio: sin eso,
 * la imagen no cargaba nunca en el panel.
 */
function ImagenField({ label, value, onChange, hint }) {
  const url = value ? resolveAssetUrl(value) : null;

  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-gray-700">{label}</p>
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
          {url ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus size={18} strokeWidth={1.6} className="text-gray-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] text-gray-500">{value || 'Sin imagen'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <FileButton label={value ? 'Cambiar' : 'Subir imagen'} onUploaded={onChange} />
            {value ? (
              <button
                type="button"
                onClick={() => onChange('')}
                className="inline-flex h-10 items-center rounded-xl px-3 text-[12px] font-semibold text-gray-500 transition hover:bg-white hover:text-gray-800"
              >
                Quitar
              </button>
            ) : null}
          </div>
          {hint ? <p className="mt-1.5 text-[11px] text-gray-400">{hint}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ActionFields({ prefix = '', value, onChange, categorias, productos }) {
  const tipoKey = prefix ? `${prefix}_accion_tipo` : 'accion_tipo';
  const valorKey = prefix ? `${prefix}_accion_valor` : 'accion_valor';
  const tipo = value[tipoKey] || 'none';
  const isReference = tipo === 'categoria' || tipo === 'producto';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <SelectField
        label="Acción del botón"
        value={tipo}
        onChange={(event) => onChange(tipoKey, event.target.value)}
        options={ACTION_OPTIONS}
      />
      {isReference ? (
        <SelectField
          label={tipo === 'categoria' ? 'Categoría destino' : 'Producto destino'}
          value={value[valorKey] || ''}
          onChange={(event) => onChange(valorKey, event.target.value)}
          options={[
            {
              value: '',
              label: tipo === 'categoria' ? 'Primera categoría disponible' : 'Elegir producto',
            },
            ...(tipo === 'categoria' ? categorias : productos).map((item) => ({
              value: String(item.id),
              label: item.nombre,
            })),
          ]}
        />
      ) : (
        <InputField
          label={
            tipo === 'url' ? 'Link destino' : tipo === 'whatsapp' ? 'Mensaje o teléfono' : 'Valor'
          }
          value={value[valorKey] || ''}
          onChange={(event) => onChange(valorKey, event.target.value)}
          disabled={!['url', 'whatsapp'].includes(tipo)}
          placeholder={
            tipo === 'url' ? 'https://...' : tipo === 'whatsapp' ? 'Promo del dia' : 'No requerido'
          }
        />
      )}
    </div>
  );
}

export default function SeccionWebPublica({ config, setConfig }) {
  const [categorias, setCategorias] = useState([]);
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get('/categorias').catch(() => []),
      api.get('/productos').catch(() => []),
    ]).then(([cats, prods]) => {
      setCategorias(Array.isArray(cats) ? cats.filter((item) => item.activo) : []);
      setProductos(Array.isArray(prods) ? prods.filter((item) => item.activo) : []);
    });
  }, []);

  const promos = useMemo(
    () => parseJsonArray(config.web_promos_json).map(normalizePromo),
    [config.web_promos_json]
  );

  const setField = (key, value) => setConfig((prev) => ({ ...prev, [key]: value }));
  const setPromos = (nextPromos) =>
    setField('web_promos_json', JSON.stringify(nextPromos.map(normalizePromo)));
  const updatePromo = (index, key, value) => {
    setPromos(
      promos.map((promo, current) => (current === index ? { ...promo, [key]: value } : promo))
    );
  };
  const addPromo = () => {
    setPromos([
      ...promos,
      normalizePromo({
        id: `promo_${Date.now()}`,
        titulo: 'Promo especial',
        descripcion: 'Cargá una descripcion corta y tentadora.',
      }),
    ]);
  };
  const removePromo = (index) => setPromos(promos.filter((_, current) => current !== index));

  const [promoAbierta, setPromoAbierta] = useState(null);

  // La vista previa pasa por `resolveAssetUrl`: las rutas se guardan
  // relativas y la API vive en otro dominio, así que sin esto la imagen del
  // hero nunca cargaba en el panel aunque sí se viera en la web pública.
  const previewImage = resolveAssetUrl(config.web_hero_imagen || config.negocio_logo || '');
  const activePromos = promos.filter((promo) => promo.activa && promo.mostrar_banner);

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-8">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}
      <div className="flex justify-end">
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-600 transition hover:bg-gray-200"
        >
          <Eye size={15} strokeWidth={1.9} />
          Ver como cliente
        </a>
      </div>

      <SectionCard
        icon={Megaphone}
        tone="rose"
        title="Hero principal"
        subtitle="La primera pantalla que ve el cliente al entrar"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <InputField
            label="Título"
            value={config.web_hero_titulo || ''}
            onChange={(event) => setField('web_hero_titulo', event.target.value)}
          />
          <InputField
            label="Texto del botón"
            value={config.web_hero_boton_texto || ''}
            onChange={(event) => setField('web_hero_boton_texto', event.target.value)}
          />
          <div className="md:col-span-2">
            <TextareaField
              rows={3}
              label="Subtitulo"
              value={config.web_hero_subtitulo || ''}
              onChange={(event) => setField('web_hero_subtitulo', event.target.value)}
            />
          </div>
          <ImagenField
            label="Imagen de fondo"
            value={config.web_hero_imagen || ''}
            onChange={(url) => setField('web_hero_imagen', url)}
            hint="Apaisada, al menos 1200 px de ancho."
          />
          <ActionFields
            prefix="web_hero"
            value={config}
            onChange={setField}
            categorias={categorias}
            productos={productos}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Megaphone}
        tone="amber"
        title="Popup al entrar"
        subtitle="Anuncio grande para promo del dia o semana"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ToggleSwitch
            label="Mostrar popup"
            description="Se muestra al entrar, respetando la frecuencia configurada."
            checked={isActive(config.web_popup_activo)}
            onChange={(checked) => setField('web_popup_activo', checked ? '1' : '0')}
            color="amber"
          />
          <InputField
            label="Frecuencia en horas"
            type="number"
            value={config.web_popup_frecuencia_horas || '12'}
            onChange={(event) => setField('web_popup_frecuencia_horas', event.target.value)}
          />
          <InputField
            label="Título"
            value={config.web_popup_titulo || ''}
            onChange={(event) => setField('web_popup_titulo', event.target.value)}
          />
          <InputField
            label="Texto del botón"
            value={config.web_popup_boton_texto || ''}
            onChange={(event) => setField('web_popup_boton_texto', event.target.value)}
          />
          <div className="md:col-span-2">
            <TextareaField
              rows={3}
              label="Descripción"
              value={config.web_popup_descripcion || ''}
              onChange={(event) => setField('web_popup_descripcion', event.target.value)}
            />
          </div>
          <InputField
            label="Desde"
            type="datetime-local"
            value={toDateTimeLocal(config.web_popup_desde)}
            onChange={(event) => setField('web_popup_desde', event.target.value)}
          />
          <InputField
            label="Hasta"
            type="datetime-local"
            value={toDateTimeLocal(config.web_popup_hasta)}
            onChange={(event) => setField('web_popup_hasta', event.target.value)}
          />
          <ImagenField
            label="Imagen del popup"
            value={config.web_popup_imagen || ''}
            onChange={(url) => setField('web_popup_imagen', url)}
          />
          <ActionFields
            prefix="web_popup"
            value={config}
            onChange={setField}
            categorias={categorias}
            productos={productos}
          />
        </div>
      </SectionCard>

      <SectionCard
        icon={Plus}
        tone="rose"
        title="Promos de la vidriera"
        subtitle="Banners con fecha, imagen y acción propia"
      >
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <ToggleSwitch
            label="Mostrar productos destacados"
            description="Usa los productos marcados como destacados en la carta."
            checked={isActive(config.web_mostrar_destacados)}
            onChange={(checked) => setField('web_mostrar_destacados', checked ? '1' : '0')}
            color="rose"
          />
          <button
            type="button"
            onClick={addPromo}
            className="inline-flex h-full min-h-[76px] items-center justify-center gap-2 rounded-2xl border border-dashed border-rose-300 bg-danger-50 px-4 text-sm font-black uppercase tracking-widest text-danger-700 transition hover:bg-danger-100"
          >
            <Plus size={18} />
            Nueva promo
          </button>
        </div>

        <div className="space-y-5">
          {promos.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-sm font-semibold text-gray-400">
              Todavía no cargaste promos para la web pública.
            </div>
          ) : (
            promos.map((promo, index) => (
              <div key={promo.id || index} className="rounded-xl bg-gray-50 p-4">
                {/*
                  Cada promo despliega diez campos. Con cuatro o cinco cargadas
                  la pantalla se volvía un scroll interminable, así que sólo se
                  abre la que se está editando.
                */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPromoAbierta(promoAbierta === index ? null : index)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold text-gray-900">
                        {promo.titulo || `Promo ${index + 1}`}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-gray-500">
                        {promo.activa ? 'Activa' : 'Pausada'}
                        {promo.precio_texto ? ` · ${promo.precio_texto}` : ''}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => updatePromo(index, 'activa', !promo.activa)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${promo.activa ? 'bg-gray-900 text-white' : 'bg-gray-200 text-gray-500'}`}
                  >
                    {promo.activa ? 'Activa' : 'Pausada'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPromoAbierta(promoAbierta === index ? null : index)}
                    className="shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-gray-500 transition hover:bg-white hover:text-gray-800"
                  >
                    {promoAbierta === index ? 'Cerrar' : 'Editar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`¿Quitar la promo "${promo.titulo || index + 1}"?`)) {
                        removePromo(index);
                      }
                    }}
                    aria-label="Quitar promo"
                    className="shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-white hover:text-gray-700"
                  >
                    <Trash2 size={15} strokeWidth={1.9} />
                  </button>
                </div>

                <div
                  className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${promoAbierta === index ? 'mt-4' : 'hidden'}`}
                >
                  <InputField
                    label="Título"
                    value={promo.titulo}
                    onChange={(event) => updatePromo(index, 'titulo', event.target.value)}
                  />
                  <InputField
                    label="Etiqueta"
                    value={promo.etiqueta}
                    onChange={(event) => updatePromo(index, 'etiqueta', event.target.value)}
                  />
                  <InputField
                    label="Precio / oferta visible"
                    value={promo.precio_texto}
                    onChange={(event) => updatePromo(index, 'precio_texto', event.target.value)}
                    placeholder="$10.000 / 2x1 / Solo hoy"
                  />
                  <InputField
                    label="Boton"
                    value={promo.boton_texto}
                    onChange={(event) => updatePromo(index, 'boton_texto', event.target.value)}
                  />
                  <div className="md:col-span-2">
                    <TextareaField
                      rows={3}
                      label="Descripción"
                      value={promo.descripcion}
                      onChange={(event) => updatePromo(index, 'descripcion', event.target.value)}
                    />
                  </div>
                  <InputField
                    label="Desde"
                    type="datetime-local"
                    value={promo.desde}
                    onChange={(event) => updatePromo(index, 'desde', event.target.value)}
                  />
                  <InputField
                    label="Hasta"
                    type="datetime-local"
                    value={promo.hasta}
                    onChange={(event) => updatePromo(index, 'hasta', event.target.value)}
                  />
                  <ImagenField
                    label="Imagen"
                    value={promo.imagen}
                    onChange={(url) => updatePromo(index, 'imagen', url)}
                  />
                  <ToggleSwitch
                    label="Mostrar en el banner de la vidriera"
                    description="Si lo apagás, la promo existe pero no se ve en la portada."
                    checked={promo.mostrar_banner}
                    onChange={(checked) => updatePromo(index, 'mostrar_banner', checked)}
                  />
                  <ActionFields
                    value={promo}
                    onChange={(key, value) => updatePromo(index, key, value)}
                    categorias={categorias}
                    productos={productos}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={Eye}
        tone="violet"
        title="Vista previa rápida"
        subtitle="Chequeo visual antes de guardar y publicar"
      >
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-[linear-gradient(135deg,_#fff7ef,_#eef4ff)] text-gray-900 shadow-sm">
          <div className="grid min-h-[260px] grid-cols-1 md:grid-cols-[1.15fr,0.85fr]">
            <div className="flex flex-col justify-center p-8">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-red-500">
                Modo Sabor online
              </p>
              <h3 className="text-4xl font-black uppercase leading-none">
                {config.web_hero_titulo || config.negocio_nombre || 'Modo Sabor'}
              </h3>
              <p className="mt-4 max-w-md text-sm font-medium leading-6 text-gray-600">
                {config.web_hero_subtitulo || config.negocio_descripcion}
              </p>
              <div className="mt-6 inline-flex w-fit rounded-2xl bg-red-600 px-5 py-3 text-xs font-black uppercase tracking-widest">
                {config.web_hero_boton_texto || 'Pedir ahora'}
              </div>
            </div>
            <div className="relative min-h-[220px] bg-white/70">
              {previewImage ? (
                <img src={previewImage} alt="Hero preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-5xl font-black text-gray-300">
                  MS
                </div>
              )}
            </div>
          </div>
          {activePromos.length > 0 ? (
            <div className="grid gap-3 border-t border-gray-100 p-4 md:grid-cols-3">
              {activePromos.slice(0, 3).map((promo) => (
                <div key={promo.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-widest text-red-300">
                    {promo.etiqueta}
                  </p>
                  <p className="mt-1 text-sm font-black">{promo.titulo}</p>
                  {promo.precio_texto ? (
                    <p className="mt-2 text-lg font-black text-gray-900">{promo.precio_texto}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}

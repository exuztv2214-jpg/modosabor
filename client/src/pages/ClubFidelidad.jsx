import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Gift, Phone, QrCode, ChevronLeft } from 'lucide-react';

import api from '../lib/api';
import { resolveAssetUrl } from '../lib/assets';
import { buildPublicAppUrl } from '../lib/publicUrls';
import { DEFAULT_BRAND_LOGO, getPublicBrandTheme } from '../lib/webPublicaHelpers';

import TarjetaFidelidad from './ClubFidelidad/TarjetaFidelidad.jsx';
import TarjetaFidelidadFisica from '../components/TarjetaFidelidadFisica.jsx';
import FormularioCliente from './ClubFidelidad/FormularioCliente.jsx';
import StatsCliente from './ClubFidelidad/StatsCliente.jsx';
import ComoFunciona from './ClubFidelidad/ComoFunciona.jsx';

const EMPTY_FORM = {
  nombre: '',
  telefono: '',
  email: '',
  fecha_nacimiento: '',
  direccion: '',
  referencia: '',
};

function getSafeBranding(payload) {
  return {
    negocio_nombre: payload?.branding?.negocio_nombre || 'Modo Sabor',
    negocio_logo: payload?.branding?.negocio_logo || DEFAULT_BRAND_LOGO,
    public_app_url: payload?.branding?.public_app_url || '',
    tarjeta_fidelidad_fondo: payload?.branding?.tarjeta_fidelidad_fondo || '',
  };
}

export default function ClubFidelidad() {
  const { codigo } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lookuping, setLookuping] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [payload, setPayload] = useState(null);

  const branding = useMemo(() => getSafeBranding(payload), [payload]);
  const theme = useMemo(() => getPublicBrandTheme(payload?.config || {}), [payload?.config]);
  const colorPrimario = theme.primary;
  const logoUrl = useMemo(
    () => resolveAssetUrl(branding.negocio_logo || ''),
    [branding.negocio_logo]
  );
  const customFrontImage = useMemo(
    () =>
      branding.tarjeta_fidelidad_fondo ? resolveAssetUrl(branding.tarjeta_fidelidad_fondo) : '',
    [branding.tarjeta_fidelidad_fondo]
  );
  const cardCode = payload?.cliente?.codigo_tarjeta || codigo || '';
  const clubUrl = useMemo(() => {
    const config = { public_app_url: branding.public_app_url };
    return cardCode
      ? buildPublicAppUrl(`/club/${encodeURIComponent(cardCode)}`, config)
      : buildPublicAppUrl('/club', config);
  }, [branding.public_app_url, cardCode]);

  const hydrate = (nextPayload) => {
    setPayload(nextPayload);
    const cliente = nextPayload?.cliente || {};
    setForm((prev) => ({
      ...prev,
      nombre: cliente.nombre || prev.nombre || '',
      telefono: cliente.telefono || prev.telefono || '',
      email: cliente.email || prev.email || '',
      fecha_nacimiento: cliente.fecha_nacimiento || prev.fecha_nacimiento || '',
      direccion: cliente.direccion || prev.direccion || '',
      referencia: cliente.referencia_principal || prev.referencia || '',
    }));
  };

  const loadCard = async () => {
    setLoading(true);
    try {
      // Sin código (QR genérico de mostrador, todavía sin cliente vinculado)
      // igual necesitamos branding/config reales del negocio, no solo cuando
      // hay un codigo_tarjeta puntual.
      const data = codigo
        ? await api.get(`/fidelizacion/club/${encodeURIComponent(codigo)}`)
        : await api.get('/fidelizacion/club-branding');
      hydrate(data);
    } catch (error) {
      if (error?._httpStatus === 404) {
        setPayload(null);
      } else {
        toast.error(error?.error || 'No se pudo cargar la tarjeta');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
  }, [codigo]);

  useEffect(() => {
    const negocio = branding.negocio_nombre || 'Modo Sabor';
    const title = payload?.cliente
      ? `${negocio} | Tarjeta de fidelidad`
      : `${negocio} | Club fidelidad`;
    const desc = payload?.cliente
      ? `Consultá tu tarjeta virtual de fidelidad de ${negocio}, tus puntos, sellos y premios disponibles.`
      : `Completá tu ficha de cliente y activá tu tarjeta virtual de fidelidad en ${negocio}.`;

    const setMeta = (prop, content, attr = 'name') => {
      let el = document.querySelector(`meta[${attr}="${prop}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    document.title = title;
    setMeta('description', desc);
    setMeta('og:type', 'website', 'property');
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('og:url', window.location.href, 'property');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
    if (logoUrl) {
      setMeta('og:image', logoUrl, 'property');
      setMeta('twitter:image', logoUrl);
    }
  }, [branding.negocio_nombre, logoUrl, payload?.cliente]);

  const buscarPorTelefono = async () => {
    if (!form.telefono.trim()) return toast.error('Ingresá tu teléfono');
    setLookuping(true);
    try {
      const data = await api.post('/fidelizacion/club/lookup', {
        codigo: codigo || '',
        telefono: form.telefono,
      });
      if (data?.found) {
        hydrate(data);
        toast.success('Encontramos tu ficha');
      } else {
        toast.success('No encontramos ficha previa. Podés completar tus datos.');
      }
    } catch (error) {
      toast.error(error?.error || 'No se pudo buscar la ficha');
    } finally {
      setLookuping(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) return toast.error('Ingresá tu nombre');
    if (!form.telefono.trim()) return toast.error('Ingresá tu teléfono');
    setSaving(true);
    try {
      const data = await api.post('/fidelizacion/club/registro', {
        codigo: codigo || '',
        ...form,
      });
      hydrate(data);
      toast.success(data?.ya_existia ? 'Actualizamos tu ficha' : 'Tu ficha quedó creada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la ficha');
    } finally {
      setSaving(false);
    }
  };

  const copyClubLink = async () => {
    if (!clubUrl) return;
    try {
      await navigator.clipboard.writeText(clubUrl);
      toast.success('Link de tarjeta copiado');
    } catch {
      toast.error('No se pudo copiar el link');
    }
  };

  const shareCard = async () => {
    if (!clubUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${branding.negocio_nombre} - Tarjeta de fidelidad`,
          text: 'Mirá mi tarjeta de fidelidad en',
          url: clubUrl,
        });
      } catch {
        // noop
      }
    } else {
      copyClubLink();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="mt-4 text-sm font-bold text-gray-500">Cargando tu tarjeta...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
              <img
                src={logoUrl}
                alt={branding.negocio_nombre}
                className="h-full w-full object-contain p-1"
              />
            </div>
            <div>
              <p className="text-lg font-black leading-tight">{branding.negocio_nombre}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                Club de Fidelidad
              </p>
            </div>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 rounded-xl border border-gray-200/80 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
            Menú
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        {/* Hero section */}
        <div className="mb-8 text-center">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white px-4 py-2 text-sm font-bold shadow-sm"
            style={{ color: colorPrimario }}
          >
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse"
              style={{ backgroundColor: colorPrimario }}
            />
            Programa de fidelidad
          </div>
          <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">
            Tu tarjeta de fidelidad,
            <br />
            <span style={{ color: colorPrimario }}>sin vueltas.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-gray-500">
            Si ya pediste por WhatsApp o en el local, completá tu ficha y vinculamos tus compras.
          </p>
        </div>

        {/* Features grid */}
        <div className="mb-12 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm text-center">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: `${colorPrimario}12`, color: colorPrimario }}
            >
              <Phone size={22} />
            </div>
            <h3 className="mt-4 text-base font-black">Tu teléfono te identifica</h3>
            <p className="mt-2 text-sm font-medium text-gray-500">Un número, tu identidad.</p>
          </div>
          <div className="rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm text-center">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: `${colorPrimario}12`, color: colorPrimario }}
            >
              <QrCode size={22} />
            </div>
            <h3 className="mt-4 text-base font-black">QR personalizado</h3>
            <p className="mt-2 text-sm font-medium text-gray-500">Escaneá y accedé a tu tarjeta.</p>
          </div>
          <div className="rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm text-center">
            <div
              className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl shadow-sm"
              style={{ backgroundColor: `${colorPrimario}12`, color: colorPrimario }}
            >
              <Gift size={22} />
            </div>
            <h3 className="mt-4 text-base font-black">Sellos y recompensas</h3>
            <p className="mt-2 text-sm font-medium text-gray-500">Premios listos para canjear.</p>
          </div>
        </div>

        {/* Layout principal: tarjeta + formulario */}
        <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr] xl:items-start">
          {/* Columna izquierda: tarjeta + stats */}
          <div className="space-y-6">
            <TarjetaFidelidad
              cliente={payload?.cliente}
              config={payload?.config}
              branding={branding}
              colorPrimario={colorPrimario}
              clubUrl={clubUrl}
              logoUrl={logoUrl}
              customFrontImage={customFrontImage}
            />
            {payload?.cliente && (
              <>
                <StatsCliente
                  cliente={payload.cliente}
                  config={payload.config}
                  colorPrimario={colorPrimario}
                  clubUrl={clubUrl}
                  onCopyLink={copyClubLink}
                  onShare={shareCard}
                />
                {/* Tarjeta física para imprimir */}
                <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
                  <h3 className="text-lg font-bold text-gray-900">Tu tarjeta física</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Imprimí tu tarjeta de fidelidad y llevála en la billetera.
                  </p>
                  <div className="mt-4">
                    <TarjetaFidelidadFisica
                      cliente={payload.cliente}
                      config={branding}
                      colorPrimario={colorPrimario}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Columna derecha: formulario + cómo funciona */}
          <div className="space-y-6">
            <FormularioCliente
              form={form}
              setForm={setForm}
              onSubmit={guardar}
              onLookup={buscarPorTelefono}
              saving={saving}
              lookuping={lookuping}
              payload={payload}
              colorPrimario={colorPrimario}
            />
            <ComoFunciona colorPrimario={colorPrimario} />
          </div>
        </div>
      </main>
    </div>
  );
}

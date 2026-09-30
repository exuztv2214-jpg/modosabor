import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Gift, ChevronLeft, MessageCircle, Share2, HelpCircle, ChevronDown } from 'lucide-react';

import api from '../lib/api';
import { resolveAssetUrl } from '../lib/assets';
import { buildPublicAppUrl } from '../lib/publicUrls';
import {
  DEFAULT_BRAND_LOGO,
  getPublicBrandTheme,
  buildWhatsAppUrl,
} from '../lib/webPublicaHelpers';

import TarjetaFidelidadFisica from '../components/TarjetaFidelidadFisica.jsx';
import TarjetaFidelidad from './ClubFidelidad/TarjetaFidelidad.jsx';
import FormularioCliente from './ClubFidelidad/FormularioCliente.jsx';
import StatsCliente from './ClubFidelidad/StatsCliente.jsx';
import ComoFunciona from './ClubFidelidad/ComoFunciona.jsx';
import BarraSocio from './ClubFidelidad/BarraSocio.jsx';
import CartelBienvenida from './ClubFidelidad/CartelBienvenida.jsx';

const EMPTY_FORM = {
  nombre: '',
  telefono: '',
  email: '',
  fecha_nacimiento: '',
  direccion: '',
  barrio: '',
  referencia: '',
  acepto_terminos: false,
};

function getSafeBranding(payload) {
  return {
    negocio_nombre: payload?.branding?.negocio_nombre || 'Modo Sabor',
    negocio_logo: payload?.branding?.negocio_logo || DEFAULT_BRAND_LOGO,
    public_app_url: payload?.branding?.public_app_url || '',
    tarjeta_fidelidad_fondo: payload?.branding?.tarjeta_fidelidad_fondo || '',
  };
}

// Cliente falso para el modo `?preview=1` (usado para vender el club y
// para mostrar la tarjeta llena sin necesidad de crear un cliente real).
const DEMO_CLIENTE = {
  id: 'demo',
  nombre: 'Hernán Lorenzo',
  telefono: '381 598 8735',
  email: 'demo@modosabor.com',
  codigo_tarjeta: 'DEMO',
  sellos_actuales: 2,
  puntos: 350,
  nivel: 'Bronce',
  recompensas_pendientes: 0,
  total_pedidos: 5,
  total_gastado: 12500,
};

export default function ClubFidelidad() {
  const { codigo } = useParams();
  const isPreview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';
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
      barrio: cliente.barrio || prev.barrio || '',
      referencia: cliente.referencia_principal || prev.referencia || '',
      // Si el cliente ya esta en la base, ya acepto en su registro anterior.
      acepto_terminos: cliente.id ? true : prev.acepto_terminos,
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
      // En modo preview: inyectar cliente falso encima del branding real,
      // asi se ve la tarjeta con nombre y sellos sin tocar la base.
      hydrate(isPreview ? { ...data, cliente: DEMO_CLIENTE } : data);
    } catch (error) {
      if (error?._httpStatus === 404) {
        setPayload(isPreview ? { cliente: DEMO_CLIENTE } : null);
      } else {
        toast.error(error?.error || 'No se pudo cargar la tarjeta');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCard();
    // La carga depende del código público; loadCard se recrea sólo para usar el estado actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const buscarPorTelefono = async (telefonoOverride) => {
    const telefonoRaw = typeof telefonoOverride === 'string' ? telefonoOverride : form.telefono;
    if (!telefonoRaw?.trim()) return toast.error('Ingresá tu teléfono');
    setLookuping(true);
    try {
      const data = await api.post('/fidelizacion/club/lookup', {
        codigo: codigo || '',
        telefono: telefonoRaw,
      });
      if (data?.found) {
        hydrate(data);
        toast.success('Encontramos tu ficha');
        // Scroll suave hacia la tarjeta para que el usuario vea sus sellos.
        setTimeout(() => {
          document
            .getElementById('mi-tarjeta')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      } else {
        toast('No encontramos ficha previa. Completá tus datos abajo.', { icon: 'ℹ️' });
        setForm((prev) => ({ ...prev, telefono: telefonoRaw }));
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
    if (!form.acepto_terminos) {
      return toast.error('Tenés que aceptar las bases y condiciones para continuar');
    }
    setSaving(true);
    try {
      const data = await api.post('/fidelizacion/club/registro', {
        codigo: codigo || '',
        ...form,
      });
      hydrate(data);
      toast.success(data?.ya_existia ? 'Actualizamos tu ficha' : 'Tu ficha quedó creada');
      // Post-registro: hacer scroll a la tarjeta para que vea el cartel
      // "Este link es tu tarjeta. No lo pierdas." con el link + botones
      // "Enviarme el link" y "Guardar en celular".
      setTimeout(() => {
        document
          .getElementById('mi-tarjeta')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
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
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
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
              <p className="text-lg font-semibold leading-tight">{branding.negocio_nombre}</p>
              <p className="text-[10px] font-bold text-gray-500">Club de Fidelidad</p>
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
        {/* Barra "ya sos socio" arriba de todo, solo cuando el cliente
            todavia no fue vinculado en esta sesion. Le da el atajo mas
            rapido para volver a ver sus sellos. */}
        {!payload?.cliente ? (
          <BarraSocio
            onBuscar={buscarPorTelefono}
            buscando={lookuping}
            colorPrimario={colorPrimario}
          />
        ) : null}

        {/* Hero section */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2">
            <span
              className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white px-4 py-2 text-sm font-bold shadow-sm"
              style={{ color: colorPrimario }}
            >
              <span
                className="h-2.5 w-2.5 rounded-full animate-pulse"
                style={{ backgroundColor: colorPrimario }}
              />
              Programa de fidelidad
            </span>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 shadow-sm">
              100% gratis
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">
            Tu tarjeta de fidelidad,
            <br />
            <span style={{ color: colorPrimario }}>sin vueltas.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg font-medium text-gray-500">
            Si ya pediste por WhatsApp o en el local, completá tu ficha y vinculamos tus compras.
          </p>
        </div>

        {/* Banner del premio real (usando premio_descripcion configurado) */}
        <div className="mb-10">
          <div
            className="relative overflow-hidden rounded-[28px] border border-white/30 p-6 shadow-xl sm:p-8"
            style={{
              background: `linear-gradient(135deg, ${colorPrimario} 0%, ${colorPrimario}dd 60%, ${colorPrimario}bb 100%)`,
            }}
          >
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl"
              style={{
                background: 'radial-gradient(circle, rgba(255,255,255,0.35), transparent 70%)',
              }}
            />
            <div className="relative flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/25 backdrop-blur-sm">
                <Gift size={32} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1 text-white">
                <p className="text-[11px] font-semibold text-white/80">¿Qué ganás?</p>
                <p className="mt-1 text-2xl font-semibold leading-tight sm:text-3xl">
                  {payload?.config?.premio_descripcion || '1 Pizza Muzzarella gratis'}
                </p>
                <p className="mt-1 text-sm font-bold text-white/90">
                  Después de {payload?.config?.sellos_para_premio || 8} compras. Sin trampa.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Layout principal: tarjeta + formulario */}
        <div className="grid gap-8 xl:grid-cols-[1fr_1.2fr] xl:items-start">
          {/* Columna izquierda: tarjeta + stats */}
          <div id="mi-tarjeta" className="space-y-6 scroll-mt-24">
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
                <CartelBienvenida
                  clubUrl={clubUrl}
                  colorPrimario={colorPrimario}
                  nombreCliente={payload.cliente.nombre}
                  telefonoCliente={payload.cliente.telefono}
                  onCopyLink={copyClubLink}
                  esNuevo={Boolean(payload?.ya_existia === false)}
                />
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
                      clubUrl={clubUrl}
                      sellosParaPremio={payload?.config?.sellos_para_premio}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Columna derecha: formulario */}
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
          </div>
        </div>

        {/* "Como funciona" ocupa todo el ancho (fuera del grid de 2 columnas)
            asi la mini tarjeta y los 3 pasos entran comodos al lado. */}
        <div className="mt-12">
          <ComoFunciona
            colorPrimario={colorPrimario}
            sellosParaPremio={payload?.config?.sellos_para_premio}
          />
        </div>

        {/* Compartir con amigos + contacto WhatsApp */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-[24px] border border-gray-200/80 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
                style={{ backgroundColor: `${colorPrimario}12`, color: colorPrimario }}
              >
                <Share2 size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">Compartí con amigos</h3>
                <p className="mt-1 text-sm font-medium text-gray-500">
                  Mandale este link a alguien que quieras invitar al club.
                </p>
                <button
                  type="button"
                  onClick={shareCard}
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[11px] font-semibold text-white shadow-sm transition hover:opacity-90"
                  style={{ backgroundColor: colorPrimario }}
                >
                  <Share2 size={14} />
                  Compartir link
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm">
                <MessageCircle size={22} />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-gray-900">¿Necesitás ayuda?</h3>
                <p className="mt-1 text-sm font-medium text-gray-600">
                  Si tenés dudas con tus sellos o querés canjear un premio, escribinos.
                </p>
                <a
                  href={buildWhatsAppUrl(
                    payload?.config || {},
                    'Hola, tengo una consulta sobre mi tarjeta de fidelidad.'
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-600"
                >
                  <MessageCircle size={14} />
                  Escribir por WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Preguntas frecuentes */}
        <div className="mt-12">
          <div className="mb-6 text-center">
            <div
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                background: `linear-gradient(135deg, ${colorPrimario}24, ${colorPrimario}0f)`,
              }}
            >
              <HelpCircle size={26} style={{ color: colorPrimario }} />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900">Preguntas frecuentes</h3>
            <p className="mt-2 text-sm font-medium text-gray-500">
              Lo que la gente más nos pregunta del club.
            </p>
          </div>
          <FAQ colorPrimario={colorPrimario} sellos={payload?.config?.sellos_para_premio || 8} />
        </div>

        {/* T&C simplificados con link a la pagina completa */}
        <div className="mt-10 rounded-[20px] border border-gray-200/80 bg-white p-5 text-center text-xs font-medium text-gray-500">
          <p>
            El club es gratis y tu ficha queda ligada a tu teléfono. Los sellos no vencen mientras
            sigas activo. El premio se entrega en {branding.negocio_nombre} presentando tu QR o el
            teléfono con el que te anotaste.
          </p>
          <Link
            to="/club/terminos"
            className="mt-3 inline-block text-[11px] font-semibold hover:underline"
            style={{ color: colorPrimario }}
          >
            Leer bases y condiciones completas →
          </Link>
        </div>
      </main>
    </div>
  );
}

// FAQ colapsable simple
function FAQ({ colorPrimario, sellos }) {
  const items = [
    {
      q: `¿Cómo sumo sellos?`,
      a: `Cada compra que cumpla la condición del programa en el local, por WhatsApp o por la web pública suma un sello. Solo tenés que dar tu teléfono al pagar.`,
    },
    {
      q: `¿Cuántos sellos necesito para el premio?`,
      a: `Con ${sellos} sellos ya destrabás el premio y podés canjearlo presentando tu tarjeta o tu teléfono.`,
    },
    {
      q: `¿Los sellos vencen?`,
      a: `Mientras sigas comprando de vez en cuando, no vencen. Si pasás mucho tiempo sin actividad podemos revisar tu tarjeta.`,
    },
    {
      q: `¿Puedo canjear en delivery?`,
      a: `Sí. Al hacer tu pedido avisá que querés canjear tu premio y te lo mandamos junto con el resto de la orden.`,
    },
    {
      q: `¿Qué pasa si cambio de número?`,
      a: `Escribinos por WhatsApp con tu nombre y te transferimos los sellos al número nuevo.`,
    },
    {
      q: `¿Se puede compartir la tarjeta con otra persona?`,
      a: `Cada tarjeta es individual y va con un teléfono. Si querés que otra persona sume, que se anote con su propio número.`,
    },
  ];

  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={item.q}
            className="overflow-hidden rounded-[16px] border border-gray-200/80 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-gray-900">{item.q}</span>
              <ChevronDown
                size={18}
                className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                style={{ color: colorPrimario }}
              />
            </button>
            {isOpen ? (
              <div className="px-5 pb-4 text-sm font-medium leading-relaxed text-gray-600">
                {item.a}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

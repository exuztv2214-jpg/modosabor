import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ScrollText } from 'lucide-react';

import api from '../../lib/api';
import { resolveAssetUrl } from '../../lib/assets';
import { DEFAULT_BRAND_LOGO, getPublicBrandTheme } from '../../lib/webPublicaHelpers';

// Pagina publica /club/terminos con las Bases y Condiciones completas
// del Club de Fidelidad. Se linkea desde el checkbox del formulario y
// desde el pie del club. Toma los datos del negocio de la config publica
// para que sean coherentes (nombre, sellos para premio, premio, etc).
export default function TerminosCondiciones() {
  const [config, setConfig] = useState(null);
  const [branding, setBranding] = useState({
    negocio_nombre: 'Modo Sabor',
    negocio_logo: DEFAULT_BRAND_LOGO,
  });

  useEffect(() => {
    api
      .get('/fidelizacion/club-branding')
      .then((data) => {
        setConfig(data?.config || {});
        setBranding({
          negocio_nombre: data?.branding?.negocio_nombre || 'Modo Sabor',
          negocio_logo: data?.branding?.negocio_logo || DEFAULT_BRAND_LOGO,
        });
      })
      .catch(() => {
        // sin data: mostramos con defaults
      });
  }, []);

  useEffect(() => {
    document.title = `${branding.negocio_nombre} | Bases y condiciones del club`;
  }, [branding.negocio_nombre]);

  const theme = getPublicBrandTheme(config || {});
  const colorPrimario = theme.primary;
  const sellosParaPremio = Number(config?.sellos_para_premio || 8);
  const premio = config?.premio_descripcion || '1 Pizza Muzzarella';
  const diasExpiracion = Number(config?.dias_expiracion || 180);
  const montoMinimoSello = Number(config?.monto_minimo_sello || 0);
  const logoUrl = resolveAssetUrl(branding.negocio_logo || '');

  const secciones = [
    {
      titulo: '1. Alcance del programa',
      cuerpo: `El Club de Fidelidad de ${branding.negocio_nombre} es un programa gratuito de recompensas destinado a clientes que realicen compras en el local, por WhatsApp o por la web pública. La inscripción es voluntaria y se realiza cargando nombre y teléfono en el formulario del club.`,
    },
    {
      titulo: '2. Cómo se ganan sellos',
      cuerpo: `Por cada compra realizada como cliente identificado (dando el teléfono al pagar) se suma un sello a la tarjeta virtual.${
        montoMinimoSello > 0
          ? ` La compra debe superar el monto mínimo configurado por el negocio para que otorgue sello (actualmente $${montoMinimoSello.toLocaleString('es-AR')}).`
          : ''
      } Los sellos se acreditan al confirmarse el pago del pedido, no al hacer la reserva.`,
    },
    {
      titulo: '3. Premio y canje',
      cuerpo: `Al completar ${sellosParaPremio} sellos, el cliente destraba el premio: "${premio}". El premio se canjea presentando el QR de la tarjeta virtual o dando el teléfono con el que se registró. Los premios no son acumulables (cada canje resta un premio pendiente) y no son transferibles a terceros. No se canjean por dinero ni por productos distintos al ofrecido.`,
    },
    {
      titulo: '4. Vigencia de sellos y puntos',
      cuerpo: `Los sellos no vencen mientras el cliente mantenga actividad razonable (al menos una compra cada ${diasExpiracion} días). Si el cliente pasa más de ese período sin comprar, ${branding.negocio_nombre} se reserva el derecho de revisar la tarjeta y ajustar sellos vencidos. Los premios pendientes deben canjearse dentro del año calendario de haber sido ganados.`,
    },
    {
      titulo: '5. Identificación del cliente',
      cuerpo: `El teléfono cargado en la ficha es el identificador único del cliente. Si el cliente cambia de número, debe informarlo al negocio para que se transfieran los sellos y puntos al número nuevo. No se responsabiliza al negocio por sellos perdidos si el cliente no informa el cambio.`,
    },
    {
      titulo: '6. Uso de datos personales',
      cuerpo: `Los datos personales cargados (nombre, teléfono, email, fecha de nacimiento, dirección y barrio) se usan exclusivamente para operar el programa de fidelidad y para enviar novedades y promociones a través de WhatsApp o email. No se comparten con terceros. El cliente puede pedir la baja del programa y la eliminación de sus datos en cualquier momento escribiendo al negocio.`,
    },
    {
      titulo: '7. Fraudes y suspensión',
      cuerpo: `${branding.negocio_nombre} se reserva el derecho de suspender la cuenta de un cliente y anular los sellos acumulados en caso de detectar fraude, uso indebido del programa, o uso de datos de terceros sin su consentimiento. También se puede suspender una cuenta si se detectan sellos cargados por error operativo.`,
    },
    {
      titulo: '8. Modificaciones del programa',
      cuerpo: `${branding.negocio_nombre} se reserva el derecho de modificar los términos del programa (cantidad de sellos para el premio, tipo de premio, monto mínimo por sello, etc.) en cualquier momento. Los cambios se publicarán en esta misma página. Los sellos ya acumulados al momento del cambio se respetan bajo las condiciones vigentes al momento de haberse ganado.`,
    },
    {
      titulo: '9. Baja del programa',
      cuerpo: `El cliente puede darse de baja del programa en cualquier momento escribiéndonos por WhatsApp. Al darse de baja, se pierden los sellos y premios pendientes. Los datos personales se eliminan de la base activa dentro de los 30 días siguientes.`,
    },
    {
      titulo: '10. Consultas y reclamos',
      cuerpo: `Cualquier consulta, reclamo o problema con la carga de sellos se puede canalizar por WhatsApp al número del negocio publicado en la carta online o directamente presentándose en el local con el número de teléfono con el que el cliente se registró.`,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-50 border-b border-gray-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm">
              <img
                src={logoUrl}
                alt={branding.negocio_nombre}
                className="h-full w-full object-contain p-1"
              />
            </div>
            <div>
              <p className="text-sm font-black leading-tight">{branding.negocio_nombre}</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
                Bases y condiciones
              </p>
            </div>
          </div>
          <Link
            to="/club"
            className="inline-flex items-center gap-1 rounded-xl border border-gray-200/80 bg-white px-4 py-2 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <ChevronLeft size={14} />
            Volver al club
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <div className="text-center">
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full shadow-sm"
            style={{
              background: `linear-gradient(135deg, ${colorPrimario}24, ${colorPrimario}0f)`,
            }}
          >
            <ScrollText size={26} style={{ color: colorPrimario }} />
          </div>
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">Bases y condiciones</h1>
          <p className="mt-2 text-sm font-medium text-gray-500">
            Reglas simples y claras del Club de Fidelidad de {branding.negocio_nombre}.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          {secciones.map((sec) => (
            <div
              key={sec.titulo}
              className="rounded-[20px] border border-gray-200/80 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-black text-gray-900">{sec.titulo}</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-gray-600">{sec.cuerpo}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-[20px] border border-gray-200/80 bg-white p-5 text-center text-xs font-medium text-gray-500">
          <p>
            Última actualización de estas bases:{' '}
            {new Date().toLocaleDateString('es-AR', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
            .
          </p>
        </div>
      </main>
    </div>
  );
}

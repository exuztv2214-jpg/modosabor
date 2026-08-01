import { useEffect, useState } from 'react';
import { Check, Copy, MessageCircle, Smartphone, PartyPopper } from 'lucide-react';

// Cartel destacado que aparece cuando el cliente ya tiene ficha cargada.
// Le muestra su link personalizado bien grande y le da 3 formas de no
// perderlo: copiarlo, mandarselo por WhatsApp a si mismo, o guardarlo
// como acceso en el celular.
export default function CartelBienvenida({
  clubUrl,
  colorPrimario,
  nombreCliente,
  telefonoCliente,
  onCopyLink,
  esNuevo,
}) {
  const [copied, setCopied] = useState(false);
  const [pulsando, setPulsando] = useState(false);

  // Cuando el cliente RECIEN se registra: pulsar el boton "Enviarme el link"
  // durante 6 segundos para atraer su atencion al metodo mas util de guardar
  // la tarjeta.
  useEffect(() => {
    if (esNuevo) {
      setPulsando(true);
      const id = setTimeout(() => setPulsando(false), 6000);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [esNuevo]);

  if (!clubUrl) return null;

  // Version corta del link para mostrar (sin protocolo, sin querystring)
  const linkVisible = clubUrl.replace(/^https?:\/\//, '').replace(/\?.*$/, '');

  const copiar = async () => {
    try {
      await onCopyLink?.();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // el toast ya lo maneja onCopyLink
    }
  };

  const mandarWhatsappAlPropio = () => {
    // Abrimos WA con el telefono del propio cliente y el link como mensaje.
    // Asi le llega a su propio chat y le queda guardado.
    const phone = String(telefonoCliente || '').replace(/\D/g, '');
    const finalPhone = phone.startsWith('54') ? phone : `54${phone}`;
    const nombre = String(nombreCliente || '').split(' ')[0] || '';
    const saludo = nombre ? `Hola ${nombre}!` : 'Hola!';
    const text = encodeURIComponent(
      `${saludo} Este es tu link para ver tus sellos del Club Modo Sabor:\n${clubUrl}\n\nGuardalo asi lo tenes a mano.`
    );
    window.open(`https://wa.me/${finalPhone}?text=${text}`, '_blank');
  };

  return (
    <div
      className="relative overflow-hidden rounded-[24px] border-2 p-5 shadow-lg sm:p-6"
      style={{
        borderColor: `${colorPrimario}40`,
        background: `linear-gradient(135deg, ${colorPrimario}12, ${colorPrimario}04)`,
      }}
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${colorPrimario}30, transparent 70%)` }}
      />
      <div className="relative">
        <div className="flex items-center gap-2">
          {esNuevo ? <PartyPopper size={18} style={{ color: colorPrimario }} /> : null}
          <p
            className="text-[10px] font-black uppercase tracking-[0.22em]"
            style={{ color: colorPrimario }}
          >
            {esNuevo ? 'Bienvenido al club' : 'Tu link personal'}
          </p>
        </div>
        <h3 className="mt-1 text-lg font-black text-gray-900 sm:text-xl">
          Este link es tu tarjeta. No lo pierdas.
        </h3>
        <p className="mt-1 text-sm font-medium text-gray-600">
          Guardalo en marcadores, en el escritorio del celular o mandátelo por WhatsApp para volver
          rápido a ver tus sellos.
        </p>

        <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-2xl border border-gray-200 bg-white px-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-bold text-gray-800">{linkVisible}</p>
          </div>
          <button
            type="button"
            onClick={copiar}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition hover:opacity-90"
            style={{ backgroundColor: colorPrimario }}
          >
            {copied ? (
              <>
                <Check size={14} /> Copiado
              </>
            ) : (
              <>
                <Copy size={14} /> Copiar
              </>
            )}
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {telefonoCliente ? (
            <button
              type="button"
              onClick={mandarWhatsappAlPropio}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-[11px] font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-emerald-600 ${pulsando ? 'animate-pulse ring-4 ring-emerald-300' : ''}`}
            >
              <MessageCircle size={14} />
              Enviarme el link
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              alert(
                'Para guardar en tu celular:\n\n' +
                  'iPhone: tocá el botón compartir (cuadrado con flecha ↑) y elegí "Agregar a pantalla de inicio".\n\n' +
                  'Android: tocá los tres puntos (⋮) del navegador y elegí "Añadir a pantalla de inicio" o "Instalar app".'
              );
            }}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-[11px] font-black uppercase tracking-widest text-gray-700 transition hover:bg-gray-50"
          >
            <Smartphone size={14} />
            Guardar en celular
          </button>
        </div>
      </div>
    </div>
  );
}

import { MessageCircle } from 'lucide-react';
import { buildWhatsAppUrl } from '../../lib/webPublicaHelpers.js';

export default function WhatsAppFloat({ config, totalItems }) {
  if (!config?.negocio_telefono) return null;

  const mensaje = `Hola, quiero hacer un pedido en ${config.negocio_nombre || 'Modo Sabor'}.`;
  const url = buildWhatsAppUrl(config, mensaje);

  return (
    <>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Contactar por WhatsApp"
        className="fixed right-4 z-[122] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-2xl transition-all hover:scale-110 active:scale-95 md:hidden"
        style={{ backgroundColor: '#25D366', bottom: totalItems > 0 ? '7rem' : '1.5rem' }}
      >
        <MessageCircle size={26} fill="white" strokeWidth={0} />
      </a>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        aria-label="Contactar por WhatsApp"
        className="fixed bottom-6 left-6 z-[122] hidden items-center gap-3 rounded-full bg-white px-4 py-3 text-left shadow-2xl ring-1 ring-black/5 transition-all hover:-translate-y-1 lg:flex"
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
          style={{ backgroundColor: '#25D366' }}
        >
          <MessageCircle size={24} fill="white" strokeWidth={0} />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-green-600">WhatsApp</p>
          <p className="text-sm font-semibold text-gray-900">Hacé tu pedido</p>
        </div>
      </a>
    </>
  );
}

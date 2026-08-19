import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

import api from '../lib/api.js';
import maquetaWhatsappMasivo from '../../../maqueta-whatsapp-masivo.html?url';

export default function WhatsAppMasivo() {
  const frameRef = useRef(null);
  const datosRef = useRef(null);

  const entregarDatos = useCallback(() => {
    const destino = frameRef.current?.contentWindow;
    if (!destino || !datosRef.current) return;
    destino.postMessage(
      { tipo: 'modosabor:whatsapp-masivo', datos: datosRef.current },
      window.location.origin
    );
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [
        estado,
        campanas,
        excluidos,
        respuestas,
        config,
        todos,
        frecuentes,
        nuevos,
        inactivos,
      ] = await Promise.all([
        api.get('/whatsapp/estado'),
        api.get('/whatsapp/campanas?limite=20'),
        api.get('/whatsapp/excluidos'),
        api.get('/whatsapp/respuestas?limite=30'),
        api.get('/whatsapp/config'),
        api.get('/whatsapp/destinatarios?segmento=todos'),
        api.get('/whatsapp/destinatarios?segmento=frecuentes'),
        api.get('/whatsapp/destinatarios?segmento=nuevos'),
        api.get('/whatsapp/destinatarios?segmento=inactivos'),
      ]);

      datosRef.current = {
        estado,
        campanas: campanas || [],
        excluidos: excluidos || [],
        respuestas: respuestas || [],
        config: config || {},
        audiencias: {
          todos: todos?.items || [],
          frecuentes: frecuentes?.items || [],
          nuevos: nuevos?.items || [],
          inactivos: inactivos?.items || [],
        },
      };
      entregarDatos();
    } catch (error) {
      toast.error(error?.error || 'No se pudo sincronizar WhatsApp masivo');
    }
  }, [entregarDatos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="overflow-hidden bg-[#f4f6fa]" style={{ height: 'calc(100vh - 74px)' }}>
      <iframe
        ref={frameRef}
        title="WhatsApp masivo"
        src={maquetaWhatsappMasivo}
        onLoad={entregarDatos}
        className="block w-full border-0"
        style={{ height: '100%' }}
      />
    </div>
  );
}

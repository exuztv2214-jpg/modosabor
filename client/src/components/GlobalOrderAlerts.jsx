import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { useAuth } from '../context/AuthContext.jsx';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import api from '../lib/api.js';
import { socketManager } from '../lib/socket.js';
import {
  claimAlertKey,
  runDeliveredAlert,
  runOrderAlert,
  useOrderAlertPlayback,
} from '../lib/orderAlerts.js';
import { msDesde } from '../lib/fechas.js';

function wasCreatedRecently(value) {
  /*
    `new Date(value)` sobre el string crudo de SQLite leía la fecha UTC como
    local: en Tucumán quedaba 3 horas adelantada y el `Math.abs(...) <= 2min`
    nunca se cumplía. O sea que **la alerta sonora de pedido nuevo no sonaba
    nunca**. Ver lib/fechas.js.
  */
  const edad = msDesde(value);
  if (edad === null) return false;
  return edad <= 2 * 60 * 1000;
}

export default function GlobalOrderAlerts() {
  const { isAuth, token } = useAuth();
  const { config } = useAppConfig();
  const navigate = useNavigate();
  const { audioContextRef, voiceRef, fallbackAudioRef } = useOrderAlertPlayback();
  const seenOrdersRef = useRef(new Set());
  const deliveredSeenRef = useRef(new Set());
  const lastEstadoRef = useRef(new Map());
  const lastAudioErrorAtRef = useRef(0);
  const printingPedidosRef = useRef(new Set());

  useEffect(() => {
    if (!isAuth || !token) return undefined;

    let released = false;
    let unsubscribe = () => {};

    const imprimirEnIframe = (html) => {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (!doc) return;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1500);
      }, 250);
    };

    const intentarImpresionAutomatica = async (pedido) => {
      if (!pedido?.id) return;
      const origen = String(pedido.origen || '').toLowerCase();
      const esWeb = origen === 'web' || origen === 'whatsapp';
      const esTpv = origen === 'tpv' || origen === 'interno';
      const permitida =
        (esWeb && String(config?.impresion_auto_web) === '1') ||
        (esTpv && String(config?.impresion_auto_tpv) === '1');

      if (!permitida) return;
      if (!claimAlertKey(`print:${pedido.id}`, 8000)) return;
      if (printingPedidosRef.current.has(pedido.id)) return;

      printingPedidosRef.current.add(pedido.id);
      try {
        const response = await api.post(`/pedidos/${pedido.id}/imprimir`, { tipo: 'tpv_pack' });
        if (response?.html) {
          imprimirEnIframe(response.html);
        }
      } catch (error) {
        console.warn('[GlobalOrderAlerts] no se pudo imprimir automaticamente', error);
      } finally {
        setTimeout(() => printingPedidosRef.current.delete(pedido.id), 6000);
      }
    };

    const announceOrder = async (pedido, source = 'nuevo_pedido') => {
      if (!pedido?.id || seenOrdersRef.current.has(pedido.id)) return;
      if (!claimAlertKey(`nuevo:${pedido.id}`)) return;

      seenOrdersRef.current.add(pedido.id);
      if (seenOrdersRef.current.size > 100) {
        const recentIds = [...seenOrdersRef.current].slice(-60);
        seenOrdersRef.current = new Set(recentIds);
      }

      try {
        await runOrderAlert({
          pedido,
          config,
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
        });
        console.info('[GlobalOrderAlerts] alerta lanzada', {
          source,
          pedidoId: pedido.id,
          numero: pedido.numero,
        });
      } catch (error) {
        console.warn('[GlobalOrderAlerts] no se pudo reproducir la alerta', error);
        if (Date.now() - lastAudioErrorAtRef.current > 8000) {
          lastAudioErrorAtRef.current = Date.now();
          toast(
            'Llego un pedido, pero el navegador bloqueo el audio. Hace un click en el panel y proba de nuevo.',
            {
              icon: '🔔',
            }
          );
        }
      }

      intentarImpresionAutomatica(pedido).catch(() => {});
    };

    const announceFromAdminUpdate = async (pedido) => {
      const estado = String(pedido?.estado || '')
        .trim()
        .toLowerCase();
      const prevEstado = lastEstadoRef.current.get(pedido.id);
      lastEstadoRef.current.set(pedido.id, estado);

      if (estado !== 'entregado') {
        deliveredSeenRef.current.delete(pedido.id);
      }

      if (estado === 'entregado') {
        if (prevEstado === 'entregado' || deliveredSeenRef.current.has(pedido.id)) return;
        if (!claimAlertKey(`entregado:${pedido.id}`)) return;
        deliveredSeenRef.current.add(pedido.id);
        if (deliveredSeenRef.current.size > 100) {
          const recentIds = [...deliveredSeenRef.current].slice(-60);
          deliveredSeenRef.current = new Set(recentIds);
        }

        try {
          await runDeliveredAlert({
            pedido,
            config,
            audioContextRef,
            voiceRef,
            fallbackAudioRef,
            scope: 'admin',
          });
          toast.success(`Se entrego el pedido #${pedido.numero || pedido.id}`);
        } catch {}
        return;
      }

      if (!pedido?.id || seenOrdersRef.current.has(pedido.id)) return;
      const eligible =
        estado === 'nuevo' || (estado === 'confirmado' && wasCreatedRecently(pedido?.creado_en));
      if (!eligible) return;
      await announceOrder(pedido, 'pedido_actualizado_admin');
    };

    const announceWhatsappHumanHandoff = async (event = {}) => {
      const conversationId = event?.conversacion_id;
      const phone = String(event?.telefono || '').trim();
      const name = String(event?.nombre || '').trim();
      const reason = String(event?.motivo || '').trim() || 'Chispita necesita ayuda';
      const identity = name || (phone ? `+${phone}` : 'Un cliente de WhatsApp');
      const eventKey = `${conversationId || phone || 'sin-id'}:${event?.en || reason}`;
      if (!claimAlertKey(`whatsapp-persona:${eventKey}`, 10 * 60 * 1000)) return;

      try {
        await runOrderAlert({
          pedido: {
            id: `whatsapp-persona-${conversationId || phone || Date.now()}`,
            numero: 'WhatsApp',
            cliente_nombre: identity,
          },
          config,
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
        });
      } catch (error) {
        console.warn('[GlobalOrderAlerts] no se pudo reproducir la alerta de WhatsApp', error);
      }

      const query = new URLSearchParams({ tab: 'whatsapp' });
      if (conversationId) query.set('conversacion', String(conversationId));
      const destination = `/admin/configuracion?${query.toString()}`;

      toast.custom(
        (currentToast) => (
          <button
            type="button"
            onClick={() => {
              toast.dismiss(currentToast.id);
              /*
                Navegación de la aplicación, no `window.location.assign`.

                Este aviso aparece en todas las pantallas, el TPV incluido. Con
                una recarga completa, el cajero que está armando un pedido y
                toca el aviso **pierde el carrito**: sólo se guarda si aparcó el
                pedido a mano, y nadie aparca antes de atender una urgencia.

                Perder seis ítems cargados por atender un aviso es peor que el
                problema que el aviso venía a resolver.
              */
              navigate(destination);
            }}
            className="flex w-[min(92vw,430px)] items-start gap-3 rounded-2xl border border-red-100 bg-white p-4 text-left shadow-xl"
            aria-label={`Abrir conversación de WhatsApp de ${identity}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-xl">
              💬
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-gray-900">
                WhatsApp necesita una persona
              </span>
              <span className="mt-1 block text-[12px] font-semibold text-gray-700">{identity}</span>
              <span className="mt-1 block text-[12px] leading-relaxed text-gray-500">{reason}</span>
              <span className="mt-2 block text-[11px] font-semibold text-red-600">
                Abrir conversación
              </span>
            </span>
          </button>
        ),
        { duration: 20000, id: `whatsapp-persona-${eventKey}` }
      );
    };

    socketManager.retainAuthenticated(token).catch(() => {});
    const unsubscribeNuevo = socketManager.on('nuevo_pedido', (pedido) =>
      announceOrder(pedido, 'nuevo_pedido')
    );
    const unsubscribeSystemNuevo = socketManager.on('system_nuevo_pedido', (pedido) =>
      announceOrder(pedido, 'system_nuevo_pedido')
    );
    const unsubscribeAdminUpdate = socketManager.on(
      'pedido_actualizado_admin',
      announceFromAdminUpdate
    );
    const unsubscribeWhatsappHuman = socketManager.on(
      'whatsapp_necesita_persona',
      announceWhatsappHumanHandoff
    );
    unsubscribe = () => {
      unsubscribeNuevo();
      unsubscribeSystemNuevo();
      unsubscribeAdminUpdate();
      unsubscribeWhatsappHuman();
    };

    return () => {
      unsubscribe();
      if (!released) {
        released = true;
        socketManager.releaseAuthenticated();
      }
    };
  }, [audioContextRef, config, fallbackAudioRef, isAuth, navigate, token, voiceRef]);

  return null;
}

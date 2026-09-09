import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { LayoutGrid, List, Package, RefreshCw } from 'lucide-react';

import api from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { socketManager } from '../../lib/socket.js';
import { APP_BG, BRAND, estadoTono, STROKE } from '../../lib/theme.js';
import { paymentMethodLabel } from '../../lib/paymentStatus.js';
import {
  claimAlertKey,
  runDeliveredAlert,
  runOrderAlert,
  useOrderAlertPlayback,
} from '../../lib/orderAlerts.js';

import PedidoCard from './PedidoCard.jsx';
import PedidoDetailModal from './PedidoDetailModal.jsx';
import HistorialPanel from './HistorialPanel.jsx';
import {
  COLS,
  ESTADOS_ACTIVOS,
  PRINT_LABELS,
  SIMPLE_COLS,
  csvCell,
  todayStr,
} from './constants.js';

export default function Pedidos() {
  const { hasPermission, isAuth, token } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncingPaymentKey, setSyncingPaymentKey] = useState(null);
  const [pedidoAbierto, setPedidoAbierto] = useState(null);
  const [repartidores, setRepartidores] = useState([]);
  const [guardandoPedido, setGuardandoPedido] = useState(false);

  const configRef = useRef({});
  const deliveredSeenRef = useRef(new Set());
  const deliveryPollSeenRef = useRef(new Set());
  const conciliandoActivosRef = useRef(false);
  const [configSnapshot, setConfigSnapshot] = useState({});
  const { audioContextRef, voiceRef, fallbackAudioRef } = useOrderAlertPlayback();

  const canEdit = hasPermission('pedidos.edit');
  const canKitchen = hasPermission('pedidos.kitchen');
  const canPrint = hasPermission('pedidos.print');
  const simpleFlow = String(configSnapshot?.modulo_kds_activo ?? '1') === '0';

  // ── Historial ───────────────────────────────────────────────────
  const [modoHistorial, setModoHistorial] = useState(false);
  const [histFiltros, setHistFiltros] = useState({
    desde: todayStr(),
    hasta: todayStr(),
    estado: '',
    tipo: '',
  });
  const [histBusqueda, setHistBusqueda] = useState('');
  const [histPedidos, setHistPedidos] = useState([]);
  const [histLoading, setHistLoading] = useState(false);
  const [histPage, setHistPage] = useState(50);

  const cargarHistorial = async () => {
    setHistLoading(true);
    try {
      const params = new URLSearchParams({ limit: 500 });
      if (histFiltros.desde) params.set('fecha_desde', histFiltros.desde);
      if (histFiltros.hasta) params.set('fecha_hasta', histFiltros.hasta);
      if (histFiltros.estado) params.set('estado', histFiltros.estado);
      const data = await api.get(`/pedidos?${params}`);
      setHistPedidos(Array.isArray(data) ? data : []);
      setHistPage(50);
    } catch {
      toast.error('Error al cargar historial');
    } finally {
      setHistLoading(false);
    }
  };

  const histFiltrados = useMemo(() => {
    let result = histPedidos;
    if (histFiltros.tipo) result = result.filter((p) => p.tipo_entrega === histFiltros.tipo);
    if (histBusqueda.trim()) {
      const term = histBusqueda.trim().toLowerCase();
      result = result.filter(
        (p) =>
          String(p.numero || p.id).includes(term) ||
          String(p.cliente_nombre || '')
            .toLowerCase()
            .includes(term) ||
          String(p.cliente_telefono || '').includes(term)
      );
    }
    return result;
  }, [histPedidos, histFiltros.tipo, histBusqueda]);

  const exportarHistorialCSV = () => {
    if (!histFiltrados.length) return toast.error('No hay pedidos para exportar');
    const headers = ['#', 'Fecha', 'Cliente', 'Tipo', 'Estado', 'Método de pago', 'Total'];
    const rows = histFiltrados.map((p) => [
      p.numero || p.id,
      p.creado_en
        ? format(parseISO(String(p.creado_en).replace(' ', 'T')), 'dd/MM/yyyy HH:mm')
        : '',
      p.cliente_nombre || 'Consumidor final',
      p.tipo_entrega,
      estadoTono(p.estado).label,
      paymentMethodLabel(p.metodo_pago),
      Number(p.total || 0).toFixed(2),
    ]);
    const csv = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
    // El BOM hace que Excel abra el archivo con los acentos correctos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${histFiltros.desde || 'hoy'}_${histFiltros.hasta || 'hoy'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${histFiltrados.length} pedidos exportados`);
  };

  // ── Máquina de estados ──────────────────────────────────────────
  const getNextState = (pedido) => {
    if (simpleFlow) {
      if (pedido.estado === 'nuevo') return 'preparando';
      if (pedido.estado === 'preparando')
        return pedido.tipo_entrega === 'delivery' ? 'en_camino' : 'entregado';
      if (pedido.estado === 'en_camino') return 'entregado';
      return null;
    }

    if (pedido.estado === 'nuevo') return 'confirmado';
    if (pedido.estado === 'confirmado') return 'preparando';
    if (pedido.estado === 'preparando') return 'listo';
    if (pedido.estado === 'listo')
      return pedido.tipo_entrega === 'delivery' ? 'en_camino' : 'entregado';
    if (pedido.estado === 'en_camino') return 'entregado';
    return null;
  };

  const getNextActionLabel = (pedido, nextState) => {
    if (!nextState) return '';
    if (nextState === 'entregado') return 'Entregar';
    if (nextState === 'en_camino') return 'Enviar';
    if (simpleFlow && pedido.estado === 'nuevo' && nextState === 'preparando') return 'Aceptar';
    return String(nextState).replace(/_/g, ' ');
  };

  const canChangeState = (pedido, nextState) => {
    if (canEdit) return true;
    if (simpleFlow) {
      if (canKitchen) {
        if (pedido.estado === 'nuevo' && nextState === 'preparando') return true;
        if (
          pedido.estado === 'preparando' &&
          pedido.tipo_entrega === 'delivery' &&
          nextState === 'en_camino'
        )
          return true;
        if (
          pedido.estado === 'preparando' &&
          pedido.tipo_entrega !== 'delivery' &&
          nextState === 'entregado'
        )
          return true;
        if (pedido.estado === 'en_camino' && nextState === 'entregado') return true;
      }
      if (hasPermission('delivery.manage')) {
        if (pedido.tipo_entrega !== 'delivery') return false;
        if (pedido.estado === 'preparando' && nextState === 'en_camino') return true;
        if (pedido.estado === 'en_camino' && nextState === 'entregado') return true;
      }
      return false;
    }

    if (canKitchen) {
      if (pedido.estado === 'confirmado' && nextState === 'preparando') return true;
      if (pedido.estado === 'preparando' && nextState === 'listo') return true;
      if (
        pedido.estado === 'listo' &&
        pedido.tipo_entrega === 'delivery' &&
        nextState === 'en_camino'
      )
        return true;
      if (
        pedido.estado === 'listo' &&
        pedido.tipo_entrega !== 'delivery' &&
        nextState === 'entregado'
      )
        return true;
    }
    if (hasPermission('delivery.manage')) {
      return (
        pedido.tipo_entrega === 'delivery' &&
        pedido.estado === 'en_camino' &&
        nextState === 'entregado'
      );
    }
    return false;
  };

  const cargar = () => {
    setLoading(true);
    api
      .get('/pedidos/activos')
      .then((data) => {
        setPedidos(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  /*
    El socket es la vía inmediata, pero un evento emitido durante un microcorte
    no se repite al reconectar. Esta conciliación silenciosa toma el servidor
    como fuente de verdad sin mostrar skeleton ni pedir que la persona haga F5.
  */
  const reconciliarPedidosActivos = useCallback(async () => {
    if (document.hidden || conciliandoActivosRef.current) return;
    conciliandoActivosRef.current = true;
    try {
      const data = await api.get('/pedidos/activos');
      if (Array.isArray(data)) setPedidos(data);
    } catch {
      // El socket puede seguir conectado aunque esta consulta puntual falle.
    } finally {
      conciliandoActivosRef.current = false;
    }
  }, []);

  useEffect(() => {
    const reconciliarAlVolver = () => {
      if (!document.hidden) void reconciliarPedidosActivos();
    };
    const timer = window.setInterval(reconciliarAlVolver, 15000);
    window.addEventListener('focus', reconciliarAlVolver);
    document.addEventListener('visibilitychange', reconciliarAlVolver);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reconciliarAlVolver);
      document.removeEventListener('visibilitychange', reconciliarAlVolver);
    };
  }, [reconciliarPedidosActivos]);

  // ── Impresión manual ────────────────────────────────────────────
  // La autoimpresión vive exclusivamente en GlobalOrderAlerts. Esta pantalla
  // sólo abre documentos cuando una persona toca Comanda/Ticket: antes ambas
  // rutas atendían el mismo socket y el pedido salía dos veces.
  const imprimir = useCallback(async (id, tipo, options = {}) => {
    const { silent = false } = options;
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup) {
      toast.error('Permití las ventanas emergentes para imprimir');
      return;
    }
    popup.document.write(
      '<p style="font-family: Arial, sans-serif; padding: 24px;">Preparando impresión…</p>'
    );
    popup.document.close();

    try {
      const response = await api.post(`/pedidos/${id}/imprimir`, { tipo });
      popup.document.open();
      popup.document.write(response.html);
      popup.document.close();
      if (!silent) toast.success(`${PRINT_LABELS[tipo] || 'Documento'} listo`);
    } catch {
      popup.close();
      if (!silent) toast.error('No se pudo generar la impresión');
    }
  }, []);

  // ── Tiempo real ─────────────────────────────────────────────────
  useEffect(() => {
    api
      .get('/configuracion/panel')
      .then((data) => {
        configRef.current = data;
        setConfigSnapshot(data || {});
      })
      .catch(() => {});

    // Los riders se cargan una vez: la lista cambia poco y se necesita para
    // poder reasignar un delivery desde el detalle del pedido.
    api
      .get('/repartidores')
      .then((data) => setRepartidores(Array.isArray(data) ? data.filter((r) => r.activo) : []))
      .catch(() => setRepartidores([]));

    cargar();

    if (isAuth && token) {
      socketManager.retainAuthenticated(token).catch(() => {
        socketManager.connect();
      });
    } else {
      socketManager.connect();
    }

    const unsubscribeNuevo = socketManager.on('nuevo_pedido', (p) => {
      setPedidos((prev) => [p, ...prev.filter((pedido) => pedido.id !== p.id)]);
      if (claimAlertKey(`nuevo:${p.id}`)) {
        runOrderAlert({
          pedido: p,
          config: configRef.current || {},
          audioContextRef,
          voiceRef,
          fallbackAudioRef,
        }).catch(() => {});
      }
      toast.success(`Nuevo pedido #${p.numero}`);
    });

    /**
     * Reubica el pedido en el tablero y, si acaba de entregarse, dispara
     * la alerta una sola vez.
     *
     * Antes esta función tenía el bloque de `setPedidos` duplicado: una vez
     * en el early return y otra al final. Ahora la reubicación ocurre en un
     * solo lugar, al final, pase lo que pase con la alerta.
     */
    const handlePedidoActualizado = async (p) => {
      if (p?.estado !== 'entregado') {
        deliveredSeenRef.current.delete(p.id);
      }

      const esEntregaNueva =
        p?.estado === 'entregado' &&
        !deliveredSeenRef.current.has(p.id) &&
        claimAlertKey(`entregado:${p.id}`);

      if (p?.estado === 'entregado') deliveredSeenRef.current.add(p.id);

      if (esEntregaNueva) {
        try {
          await runDeliveredAlert({
            pedido: p,
            config: configRef.current || {},
            audioContextRef,
            voiceRef,
            fallbackAudioRef,
            scope: 'admin',
          });
        } catch {
          // Que falle el sonido no puede impedir que el tablero se actualice.
        }
        toast.success(`Se entregó el pedido #${p.numero || p.id}`);
      }

      setPedidos((prev) => {
        const next = prev.filter((item) => item.id !== p.id);
        return ESTADOS_ACTIVOS.includes(p.estado) ? [...next, p] : next;
      });
    };

    const unsubscribeUpdate = socketManager.on('pedido_actualizado', handlePedidoActualizado);
    const unsubscribeAdminUpdate = socketManager.on(
      'pedido_actualizado_admin',
      handlePedidoActualizado
    );

    return () => {
      unsubscribeNuevo();
      unsubscribeUpdate();
      unsubscribeAdminUpdate();
      if (isAuth && token) {
        socketManager.releaseAuthenticated();
      } else {
        socketManager.disconnect();
      }
    };
  }, [audioContextRef, fallbackAudioRef, isAuth, token, voiceRef]);

  /**
   * Red de seguridad para las entregas.
   *
   * El socket ya avisa cuando un pedido se entrega, pero si la conexión se
   * cayó un momento el evento se pierde y el aviso nunca llega. Este chequeo
   * lo cubre.
   *
   * Dos cosas que antes no hacía y ahora sí: se detiene cuando la pestaña
   * está en segundo plano —no tiene sentido pegarle al servidor para avisar
   * algo que nadie va a ver— y corre cada 15 segundos en vez de cada 8. El
   * `claimAlertKey` sigue evitando que suene dos veces si el socket también
   * lo reportó.
   */
  useEffect(() => {
    let cancelled = false;

    const revisarEntregadosRecientes = async () => {
      if (document.hidden) return;
      try {
        const rows = await api.get('/pedidos?limit=20');
        if (cancelled || !Array.isArray(rows)) return;

        const recentDelivered = rows.filter((pedido) => {
          if (String(pedido?.estado || '') !== 'entregado') return false;
          const updatedAt = new Date(pedido?.actualizado_en || pedido?.creado_en || 0).getTime();
          return Number.isFinite(updatedAt) && Date.now() - updatedAt <= 90 * 1000;
        });

        for (const pedido of recentDelivered) {
          if (deliveryPollSeenRef.current.has(pedido.id)) continue;
          if (!claimAlertKey(`entregado:${pedido.id}`)) continue;
          deliveryPollSeenRef.current.add(pedido.id);
          deliveredSeenRef.current.add(pedido.id);
          try {
            await runDeliveredAlert({
              pedido,
              config: configRef.current || {},
              audioContextRef,
              voiceRef,
              fallbackAudioRef,
              scope: 'admin',
            });
          } catch {
            // Igual que arriba: el sonido es accesorio.
          }
          toast.success(`Se entregó el pedido #${pedido.numero || pedido.id}`);
        }

        if (deliveryPollSeenRef.current.size > 120) {
          deliveryPollSeenRef.current = new Set([...deliveryPollSeenRef.current].slice(-80));
        }
      } catch {
        // Es una red de seguridad: si falla, el socket sigue siendo la vía principal.
      }
    };

    revisarEntregadosRecientes();
    const timer = window.setInterval(revisarEntregadosRecientes, 15000);
    const onVisible = () => {
      if (!document.hidden) revisarEntregadosRecientes();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [audioContextRef, fallbackAudioRef, voiceRef]);

  // ── Acciones ────────────────────────────────────────────────────
  const cambiarEstado = async (id, estado) => {
    toast.dismiss();
    const prevPedidos = pedidos;
    const pedido = prevPedidos.find((p) => p.id === id);
    if (!pedido) return;

    let motivoCancelacion = '';
    if (estado === 'cancelado') {
      motivoCancelacion =
        window.prompt(`Motivo de cancelación del pedido #${pedido.numero}:`, '') || '';
      if (!motivoCancelacion.trim()) return;
    }

    // Optimista: la UI responde ya y hace rollback si el servidor rechaza.
    if (estado === 'entregado' || estado === 'cancelado') {
      setPedidos((prev) => prev.filter((p) => p.id !== id));
      setPedidoAbierto((abierto) => (abierto?.id === id ? null : abierto));
    } else {
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p)));
    }

    try {
      const updated = await api.put(`/pedidos/${id}/estado`, {
        estado,
        ...(estado === 'cancelado' ? { motivo_cancelacion: motivoCancelacion } : {}),
      });
      if (estado === 'entregado' || estado === 'cancelado') {
        toast.success(estado === 'entregado' ? 'Pedido entregado' : 'Pedido cancelado');
      } else {
        setPedidos((prev) => prev.map((p) => (p.id === id ? updated : p)));
        if (estado === 'preparando') toast.success('Pedido aceptado y en preparación');
        if (estado === 'en_camino') toast.success('Pedido marcado como enviado');
      }
    } catch (error) {
      setPedidos(prevPedidos);
      toast.error(error?.error || 'Error al actualizar');
    }
  };

  const sincronizarPago = async (pedidoId) => {
    setSyncingPaymentKey(pedidoId);
    try {
      const result = await api.post(`/pedidos/${pedidoId}/pago/mercadopago/sync`);
      if (result?.pedido) {
        aplicarPedidoActualizado(result.pedido);
      }
      toast.success(result?.message || 'Pago sincronizado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo revisar el pago');
    } finally {
      setSyncingPaymentKey(null);
    }
  };

  /**
   * Refleja un pedido actualizado en el tablero y en el modal.
   *
   * El modal trabaja sobre una copia del pedido, así que si sólo tocáramos
   * la lista el detalle abierto seguiría mostrando los datos viejos.
   */
  const aplicarPedidoActualizado = (actualizado) => {
    if (!actualizado?.id) return;
    setPedidos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
    setHistPedidos((prev) => prev.map((p) => (p.id === actualizado.id ? actualizado : p)));
    setPedidoAbierto((abierto) => (abierto?.id === actualizado.id ? actualizado : abierto));
  };

  /**
   * Cambia la forma de entrega de un pedido ya cargado.
   *
   * `PUT /pedidos/:id` reescribe la fila completa: si no le mandamos todos
   * los campos, los que falten quedan en null. Por eso se arma el payload
   * a partir del pedido existente y sólo se pisa lo que cambia.
   */
  const cambiarTipoEntrega = async (pedido, nuevoTipo) => {
    if (!pedido || pedido.tipo_entrega === nuevoTipo) return;

    let mesa = pedido.mesa || '';
    if (nuevoTipo === 'mesa') {
      mesa = window.prompt('¿A qué mesa pasa el pedido?', mesa || '');
      if (mesa === null) return;
      if (!String(mesa).trim()) {
        toast.error('Necesitás indicar el número de mesa');
        return;
      }
    } else {
      // Al salir de mesa la liberamos, si no queda ocupada para siempre.
      mesa = '';
    }

    if (nuevoTipo === 'delivery' && !String(pedido.cliente_direccion || '').trim()) {
      toast.error('Cargá primero la dirección del cliente para pasarlo a delivery');
      return;
    }

    setGuardandoPedido(true);
    try {
      const actualizado = await api.put(`/pedidos/${pedido.id}`, {
        cliente_nombre: pedido.cliente_nombre || '',
        cliente_telefono: pedido.cliente_telefono || '',
        cliente_direccion: pedido.cliente_direccion || '',
        notas: pedido.notas || '',
        metodo_pago: pedido.metodo_pago,
        tipo_entrega: nuevoTipo,
        mesa,
        hora_entrega: pedido.hora_entrega || '',
        descuento: Number(pedido.descuento || 0),
      });
      aplicarPedidoActualizado(actualizado);
      toast.success('Forma de entrega actualizada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo cambiar la forma de entrega');
    } finally {
      setGuardandoPedido(false);
    }
  };

  /** Asigna, reasigna o autoasigna el rider de un pedido de delivery. */
  const asignarRider = async (pedido, repartidorId) => {
    if (!pedido) return;
    setGuardandoPedido(true);
    try {
      const respuesta = repartidorId
        ? await api.post(`/repartidores/${repartidorId}/asignar/${pedido.id}`)
        : await api.post(`/repartidores/auto-asignar/${pedido.id}`);
      const actualizado = respuesta?.pedido || respuesta;
      aplicarPedidoActualizado(actualizado);
      toast.success(
        repartidorId
          ? `Asignado a ${actualizado?.repartidor_nombre || 'el rider'}`
          : `Autoasignado a ${actualizado?.repartidor_nombre || 'un rider'}`
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo asignar el rider');
    } finally {
      setGuardandoPedido(false);
    }
  };

  const actualizarPago = async (pedidoId, pagoEstado) => {
    setSyncingPaymentKey(pedidoId);
    try {
      const result = await api.put(`/pedidos/${pedidoId}/pago`, { pago_estado: pagoEstado });
      aplicarPedidoActualizado(result);
      toast.success(pagoEstado === 'pagado' ? 'Cobro registrado' : 'Estado de pago actualizado');
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar el cobro');
    } finally {
      setSyncingPaymentKey(null);
    }
  };

  const columnas = simpleFlow ? SIMPLE_COLS : COLS;

  return (
    <div
      className={`flex flex-col px-6 py-6 ${modoHistorial ? 'min-h-screen' : 'h-[calc(100vh-4rem)] overflow-hidden'}`}
      style={{ background: APP_BG }}
    >
      {/* ── Encabezado ── */}
      <div className="mb-5 flex flex-shrink-0 flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Pedidos</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {modoHistorial
              ? `${histFiltrados.length} pedidos en el historial`
              : `${pedidos.length} ${pedidos.length === 1 ? 'pedido activo' : 'pedidos activos'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !modoHistorial;
              setModoHistorial(next);
              if (next) cargarHistorial();
            }}
            style={modoHistorial ? { background: BRAND, color: '#FFFFFF' } : undefined}
            className={`flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold transition ${modoHistorial ? '' : 'bg-white text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:bg-gray-50'}`}
          >
            {modoHistorial ? (
              <LayoutGrid size={16} strokeWidth={STROKE} />
            ) : (
              <List size={16} strokeWidth={STROKE} />
            )}
            {modoHistorial ? 'Ver en vivo' : 'Historial'}
          </button>
          {!modoHistorial ? (
            <button
              type="button"
              onClick={cargar}
              className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
            >
              <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          ) : null}
        </div>
      </div>

      {modoHistorial ? (
        <div className="flex-1">
          <HistorialPanel
            filtros={histFiltros}
            onFiltrosChange={setHistFiltros}
            busqueda={histBusqueda}
            onBusquedaChange={setHistBusqueda}
            pedidos={histFiltrados}
            loading={histLoading}
            page={histPage}
            onVerMas={() => setHistPage((p) => p + 50)}
            onAplicar={cargarHistorial}
            onExportar={exportarHistorialCSV}
            onAbrirPedido={setPedidoAbierto}
          />
        </div>
      ) : (
        <div className="no-scrollbar flex flex-1 gap-4 overflow-x-auto pb-2">
          {columnas.map((col) => {
            const colPedidos = pedidos.filter((p) => p.estado === col.estado);
            const tono = estadoTono(col.estado);
            const IconCol = col.icon;
            return (
              <div key={col.estado} className="flex w-[290px] flex-shrink-0 flex-col">
                <div className="mb-3 flex items-center gap-2.5 px-1">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: tono.bg, color: tono.fg }}
                  >
                    <IconCol size={16} strokeWidth={STROKE} />
                  </span>
                  <span className="text-[14px] font-semibold text-gray-800">{col.label}</span>
                  <span
                    className="ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                    style={{ background: tono.bg, color: tono.fg }}
                  >
                    {colPedidos.length}
                  </span>
                </div>

                <div className="no-scrollbar flex-1 space-y-2.5 overflow-y-auto px-1 pb-4">
                  {colPedidos.length === 0 ? (
                    <div className="rounded-2xl border-2 border-dashed border-gray-200 py-12 text-center">
                      <Package size={22} strokeWidth={1.4} className="mx-auto mb-2 text-gray-200" />
                      <p className="text-[12px] text-gray-400">Sin pedidos</p>
                    </div>
                  ) : null}
                  {colPedidos.map((p) => (
                    <PedidoCard
                      key={p.id}
                      pedido={p}
                      onEstado={cambiarEstado}
                      onPrint={imprimir}
                      onOpen={setPedidoAbierto}
                      onSyncPayment={sincronizarPago}
                      onUpdatePayment={actualizarPago}
                      syncingPaymentKey={syncingPaymentKey}
                      canPrint={canPrint}
                      canChangeState={(nextState) => canChangeState(p, nextState)}
                      resolveNextState={getNextState}
                      resolveNextLabel={getNextActionLabel}
                      canCancel={canEdit}
                      canManagePayment={canEdit}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pedidoAbierto ? (
        <PedidoDetailModal
          pedido={pedidoAbierto}
          onClose={() => setPedidoAbierto(null)}
          onPrint={imprimir}
          canPrint={canPrint}
          canEdit={canEdit}
          canAssignRider={canEdit || hasPermission('delivery.manage')}
          repartidores={repartidores}
          guardando={guardandoPedido}
          onCambiarTipoEntrega={cambiarTipoEntrega}
          onAsignarRider={asignarRider}
        />
      ) : null}
    </div>
  );
}

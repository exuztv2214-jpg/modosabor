import { useState } from 'react';
import {
  Bike,
  ClipboardPaste,
  Gift,
  History,
  MapPin,
  Receipt,
  Star,
  UserSearch,
  Users,
} from 'lucide-react';

import { fmt, Popover, SectionLabel, STROKE } from './tpvUi.jsx';

/**
 * Datos del cliente, comprimidos para una columna de 320px.
 *
 * Antes esto eran seis tarjetas apiladas. Ahora es una tarjeta de tres o
 * cuatro filas donde cada dato accesorio —fidelidad, historial, clientes
 * del día, barrios de Monteros, rider— se abre desde su propio botón.
 *
 * Las filas de dirección y rider sólo existen en delivery: no tiene
 * sentido reservarles alto en una venta de mostrador.
 */
export default function TpvCustomerBlock({
  cliente,
  tipoEntrega,
  mesa,
  onSetMesa,
  onImprimirMesa,
  printingMesa,
  onSetCliente,
  onClearCliente,
  onAbrirSelectorClientes,
  onCanjearRecompensa,
  clienteResumen,
  clientesDelDia = [],
  onQuickPickCliente,
  onRepeatClientePedido,
  onRepeatPedidoHistorico,
  barriosConocidos = [],
  onUbicacionCliente,
  onPegarUbicacionCliente,
  sharingLocation,
  repartidoresActivos = [],
  repartidoresDisponibles = [],
  selectedRiderId,
  onSeleccionarRider,
}) {
  const [abierto, setAbierto] = useState(null);
  const toggle = (key) => setAbierto((previo) => (previo === key ? null : key));
  const cerrar = () => setAbierto(null);

  const campo =
    'h-10 w-full min-w-0 rounded-xl border border-transparent bg-gray-50 px-3 text-[13px] font-medium text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-brand-200 focus:bg-white';
  const iconBtn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800';

  const selectedBarrio = (barriosConocidos || []).find(
    (barrio) => String(barrio.id) === String(cliente?.direccion_barrio_id || '')
  );
  const selectedManzana = (selectedBarrio?.manzanas || []).find(
    (manzana) => String(manzana.id) === String(cliente?.direccion_manzana_id || '')
  );

  const formatDireccionConocida = ({ barrio, manzana, casa }) => {
    if (!barrio) return '';
    const parts = [barrio.nombre || 'Barrio conocido'];
    if (manzana?.letra) parts.push(`Mza ${manzana.letra}`);
    if (String(casa || '').trim()) parts.push(`Casa ${String(casa).trim()}`);
    parts.push('Monteros');
    return parts.join(', ');
  };

  const updateDireccionConocida = ({ barrio, manzana, casa }) => {
    onSetCliente({
      ...cliente,
      direccion_barrio_id: barrio?.id || null,
      direccion_barrio_nombre: barrio?.nombre || '',
      direccion_manzana_id: manzana?.id || null,
      direccion_manzana: manzana?.letra || '',
      direccion_casa: casa || '',
      direccion: barrio ? formatDireccionConocida({ barrio, manzana, casa }) : cliente.direccion,
      latitud: null,
      longitud: null,
      ubicacionExacta: false,
    });
  };

  // ── Mesa: el caso más simple ──
  if (tipoEntrega === 'mesa') {
    return (
      <div className="flex gap-2 px-3">
        <input
          value={mesa}
          onChange={(event) => onSetMesa(event.target.value)}
          placeholder="N° de mesa"
          className={`${campo} tabular-nums`}
        />
        <button
          type="button"
          onClick={onImprimirMesa}
          disabled={printingMesa || !String(mesa || '').trim()}
          title="Imprimir precuenta"
          aria-label="Imprimir precuenta"
          className={`${iconBtn} disabled:opacity-40`}
        >
          <Receipt size={17} strokeWidth={STROKE} />
        </button>
      </div>
    );
  }

  const sellos = Number(cliente.sellos_actuales || 0);
  const premios = Number(cliente.recompensas_pendientes || 0);
  const riderElegido = repartidoresActivos.find(
    (item) => String(item.id) === String(selectedRiderId)
  );
  const riderSugerido = repartidoresDisponibles[0] || repartidoresActivos[0] || null;

  return (
    <div className="space-y-1.5 px-3">
      {/* ── Teléfono ── */}
      <div className="flex gap-2">
        <input
          value={cliente.telefono}
          onChange={(event) => onSetCliente({ ...cliente, telefono: event.target.value })}
          placeholder="Teléfono"
          inputMode="tel"
          className={`${campo} tabular-nums`}
        />
        <button
          type="button"
          onClick={onAbrirSelectorClientes}
          title="Buscar cliente"
          aria-label="Buscar cliente"
          className={iconBtn}
        >
          <UserSearch size={17} strokeWidth={STROKE} />
        </button>
      </div>

      {/* ── Nombre + accesos ── */}
      <div className="relative flex gap-2">
        <input
          value={cliente.nombre}
          onChange={(event) => onSetCliente({ ...cliente, nombre: event.target.value })}
          placeholder="Nombre"
          className={campo}
        />

        {cliente.id ? (
          <button
            type="button"
            onClick={() => toggle('fidelidad')}
            title="Tarjeta de fidelidad"
            className={`flex h-10 shrink-0 items-center gap-1 rounded-xl px-2.5 text-[12px] font-semibold tabular-nums transition ${premios > 0 ? 'bg-brand-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            {premios > 0 ? (
              <Gift size={14} strokeWidth={STROKE} />
            ) : (
              <Star size={14} strokeWidth={STROKE} />
            )}
            {premios > 0 ? premios : sellos}
          </button>
        ) : null}

        {clienteResumen?.id ? (
          <button
            type="button"
            onClick={() => toggle('historial')}
            title="Historial del cliente"
            aria-label="Historial del cliente"
            className={iconBtn}
          >
            <History size={17} strokeWidth={STROKE} />
          </button>
        ) : null}

        {clientesDelDia.length > 0 && !cliente.nombre ? (
          <button
            type="button"
            onClick={() => toggle('delDia')}
            title="Clientes del día"
            aria-label="Clientes del día"
            className={iconBtn}
          >
            <Users size={17} strokeWidth={STROKE} />
          </button>
        ) : null}

        <Popover open={abierto === 'fidelidad'} onClose={cerrar} align="right">
          <SectionLabel className="mb-1">Tarjeta de fidelidad</SectionLabel>
          <p className="text-[13px] font-semibold text-gray-900">
            {cliente.codigo_tarjeta || `Cliente #${cliente.id}`}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-gray-50 px-2 py-2.5">
              <p className="text-[10px] font-medium text-gray-400">Puntos</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">
                {Number(cliente.puntos || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-2 py-2.5">
              <p className="text-[10px] font-medium text-gray-400">Sellos</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-gray-900">{sellos}</p>
            </div>
            <div className="rounded-xl bg-brand-50 px-2 py-2.5">
              <p className="text-[10px] font-medium text-brand-400">Premios</p>
              <p className="mt-0.5 text-base font-bold tabular-nums text-brand-600">{premios}</p>
            </div>
          </div>
          {premios > 0 ? (
            <button
              type="button"
              onClick={() => {
                onCanjearRecompensa();
                cerrar();
              }}
              className="mt-3 h-11 w-full rounded-xl bg-brand-500 text-[13px] font-semibold text-white"
            >
              Canjear premio
            </button>
          ) : null}
        </Popover>

        <Popover open={abierto === 'historial'} onClose={cerrar} align="right">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionLabel>Historial</SectionLabel>
              <p className="mt-0.5 text-[13px] font-semibold text-gray-900">
                {Number(clienteResumen?.total_pedidos || 0)} pedidos ·{' '}
                {fmt(clienteResumen?.total_gastado || 0)}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-500">
              {clienteResumen?.nivel || 'Bronce'}
            </span>
          </div>
          {Array.isArray(clienteResumen?.pedidos) && clienteResumen.pedidos.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => {
                  onRepeatClientePedido();
                  cerrar();
                }}
                className="mt-3 h-11 w-full rounded-xl bg-gray-900 text-[13px] font-semibold text-white"
              >
                Repetir el último
              </button>
              <div className="mt-2 max-h-[200px] space-y-1 overflow-y-auto">
                {clienteResumen.pedidos.slice(0, 5).map((pedido) => (
                  <button
                    key={pedido.id}
                    type="button"
                    onClick={() => {
                      onRepeatPedidoHistorico?.(pedido);
                      cerrar();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12px] font-semibold text-gray-900">
                        #{pedido.numero}
                      </span>
                      <span className="block truncate text-[11px] text-gray-400">
                        {pedido.estado} · {pedido.tipo_entrega}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-brand-600">
                      {fmt(pedido.total)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-3 text-center text-[12px] text-gray-400">
              Sin pedidos entregados todavía.
            </p>
          )}
        </Popover>

        <Popover open={abierto === 'delDia'} onClose={cerrar} align="right">
          <SectionLabel className="mb-2">Clientes del día</SectionLabel>
          <div className="max-h-[240px] space-y-1 overflow-y-auto">
            {clientesDelDia.map((item, index) => (
              <button
                key={`${item.id || item.telefono || item.nombre}-${index}`}
                type="button"
                onClick={() => {
                  onQuickPickCliente?.(item);
                  cerrar();
                }}
                className="w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-gray-50"
              >
                <span className="block text-[12px] font-semibold text-gray-900">{item.nombre}</span>
                <span className="block text-[11px] tabular-nums text-gray-400">
                  {item.telefono || 'Sin teléfono'}
                </span>
              </button>
            ))}
          </div>
        </Popover>
      </div>

      {/* ── Dirección + rider: sólo delivery ── */}
      {tipoEntrega === 'delivery' ? (
        <>
          <div className="relative flex gap-2">
            <input
              value={cliente.direccion}
              onChange={(event) =>
                onSetCliente({
                  ...cliente,
                  direccion: event.target.value,
                  latitud: null,
                  longitud: null,
                })
              }
              placeholder="Dirección"
              className={campo}
            />
            <button
              type="button"
              onClick={() => toggle('direccion')}
              title="Ubicación y barrios conocidos"
              aria-label="Ubicación y barrios conocidos"
              className={
                cliente.latitud
                  ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white'
                  : iconBtn
              }
            >
              <MapPin size={17} strokeWidth={STROKE} />
            </button>

            <Popover open={abierto === 'direccion'} onClose={cerrar} align="right">
              <SectionLabel className="mb-2">Ubicación exacta</SectionLabel>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onUbicacionCliente}
                  disabled={sharingLocation}
                  title="Usa el GPS de este dispositivo (sólo si el cliente está en el local)"
                  className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold transition ${cliente.latitud ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  <MapPin size={14} strokeWidth={STROKE} />
                  {sharingLocation ? 'Tomando…' : cliente.latitud ? 'GPS listo' : 'Usar GPS'}
                </button>
                <button
                  type="button"
                  onClick={onPegarUbicacionCliente}
                  title="Pegá el link de Google Maps que mandó el cliente"
                  className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-[12px] font-semibold text-gray-700"
                >
                  <ClipboardPaste size={14} strokeWidth={STROKE} />
                  Pegar link
                </button>
              </div>

              {Array.isArray(barriosConocidos) && barriosConocidos.length > 0 ? (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <SectionLabel className="mb-1">Barrio con manzana y casa</SectionLabel>
                  <p className="mb-2 text-[11px] leading-snug text-gray-400">
                    Usalo cuando el cliente diga manzana y casa en vez de calle.
                  </p>
                  <select
                    value={cliente?.direccion_barrio_id || ''}
                    onChange={(event) => {
                      const barrio = barriosConocidos.find(
                        (item) => String(item.id) === String(event.target.value)
                      );
                      updateDireccionConocida({ barrio, manzana: null, casa: '' });
                    }}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700"
                  >
                    <option value="">Dirección escrita normal</option>
                    {barriosConocidos.map((barrio) => (
                      <option key={barrio.id} value={barrio.id}>
                        {barrio.nombre}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <select
                      value={cliente?.direccion_manzana_id || ''}
                      onChange={(event) => {
                        const manzana = (selectedBarrio?.manzanas || []).find(
                          (item) => String(item.id) === String(event.target.value)
                        );
                        updateDireccionConocida({
                          barrio: selectedBarrio,
                          manzana,
                          casa: cliente?.direccion_casa || '',
                        });
                      }}
                      disabled={!selectedBarrio}
                      className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 disabled:opacity-40"
                    >
                      <option value="">Manzana</option>
                      {(selectedBarrio?.manzanas || []).map((manzana) => (
                        <option key={manzana.id} value={manzana.id}>
                          {manzana.letra}
                        </option>
                      ))}
                    </select>
                    <input
                      value={cliente?.direccion_casa || ''}
                      onChange={(event) =>
                        updateDireccionConocida({
                          barrio: selectedBarrio,
                          manzana: selectedManzana,
                          casa: event.target.value,
                        })
                      }
                      disabled={!selectedBarrio}
                      placeholder="Casa"
                      className="h-11 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-medium text-gray-700 disabled:opacity-40"
                    />
                  </div>
                </div>
              ) : null}
            </Popover>
          </div>

          {/* Rider: una línea, no un bloque */}
          <div className="relative flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
            <Bike size={14} strokeWidth={STROKE} className="shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-600">
              {riderElegido ? (
                riderElegido.nombre
              ) : riderSugerido ? (
                <>
                  {riderSugerido.nombre}
                  <span className="text-gray-400"> · automático</span>
                </>
              ) : (
                <span className="text-amber-600">Sin riders activos</span>
              )}
            </span>
            <button
              type="button"
              onClick={() => toggle('rider')}
              className="shrink-0 text-[11px] font-semibold text-brand-600 transition hover:text-brand-700"
            >
              Cambiar
            </button>

            <Popover open={abierto === 'rider'} onClose={cerrar} align="right">
              <SectionLabel className="mb-2">Asignar rider</SectionLabel>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    onSeleccionarRider('');
                    cerrar();
                  }}
                  className={`flex h-11 w-full items-center rounded-xl px-3 text-[13px] font-semibold transition ${!selectedRiderId ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  Que decida el sistema
                </button>
                {repartidoresActivos.map((repartidor) => {
                  const activo = String(selectedRiderId) === String(repartidor.id);
                  const libre = Number(repartidor.disponible) === 1;
                  return (
                    <button
                      key={repartidor.id}
                      type="button"
                      onClick={() => {
                        onSeleccionarRider(String(repartidor.id));
                        cerrar();
                      }}
                      className={`flex h-11 w-full items-center justify-between rounded-xl px-3 text-[13px] font-semibold transition ${activo ? 'bg-brand-500 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {repartidor.nombre}
                      {!libre ? (
                        <span
                          className={`text-[10px] font-medium ${activo ? 'text-white/75' : 'text-amber-600'}`}
                        >
                          Ocupado
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {repartidoresActivos.length > 0 && repartidoresDisponibles.length === 0 ? (
                <p className="mt-2 text-[11px] leading-snug text-amber-600">
                  No hay riders libres. Podés fijar uno ocupado si el turno trabaja con un solo
                  reparto.
                </p>
              ) : null}
            </Popover>
          </div>
        </>
      ) : null}

      {cliente.nombre || cliente.telefono ? (
        <button
          type="button"
          onClick={onClearCliente}
          className="w-full text-[11px] font-medium text-gray-300 transition hover:text-brand-500"
        >
          Limpiar cliente
        </button>
      ) : null}
    </div>
  );
}

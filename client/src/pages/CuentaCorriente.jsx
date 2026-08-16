import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, NotebookPen, RefreshCw } from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';

/**
 * Cuenta corriente: quiénes deben y cuánto.
 *
 * Reemplaza el cuaderno. Y lo importante no es el saldo: es que cada peso
 * tenga su fila con fecha, motivo y quién lo cargó. Un número solo no se puede
 * defender cuando el cliente discute la cuenta — y en algún momento la discute.
 *
 * Por eso el detalle muestra los movimientos completos y no un resumen.
 */

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

export default function CuentaCorriente() {
  const [lista, setLista] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargarLista = useCallback(async () => {
    setCargando(true);
    try {
      setLista(await api.get('/cuenta-corriente'));
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  const abrir = async (clienteId) => {
    try {
      setDetalle(await api.get(`/cuenta-corriente/${clienteId}`));
    } catch (error) {
      toast.error(error?.error || 'No se pudo abrir la cuenta');
    }
  };

  const cobrar = async () => {
    const ingresado = window.prompt(
      `${detalle.nombre} debe ${fmt(detalle.saldo)}.\n\n¿Cuánto está pagando?`,
      String(detalle.saldo)
    );
    if (ingresado === null) return;
    const monto = Math.max(0, Number(String(ingresado).replace(/[^\d]/g, '') || 0));
    if (!monto) return;

    try {
      await api.post(`/cuenta-corriente/${detalle.id}/pago`, {
        monto,
        nota: String(window.prompt('Nota (opcional)', '') || '').trim(),
      });
      toast.success(`Cobrados ${fmt(monto)}`);
      await abrir(detalle.id);
      await cargarLista();
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar el pago');
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Cargando…
      </div>
    );
  }

  /* ── El detalle de un cliente ─────────────────────────────────────────── */
  if (detalle) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pb-16 pt-2">
        <button
          type="button"
          onClick={() => setDetalle(null)}
          className="flex items-center gap-1.5 text-[13px] text-gray-500 transition hover:text-gray-800"
        >
          <ArrowLeft size={15} strokeWidth={STROKE} />
          Volver
        </button>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-[19px] font-semibold text-gray-900">{detalle.nombre}</h1>
              <p className="mt-0.5 text-[13px] text-gray-500">{detalle.telefono}</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">Debe</p>
              <p className="text-[26px] font-bold tabular-nums" style={{ color: BRAND }}>
                {fmt(detalle.saldo)}
              </p>
              <p className="text-[11px] text-gray-400">
                de {fmt(detalle.limite_credito)} · le quedan {fmt(detalle.disponible)}
              </p>
            </div>
          </div>

          {detalle.saldo > 0 ? (
            <button
              type="button"
              onClick={cobrar}
              className="mt-4 h-11 w-full rounded-xl text-[13px] font-semibold text-white transition hover:brightness-95"
              style={{ backgroundColor: BRAND }}
            >
              Registrar un pago
            </button>
          ) : null}
        </div>

        <div className="rounded-2xl border border-gray-200/80 bg-white p-5">
          <p className="mb-3 text-[13px] font-semibold text-gray-900">Movimientos</p>
          {detalle.movimientos?.length ? (
            <div className="space-y-1">
              {detalle.movimientos.map((mov) => {
                const suma = mov.tipo === 'consumo' || mov.tipo === 'ajuste';
                return (
                  <div
                    key={mov.id}
                    className="flex items-baseline justify-between gap-3 rounded-xl px-2.5 py-2 hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-gray-900">
                        {mov.tipo === 'consumo'
                          ? mov.pedido_numero
                            ? `Pedido #${mov.pedido_numero}`
                            : 'Consumo'
                          : mov.tipo === 'pago'
                            ? 'Pagó'
                            : 'Ajuste'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {String(mov.creado_en || '')
                          .slice(0, 16)
                          .replace('T', ' ')}
                        {mov.usuario_nombre ? ` · ${mov.usuario_nombre}` : ''}
                        {mov.nota ? ` · ${mov.nota}` : ''}
                      </p>
                    </div>
                    <p
                      className="shrink-0 text-[14px] font-semibold tabular-nums"
                      style={{ color: suma ? '#111827' : '#047857' }}
                    >
                      {suma ? '+' : '−'}
                      {fmt(mov.monto)}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-[13px] text-gray-400">
              Todavía no hay movimientos.
            </p>
          )}
        </div>
      </div>
    );
  }

  /* ── La lista de deudores ─────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-16 pt-2">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[19px] font-semibold tracking-tight text-gray-900">
              <NotebookPen size={19} strokeWidth={STROKE} style={{ color: BRAND }} />
              Cuenta corriente
            </h1>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-gray-500">
              Los clientes que consumen y pagan después. El límite se habilita por cliente desde su
              ficha: sin límite cargado, no se le puede fiar.
            </p>
          </div>
          <button
            type="button"
            onClick={cargarLista}
            title="Recargar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:text-gray-600"
          >
            <RefreshCw size={15} strokeWidth={STROKE} />
          </button>
        </div>

        {Number(lista?.total_adeudado) > 0 ? (
          <div className="mt-4 flex items-baseline justify-between gap-4 rounded-xl bg-gray-50 px-4 py-3">
            <span className="text-[13px] text-gray-600">Total en la calle</span>
            <span className="text-[20px] font-bold tabular-nums" style={{ color: BRAND }}>
              {fmt(lista.total_adeudado)}
            </span>
          </div>
        ) : null}
      </div>

      {lista?.clientes?.length ? (
        <div className="space-y-2">
          {lista.clientes.map((cliente) => {
            const cerca = Number(cliente.saldo) >= Number(cliente.limite_credito) * 0.8;
            return (
              <button
                key={cliente.id}
                type="button"
                onClick={() => abrir(cliente.id)}
                className="flex w-full items-center justify-between gap-4 rounded-2xl border border-gray-200/80 bg-white p-4 text-left transition hover:border-gray-300"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-gray-900">{cliente.nombre}</p>
                  <p className="text-[11px] text-gray-400">
                    límite {fmt(cliente.limite_credito)}
                    {/*
                      El aviso de que está cerca del límite va acá y no adentro:
                      es lo que hace falta saber antes de fiarle otra vez.
                    */}
                    {cerca ? ' · cerca del límite' : ''}
                  </p>
                </div>
                <p
                  className="shrink-0 text-[16px] font-bold tabular-nums"
                  style={{ color: cerca ? BRAND : '#111827' }}
                >
                  {fmt(cliente.saldo)}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center">
          <p className="text-[14px] font-medium text-gray-700">Nadie debe nada</p>
          <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-gray-400">
            Cuando le habilites cuenta corriente a un cliente y le fíes un pedido, va a aparecer
            acá.
          </p>
        </div>
      )}
    </div>
  );
}

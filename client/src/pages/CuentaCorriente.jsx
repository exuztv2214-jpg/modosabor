import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, NotebookPen, RefreshCw, X } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import api from '../lib/api.js';
import { parseFechaServidor } from '../lib/fechas.js';
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
  const { hasPermission } = useAuth();
  const puedeCobrar = hasPermission('caja.manage');
  const [lista, setLista] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [pagoForm, setPagoForm] = useState(null);
  const [guardandoPago, setGuardandoPago] = useState(false);

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
    const monto = Number(pagoForm?.monto || 0);
    if (!Number.isFinite(monto) || monto <= 0 || monto > Number(detalle.saldo || 0)) {
      toast.error(`El pago debe ser mayor que cero y no superar ${fmt(detalle.saldo)}`);
      return;
    }

    setGuardandoPago(true);
    try {
      await api.post(`/cuenta-corriente/${detalle.id}/pago`, {
        monto,
        metodo_pago: pagoForm.metodo_pago,
        nota: String(pagoForm.nota || '').trim(),
      });
      toast.success(`Cobrados ${fmt(monto)}`);
      setPagoForm(null);
      await abrir(detalle.id);
      await cargarLista();
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar el pago');
    } finally {
      setGuardandoPago(false);
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

          {detalle.saldo > 0 && puedeCobrar ? (
            <button
              type="button"
              onClick={() =>
                setPagoForm({
                  monto: String(detalle.saldo || ''),
                  metodo_pago: 'efectivo',
                  nota: '',
                })
              }
              className="mt-4 h-11 w-full rounded-xl text-[13px] font-semibold text-white transition hover:brightness-95"
              style={{ backgroundColor: BRAND }}
            >
              Registrar un pago
            </button>
          ) : detalle.saldo > 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-4 text-amber-800">
              Podés consultar la deuda, pero necesitás permiso de Caja para registrar un pago.
            </p>
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
                        {Number.isFinite(parseFechaServidor(mov.creado_en).getTime())
                          ? parseFechaServidor(mov.creado_en).toLocaleString('es-AR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : String(mov.creado_en || '')}
                        {mov.tipo === 'pago' && mov.metodo_pago
                          ? ` · ${mov.metodo_pago === 'transferencia' ? 'Transferencia' : 'Efectivo'}`
                          : ''}
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

        {pagoForm && puedeCobrar ? (
          <div
            role="presentation"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={(event) => {
              if (event.target === event.currentTarget) setPagoForm(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Registrar pago de cuenta corriente"
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[17px] font-semibold text-gray-900">Registrar pago</h2>
                  <p className="mt-1 text-[12px] text-gray-500">
                    {detalle.nombre} debe {fmt(detalle.saldo)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPagoForm(null)}
                  aria-label="Cerrar"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                >
                  <X size={17} strokeWidth={STROKE} />
                </button>
              </div>
              <label className="mt-4 block text-[12px] font-medium text-gray-600">
                Monto
                <input
                  value={pagoForm.monto}
                  onChange={(event) =>
                    setPagoForm((actual) => ({
                      ...actual,
                      monto: event.target.value.replace(/[^\d]/g, ''),
                    }))
                  }
                  inputMode="numeric"
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-[15px] font-semibold outline-none focus:border-gray-400"
                />
              </label>
              <label className="mt-3 block text-[12px] font-medium text-gray-600">
                Forma de pago
                <select
                  value={pagoForm.metodo_pago}
                  onChange={(event) =>
                    setPagoForm((actual) => ({ ...actual, metodo_pago: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-gray-400"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </label>
              <label className="mt-3 block text-[12px] font-medium text-gray-600">
                Nota (opcional)
                <input
                  value={pagoForm.nota}
                  onChange={(event) =>
                    setPagoForm((actual) => ({ ...actual, nota: event.target.value }))
                  }
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 outline-none focus:border-gray-400"
                />
              </label>
              <button
                type="button"
                onClick={cobrar}
                disabled={guardandoPago}
                style={{ background: BRAND }}
                className="mt-5 h-11 w-full rounded-xl text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {guardandoPago ? 'Guardando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>
        ) : null}
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

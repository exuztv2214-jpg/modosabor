import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  MessageCircle,
  RefreshCcw,
  ShoppingBag,
  Trash2,
  UserRound,
} from 'lucide-react';

import api from '../lib/api.js';

const money = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const dateTime = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function DraftCard({ draft, busy, onConfirm, onDiscard }) {
  return (
    <article className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Borrador WhatsApp
            </span>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-primary-600">
              #{draft.id}
            </span>
          </div>
          <h3 className="mt-3 text-2xl font-black text-gray-950">
            {draft.cliente_nombre || draft.conversacion_nombre || 'Cliente sin nombre'}
          </h3>
          <div className="mt-2 flex flex-wrap gap-3 text-sm font-bold text-gray-500">
            <span className="inline-flex items-center gap-2">
              <MessageCircle size={16} className="text-emerald-500" />
              {draft.telefono || 'Sin telefono'}
            </span>
            <span className="inline-flex items-center gap-2">
              <ShoppingBag size={16} className="text-primary-500" />
              {draft.tipo_entrega || 'delivery'}
            </span>
            <span>{dateTime(draft.actualizado_en)}</span>
          </div>
          {draft.cliente_direccion ? (
            <p className="mt-2 text-sm font-semibold text-gray-600">{draft.cliente_direccion}</p>
          ) : null}
          {draft.notas ? (
            <p className="mt-3 rounded-2xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-600">
              {draft.notas}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl bg-gray-50 px-5 py-4 text-right">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-gray-400">
            Total estimado
          </p>
          <p className="mt-1 text-3xl font-black text-gray-950">{money(draft.total)}</p>
          <p className="text-xs font-bold text-gray-400">{draft.metodo_pago || 'efectivo'}</p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-gray-100">
        {(draft.items || []).map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1fr_auto] gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
          >
            <div>
              <p className="font-black text-gray-950">
                {item.cantidad}x {item.nombre}
              </p>
              {item.descripcion ? (
                <p className="mt-1 text-xs font-semibold text-gray-500">{item.descripcion}</p>
              ) : null}
            </div>
            <p className="font-black text-gray-900">{money(item.precio_unitario)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(draft.id)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary-500 px-5 py-4 text-sm font-black uppercase tracking-wider text-white shadow-lg shadow-primary-100 transition hover:bg-primary-600 disabled:opacity-50"
        >
          <CheckCircle2 size={18} />
          Confirmar pedido
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDiscard(draft.id)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-black uppercase tracking-wider text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
        >
          <Trash2 size={18} />
          Descartar
        </button>
      </div>
    </article>
  );
}

export default function WhatsAppCopiloto() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const didInitialLoad = useRef(false);

  const totals = useMemo(
    () => ({
      count: drafts.length,
      amount: drafts.reduce((sum, draft) => sum + Number(draft.total || 0), 0),
    }),
    [drafts]
  );

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const data = await api.get('/whatsapp-copiloto/borradores?estado=abierto');
      setDrafts(Array.isArray(data) ? data : []);
    } catch (error) {
      const detail =
        error?.error || error?.message || (error?._httpStatus ? `HTTP ${error._httpStatus}` : '');
      toast.error(
        detail
          ? `No se pudo cargar WhatsApp Copiloto: ${detail}`
          : 'No se pudo cargar WhatsApp Copiloto'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    loadDrafts();
  }, []);

  const confirmDraft = async (id) => {
    setBusyId(id);
    try {
      const result = await api.post(`/whatsapp-copiloto/borradores/${id}/confirmar`);
      toast.success(`Pedido #${result?.pedido?.numero || result?.pedido?.id} creado`);
      await loadDrafts();
    } catch (error) {
      toast.error(error?.error || 'No se pudo confirmar el pedido');
    } finally {
      setBusyId(null);
    }
  };

  const discardDraft = async (id) => {
    setBusyId(id);
    try {
      await api.post(`/whatsapp-copiloto/borradores/${id}/descartar`);
      toast.success('Borrador descartado');
      await loadDrafts();
    } catch (error) {
      toast.error(error?.error || 'No se pudo descartar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.28em] text-emerald-600">
              <MessageCircle size={18} />
              Copiloto WhatsApp
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight text-gray-950">
              Pedidos detectados con #dale
            </h1>
            <p className="mt-2 max-w-2xl text-base font-semibold text-gray-500">
              El cliente no ve nada raro: vos escribis #dale, la IA arma el resumen y aca queda
              listo para confirmar.
            </p>
          </div>
          <button
            type="button"
            onClick={loadDrafts}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-100 bg-white px-5 py-4 text-sm font-black uppercase tracking-wider text-gray-700 shadow-sm transition hover:border-primary-200 hover:text-primary-600"
          >
            <RefreshCcw size={18} />
            Actualizar
          </button>
        </header>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
              Pendientes
            </p>
            <p className="mt-2 text-4xl font-black text-gray-950">{totals.count}</p>
          </div>
          <div className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-gray-400">
              Total estimado
            </p>
            <p className="mt-2 text-4xl font-black text-gray-950">{money(totals.amount)}</p>
          </div>
          <div className="rounded-3xl border border-primary-100 bg-primary-50 p-5">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-primary-500">
              Palabra clave
            </p>
            <p className="mt-2 text-4xl font-black text-primary-700">#dale</p>
          </div>
        </section>

        <section className="mt-8 space-y-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-3xl border border-gray-100 bg-white">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : drafts.length ? (
            drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                busy={busyId === draft.id}
                onConfirm={confirmDraft}
                onDiscard={discardDraft}
              />
            ))
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white px-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gray-50 text-gray-400">
                <UserRound size={28} />
              </div>
              <h2 className="mt-5 text-2xl font-black text-gray-950">Sin borradores pendientes</h2>
              <p className="mt-2 max-w-md text-sm font-semibold text-gray-500">
                Cuando escribas #dale en una conversacion de WhatsApp y n8n mande el resumen, el
                pedido aparece aca para confirmarlo.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

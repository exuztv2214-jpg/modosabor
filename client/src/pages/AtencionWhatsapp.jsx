import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api.js';

function botPausado(chat) {
  if (!chat?.bot_silenciado) return false;
  if (!chat.bot_silenciado_hasta) return true;
  return new Date(chat.bot_silenciado_hasta.replace(' ', 'T') + 'Z').getTime() > Date.now();
}

export default function AtencionWhatsapp() {
  const [params, setParams] = useSearchParams();
  const selected = params.get('conversacion');
  const [page, setPage] = useState(0);
  const [list, setList] = useState({ items: [], total: 0 });
  const [detail, setDetail] = useState(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const end = useRef(null);
  const lastMessage = detail?.mensajes?.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [selected, lastMessage]);

  useEffect(() => {
    let active = true;
    let timer;
    async function refresh() {
      try {
        const data = await api.get('/whatsapp/conversaciones', {
          params: { limite: 12, offset: page * 12 },
        });
        if (active) setList(data);
      } catch (err) {
        if (active) setError(err.error || 'No se pudieron actualizar las conversaciones.');
      } finally {
        if (active) timer = setTimeout(refresh, 4000);
      }
    }
    refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, version]);

  useEffect(() => {
    let active = true;
    let timer;
    setDetail(null);
    setText('');
    setError('');
    async function refresh() {
      try {
        const data = await api.get(`/whatsapp/conversaciones/${selected}/mensajes`);
        if (active) setDetail(data);
      } catch (err) {
        if (active) setError(err.error || 'No se pudo actualizar el chat.');
      } finally {
        if (active) timer = setTimeout(refresh, 3000);
      }
    }
    if (selected) refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [selected]);

  async function act(action) {
    if (busy || !detail) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'send') {
        await api.post('/whatsapp/responder', {
          telefono: detail.conversation.telefono,
          texto: text.trim(),
        });
        setText('');
      } else {
        await api.put(`/whatsapp/conversaciones/${selected}/control`, { accion: action });
      }
      setDetail(await api.get(`/whatsapp/conversaciones/${selected}/mensajes`));
      setVersion((v) => v + 1);
    } catch (err) {
      setError(
        err.error || 'No se pudo completar la acción. Revisá la conexión antes de reintentar.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="p-4 md:p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Atención WhatsApp</h1>
        <p className="text-sm text-slate-500">
          Conversaciones actualizadas automáticamente. Tomá el chat para pausar a Chispita.
        </p>
      </header>
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 text-red-800 p-3">
          {error}
        </div>
      )}
      <div className="grid md:grid-cols-[300px_1fr] gap-4">
        <aside className="rounded-xl border bg-white p-3 space-y-2">
          {list.items.length === 0 && <p className="p-3 text-slate-500">No hay conversaciones.</p>}
          {list.items.map((chat) => (
            <button
              key={chat.id}
              disabled={busy}
              onClick={() => setParams({ conversacion: String(chat.id) })}
              className={`w-full text-left rounded-lg p-3 border ${String(chat.id) === selected ? 'bg-orange-50 border-orange-400' : 'border-slate-100'}`}
            >
              <div className="font-semibold">{chat.nombre || chat.telefono}</div>
              {!!chat.escalado_humano && botPausado(chat) && (
                <span className="text-xs text-orange-700">Atención humana</span>
              )}
              <p className="text-sm text-slate-500 truncate">
                {chat.ultimo_mensaje || 'Sin mensajes'}
              </p>
            </button>
          ))}
          <div className="flex justify-between text-sm pt-2">
            <button disabled={page === 0 || busy} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(list.total / 12))}
            </span>
            <button
              disabled={(page + 1) * 12 >= list.total || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </aside>
        <section className="rounded-xl border bg-white p-4 space-y-4">
          {!detail ? (
            <p className="text-slate-500">
              {selected ? 'Cargando conversación…' : 'Seleccioná una conversación para atender.'}
            </p>
          ) : (
            <>
              <header className="flex flex-wrap justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    {detail.conversation.nombre || detail.conversation.telefono}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {botPausado(detail.conversation)
                      ? 'Atención humana / bot pausado'
                      : 'Chispita activa'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => act('tomar')}
                    className="border rounded-lg px-3 py-2"
                  >
                    Tomar chat
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => act('devolver')}
                    className="border rounded-lg px-3 py-2"
                  >
                    Devolver a Chispita
                  </button>
                </div>
              </header>
              <div
                aria-label="Mensajes"
                className="h-[45vh] overflow-y-auto bg-slate-50 rounded-xl p-3 space-y-3"
              >
                {detail.mensajes.map((message) => (
                  <article
                    key={message.id}
                    className={`rounded-lg p-3 max-w-[90%] whitespace-pre-wrap break-words ${message.direccion === 'saliente' ? 'ml-auto bg-green-100' : 'bg-white border'}`}
                  >
                    <p>{message.contenido || `[${message.tipo || 'Mensaje'}]`}</p>
                    <time className="text-xs text-slate-500">{message.creado_en}</time>
                  </article>
                ))}
                <div ref={end} />
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (text.trim()) act('send');
                }}
                className="space-y-2"
              >
                <label htmlFor="wa-reply" className="text-sm font-medium">
                  Tu respuesta
                </label>
                <textarea
                  id="wa-reply"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  disabled={busy}
                  maxLength={4000}
                  rows={3}
                  className="w-full border rounded-lg p-3"
                  placeholder="Escribí una respuesta…"
                />
                <button
                  disabled={busy || !text.trim()}
                  className="rounded-lg bg-orange-600 text-white px-5 py-2 disabled:opacity-50"
                >
                  {busy ? 'Procesando…' : 'Enviar respuesta'}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

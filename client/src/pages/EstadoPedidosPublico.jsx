import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChefHat, Clock3, RefreshCw, Route } from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';

const COLUMNAS = [
  {
    key: 'recibidos',
    titulo: 'Recibidos',
    subtitulo: 'Ya están en el sistema',
    estados: ['nuevo', 'confirmado'],
    icon: Clock3,
    bg: '#EFF6FF',
    fg: '#1D4ED8',
  },
  {
    key: 'preparando',
    titulo: 'En preparación',
    subtitulo: 'Cocina está trabajando',
    estados: ['preparando'],
    icon: ChefHat,
    bg: '#FFF7ED',
    fg: '#C2410C',
  },
  {
    key: 'listos',
    titulo: 'Listos',
    subtitulo: 'Listos para entregar o salir',
    estados: ['listo'],
    icon: CheckCircle2,
    bg: '#ECFDF5',
    fg: '#047857',
  },
  {
    key: 'en_camino',
    titulo: 'En camino',
    subtitulo: 'El delivery ya salió',
    estados: ['en_camino'],
    icon: Route,
    bg: '#F5F3FF',
    fg: '#6D28D9',
  },
];

function PedidoNumero({ pedido }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-center shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pedido</p>
      <p className="mt-0.5 text-3xl font-black tracking-tight text-slate-900">#{pedido.numero}</p>
    </div>
  );
}

export default function EstadoPedidosPublico() {
  const [pedidos, setPedidos] = useState([]);
  const [actualizado, setActualizado] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;

    const cargar = async () => {
      try {
        const response = await api.get('/pedidos/estado-publico');
        if (!activo) return;
        setPedidos(Array.isArray(response?.pedidos) ? response.pedidos : []);
        setActualizado(new Date(response?.actualizado_en || Date.now()));
        setError('');
      } catch {
        if (activo) setError('No pudimos actualizar los pedidos. Reintentando…');
      } finally {
        if (activo) setCargando(false);
      }
    };

    cargar();
    const interval = window.setInterval(cargar, 10000);
    return () => {
      activo = false;
      window.clearInterval(interval);
    };
  }, []);

  const columnas = useMemo(
    () =>
      COLUMNAS.map((columna) => ({
        ...columna,
        pedidos: pedidos.filter((pedido) => columna.estados.includes(pedido.estado)),
      })),
    [pedidos]
  );

  const entregados = pedidos.filter((pedido) => pedido.estado === 'entregado');
  const activos = columnas.reduce((total, columna) => total + columna.pedidos.length, 0);

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em]" style={{ color: BRAND }}>
              Modo Sabor
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
              Estado de pedidos
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Buscá el número que figura en tu comprobante.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-slate-400">
            <RefreshCw size={15} strokeWidth={STROKE} className={cargando ? 'animate-spin' : ''} />
            {actualizado && !Number.isNaN(actualizado.getTime())
              ? `Actualizado ${actualizado.toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}`
              : 'Actualizando…'}
          </div>
        </header>

        {error ? (
          <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {columnas.map((columna) => {
            const Icon = columna.icon;
            return (
              <article key={columna.key} className="min-h-[360px] rounded-3xl bg-slate-900 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="flex h-11 w-11 items-center justify-center rounded-2xl"
                    style={{ background: columna.bg, color: columna.fg }}
                  >
                    <Icon size={21} strokeWidth={STROKE} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-bold">{columna.titulo}</h2>
                      <span className="rounded-full bg-slate-800 px-2.5 py-1 text-sm font-bold tabular-nums">
                        {columna.pedidos.length}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{columna.subtitulo}</p>
                  </div>
                </div>

                {columna.pedidos.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 2xl:grid-cols-2">
                    {columna.pedidos.map((pedido) => (
                      <PedidoNumero key={`${pedido.numero}-${pedido.estado}`} pedido={pedido} />
                    ))}
                  </div>
                ) : (
                  <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-700 text-center text-sm text-slate-500">
                    Sin pedidos en esta etapa
                  </div>
                )}
              </article>
            );
          })}
        </section>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-5 py-4">
          <p className="text-sm text-slate-400">
            {activos
              ? `${activos} ${activos === 1 ? 'pedido activo' : 'pedidos activos'}`
              : 'No hay pedidos activos en este momento'}
          </p>
          {entregados.length ? (
            <p className="text-sm text-emerald-300">
              Entregados recientemente:{' '}
              <strong>{entregados.map((pedido) => `#${pedido.numero}`).join(' · ')}</strong>
            </p>
          ) : null}
        </footer>
      </div>
    </main>
  );
}

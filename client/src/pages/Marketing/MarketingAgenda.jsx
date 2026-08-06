import { useMemo } from 'react';
import { CalendarClock, Check, Pencil, Plus, Trash2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty } from '../Clientes/clientesUi.jsx';
import PublicadorFacebookPanel from '../../components/Marketing/PublicadorFacebookPanel.jsx';
import { CALENDAR_STATES, canalLabel, estadoLabel, fmtDate } from './marketingUtils.js';

const TONOS = {
  pendiente: { bg: '#FDF3D3', fg: '#95661A' },
  listo: { bg: '#E9F1FA', fg: '#1F5FA0' },
  publicado: { bg: '#E7F5EF', fg: '#0F6E56' },
  cancelado: { bg: '#F1F5F9', fg: '#475569' },
};

const inicioDeHoy = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Agenda de publicaciones.
 *
 * Se llamaba "Calendario" pero era una tabla plana ordenada por lo que
 * devolvía el servidor, sin ninguna noción de hoy: una publicación agendada
 * para el mes pasado que nunca salió se veía igual que una de mañana.
 *
 * Ahora está agrupada por atrasadas / hoy / próximas, que es la única
 * pregunta que le hacés a una agenda.
 *
 * El "Publicador" de Facebook era una pestaña aparte, aunque publicar es
 * exactamente lo que hacés cuando mirás esta lista. Va abajo.
 */
export default function MarketingAgenda({
  calendario,
  onCrear,
  onEditar,
  onEliminar,
  onMarcarPublicado,
}) {
  const grupos = useMemo(() => {
    const hoy = inicioDeHoy();
    const manana = hoy + 86400000;

    const pendientes = calendario.filter((c) => ['pendiente', 'listo'].includes(c.estado));
    const cerrados = calendario.filter((c) => ['publicado', 'cancelado'].includes(c.estado));

    const ts = (c) => {
      const t = new Date(String(c.fecha_programada || '').replace(' ', 'T')).getTime();
      return Number.isNaN(t) ? Infinity : t;
    };

    return {
      atrasadas: pendientes.filter((c) => ts(c) < hoy).sort((a, b) => ts(a) - ts(b)),
      hoy: pendientes.filter((c) => ts(c) >= hoy && ts(c) < manana).sort((a, b) => ts(a) - ts(b)),
      proximas: pendientes.filter((c) => ts(c) >= manana).sort((a, b) => ts(a) - ts(b)),
      cerrados: cerrados.sort((a, b) => ts(b) - ts(a)).slice(0, 12),
    };
  }, [calendario]);

  const Fila = ({ item, atrasada = false }) => {
    const tono = TONOS[item.estado] || TONOS.pendiente;
    const cerrado = ['publicado', 'cancelado'].includes(item.estado);

    return (
      <div
        className="group flex items-start gap-2.5 rounded-xl px-3 py-2.5"
        style={{ background: atrasada ? '#FEF2F2' : '#F9FAFB' }}
      >
        <CalendarClock
          size={15}
          strokeWidth={STROKE}
          className="mt-0.5 shrink-0"
          style={{ color: atrasada ? BRAND : '#9CA3AF' }}
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-gray-900">
            {item.campana_nombre || item.contenido_titulo || 'Publicación sin título'}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
            <span style={atrasada ? { color: BRAND } : undefined}>
              {fmtDate(item.fecha_programada)}
            </span>
            <span>{canalLabel(item.canal)}</span>
            <span
              className="rounded-full px-1.5 py-0.5"
              style={{ background: tono.bg, color: tono.fg }}
            >
              {estadoLabel(CALENDAR_STATES, item.estado)}
            </span>
          </p>
          {item.observaciones ? (
            <p className="mt-1 line-clamp-1 text-[11px] text-gray-500">{item.observaciones}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
          {/* Marcar como publicado requería abrir el formulario completo y
              cambiar un select. Es la acción más frecuente de esta pantalla. */}
          {!cerrado ? (
            <button
              type="button"
              onClick={() => onMarcarPublicado(item)}
              title="Marcar como publicado"
              className="rounded-lg p-1.5 text-gray-400 transition hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Check size={14} strokeWidth={STROKE} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onEditar(item)}
            title="Editar"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
          >
            <Pencil size={14} strokeWidth={STROKE} />
          </button>
          <button
            type="button"
            onClick={() => onEliminar(item)}
            title="Eliminar"
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 size={14} strokeWidth={STROKE} />
          </button>
        </div>
      </div>
    );
  };

  const vacia =
    grupos.atrasadas.length === 0 &&
    grupos.hoy.length === 0 &&
    grupos.proximas.length === 0 &&
    grupos.cerrados.length === 0;

  return (
    <div className="space-y-4">
      <Card
        title="Agenda de publicaciones"
        helper="Qué hay que publicar y cuándo"
        action={
          <button
            type="button"
            onClick={onCrear}
            style={{ background: BRAND }}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-[12px] font-semibold text-white transition hover:brightness-110"
          >
            <Plus size={13} strokeWidth={STROKE} />
            Agendar
          </button>
        }
      >
        {vacia ? (
          <Empty
            title="La agenda está vacía"
            description="Agendá una publicación para no depender de acordarte."
          />
        ) : (
          <div className="space-y-4">
            {grupos.atrasadas.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold" style={{ color: BRAND }}>
                  Atrasadas ({grupos.atrasadas.length})
                </p>
                <div className="space-y-1.5">
                  {grupos.atrasadas.map((item) => (
                    <Fila key={item.id} item={item} atrasada />
                  ))}
                </div>
              </div>
            ) : null}

            {grupos.hoy.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-gray-700">
                  Hoy ({grupos.hoy.length})
                </p>
                <div className="space-y-1.5">
                  {grupos.hoy.map((item) => (
                    <Fila key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {grupos.proximas.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-gray-500">
                  Próximas ({grupos.proximas.length})
                </p>
                <div className="space-y-1.5">
                  {grupos.proximas.map((item) => (
                    <Fila key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {grupos.cerrados.length > 0 ? (
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-gray-400">Ya cerradas</p>
                <div className="space-y-1.5 opacity-70">
                  {grupos.cerrados.map((item) => (
                    <Fila key={item.id} item={item} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      <PublicadorFacebookPanel />
    </div>
  );
}

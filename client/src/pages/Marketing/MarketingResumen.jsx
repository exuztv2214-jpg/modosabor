import { CalendarClock, Copy, Receipt, TrendingUp } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty, Stat } from '../Clientes/clientesUi.jsx';
import { canalLabel, estadoPorFechas, ESTADO_TONOS, fmtDate, fmtMoney } from './marketingUtils.js';

/**
 * Resumen del módulo.
 *
 * Antes el tablero mostraba seis contadores globales y una lista de campañas
 * activas. Faltaba lo único que contesta "¿sirvió?": el backend ya calcula
 * `recent_attributions` —qué campaña trajo qué pedido y por cuánta plata— y
 * la pantalla lo tiraba a la basura sin renderizarlo nunca.
 */
export default function MarketingResumen({
  dashboard,
  campanas,
  calendario,
  onIrACampanas,
  onIrAAgenda,
  onCopiar,
}) {
  const metrics = dashboard?.metrics || {};
  const atribuciones = dashboard?.recent_attributions || [];

  const campanasVivas = campanas.filter((c) => estadoPorFechas(c) === 'activa');
  const pendientes = (dashboard?.pending_calendar || []).length
    ? dashboard.pending_calendar
    : calendario.filter((c) => ['pendiente', 'listo'].includes(c.estado)).slice(0, 8);

  const pedidos = Number(metrics.pedidos_atribuidos || 0);
  const ventas = Number(metrics.ventas_atribuidas || 0);
  const ticket = pedidos > 0 ? ventas / pedidos : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Ventas atribuidas"
          value={fmtMoney(ventas)}
          helper={`${pedidos} ${pedidos === 1 ? 'pedido' : 'pedidos'} llegaron por una campaña`}
          tono="verde"
        />
        <Stat
          label="Ticket de esos pedidos"
          value={fmtMoney(ticket)}
          helper="Promedio de lo que gastó quien vino por marketing"
          tono="azul"
        />
        <Stat
          label="Clientes nuevos"
          value={metrics.clientes_nuevos_estimados || 0}
          helper="Primera compra, atribuida a una campaña"
          tono="violeta"
        />
        <Stat
          label="Sin publicar"
          value={metrics.publicaciones_pendientes || 0}
          helper={
            Number(metrics.publicaciones_pendientes || 0) > 0
              ? 'Publicaciones agendadas esperando'
              : 'La agenda está al día'
          }
          alerta={Number(metrics.publicaciones_pendientes || 0) > 0}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        {/*
          Esto es lo que faltaba: el registro de qué trajo cada campaña. Sin
          esto el módulo era una libreta de planificación sin devolución.
        */}
        <Card
          title="Qué trajo cada campaña"
          helper="Últimos pedidos y conversaciones que entraron con un código de campaña"
        >
          {atribuciones.length === 0 ? (
            <Empty
              title="Todavía no hay nada atribuido"
              description="Cuando un cliente pida usando el código de una campaña, o entre por su link, va a aparecer acá."
            />
          ) : (
            <div className="space-y-1.5">
              {atribuciones.map((item) => {
                const esPedido = Number(item.pedido_id || 0) > 0;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 rounded-xl bg-gray-50 px-3 py-2.5"
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={
                        esPedido
                          ? { background: '#E7F5EF', color: '#0F6E56' }
                          : { background: '#E9F1FA', color: '#1F5FA0' }
                      }
                    >
                      {esPedido ? (
                        <Receipt size={15} strokeWidth={STROKE} />
                      ) : (
                        <TrendingUp size={15} strokeWidth={STROKE} />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {item.campana_nombre || item.promo_nombre || 'Sin campaña vinculada'}
                      </p>
                      <p className="truncate text-[11px] text-gray-400">
                        {esPedido ? `Pedido #${item.pedido_id}` : 'Conversación'}
                        {item.canal ? ` · ${canalLabel(item.canal)}` : ''}
                        {item.creado_en ? ` · ${fmtDate(item.creado_en)}` : ''}
                      </p>
                    </div>

                    {Number(item.monto || item.total || 0) > 0 ? (
                      <span className="shrink-0 text-[13px] font-bold tabular-nums text-gray-900">
                        {fmtMoney(item.monto || item.total)}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Corriendo ahora"
            helper={
              campanasVivas.length === 0
                ? 'Ninguna campaña activa en este momento'
                : `${campanasVivas.length} en la calle`
            }
            action={
              <button
                type="button"
                onClick={onIrACampanas}
                className="shrink-0 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
              >
                Ver todas
              </button>
            }
          >
            {campanasVivas.length === 0 ? (
              <Empty
                title="Nada corriendo"
                description="Creá una campaña para empezar a medir de dónde vienen los pedidos."
              />
            ) : (
              <div className="space-y-1.5">
                {campanasVivas.slice(0, 5).map((item) => {
                  const tono = ESTADO_TONOS[estadoPorFechas(item)];
                  return (
                    <div key={item.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          {item.nombre}
                        </p>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ background: tono.bg, color: tono.fg }}
                        >
                          {tono.label}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {canalLabel(item.canal)}
                        {item.fecha_fin ? ` · hasta ${fmtDate(item.fecha_fin, false)}` : ''}
                      </p>

                      {item.tracking_slug ? (
                        <button
                          type="button"
                          onClick={() => onCopiar(item.tracking_slug, 'Código copiado')}
                          className="mt-1.5 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 font-mono text-[11px] font-semibold text-gray-700 transition hover:bg-gray-200"
                        >
                          {item.tracking_slug}
                          <Copy size={11} strokeWidth={STROKE} />
                        </button>
                      ) : (
                        <p className="mt-1.5 text-[11px]" style={{ color: BRAND }}>
                          Sin código: esta campaña no se puede medir
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Próximo a publicar"
            action={
              <button
                type="button"
                onClick={onIrAAgenda}
                className="shrink-0 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
              >
                Ver agenda
              </button>
            }
          >
            {pendientes.length === 0 ? (
              <Empty title="Nada agendado" description="No hay publicaciones esperando salir." />
            ) : (
              <div className="space-y-1.5">
                {pendientes.slice(0, 5).map((item) => (
                  <div key={item.id} className="flex items-start gap-2.5 px-1 py-1">
                    <CalendarClock
                      size={14}
                      strokeWidth={STROKE}
                      className="mt-0.5 shrink-0 text-gray-400"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-gray-800">
                        {item.campana_nombre || item.contenido_titulo || 'Publicación'}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        {fmtDate(item.fecha_programada)} · {canalLabel(item.canal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

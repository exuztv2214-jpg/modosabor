import { AlertTriangle, Copy, MessageCircle, Pencil, Plus, Trash2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty } from '../Clientes/clientesUi.jsx';
import { canalLabel, ESTADO_TONOS, estadoPorFechas, fmtDate, fmtMoney } from './marketingUtils.js';

/**
 * Campañas.
 *
 * La campaña es la unidad que junta todo: una promo, una pieza de contenido,
 * un canal, una ventana de fechas y —lo importante— un código de seguimiento.
 * Sin ese código no hay forma de saber si funcionó, así que ahora se avisa
 * fuerte cuando falta en vez de mostrar un discreto "sin código".
 */
export default function MarketingCampanas({
  campanas,
  atribucionPorCampana,
  onCrear,
  onEditar,
  onEliminar,
  onCopiar,
}) {
  if (campanas.length === 0) {
    return (
      <Card>
        <Empty
          title="Todavía no hay campañas"
          description="Una campaña es una acción con fecha, canal y un código para medir qué trajo. Sin eso, no se puede saber qué funcionó."
          action={
            <button
              type="button"
              onClick={onCrear}
              style={{ background: BRAND }}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
            >
              <Plus size={15} strokeWidth={STROKE} />
              Crear la primera
            </button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {campanas.map((item) => {
        const estado = estadoPorFechas(item);
        const tono = ESTADO_TONOS[estado];
        const sinCodigo = !item.tracking_slug;
        const resultado = atribucionPorCampana?.[item.id];

        return (
          <div
            key={item.id}
            className="group flex flex-col rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-gray-900">{item.nombre}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-gray-500">
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: tono.bg, color: tono.fg }}
                  >
                    {tono.label}
                  </span>
                  <span>{canalLabel(item.canal)}</span>
                  {item.fecha_inicio || item.fecha_fin ? (
                    <span>
                      {item.fecha_inicio ? fmtDate(item.fecha_inicio, false) : '—'}
                      {' → '}
                      {item.fecha_fin ? fmtDate(item.fecha_fin, false) : 'sin fin'}
                    </span>
                  ) : null}
                </p>
              </div>

              <div className="flex shrink-0 gap-0.5 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => onEditar(item)}
                  title="Editar"
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                >
                  <Pencil size={15} strokeWidth={STROKE} />
                </button>
                <button
                  type="button"
                  onClick={() => onEliminar(item)}
                  title="Eliminar"
                  className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 size={15} strokeWidth={STROKE} />
                </button>
              </div>
            </div>

            {item.objetivo ? (
              <p className="mt-2 line-clamp-2 text-[12px] leading-4 text-gray-500">
                {item.objetivo}
              </p>
            ) : null}

            {/* Resultado real de la campaña, no sólo lo planificado. */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-gray-50 px-2.5 py-2">
                <p className="text-[11px] text-gray-500">Pedidos</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-gray-900">
                  {resultado?.pedidos || 0}
                </p>
              </div>
              <div
                className="rounded-xl px-2.5 py-2"
                style={{ background: resultado?.ventas > 0 ? '#E7F5EF' : '#F3F4F6' }}
              >
                <p
                  className="text-[11px]"
                  style={{ color: resultado?.ventas > 0 ? '#0F6E56' : '#6B7280' }}
                >
                  Vendido
                </p>
                <p
                  className="mt-0.5 truncate text-[15px] font-bold tabular-nums"
                  style={{ color: resultado?.ventas > 0 ? '#08453A' : '#111827' }}
                >
                  {fmtMoney(resultado?.ventas || 0)}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 px-2.5 py-2">
                <p className="text-[11px] text-gray-500">Invertido</p>
                <p className="mt-0.5 truncate text-[15px] font-bold tabular-nums text-gray-900">
                  {fmtMoney(item.presupuesto_estimado)}
                </p>
              </div>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {item.promo_nombre ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                  Promo: {item.promo_nombre}
                </span>
              ) : null}
              {item.contenido_titulo ? (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                  Contenido: {item.contenido_titulo}
                </span>
              ) : null}
            </div>

            <div className="mt-auto pt-3">
              {sinCodigo ? (
                <div
                  className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: '#FEF2F2' }}
                >
                  <AlertTriangle
                    size={14}
                    strokeWidth={STROKE}
                    className="mt-0.5 shrink-0"
                    style={{ color: BRAND }}
                  />
                  <p className="text-[12px] leading-4" style={{ color: '#7F1D1D' }}>
                    Sin código de seguimiento no hay forma de saber qué trajo esta campaña. Editala
                    y cargale uno.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-500">Código para medir</p>
                  <button
                    type="button"
                    onClick={() => onCopiar(item.tracking_slug, 'Código copiado')}
                    className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-mono text-[13px] font-semibold text-gray-900 transition hover:bg-gray-200"
                  >
                    {item.tracking_slug}
                    <Copy size={12} strokeWidth={STROKE} />
                  </button>

                  {item.whatsapp_cta_texto ? (
                    <div className="mt-2 border-t border-gray-200 pt-2">
                      <p className="text-[11px] text-gray-500">Mensaje para el posteo</p>
                      <p className="mt-0.5 text-[12px] leading-4 text-gray-700">
                        {item.whatsapp_cta_texto}
                      </p>
                      <button
                        type="button"
                        onClick={() => onCopiar(item.whatsapp_cta_texto, 'Mensaje copiado')}
                        className="mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                      >
                        <MessageCircle size={12} strokeWidth={STROKE} />
                        Copiar para publicar
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

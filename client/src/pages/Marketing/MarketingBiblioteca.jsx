import { Copy, Pencil, Plus, Tag, Trash2 } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty } from '../Clientes/clientesUi.jsx';
import {
  canalLabel,
  CONTENT_STATES,
  ESTADO_TONOS,
  estadoLabel,
  estadoPorFechas,
  fmtDate,
  fmtMoney,
  promoTipoLabel,
} from './marketingUtils.js';

const CONTENIDO_TONOS = {
  publicado: { bg: '#E7F5EF', fg: '#0F6E56' },
  listo: { bg: '#E9F1FA', fg: '#1F5FA0' },
  borrador: { bg: '#F1F5F9', fg: '#475569' },
};

/**
 * Biblioteca: promos y contenido juntos.
 *
 * Antes eran dos pestañas separadas al mismo nivel que Campañas. Pero ni una
 * promo ni un texto hacen nada solos: son los insumos que una campaña usa.
 * Ponerlos juntos y por debajo de campañas refleja cómo se trabaja.
 */
export default function MarketingBiblioteca({
  promos,
  contenidos,
  onCrearPromo,
  onEditarPromo,
  onEliminarPromo,
  onCrearContenido,
  onEditarContenido,
  onEliminarContenido,
  onCopiar,
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card
        title="Promos"
        helper="El beneficio concreto que ofrece una campaña"
        action={
          <button
            type="button"
            onClick={onCrearPromo}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Plus size={13} strokeWidth={STROKE} />
            Nueva
          </button>
        }
      >
        {promos.length === 0 ? (
          <Empty
            title="Sin promos"
            description="Una promo define qué se descuenta. Después se engancha a una campaña."
          />
        ) : (
          <div className="space-y-1.5">
            {promos.map((promo) => {
              const estado = estadoPorFechas(promo);
              const tono = ESTADO_TONOS[estado];
              const esPorcentaje = promo.tipo_promo === 'porcentaje';

              return (
                <div key={promo.id} className="group rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {promo.nombre}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                        <span
                          className="rounded-full px-1.5 py-0.5"
                          style={{ background: tono.bg, color: tono.fg }}
                        >
                          {tono.label}
                        </span>
                        {/* Se mostraba `descuento_fijo` y `general` crudos,
                            tal cual salen de la base. */}
                        <span>{promoTipoLabel(promo.tipo_promo)}</span>
                        <span>{canalLabel(promo.canal_sugerido)}</span>
                        {promo.fecha_fin ? (
                          <span>hasta {fmtDate(promo.fecha_fin, false)}</span>
                        ) : null}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-[14px] font-bold tabular-nums text-gray-900">
                        {promo.tipo_promo === 'envio_gratis'
                          ? 'Envío'
                          : esPorcentaje
                            ? `${promo.valor}%`
                            : fmtMoney(promo.valor)}
                      </span>
                      <div className="flex opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onEditarPromo(promo)}
                          title="Editar"
                          className="rounded-lg p-1 text-gray-400 transition hover:bg-white hover:text-gray-700"
                        >
                          <Pencil size={13} strokeWidth={STROKE} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEliminarPromo(promo)}
                          title="Eliminar"
                          className="rounded-lg p-1 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={13} strokeWidth={STROKE} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {promo.cupon_codigo ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500">
                      <Tag size={10} strokeWidth={STROKE} />
                      Usa el cupón {promo.cupon_codigo}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card
        title="Contenido"
        helper="Los textos listos para copiar y pegar al publicar"
        action={
          <button
            type="button"
            onClick={onCrearContenido}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            <Plus size={13} strokeWidth={STROKE} />
            Nuevo
          </button>
        }
      >
        {contenidos.length === 0 ? (
          <Empty
            title="Sin contenido"
            description="Guardá acá los textos que usás para publicar, así no los reescribís cada vez."
          />
        ) : (
          <div className="space-y-1.5">
            {contenidos.map((item) => {
              const tono = CONTENIDO_TONOS[item.estado] || CONTENIDO_TONOS.borrador;
              const copy = item.texto_corto || item.texto_largo || '';

              return (
                <div key={item.id} className="group rounded-xl bg-gray-50 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {item.titulo}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
                        <span
                          className="rounded-full px-1.5 py-0.5"
                          style={{ background: tono.bg, color: tono.fg }}
                        >
                          {estadoLabel(CONTENT_STATES, item.estado)}
                        </span>
                        <span>{canalLabel(item.red_sugerida)}</span>
                      </p>
                    </div>

                    <div className="flex shrink-0 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEditarContenido(item)}
                        title="Editar"
                        className="rounded-lg p-1 text-gray-400 transition hover:bg-white hover:text-gray-700"
                      >
                        <Pencil size={13} strokeWidth={STROKE} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEliminarContenido(item)}
                        title="Eliminar"
                        className="rounded-lg p-1 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={13} strokeWidth={STROKE} />
                      </button>
                    </div>
                  </div>

                  {copy ? (
                    <>
                      <p className="mt-1.5 line-clamp-2 text-[12px] leading-4 text-gray-600">
                        {copy}
                      </p>
                      {/* El copy estaba a la vista pero no había forma de
                          copiarlo: había que seleccionarlo a mano. */}
                      <button
                        type="button"
                        onClick={() => onCopiar(copy, 'Texto copiado')}
                        className="mt-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                      >
                        <Copy size={12} strokeWidth={STROKE} />
                        Copiar texto
                      </button>
                    </>
                  ) : (
                    <p className="mt-1.5 text-[12px]" style={{ color: BRAND }}>
                      Sin texto cargado todavía
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

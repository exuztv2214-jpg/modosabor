import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { Star, Gift, Award } from 'lucide-react';

import { BRAND, STROKE } from '../../../lib/theme.js';
import { Card, Empty } from '../components.jsx';

function fecha(valor) {
  if (!valor) return '—';
  try {
    const d = parseISO(String(valor));
    return isValid(d) ? format(d, "d 'de' MMM yyyy", { locale: es }) : '—';
  } catch {
    return '—';
  }
}

export function PuntosTab({ detail, onOpenPremios, onOpenReconocimiento }) {
  // Sin guarda, una ficha sin historial rompía la pestaña antes de llegar al
  // chequeo de `length` que había más abajo.
  const reconocimientos = Array.isArray(detail?.reconocimientos) ? detail.reconocimientos : [];
  const puntos = Number(detail.item.puntos_reconocimiento || 0);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      <div className="md:col-span-4">
        {/* Era un degradado azul→celeste heredado de la plantilla original,
            el único de todo el sistema. */}
        <div
          className="rounded-2xl p-5 text-white shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
          style={{ background: BRAND }}
        >
          <p className="text-[12px] text-white/80">Puntos acumulados</p>
          <div className="mt-2 flex items-center gap-2.5">
            <Star size={26} className="fill-white" strokeWidth={0} />
            <span className="text-[40px] font-bold leading-none tabular-nums">{puntos}</span>
          </div>
          <p className="mt-4 text-[12px] leading-4 text-white/85">
            Se ganan por puntualidad, buen trato con el cliente y desempeño destacado. Se canjean
            por premios.
          </p>
          <button
            type="button"
            onClick={onOpenPremios}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white/15 text-[13px] font-semibold transition hover:bg-white/25"
          >
            <Gift size={15} strokeWidth={STROKE} />
            Ver premios
          </button>
        </div>
      </div>

      <div className="md:col-span-8">
        <Card
          title="Historial"
          helper="Reconocimientos otorgados y canjes hechos"
          action={
            <button
              type="button"
              onClick={onOpenReconocimiento}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <Award size={13} strokeWidth={STROKE} />
              Reconocer
            </button>
          }
        >
          {reconocimientos.length === 0 ? (
            <Empty
              title="Sin reconocimientos todavía"
              description="Dar un reconocimiento con el motivo escrito vale más que los puntos en sí: queda registrado qué hizo bien."
            />
          ) : (
            <div className="space-y-1.5">
              {reconocimientos.map((r, idx) => {
                const suma = Number(r.puntos || 0) > 0;
                const esCanje = r.tipo === 'canje' || r.tipo === 'correccion';
                return (
                  <div
                    key={r.id ?? idx}
                    className="flex items-start justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      {/* `tipo` es el motivo que carga el encargado. Antes se
                          guardaba en NULL (ver el comentario en
                          usePersonal.submitReconocimiento), así que las filas
                          viejas no tienen título y caen al texto genérico. */}
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {r.tipo && !esCanje
                          ? r.tipo
                          : esCanje
                            ? 'Canje de puntos'
                            : 'Reconocimiento'}
                      </p>
                      {r.descripcion ? (
                        <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-gray-600">
                          {r.descripcion}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-gray-400">
                        {fecha(r.fecha)}
                        {esCanje ? ' · canje' : ''}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[14px] font-bold tabular-nums"
                      style={{ color: suma ? '#0F6E56' : BRAND }}
                    >
                      {suma ? '+' : ''}
                      {r.puntos || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

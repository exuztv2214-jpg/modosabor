import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';

import { BRAND, STROKE } from '../../../lib/theme.js';
import { Card, Empty } from '../components.jsx';
import { fmt, rolLabel, turnoLabel } from '../constants.js';

/** Sin guarda, una fecha vacía o mal cargada tumbaba toda la pestaña. */
function mesAnio(valor) {
  if (!valor) return null;
  try {
    const d = parseISO(String(valor));
    return isValid(d) ? format(d, 'MMMM yyyy', { locale: es }) : null;
  } catch {
    return null;
  }
}

export function TrayectoriaTab({ detail }) {
  const item = detail.item;
  // `detail.carrera.map` sin guarda: rompía en fichas sin historial cargado.
  const carrera = Array.isArray(detail?.carrera) ? detail.carrera : [];
  const ingreso = mesAnio(item.fecha_ingreso);

  return (
    <Card title="Trayectoria" helper="Ingreso, ascensos y cambios de categoría">
      <div className="relative space-y-6 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-gray-200 before:content-['']">
        {carrera.map((c, idx) => {
          const cuando = mesAnio(c.fecha_cambio);
          return (
            <div key={c.id ?? idx} className="relative pl-8">
              <span
                className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-white"
                style={{ background: BRAND }}
              />
              <p className="text-[12px] capitalize text-gray-400">{cuando || 'Sin fecha'}</p>
              <p className="mt-0.5 text-[13px] font-semibold text-gray-900">Cambio de categoría</p>
              <div className="mt-2 inline-flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-2">
                <span className="text-[13px] text-gray-600">
                  {c.categoria_anterior_nombre || '—'}
                </span>
                <ArrowRight size={13} strokeWidth={STROKE} className="text-gray-400" />
                <span className="text-[13px] font-medium text-gray-900">
                  {c.categoria_nueva_nombre || '—'}
                </span>
                {Number(c.sueldo_nuevo || 0) > 0 ? (
                  <span className="text-[12px] text-gray-500">
                    · nuevo sueldo {fmt(c.sueldo_nuevo)}
                  </span>
                ) : null}
              </div>
              {c.motivo ? (
                <p className="mt-2 text-[12px] italic leading-4 text-gray-500">{c.motivo}</p>
              ) : null}
            </div>
          );
        })}

        {/* El ingreso va último porque la línea se lee de lo más nuevo a lo
            más viejo, igual que el resto de los historiales del sistema. */}
        <div className="relative pl-8">
          <span className="absolute left-0 top-1 h-[15px] w-[15px] rounded-full border-[3px] border-white bg-gray-300" />
          <p className="text-[12px] capitalize text-gray-400">{ingreso || 'Sin fecha'}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-gray-900">Ingreso al equipo</p>
          <p className="mt-1 text-[12px] text-gray-500">
            Empezó como {rolLabel(item.rol_operativo).toLowerCase()} en el turno{' '}
            {turnoLabel(item.turno_preferido).toLowerCase()}.
          </p>
        </div>
      </div>

      {carrera.length === 0 ? (
        <div className="mt-5 border-t border-gray-100 pt-5">
          <Empty
            title="Sin ascensos registrados"
            description="Cuando le cambies la categoría, el movimiento queda anotado acá con el sueldo nuevo."
          />
        </div>
      ) : null}
    </Card>
  );
}

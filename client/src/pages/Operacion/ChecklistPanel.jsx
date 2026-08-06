import { useState } from 'react';
import { CheckCircle2, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';

import { STROKE } from '../../lib/theme.js';
import { Card, ProgressRing } from './ui.jsx';

/**
 * Chequeo de salud del local.
 *
 * Antes eran ocho tarjetas grandes desplegadas siempre, la mayoría en verde.
 * Ocho confirmaciones de que todo está bien no son información: son ruido.
 *
 * Ahora arranca resumido —"6 de 8 en orden"— con sólo los puntos que fallan
 * a la vista, que es lo único accionable. El resto se abre si se quiere ver.
 */
export default function ChecklistPanel({ puntos = [] }) {
  const [abierto, setAbierto] = useState(false);

  const pendientes = puntos.filter((punto) => !punto.ok);
  const enOrden = puntos.length - pendientes.length;
  const todoBien = pendientes.length === 0;
  const visibles = abierto ? puntos : pendientes;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <ProgressRing
          value={enOrden}
          total={puntos.length}
          color={todoBien ? '#059669' : '#F59E0B'}
        />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-gray-900">
            {todoBien ? (
              <ShieldCheck size={16} strokeWidth={STROKE} className="text-emerald-600" />
            ) : (
              <ShieldAlert size={16} strokeWidth={STROKE} className="text-amber-500" />
            )}
            {todoBien
              ? 'Todo en orden'
              : `${pendientes.length} punto${pendientes.length === 1 ? '' : 's'} a revisar`}
          </h2>
          <p className="mt-0.5 text-[12px] text-gray-500">
            {enOrden} de {puntos.length} chequeos del local están al día
          </p>
        </div>
        <ChevronDown
          size={18}
          strokeWidth={STROKE}
          className={`shrink-0 text-gray-400 transition-transform ${abierto ? 'rotate-180' : ''}`}
        />
      </button>

      {visibles.length > 0 ? (
        <div className="grid gap-2 border-t border-gray-100 px-5 py-4 md:grid-cols-2">
          {visibles.map((punto) => (
            <div
              key={punto.id}
              className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
              style={punto.ok ? { background: '#F9FAFB' } : { background: '#FEF6E7' }}
            >
              <span className="mt-0.5 shrink-0">
                {punto.ok ? (
                  <CheckCircle2 size={15} strokeWidth={STROKE} className="text-emerald-600" />
                ) : (
                  <ShieldAlert size={15} strokeWidth={STROKE} className="text-amber-600" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-tight text-gray-900">{punto.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{punto.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

import { MapPin } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { Card, Empty } from './clientesUi.jsx';

export default function DireccionesPanel({ direcciones = [] }) {
  const lista = Array.isArray(direcciones) ? direcciones : [];

  return (
    <Card
      title="Direcciones"
      helper={
        lista.length
          ? `${lista.length} ${lista.length === 1 ? 'dirección guardada' : 'direcciones guardadas'}`
          : undefined
      }
    >
      {lista.length ? (
        <div className="space-y-1.5">
          {lista.map((direccion) => (
            <div key={direccion.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <MapPin size={13} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-gray-900">
                      {direccion.direccion}
                    </p>
                    {direccion.principal ? (
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                        style={{ background: BRAND }}
                      >
                        Principal
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {direccion.etiqueta || 'Sin etiqueta'}
                    {direccion.referencia ? ` · ${direccion.referencia}` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Sin direcciones guardadas"
          description="Se cargan solas cuando el cliente pide delivery."
        />
      )}
    </Card>
  );
}

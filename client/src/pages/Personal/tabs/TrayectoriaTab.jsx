import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowRight } from 'lucide-react';
import { fmt } from '../constants.js';

export function TrayectoriaTab({ detail }) {
  return (
    <div className="rounded-xl bg-white p-8 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
      <h4 className="text-base font-bold text-gray-900 mb-8">Línea de Tiempo Laboral</h4>
      <div className="space-y-8 relative before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-gray-100 before:content-['']">
        {/* Entrada Inicial */}
        <div className="relative pl-12">
          <div className="absolute left-1.5 top-1.5 h-5 w-5 rounded-full border-4 border-white bg-success-500 shadow-sm"></div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {detail.item.fecha_ingreso
                ? format(parseISO(detail.item.fecha_ingreso), 'MMMM yyyy', {
                    locale: es,
                  })
                : 'N/A'}
            </p>
            <h5 className="text-sm font-bold text-gray-900 mt-1">Ingreso al Equipo</h5>
            <p className="text-xs font-semibold text-gray-500 mt-1">
              Comenzó como {detail.item.rol_operativo} en el turno {detail.item.turno_preferido}.
            </p>
          </div>
        </div>

        {detail.carrera.map((c, idx) => (
          <div key={idx} className="relative pl-12">
            <div className="absolute left-1.5 top-1.5 h-5 w-5 rounded-full border-4 border-white bg-primary-500 shadow-sm"></div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {format(parseISO(c.fecha_cambio), 'MMMM yyyy', { locale: es })}
              </p>
              <h5 className="text-sm font-bold text-gray-900 mt-1">
                Ascenso / Cambio de Categoría
              </h5>
              <div className="mt-2 p-3 rounded-lg bg-gray-50 border border-gray-100 inline-block">
                <p className="text-xs font-bold text-gray-700">
                  {c.categoria_anterior_nombre} <ArrowRight size={12} className="inline mx-1" />{' '}
                  {c.categoria_nueva_nombre}
                </p>
                <p className="text-[10px] font-bold text-primary-500 mt-1">
                  Ajuste salarial: {fmt(c.sueldo_nuevo)}
                </p>
              </div>
              {c.motivo && <p className="text-xs italic text-gray-500 mt-2">"{c.motivo}"</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { AlertCircle, Database, Download, FileText, RefreshCcw, RotateCcw } from 'lucide-react';

import { SectionCard, InputField } from './ConfigComponents.jsx';

/**
 * Traduce una entrada del log de auditoría a algo legible.
 *
 * Antes esta columna mostraba `JSON.stringify(log.detalle)` truncado a 200px,
 * o sea `{"numero":142,"esta...` — información que no le sirve a nadie. Ahora
 * se arman frases con los campos que importan y, si el detalle trae algo que
 * no sabemos interpretar, se muestra el resumen en vez del volcado crudo.
 */
function describirDetalle(log) {
  const detalle = log?.detalle;
  if (!detalle) return '—';

  let datos = detalle;
  if (typeof detalle === 'string') {
    try {
      datos = JSON.parse(detalle);
    } catch {
      return detalle;
    }
  }
  if (typeof datos !== 'object') return String(datos);

  const partes = [];
  if (datos.numero) partes.push(`Pedido #${datos.numero}`);
  if (datos.nombre) partes.push(datos.nombre);
  if (datos.estado) partes.push(`estado: ${datos.estado}`);
  if (datos.claves) {
    const claves = Array.isArray(datos.claves) ? datos.claves : [datos.claves];
    partes.push(`${claves.length} ajuste${claves.length === 1 ? '' : 's'}`);
  }

  if (partes.length > 0) return partes.join(' · ');

  const claves = Object.keys(datos);
  return claves.length > 0 ? `${claves.length} campos modificados` : '—';
}

export default function SeccionAvanzado({
  f,
  exportarBackup,
  importarBackup,
  resetOperativo,
  auditLogs = [],
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* El título de la sección lo muestra el módulo arriba de las pestañas. */}

      <SectionCard
        icon={Database}
        title="Copias de seguridad"
        subtitle="Descargá la base completa o restaurá una copia anterior"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-900">
              <Download size={16} strokeWidth={1.9} className="text-gray-500" />
              <span className="text-[14px] font-medium">Exportar</span>
            </div>
            <p className="mt-1 flex-1 text-[12px] leading-relaxed text-gray-500">
              Un archivo <code className="font-mono">.sqlite</code> con todo el sistema: pedidos,
              productos, clientes y configuración. Guardalo fuera de la computadora del local.
            </p>
            <button
              type="button"
              onClick={exportarBackup}
              className="mt-4 h-11 w-full rounded-xl bg-gray-900 text-[13px] font-semibold text-white transition hover:bg-gray-800"
            >
              Descargar backup
            </button>
          </div>

          <div className="flex flex-col rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 text-gray-900">
              <RefreshCcw size={16} strokeWidth={1.9} className="text-gray-500" />
              <span className="text-[14px] font-medium">Restaurar</span>
            </div>
            <p className="mt-1 flex-1 text-[12px] leading-relaxed text-gray-500">
              Reemplaza todos los datos actuales por los del archivo. Pide confirmación escrita
              antes de ejecutarse.
            </p>
            <label className="mt-4 flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-[13px] font-semibold text-gray-600 transition hover:border-gray-400 hover:bg-white">
              Elegir archivo .sqlite
              <input type="file" className="hidden" accept=".sqlite" onChange={importarBackup} />
            </label>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        icon={FileText}
        title="Registro de auditoría"
        subtitle="Últimos movimientos sensibles del sistema"
      >
        {auditLogs.length === 0 ? (
          <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-[13px] text-gray-400">
            Todavía no hay registros.
          </p>
        ) : (
          <div className="space-y-1">
            {auditLogs.map((log, index) => (
              <div
                key={index}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2.5 transition hover:bg-gray-50"
              >
                <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {log.accion}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-gray-700">
                  {describirDetalle(log)}
                </span>
                <span className="text-[12px] font-medium text-gray-600">
                  {log.actor_nombre || 'Sistema'}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
                  {log.creado_en
                    ? new Date(String(log.creado_en).replace(' ', 'T')).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        icon={RotateCcw}
        tone="danger"
        title="Zona de peligro"
        subtitle="Acciones que no se pueden deshacer"
      >
        <div className="rounded-xl bg-[#FEF2F2] p-5">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} strokeWidth={1.9} className="mt-0.5 shrink-0 text-[#DC1F2D]" />
            <div className="min-w-0 flex-1">
              <h4 className="text-[14px] font-semibold text-gray-900">Reinicio operativo</h4>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-600">
                Borra pedidos, movimientos de caja, registros de inventario e impresiones. Los
                productos, categorías, usuarios y esta configuración se conservan.
              </p>
              <p className="mt-2 text-[12px] font-medium text-gray-700">
                Hacé un backup antes. No hay vuelta atrás.
              </p>
              <button
                type="button"
                onClick={resetOperativo}
                style={{ background: '#DC1F2D' }}
                className="mt-4 h-11 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-110"
              >
                Reiniciar para una nueva jornada
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {/*
        Las URLs públicas están al final y no arriba porque casi nunca se
        tocan: se configuran una vez al montar el sistema y no se vuelven a
        mirar. Antes abrían la pestaña, que es el lugar de lo que más se usa.
      */}
      <SectionCard
        icon={Database}
        title="Direcciones públicas"
        subtitle="Se configuran una vez al instalar el sistema"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <InputField
            label="URL pública de la API"
            {...f('public_api_url')}
            placeholder="https://modosabor-api-production.up.railway.app"
            hint="El servidor. Lo usa el GPS de la app rider para reportar posición."
          />
          <InputField
            label="URL pública de la app"
            {...f('public_app_url')}
            placeholder="https://modosabor.com.ar"
            hint="La web. Se usa en los links de seguimiento y del club de fidelidad."
          />
        </div>
      </SectionCard>
    </div>
  );
}

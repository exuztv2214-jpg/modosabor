import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Smartphone, Calendar, Star, MapPin, Copy, ExternalLink, CheckCircle2 } from 'lucide-react';
import { fmt } from '../constants.js';

export function ResumenTab({
  detail,
  publicAppDiagnostics,
  getClockUrl,
  copyText,
  onOpenMovementModal,
  onOpenSettlementModal,
}) {
  const alertToneMap = {
    critical: {
      wrap: 'border-rose-200 bg-danger-50',
      title: 'text-danger-700',
      text: 'text-rose-800',
    },
    warning: {
      wrap: 'border-amber-200 bg-warning-50',
      title: 'text-warning-700',
      text: 'text-amber-800',
    },
    success: {
      wrap: 'border-emerald-200 bg-success-50',
      title: 'text-success-700',
      text: 'text-emerald-800',
    },
    info: {
      wrap: 'border-primary-200 bg-primary-50',
      title: 'text-primary-500',
      text: 'text-gray-700',
    },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Saldos */}
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-base font-bold text-gray-900">Resumen Financiero</h4>
            <button
              onClick={onOpenMovementModal}
              className="h-8 px-3 rounded-lg bg-primary-50 text-primary-500 text-[11px] font-bold hover:bg-primary-500 hover:text-white transition-all"
            >
              Nuevo Movimiento
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between p-4 rounded-xl bg-gray-50/50 border border-gray-100">
              <span className="text-xs font-semibold text-gray-500">Sueldo Base</span>
              <span className="text-sm font-bold text-gray-900">{fmt(detail.item.monto_base)}</span>
            </div>
            <div className="flex justify-between p-4 rounded-xl bg-danger-50 border border-rose-100">
              <span className="text-xs font-semibold text-danger-600">Pendiente Acumulado</span>
              <span className="text-sm font-bold text-danger-700">
                {fmt(detail.item.pendiente_total)}
              </span>
            </div>
            <div className="flex justify-between p-4 rounded-xl bg-success-50 border border-emerald-100">
              <span className="text-xs font-semibold text-success-600">Neto a Liquidar</span>
              <span className="text-sm font-bold text-success-700">
                {fmt(detail.item.neto_sugerido_base)}
              </span>
            </div>
          </div>
        </div>

        {/* Info Contacto */}
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <h4 className="text-base font-bold text-gray-900 mb-6">Ficha del Empleado</h4>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-primary-50 flex items-center justify-center text-primary-500">
                <Smartphone size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Teléfono
                </p>
                <p className="text-sm font-bold text-gray-700">
                  {detail.item.telefono || 'Sin especificar'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-[#FEF5E5] flex items-center justify-center text-warning-500">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Antigüedad
                </p>
                <p className="text-sm font-bold text-gray-700">
                  {detail.item.antiguedad_texto} (Ingreso:{' '}
                  {detail.item.fecha_ingreso
                    ? format(parseISO(detail.item.fecha_ingreso), 'dd/MM/yy')
                    : 'N/A'}
                  )
                </p>
              </div>
            </div>
            {detail.item.fecha_nacimiento && (
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-lg bg-danger-50 flex items-center justify-center text-rose-500">
                  <Star size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    Cumpleaños
                  </p>
                  <p className="text-sm font-bold text-gray-700">
                    {format(parseISO(detail.item.fecha_nacimiento), 'dd MMMM', {
                      locale: es,
                    })}{' '}
                    {detail.item.es_cumpleanos_hoy && '🎂 HOY!'}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400">
                <MapPin size={20} />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Dirección
                </p>
                <p className="text-xs font-bold text-gray-700 truncate max-w-[200px]">
                  {detail.item.direccion || 'Sin domicilio registrado'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="text-base font-bold text-gray-900">Alertas operativas</h4>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                Lectura rápida del comportamiento reciente
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-gray-500">
              {detail.alertas_operativas?.length || 0} alertas
            </span>
          </div>
          <div className="space-y-3">
            {(detail.alertas_operativas || []).map((alert, index) => {
              const tone = alertToneMap[alert.level] || alertToneMap.info;
              return (
                <div
                  key={`${alert.title}-${index}`}
                  className={`rounded-xl border px-4 py-4 ${tone.wrap}`}
                >
                  <p className={`text-[11px] font-black uppercase tracking-widest ${tone.title}`}>
                    {alert.title}
                  </p>
                  <p className={`mt-2 text-sm font-semibold leading-6 ${tone.text}`}>
                    {alert.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <h4 className="text-base font-bold text-gray-900">Lectura de liquidación</h4>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1 mb-5">
            Decisión rápida antes de pagar
          </p>
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Valor por jornada
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {fmt(detail.resumen_liquidacion_ejecutivo?.valor_jornada || 0)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Descuento vs bruto
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {detail.resumen_liquidacion_ejecutivo?.descuento_ratio_pct || 0}%
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                Promedio de tardanza
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {detail.resumen_liquidacion_ejecutivo?.promedio_minutos_tarde || 0} min
              </p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-primary-500">
                Recomendación
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
                {detail.resumen_liquidacion_ejecutivo?.recommendation || 'Sin sugerencia'}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="text-base font-bold text-gray-900">Reloj de fichada</h4>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                Celular compartido o QR individual
              </p>
            </div>
            <a
              href={getClockUrl(detail.item)}
              target="_blank"
              rel="noreferrer"
              className="h-9 px-3 rounded-xl bg-primary-50 text-primary-500 text-[11px] font-bold inline-flex items-center gap-2 hover:bg-[#DDE8FF]"
            >
              <ExternalLink size={14} />
              Abrir
            </a>
          </div>
          <div className="space-y-3">
            {publicAppDiagnostics.warning ? (
              <div className="rounded-xl border border-amber-100 bg-warning-50 p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-warning-600">
                  Revisar URL pública
                </p>
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-800">
                  {publicAppDiagnostics.warning}
                </p>
              </div>
            ) : null}
            <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 p-4">
              <div>
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  PIN de fichada
                </p>
                <p className="text-lg font-black text-gray-900 tracking-[0.25em]">
                  {detail.item.clock_pin || '—'}
                </p>
              </div>
              <button
                onClick={() => copyText(detail.item.clock_pin || '', 'PIN copiado')}
                className="h-9 w-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary-500"
              >
                <Copy size={14} />
              </button>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 border border-gray-100 p-4 gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  Link individual
                </p>
                <p className="text-xs font-bold text-gray-700 truncate">
                  {getClockUrl(detail.item)}
                </p>
              </div>
              <button
                onClick={() => copyText(getClockUrl(detail.item), 'Link de fichada copiado')}
                className="h-9 w-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500 hover:text-primary-500"
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h4 className="text-base font-bold text-gray-900">Resumen laboral del período</h4>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                {detail.resumen_laboral?.periodo_desde || '-'} →{' '}
                {detail.resumen_laboral?.periodo_hasta || '-'}
              </p>
            </div>
            <button
              onClick={onOpenSettlementModal}
              className="h-9 px-3 rounded-xl bg-success-500 text-white text-[11px] font-bold hover:bg-[#0fc8a6]"
            >
              Liquidar
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-primary-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-primary-500">
                Jornadas
              </p>
              <p className="mt-1 text-2xl font-black text-gray-900">
                {detail.resumen_laboral?.unidades_sugeridas || 0}
              </p>
            </div>
            <div className="rounded-xl bg-warning-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-warning-700">
                Tardanzas
              </p>
              <p className="mt-1 text-2xl font-black text-gray-900">
                {detail.resumen_laboral?.tardanzas || 0}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">
                Bruto estimado
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {fmt(detail.resumen_laboral?.monto_bruto_estimado || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-success-50 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-success-700">
                Neto estimado
              </p>
              <p className="mt-1 text-lg font-black text-gray-900">
                {fmt(detail.resumen_laboral?.monto_neto_estimado || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

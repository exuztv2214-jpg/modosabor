import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Smartphone,
  Calendar,
  Cake,
  MapPin,
  Copy,
  ExternalLink,
  AlertTriangle,
  Mail,
} from 'lucide-react';

import { BRAND, STROKE } from '../../../lib/theme.js';
import { Card, Empty, Row } from '../components.jsx';
import { fmt } from '../constants.js';

/**
 * Formatea una fecha de la base sin tumbar la pantalla.
 *
 * Se usaba `format(parseISO(valor), ...)` directo. `parseISO` sobre un campo
 * vacío o con formato inesperado devuelve Invalid Date, y `format` sobre eso
 * tira una excepción: un solo empleado con la fecha mal cargada dejaba toda
 * la pestaña en blanco.
 */
function fecha(valor, patron = 'dd/MM/yy') {
  if (!valor) return null;
  try {
    const d = parseISO(String(valor));
    if (!isValid(d)) return null;
    return format(d, patron, { locale: es });
  } catch {
    return null;
  }
}

const TONOS_ALERTA = {
  critical: { bg: '#FEF2F2', fg: '#9E141E', barra: BRAND },
  warning: { bg: '#FDF3D3', fg: '#95661A', barra: '#E0A924' },
  success: { bg: '#E7F5EF', fg: '#0F6E56', barra: '#10B981' },
  info: { bg: '#F1F5F9', fg: '#475569', barra: '#94A3B8' },
};

export function ResumenTab({
  detail,
  publicAppDiagnostics,
  getClockUrl,
  copyText,
  onOpenMovementModal,
  onOpenSettlementModal,
}) {
  const item = detail.item;
  const alertas = detail.alertas_operativas || [];
  const laboral = detail.resumen_laboral || {};
  const ejecutivo = detail.resumen_liquidacion_ejecutivo || {};
  const clockUrl = getClockUrl(item);

  const debe = Number(item.pendiente_total || 0) > 0;
  const ingreso = fecha(item.fecha_ingreso);
  const cumple = fecha(item.fecha_nacimiento, "d 'de' MMMM");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          title="Situación de pago"
          helper="Qué le corresponde cobrar hoy"
          action={
            <button
              type="button"
              onClick={onOpenMovementModal}
              className="inline-flex h-9 shrink-0 items-center rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Movimiento
            </button>
          }
        >
          <div className="space-y-2">
            <div className="flex items-baseline justify-between rounded-xl bg-gray-50 px-4 py-3">
              <span className="text-[12px] text-gray-500">Sueldo base</span>
              <span className="text-[15px] font-semibold tabular-nums text-gray-900">
                {fmt(item.monto_base)}
              </span>
            </div>

            <div
              className="flex items-baseline justify-between rounded-xl px-4 py-3"
              style={{ background: debe ? '#FEF2F2' : '#F9FAFB' }}
            >
              <span className="text-[12px]" style={{ color: debe ? '#9E141E' : '#6B7280' }}>
                Ya cobrado a cuenta
              </span>
              <span
                className="text-[15px] font-semibold tabular-nums"
                style={{ color: debe ? BRAND : '#111827' }}
              >
                − {fmt(item.pendiente_total)}
              </span>
            </div>

            {/* Este número venía sin dividir por 100 desde el servidor y se
                mostraba cien veces más grande que el real. */}
            <div className="flex items-baseline justify-between rounded-xl bg-emerald-50 px-4 py-3">
              <span className="text-[12px] text-emerald-800">Neto a liquidar</span>
              <span className="text-[17px] font-bold tabular-nums text-emerald-900">
                {fmt(item.neto_sugerido_base)}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Ficha" helper="Datos de contacto y antigüedad">
          <div className="divide-y divide-gray-100">
            <Row
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone size={13} strokeWidth={STROKE} /> Teléfono
                </span>
              }
              value={item.telefono || 'Sin cargar'}
            />
            {item.email ? (
              <Row
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={13} strokeWidth={STROKE} /> Email
                  </span>
                }
                value={item.email}
              />
            ) : null}
            <Row
              label={
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={13} strokeWidth={STROKE} /> Antigüedad
                </span>
              }
              value={
                <>
                  {item.antiguedad_texto || '—'}
                  {ingreso ? (
                    <span className="ml-1 font-normal text-gray-400">desde {ingreso}</span>
                  ) : null}
                </>
              }
            />
            {cumple ? (
              <Row
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <Cake size={13} strokeWidth={STROKE} /> Cumpleaños
                  </span>
                }
                value={
                  <span style={item.es_cumpleanos_hoy ? { color: BRAND } : undefined}>
                    {cumple}
                    {item.es_cumpleanos_hoy ? ' — ¡es hoy!' : ''}
                  </span>
                }
              />
            ) : null}
            <Row
              label={
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={13} strokeWidth={STROKE} /> Dirección
                </span>
              }
              value={item.direccion || 'Sin cargar'}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card
          title="Alertas operativas"
          helper="Lo que se salió de lo normal últimamente"
          action={
            alertas.length > 0 ? (
              <span
                className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium"
                style={{ background: '#FEF2F2', color: '#9E141E' }}
              >
                {alertas.length}
              </span>
            ) : null
          }
        >
          {/* Sin alertas quedaba un recuadro vacío, que se lee igual que un
              error de carga. Ahora dice explícitamente que está todo bien. */}
          {alertas.length === 0 ? (
            <Empty
              title="Nada para revisar"
              description="No hay tardanzas, ausencias ni consumos fuera de lo habitual."
            />
          ) : (
            <div className="space-y-2">
              {alertas.map((alert, index) => {
                const tono = TONOS_ALERTA[alert.level] || TONOS_ALERTA.info;
                return (
                  <div
                    key={`${alert.title}-${index}`}
                    className="relative overflow-hidden rounded-xl px-4 py-3"
                    style={{ background: tono.bg }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: tono.barra }}
                    />
                    <div className="pl-2">
                      <p className="text-[13px] font-semibold" style={{ color: tono.fg }}>
                        {alert.title}
                      </p>
                      <p className="mt-1 text-[12px] leading-4 text-gray-700">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Antes de pagar" helper="Los tres números que conviene mirar">
          <div className="space-y-2">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[12px] text-gray-500">Valor por jornada</p>
              <p className="mt-0.5 text-[17px] font-bold tabular-nums text-gray-900">
                {fmt(ejecutivo.valor_jornada || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[12px] text-gray-500">Descontado sobre el bruto</p>
              <p className="mt-0.5 text-[17px] font-bold tabular-nums text-gray-900">
                {ejecutivo.descuento_ratio_pct || 0}%
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[12px] text-gray-500">Tardanza promedio</p>
              <p
                className="mt-0.5 text-[17px] font-bold tabular-nums"
                style={{
                  color: Number(ejecutivo.promedio_minutos_tarde || 0) > 10 ? BRAND : '#111827',
                }}
              >
                {ejecutivo.promedio_minutos_tarde || 0} min
              </p>
            </div>
            {ejecutivo.recommendation ? (
              <div className="rounded-xl border border-gray-200 px-4 py-3">
                <p className="text-[12px] text-gray-500">Sugerencia del sistema</p>
                <p className="mt-1 text-[13px] leading-5 text-gray-800">
                  {ejecutivo.recommendation}
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card
          title="Reloj de fichada"
          helper="Celular compartido del local o link individual"
          action={
            <a
              href={clockUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <ExternalLink size={13} strokeWidth={STROKE} />
              Abrir
            </a>
          }
        >
          <div className="space-y-2">
            {publicAppDiagnostics.warning ? (
              <div
                className="flex items-start gap-2 rounded-xl px-4 py-3"
                style={{ background: '#FDF3D3' }}
              >
                <AlertTriangle
                  size={14}
                  strokeWidth={STROKE}
                  className="mt-0.5 shrink-0"
                  style={{ color: '#95661A' }}
                />
                <div>
                  <p className="text-[12px] font-semibold" style={{ color: '#95661A' }}>
                    Revisá la URL pública
                  </p>
                  <p className="mt-0.5 text-[12px] leading-4 text-gray-700">
                    {publicAppDiagnostics.warning}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
              <div>
                <p className="text-[12px] text-gray-500">PIN de fichada</p>
                <p className="mt-0.5 font-mono text-[18px] font-bold tracking-[0.2em] text-gray-900">
                  {item.clock_pin || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyText(item.clock_pin || '', 'PIN copiado')}
                disabled={!item.clock_pin}
                title="Copiar PIN"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-800 disabled:opacity-40"
              >
                <Copy size={14} strokeWidth={STROKE} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[12px] text-gray-500">Link individual</p>
                <p className="mt-0.5 truncate text-[12px] text-gray-700">{clockUrl}</p>
              </div>
              <button
                type="button"
                onClick={() => copyText(clockUrl, 'Link de fichada copiado')}
                title="Copiar link"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-800"
              >
                <Copy size={14} strokeWidth={STROKE} />
              </button>
            </div>
          </div>
        </Card>

        <Card
          title="Período a liquidar"
          helper={
            laboral.periodo_desde
              ? `${laboral.periodo_desde} → ${laboral.periodo_hasta || 'hoy'}`
              : 'Sin período calculado'
          }
          action={
            <button
              type="button"
              onClick={onOpenSettlementModal}
              style={{ background: BRAND }}
              className="inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-[12px] font-semibold text-white transition hover:brightness-110"
            >
              Liquidar
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[12px] text-gray-500">Jornadas</p>
              <p className="mt-0.5 text-[22px] font-bold tabular-nums text-gray-900">
                {laboral.unidades_sugeridas || 0}
              </p>
            </div>
            <div
              className="rounded-xl px-4 py-3"
              style={{ background: Number(laboral.tardanzas || 0) > 0 ? '#FDF3D3' : '#F9FAFB' }}
            >
              <p
                className="text-[12px]"
                style={{ color: Number(laboral.tardanzas || 0) > 0 ? '#95661A' : '#6B7280' }}
              >
                Tardanzas
              </p>
              <p className="mt-0.5 text-[22px] font-bold tabular-nums text-gray-900">
                {laboral.tardanzas || 0}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="text-[12px] text-gray-500">Bruto estimado</p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-gray-900">
                {fmt(laboral.monto_bruto_estimado || 0)}
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-[12px] text-emerald-800">Neto estimado</p>
              <p className="mt-0.5 text-[15px] font-semibold tabular-nums text-emerald-900">
                {fmt(laboral.monto_neto_estimado || 0)}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

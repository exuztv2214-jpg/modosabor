import { X, Zap, AlertTriangle } from 'lucide-react';

import { BRAND, STROKE, Z } from '../../../lib/theme.js';
import { CONTROL, LABEL, SELECT, PAYMENT_OPTIONS, FREQUENCY_OPTIONS, fmt } from '../constants.js';
import { ToggleSwitch } from './ToggleSwitch.jsx';

export function SettlementModal({
  open,
  onClose,
  settlementForm,
  onSettlementFormChange,
  selectedPerson,
  detail,
  liquidacionPreview,
  onConfirmar,
  onAuto,
  saving,
}) {
  if (!open) return null;

  const set = (campo) => (e) =>
    onSettlementFormChange({ ...settlementForm, [campo]: e.target.value });

  const enRojo = liquidacionPreview.neto < 0;
  const laboral = detail?.resumen_laboral;
  const frecuencia =
    FREQUENCY_OPTIONS.find((f) => f.value === selectedPerson?.frecuencia_pago)?.label ||
    selectedPerson?.frecuencia_pago ||
    'período';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-semibold text-gray-900">Liquidar sueldo</h3>
            <p className="mt-0.5 text-[12px] text-gray-500">{selectedPerson?.nombre}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {/* La sugerencia automática estaba abajo del formulario, después de
              que ya habías tipeado todo a mano. Va arriba, con el botón que
              la aplica: es el camino corto y debería ofrecerse primero. */}
          {laboral ? (
            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13px] font-medium text-gray-900">
                    El sistema calculó {laboral.unidades_sugeridas || 0} jornadas
                  </p>
                  <p className="mt-0.5 text-[12px] text-gray-500">
                    Neto estimado {fmt(laboral.monto_neto_estimado || 0)} según la asistencia
                    cargada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAuto}
                  disabled={saving}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100 disabled:opacity-40"
                >
                  <Zap size={13} strokeWidth={STROKE} />
                  Usar esto
                </button>
              </div>
              {detail?.resumen_liquidacion_ejecutivo?.recommendation ? (
                <p className="mt-2 border-t border-gray-200 pt-2 text-[12px] leading-4 text-gray-600">
                  {detail.resumen_liquidacion_ejecutivo.recommendation}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Cuántos períodos ({frecuencia.toLowerCase()})</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={settlementForm.unidades}
                onChange={set('unidades')}
                className={CONTROL}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Cómo se le paga</span>
              <select
                value={settlementForm.metodo_pago}
                onChange={set('metodo_pago')}
                className={SELECT}
              >
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Período desde</span>
              <input
                type="date"
                value={settlementForm.periodo_desde}
                onChange={set('periodo_desde')}
                className={CONTROL}
              />
            </label>
            <label className="block">
              <span className={LABEL}>Período hasta</span>
              <input
                type="date"
                value={settlementForm.periodo_hasta}
                onChange={set('periodo_hasta')}
                className={CONTROL}
              />
            </label>
          </div>

          <div
            className="rounded-xl px-5 py-4"
            style={{ background: enRojo ? '#FEF2F2' : '#E7F5EF' }}
          >
            <p className="text-[12px]" style={{ color: enRojo ? '#9E141E' : '#0F6E56' }}>
              Se le paga
            </p>
            <p
              className="mt-1 text-[30px] font-bold leading-none tabular-nums tracking-tight"
              style={{ color: enRojo ? BRAND : '#08453A' }}
            >
              {liquidacionPreview.label}
            </p>
            {enRojo ? (
              <p
                className="mt-2 flex items-start gap-1.5 text-[12px] leading-4"
                style={{ color: '#9E141E' }}
              >
                <AlertTriangle size={13} strokeWidth={STROKE} className="mt-px shrink-0" />
                Lo que ya cobró a cuenta supera el bruto del período. Revisá las jornadas antes de
                confirmar.
              </p>
            ) : null}
          </div>

          {/* El formulario ya mandaba `impacta_caja: 1` siempre, sin control
              para cambiarlo: una liquidación pagada por transferencia desde
              otra cuenta igual descontaba del efectivo del día. */}
          <div className="rounded-xl bg-gray-50 p-4">
            <ToggleSwitch
              checked={settlementForm.impacta_caja === 1}
              onChange={(v) =>
                onSettlementFormChange({ ...settlementForm, impacta_caja: v ? 1 : 0 })
              }
              label="Descontar de la caja"
              description="Apagalo si el pago sale de otro lado y no del efectivo del local."
            />
          </div>

          <label className="block">
            <span className={LABEL}>Nota del recibo</span>
            <textarea
              value={settlementForm.notas}
              onChange={set('notas')}
              className={`${CONTROL} h-20 resize-none py-2.5`}
              placeholder="Opcional: aclaración que quede registrada"
            />
          </label>
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            // Este botón NO tenía `disabled`: dos clics seguidos registraban
            // dos liquidaciones y le pagabas dos veces a la misma persona.
            disabled={saving || enRojo}
            style={{ background: BRAND }}
            className="h-11 flex-[2] rounded-xl text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Registrando…' : `Confirmar ${liquidacionPreview.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

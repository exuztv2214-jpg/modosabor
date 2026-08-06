import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

import { BRAND, STROKE } from '../../../lib/theme.js';
import { Card, Empty, Pill } from '../components.jsx';
import {
  CONTROL,
  LABEL,
  SELECT,
  TURNOS,
  estadoAsistencia,
  hoyIso,
  rolLabel,
} from '../constants.js';

function fecha(valor, patron) {
  if (!valor) return '—';
  try {
    const d = parseISO(String(valor));
    return isValid(d) ? format(d, patron, { locale: es }) : '—';
  } catch {
    return '—';
  }
}

function hora(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  return isValid(d) ? format(d, 'HH:mm') : '—';
}

/**
 * Corre la semana N días, en hora local.
 *
 * Se hacía con `.toISOString().split('T')[0]`, que devuelve la fecha en UTC:
 * dependiendo de la hora del día podía saltear o repetir una semana.
 */
function correrSemana(desde, dias) {
  const base = desde ? new Date(`${desde}T12:00:00`) : new Date();
  if (Number.isNaN(base.getTime())) return hoyIso();
  base.setDate(base.getDate() + dias);
  const pad = (n) => String(n).padStart(2, '0');
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

const ESTADOS_EDITOR = [
  { value: 'presente', label: 'Presente' },
  { value: 'tarde', label: 'Llegó tarde' },
  { value: 'ausente', label: 'Ausente' },
  { value: 'franco', label: 'Franco' },
  { value: 'justificado', label: 'Justificado' },
];

export function PlanillaTab({
  weeklyBoard,
  cargarPlanillaSemanal,
  weeklySummary,
  weeklyRow,
  selectedId,
  onSelectId,
  seleccionarDiaPlanilla,
  weeklyEditor,
  setWeeklyEditor,
  guardarAsistenciaManual,
  saving,
  weeklyEditorDay,
}) {
  const dias = weeklyBoard?.dias || [];
  const filas = weeklySummary.rows || [];
  const setEditor = (campo) => (e) =>
    setWeeklyEditor((prev) => ({ ...prev, [campo]: e.target.value }));

  return (
    <div className="space-y-4">
      <Card
        title="Planilla semanal"
        helper={`${weeklyBoard?.desde || '—'} → ${weeklyBoard?.hasta || '—'}`}
        action={
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => cargarPlanillaSemanal(correrSemana(weeklyBoard?.desde, -7))}
              title="Semana anterior"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <ChevronLeft size={16} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              onClick={() => cargarPlanillaSemanal(hoyIso())}
              className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Esta semana
            </button>
            {/* Se podía retroceder pero no volver adelante: si te ibas tres
                semanas atrás, la única salida era "Semana actual". */}
            <button
              type="button"
              onClick={() => cargarPlanillaSemanal(correrSemana(weeklyBoard?.desde, 7))}
              title="Semana siguiente"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <ChevronRight size={16} strokeWidth={STROKE} />
            </button>
          </div>
        }
      >
        <div className="mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
          <div className="rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[12px] text-gray-500">Mejor asistencia</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-gray-900">
              {weeklySummary.topAttendance?.nombre || 'Sin datos'}
            </p>
            <p className="text-[11px] text-gray-400">
              {weeklySummary.topAttendance
                ? `${weeklySummary.topAttendance.presentDays} jornadas`
                : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 px-3 py-2.5">
            <p className="text-[12px] text-gray-500">Más puntual</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-gray-900">
              {weeklySummary.topPunctual?.nombre || 'Sin datos'}
            </p>
            <p className="text-[11px] text-gray-400">
              {weeklySummary.topPunctual ? `${weeklySummary.topPunctual.lateDays} tardanzas` : '—'}
            </p>
          </div>
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: weeklySummary.totalLate > 0 ? '#FDF3D3' : '#F9FAFB' }}
          >
            <p
              className="text-[12px]"
              style={{ color: weeklySummary.totalLate > 0 ? '#95661A' : '#6B7280' }}
            >
              Tardanzas
            </p>
            <p className="mt-0.5 text-[20px] font-bold tabular-nums text-gray-900">
              {weeklySummary.totalLate}
            </p>
          </div>
          <div
            className="rounded-xl px-3 py-2.5"
            style={{ background: weeklySummary.totalAbsent > 0 ? '#FEF2F2' : '#F9FAFB' }}
          >
            <p
              className="text-[12px]"
              style={{ color: weeklySummary.totalAbsent > 0 ? '#9E141E' : '#6B7280' }}
            >
              Ausencias
            </p>
            <p
              className="mt-0.5 text-[20px] font-bold tabular-nums"
              style={{ color: weeklySummary.totalAbsent > 0 ? BRAND : '#111827' }}
            >
              {weeklySummary.totalAbsent}
            </p>
          </div>
        </div>

        {filas.length === 0 ? (
          <Empty
            title="Sin datos en esta semana"
            description="Todavía no se tomó asistencia en el rango elegido."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead>
                <tr className="text-[12px] text-gray-500">
                  <th className="pb-3 pr-4 font-normal">Empleado</th>
                  {dias.map((day) => (
                    <th key={day.fecha} className="px-2 pb-3 text-center font-normal">
                      <div className="capitalize">{fecha(day.fecha, 'EEE')}</div>
                      <div className="text-[11px] text-gray-400">{fecha(day.fecha, 'dd/MM')}</div>
                    </th>
                  ))}
                  <th className="pb-3 pl-4 text-right font-normal">Semana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filas.map((item) => {
                  const activo = String(item.id) === String(selectedId);
                  return (
                    <tr key={item.id} style={activo ? { background: '#FEF7F7' } : undefined}>
                      <td className="py-2.5 pr-4">
                        <button
                          type="button"
                          onClick={() => onSelectId(String(item.id))}
                          className="text-left"
                        >
                          <p
                            className="text-[13px] font-medium"
                            style={{ color: activo ? BRAND : '#111827' }}
                          >
                            {item.nombre}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {rolLabel(item.rol_operativo)}
                          </p>
                        </button>
                      </td>

                      {item.days.map((day) => {
                        const tono = day.estado ? estadoAsistencia(day.estado) : null;
                        return (
                          <td key={`${item.id}-${day.fecha}`} className="px-1.5 py-2.5 text-center">
                            {/* Antes cada celda escupía el valor crudo de la
                                base en mayúsculas ("AUSENTE"). Con seis días
                                al lado, la grilla era ilegible. Ahora es un
                                punto de color y el detalle va en el title. */}
                            <span
                              className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-semibold"
                              style={{
                                background: tono ? tono.bg : '#F9FAFB',
                                color: tono ? tono.fg : '#D1D5DB',
                              }}
                              title={
                                tono
                                  ? `${tono.label}${day.minutos_tarde ? ` · ${day.minutos_tarde} min tarde` : ''}`
                                  : 'Sin registro'
                              }
                            >
                              {tono ? tono.label[0] : '·'}
                            </span>
                          </td>
                        );
                      })}

                      <td className="py-2.5 pl-4">
                        <div className="flex justify-end gap-1.5 text-[11px] tabular-nums">
                          <span className="text-emerald-700" title="Presentes">
                            {item.presentDays}
                          </span>
                          <span className="text-gray-300">/</span>
                          <span
                            style={{ color: item.lateDays > 0 ? '#95661A' : '#9CA3AF' }}
                            title="Tardanzas"
                          >
                            {item.lateDays}
                          </span>
                          <span className="text-gray-300">/</span>
                          <span
                            style={{ color: item.absentDays > 0 ? BRAND : '#9CA3AF' }}
                            title="Ausencias"
                          >
                            {item.absentDays}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-gray-400">
              Cada celda es un día. Presentes / tardanzas / ausencias a la derecha.
            </p>
          </div>
        )}
      </Card>

      {weeklyRow ? (
        <Card
          title={`Corregir la semana de ${weeklyRow.nombre}`}
          helper="Elegí un día y ajustá lo que haya quedado mal cargado"
          action={
            <button
              type="button"
              onClick={guardarAsistenciaManual}
              disabled={saving || !weeklyEditor.fecha_operativa}
              style={{ background: BRAND }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              <Save size={13} strokeWidth={STROKE} />
              Guardar
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
            {(weeklyRow.days || []).map((day) => {
              const elegido = weeklyEditor.fecha_operativa === day.fecha;
              const tono = day.estado ? estadoAsistencia(day.estado) : null;
              return (
                <button
                  type="button"
                  key={day.fecha}
                  onClick={() => seleccionarDiaPlanilla(day)}
                  className="rounded-xl px-2.5 py-2 text-left transition"
                  style={{
                    background: elegido ? '#FEF2F2' : '#F9FAFB',
                    boxShadow: elegido ? `inset 0 0 0 1.5px ${BRAND}` : 'none',
                  }}
                >
                  <p className="text-[12px] capitalize text-gray-500">
                    {fecha(day.fecha, 'EEE dd')}
                  </p>
                  <p
                    className="mt-0.5 truncate text-[12px] font-medium"
                    style={{ color: tono ? tono.fg : '#9CA3AF' }}
                  >
                    {tono ? tono.label : 'Sin registro'}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-gray-400">
                    {hora(day.ingreso_en)} – {hora(day.salida_en)}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 p-4">
            <p className="text-[13px] font-medium text-gray-900">
              {weeklyEditor.fecha_operativa
                ? fecha(weeklyEditor.fecha_operativa, "EEEE d 'de' MMMM")
                : 'Elegí un día de arriba'}
            </p>

            {weeklyEditorDay ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-gray-500">
                <span>Ahora:</span>
                {weeklyEditorDay.estado ? (
                  <Pill
                    label={estadoAsistencia(weeklyEditorDay.estado).label}
                    bg={estadoAsistencia(weeklyEditorDay.estado).bg}
                    fg={estadoAsistencia(weeklyEditorDay.estado).fg}
                  />
                ) : (
                  <span className="text-gray-400">sin registro</span>
                )}
                <span className="tabular-nums">
                  {hora(weeklyEditorDay.ingreso_en)} – {hora(weeklyEditorDay.salida_en)}
                </span>
                {Number(weeklyEditorDay.minutos_tarde || 0) > 0 ? (
                  <span style={{ color: '#95661A' }}>
                    {weeklyEditorDay.minutos_tarde} min tarde
                  </span>
                ) : null}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className={LABEL}>Estado</span>
                <select
                  value={weeklyEditor.estado}
                  onChange={setEditor('estado')}
                  className={SELECT}
                >
                  {ESTADOS_EDITOR.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={LABEL}>Ingreso</span>
                <input
                  type="datetime-local"
                  value={weeklyEditor.ingreso_en}
                  onChange={setEditor('ingreso_en')}
                  className={CONTROL}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Salida</span>
                <input
                  type="datetime-local"
                  value={weeklyEditor.salida_en}
                  onChange={setEditor('salida_en')}
                  className={CONTROL}
                />
              </label>
              <label className="block">
                <span className={LABEL}>Turno</span>
                <select
                  value={weeklyEditor.turno_id}
                  onChange={setEditor('turno_id')}
                  className={SELECT}
                >
                  {TURNOS.map((turno) => (
                    <option key={turno.value} value={turno.value}>
                      {turno.label}
                    </option>
                  ))}
                  <option value="manual">Manual</option>
                </select>
              </label>
            </div>

            <textarea
              value={weeklyEditor.notas}
              onChange={setEditor('notas')}
              className={`${CONTROL} mt-3 h-20 resize-none py-2.5`}
              placeholder="Motivo de la corrección (queda registrado)"
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

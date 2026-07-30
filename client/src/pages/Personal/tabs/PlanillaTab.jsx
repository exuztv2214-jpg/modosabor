import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { CONTROL, todayIso } from '../constants.js';
import { TURNOS } from '../constants.js';

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
  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-5">
          <div>
            <h4 className="text-base font-bold text-gray-900">Planilla semanal de asistencia</h4>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
              {weeklyBoard?.desde || '-'} → {weeklyBoard?.hasta || '-'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                cargarPlanillaSemanal(
                  weeklyBoard?.desde
                    ? new Date(
                        new Date(`${weeklyBoard.desde}T00:00:00`).getTime() -
                          7 * 24 * 60 * 60 * 1000
                      )
                        .toISOString()
                        .split('T')[0]
                    : todayIso
                )
              }
              className="h-10 px-3 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
            >
              Semana anterior
            </button>
            <button
              onClick={() => cargarPlanillaSemanal(todayIso)}
              className="h-10 px-3 rounded-xl bg-primary-500 text-xs font-bold text-white hover:bg-primary-600"
            >
              Semana actual
            </button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary-500">
              Mejor asistencia
            </p>
            <p className="mt-1 text-sm font-black text-gray-900">
              {weeklySummary.topAttendance?.nombre || 'Sin datos'}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-primary-500">
              {weeklySummary.topAttendance
                ? `${weeklySummary.topAttendance.presentDays} jornadas presentes`
                : 'Sin registros'}
            </p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-success-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-success-600">
              Mejor puntualidad
            </p>
            <p className="mt-1 text-sm font-black text-gray-900">
              {weeklySummary.topPunctual?.nombre || 'Sin datos'}
            </p>
            <p className="mt-1 text-[11px] font-semibold text-success-700">
              {weeklySummary.topPunctual
                ? `${weeklySummary.topPunctual.lateDays} tardanzas`
                : 'Sin registros'}
            </p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-warning-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-warning-600">
              Tardanzas semanales
            </p>
            <p className="mt-1 text-2xl font-black text-warning-700">{weeklySummary.totalLate}</p>
          </div>
          <div className="rounded-xl border border-rose-100 bg-danger-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-danger-600">
              Ausencias semanales
            </p>
            <p className="mt-1 text-2xl font-black text-danger-700">{weeklySummary.totalAbsent}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead>
              <tr className="bg-gray-50/70">
                <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Empleado
                </th>
                {weeklyBoard?.dias?.map((day) => (
                  <th
                    key={day.fecha}
                    className="px-3 py-3 text-center text-[10px] font-black uppercase tracking-wider text-gray-400"
                  >
                    <div>{format(parseISO(day.fecha), 'dd/MM')}</div>
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider text-gray-400">
                  Resumen
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {weeklySummary.rows.map((item) => (
                <tr
                  key={item.id}
                  className={String(item.id) === String(selectedId) ? 'bg-primary-50/35' : ''}
                >
                  <td className="px-4 py-4">
                    <button onClick={() => onSelectId(String(item.id))} className="text-left">
                      <p className="text-sm font-bold text-gray-900">{item.nombre}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                        {item.rol_operativo}
                      </p>
                    </button>
                  </td>
                  {item.days.map((day) => {
                    const tone =
                      day.estado === 'ausente'
                        ? 'bg-danger-50 text-danger-700'
                        : day.estado === 'tarde'
                          ? 'bg-warning-50 text-warning-700'
                          : day.estado
                            ? 'bg-success-50 text-success-700'
                            : 'bg-gray-50 text-gray-300';
                    return (
                      <td key={`${item.id}-${day.fecha}`} className="px-2 py-3 text-center">
                        <div
                          className={`rounded-xl px-2 py-2 text-[11px] font-black uppercase ${tone}`}
                        >
                          {day.estado || '—'}
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-4 py-3">
                    <div className="flex min-w-[148px] flex-col gap-1 rounded-xl border border-gray-100 bg-white px-3 py-2">
                      <span className="text-[11px] font-black text-success-700">
                        {item.presentDays} presentes
                      </span>
                      <span className="text-[11px] font-black text-warning-700">
                        {item.lateDays} tardanzas
                      </span>
                      <span className="text-[11px] font-black text-danger-700">
                        {item.absentDays} ausencias
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {weeklyRow ? (
          <div className="mt-5 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">
              Detalle semanal de {weeklyRow.nombre}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {weeklyRow.days.map((day) => (
                <button
                  type="button"
                  key={day.fecha}
                  onClick={() => seleccionarDiaPlanilla(day)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    weeklyEditor.fecha_operativa === day.fecha
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="text-xs font-bold text-gray-900">
                    {format(parseISO(day.fecha), 'EEE dd/MM', { locale: es })}
                  </p>
                  <p className="mt-2 text-sm font-black text-primary-500">
                    {day.estado || 'Sin registro'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-gray-500">
                    Ingreso: {day.ingreso_en ? format(new Date(day.ingreso_en), 'HH:mm') : '-'}
                  </p>
                  <p className="text-[11px] font-semibold text-gray-500">
                    Salida: {day.salida_en ? format(new Date(day.salida_en), 'HH:mm') : '-'}
                  </p>
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-primary-500">
                    Corrección manual del día
                  </p>
                  <p className="mt-1 text-sm font-bold text-gray-900">
                    {weeklyEditor.fecha_operativa
                      ? format(parseISO(weeklyEditor.fecha_operativa), "EEEE dd 'de' MMMM", {
                          locale: es,
                        })
                      : 'Elegí un día'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-gray-500">
                    Ajustá el estado real, ingreso y salida si necesitás corregir la planilla.
                  </p>
                </div>
                <button
                  onClick={guardarAsistenciaManual}
                  disabled={saving || !weeklyEditor.fecha_operativa}
                  className="h-11 rounded-xl bg-primary-500 px-5 text-sm font-bold text-white shadow-lg shadow-[#5D87FF]/20 transition-all hover:bg-primary-600 disabled:opacity-50"
                >
                  Guardar corrección
                </button>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Estado
                  </label>
                  <select
                    value={weeklyEditor.estado}
                    onChange={(e) =>
                      setWeeklyEditor((prev) => ({ ...prev, estado: e.target.value }))
                    }
                    className={CONTROL}
                  >
                    <option value="presente">Presente</option>
                    <option value="tarde">Tarde</option>
                    <option value="ausente">Ausente</option>
                    <option value="franco">Franco</option>
                    <option value="justificado">Justificado</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Ingreso
                  </label>
                  <input
                    type="datetime-local"
                    value={weeklyEditor.ingreso_en}
                    onChange={(e) =>
                      setWeeklyEditor((prev) => ({
                        ...prev,
                        ingreso_en: e.target.value,
                      }))
                    }
                    className={CONTROL}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Salida
                  </label>
                  <input
                    type="datetime-local"
                    value={weeklyEditor.salida_en}
                    onChange={(e) =>
                      setWeeklyEditor((prev) => ({
                        ...prev,
                        salida_en: e.target.value,
                      }))
                    }
                    className={CONTROL}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-black uppercase tracking-wider text-gray-400">
                    Turno
                  </label>
                  <select
                    value={weeklyEditor.turno_id}
                    onChange={(e) =>
                      setWeeklyEditor((prev) => ({
                        ...prev,
                        turno_id: e.target.value,
                      }))
                    }
                    className={CONTROL}
                  >
                    {TURNOS.map((turno) => (
                      <option key={turno.value} value={turno.value}>
                        {turno.label}
                      </option>
                    ))}
                    <option value="manual">Manual</option>
                  </select>
                </div>
              </div>
              <textarea
                value={weeklyEditor.notas}
                onChange={(e) => setWeeklyEditor((prev) => ({ ...prev, notas: e.target.value }))}
                className={`${CONTROL} mt-3 h-20 py-3 resize-none`}
                placeholder="Notas de corrección o motivo"
              />
              {weeklyEditorDay ? (
                <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <div className="rounded-xl bg-primary-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                      Estado actual
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                      {weeklyEditorDay.estado || 'Sin registro'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Ingreso actual
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                      {weeklyEditorDay.ingreso_en
                        ? format(new Date(weeklyEditorDay.ingreso_en), 'HH:mm')
                        : '-'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-gray-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Salida actual
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                      {weeklyEditorDay.salida_en
                        ? format(new Date(weeklyEditorDay.salida_en), 'HH:mm')
                        : '-'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-warning-50 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-warning-600">
                      Tardanza
                    </p>
                    <p className="mt-1 text-sm font-black text-gray-900">
                      {weeklyEditorDay.minutos_tarde || 0} min
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

import { format } from 'date-fns';
import { CONTROL, fmt } from '../constants.js';

export function EquipoTab({
  attendanceSummary,
  turnoActual,
  saving,
  registrarAsistencia,
  attendanceForm,
  setAttendanceForm,
  currentAttendance,
  shiftMetrics,
  attendanceRange,
  setAttendanceRange,
  cargarAnaliticaAsistencia,
  attendanceAnalytics,
  goalForm,
  setGoalForm,
  guardarObjetivo,
  detail,
  marcarObjetivoCumplido,
  productCatalog,
  productConsumptionForm,
  setProductConsumptionForm,
  registrarConsumoProducto,
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h4 className="text-base font-bold text-gray-900">Asistencia del turno</h4>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-1">
                {attendanceSummary?.turno_actual_nombre || turnoActual || 'Sin turno'}
              </p>
            </div>
            <span className="px-3 py-1 rounded-full bg-primary-50 text-primary-500 text-[11px] font-bold">
              {attendanceSummary?.fecha_operativa || '-'}
            </span>
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => registrarAsistencia('presente')}
                disabled={saving}
                className="h-11 rounded-xl bg-success-50 text-success-700 text-sm font-bold hover:bg-success-100 transition-all disabled:opacity-50"
              >
                Marcar ingreso
              </button>
              <button
                onClick={() => registrarAsistencia('presente', true)}
                disabled={saving}
                className="h-11 rounded-xl bg-slate-100 text-slate-700 text-sm font-bold hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                Marcar salida
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => registrarAsistencia('tarde')}
                disabled={saving}
                className="h-11 rounded-xl bg-warning-50 text-warning-700 text-sm font-bold hover:bg-warning-100 transition-all disabled:opacity-50"
              >
                Llegó tarde
              </button>
              <button
                onClick={() => registrarAsistencia('ausente')}
                disabled={saving}
                className="h-11 rounded-xl bg-danger-50 text-danger-700 text-sm font-bold hover:bg-danger-100 transition-all disabled:opacity-50"
              >
                Ausente
              </button>
            </div>
            <textarea
              value={attendanceForm.notas}
              onChange={(e) => setAttendanceForm((prev) => ({ ...prev, notas: e.target.value }))}
              className={`${CONTROL} h-20 py-3 resize-none`}
              placeholder="Nota de asistencia o salida"
            />
            <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-2">
                Estado de hoy
              </p>
              {currentAttendance ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-800">
                    Estado: {currentAttendance.estado}
                  </p>
                  <p className="text-xs font-semibold text-gray-500">
                    Ingreso:{' '}
                    {currentAttendance.ingreso_en
                      ? format(new Date(currentAttendance.ingreso_en), 'dd/MM HH:mm')
                      : '-'}
                  </p>
                  <p className="text-xs font-semibold text-gray-500">
                    Salida:{' '}
                    {currentAttendance.salida_en
                      ? format(new Date(currentAttendance.salida_en), 'dd/MM HH:mm')
                      : '-'}
                  </p>
                  <p className="text-xs font-semibold text-gray-500">
                    Tardanza: {currentAttendance.minutos_tarde || 0} min
                  </p>
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-500">
                  Todavía no hay asistencia cargada para este turno.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <div className="flex items-center justify-between gap-3 mb-5">
            <h4 className="text-base font-bold text-gray-900">Equipo del turno actual</h4>
            <div className="flex gap-2">
              <input
                type="date"
                value={attendanceRange.desde}
                onChange={(e) => setAttendanceRange((prev) => ({ ...prev, desde: e.target.value }))}
                className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600"
              />
              <input
                type="date"
                value={attendanceRange.hasta}
                onChange={(e) => setAttendanceRange((prev) => ({ ...prev, hasta: e.target.value }))}
                className="h-10 rounded-xl border border-gray-200 px-3 text-xs font-semibold text-gray-600"
              />
              <button
                onClick={() =>
                  cargarAnaliticaAsistencia(attendanceRange.desde, attendanceRange.hasta)
                }
                className="h-10 px-3 rounded-xl bg-primary-500 text-white text-xs font-bold hover:bg-primary-600 transition-all"
              >
                Ver ranking
              </button>
            </div>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-xl border border-emerald-100 bg-success-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-success-600">
                Presentes
              </p>
              <p className="mt-1 text-2xl font-black text-success-700">{shiftMetrics.presentes}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-warning-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-warning-600">
                Tardanzas
              </p>
              <p className="mt-1 text-2xl font-black text-warning-700">{shiftMetrics.tardes}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-danger-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-danger-600">
                Ausentes
              </p>
              <p className="mt-1 text-2xl font-black text-danger-700">{shiftMetrics.ausentes}</p>
            </div>
            <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary-500">
                Mejor puntualidad
              </p>
              <p className="mt-1 truncate text-sm font-black text-gray-900">
                {shiftMetrics.puntualTop?.personal_nombre || 'Sin datos'}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-primary-500">
                {shiftMetrics.puntualTop
                  ? `${shiftMetrics.puntualTop.puntualidadPct}% puntualidad`
                  : 'Tomá asistencia para verlo'}
              </p>
            </div>
          </div>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {shiftMetrics.total ? (
              (attendanceSummary?.items || []).map((item) => (
                <div
                  key={`${item.personal_id}-${item.turno_id}`}
                  className="rounded-xl border border-gray-100 p-4 bg-gray-50/60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{item.personal_nombre}</p>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                        {item.rol_operativo}
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${item.estado === 'ausente' ? 'bg-danger-100 text-danger-700' : item.estado === 'tarde' ? 'bg-warning-100 text-warning-700' : 'bg-success-100 text-success-700'}`}
                    >
                      {item.estado}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm font-semibold text-gray-400">
                Aún no hay asistencia tomada para este turno.
              </div>
            )}
          </div>
          <div className="mt-6 border-t border-gray-100 pt-5">
            <p className="text-[11px] font-black uppercase tracking-widest text-gray-400 mb-3">
              Ranking asistencia y puntualidad
            </p>
            <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
              {(attendanceAnalytics.ranking || []).slice(0, 6).map((item, index) => (
                <div
                  key={item.personal_id}
                  className="rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {index + 1}. {item.personal_nombre}
                    </p>
                    <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                      {item.rol_operativo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-primary-500">
                      {item.asistenciaPct}% asistencia
                    </p>
                    <p className="text-[11px] font-semibold text-success-600">
                      {item.puntualidadPct}% puntualidad
                    </p>
                  </div>
                </div>
              ))}
              {!(attendanceAnalytics.ranking || []).length ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm font-semibold text-gray-400">
                  No hay datos de asistencia en ese rango.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <h4 className="text-base font-bold text-gray-900 mb-5">Metas y premios</h4>
          <div className="grid grid-cols-2 gap-3">
            <input
              value={goalForm.fecha_desde}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, fecha_desde: e.target.value }))}
              type="date"
              className={CONTROL}
            />
            <input
              value={goalForm.fecha_hasta}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, fecha_hasta: e.target.value }))}
              type="date"
              className={CONTROL}
            />
            <input
              value={goalForm.objetivo}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, objetivo: e.target.value }))}
              className={CONTROL}
              placeholder="Meta"
            />
            <input
              value={goalForm.progreso}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, progreso: e.target.value }))}
              className={CONTROL}
              placeholder="Progreso actual"
            />
            <input
              value={goalForm.premio_puntos}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, premio_puntos: e.target.value }))}
              className={CONTROL}
              placeholder="Premio en puntos"
            />
            <input
              value={goalForm.premio_monto}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, premio_monto: e.target.value }))}
              className={CONTROL}
              placeholder="Premio en $"
            />
          </div>
          <textarea
            value={goalForm.notas}
            onChange={(e) => setGoalForm((prev) => ({ ...prev, notas: e.target.value }))}
            className={`${CONTROL} mt-3 h-20 py-3 resize-none`}
            placeholder="Notas de objetivo o bono"
          />
          <button
            onClick={guardarObjetivo}
            disabled={saving}
            className="mt-4 h-11 px-5 rounded-xl bg-primary-500 text-white text-sm font-bold shadow-lg shadow-[#5D87FF]/20 hover:bg-primary-600 transition-all disabled:opacity-50"
          >
            Guardar meta
          </button>
          <div className="mt-5 space-y-3">
            {(detail.objetivos || []).slice(0, 6).map((objetivo) => (
              <div key={objetivo.id} className="rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{objetivo.tipo}</p>
                    <p className="text-xs font-semibold text-gray-500">
                      {objetivo.progreso} / {objetivo.objetivo} {objetivo.unidad}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-primary-500">
                      {objetivo.premio_puntos || 0} pts
                    </span>
                    {Number(objetivo.cumplido || 0) === 1 ? (
                      <p className="mt-1 text-[11px] font-bold text-success-600 uppercase">
                        Cumplido
                      </p>
                    ) : (
                      <button
                        onClick={() => marcarObjetivoCumplido(objetivo.id, objetivo.objetivo)}
                        className="mt-1 text-[11px] font-bold text-warning-600 uppercase hover:text-warning-700"
                      >
                        Marcar cumplido
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100">
          <h4 className="text-base font-bold text-gray-900 mb-5">
            Consumo con descuento de empleado
          </h4>
          <div className="space-y-3">
            <select
              value={productConsumptionForm.producto_id}
              onChange={(e) =>
                setProductConsumptionForm((prev) => ({
                  ...prev,
                  producto_id: e.target.value,
                }))
              }
              className={CONTROL}
            >
              <option value="">Elegir producto</option>
              {productCatalog.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.nombre} - {fmt(product.precio)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={productConsumptionForm.cantidad}
                onChange={(e) =>
                  setProductConsumptionForm((prev) => ({
                    ...prev,
                    cantidad: e.target.value,
                  }))
                }
                className={CONTROL}
                placeholder="Cantidad"
              />
              <input
                value={productConsumptionForm.descuento_empleado_pct}
                onChange={(e) =>
                  setProductConsumptionForm((prev) => ({
                    ...prev,
                    descuento_empleado_pct: e.target.value,
                  }))
                }
                className={CONTROL}
                placeholder="% descuento"
              />
            </div>
            <textarea
              value={productConsumptionForm.descripcion}
              onChange={(e) =>
                setProductConsumptionForm((prev) => ({
                  ...prev,
                  descripcion: e.target.value,
                }))
              }
              className={`${CONTROL} h-20 py-3 resize-none`}
              placeholder="Observación del consumo"
            />
            <button
              onClick={registrarConsumoProducto}
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-primary-500 text-white text-sm font-bold hover:bg-primary-600 transition-all disabled:opacity-50"
            >
              Cargar consumo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

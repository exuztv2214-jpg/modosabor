import { format, isValid } from 'date-fns';
import { Check, LogIn, LogOut, Clock3, UserX, Target, Trophy } from 'lucide-react';

import { BRAND, STROKE } from '../../../lib/theme.js';
import { Card, Empty, Pill } from '../components.jsx';
import { CONTROL, LABEL, SELECT, estadoAsistencia, fmt, rolLabel } from '../constants.js';

/** `format` sobre una fecha inválida tira excepción y tumba la pestaña. */
function hora(valor, patron = 'dd/MM HH:mm') {
  if (!valor) return '—';
  const d = new Date(valor);
  return isValid(d) ? format(d, patron) : '—';
}

/** Campo con etiqueta visible.
 *
 *  El formulario de metas tenía seis campos identificados sólo por
 *  placeholder — incluidas dos fechas idénticas. Apenas escribías algo, el
 *  placeholder desaparecía y ya no había forma de saber cuál era cuál.
 */
function Campo({ label, children }) {
  return (
    <label className="block">
      <span className={LABEL}>{label}</span>
      {children}
    </label>
  );
}

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
  const estadoHoy = currentAttendance?.estado ? estadoAsistencia(currentAttendance.estado) : null;
  const yaFicho = Boolean(currentAttendance?.ingreso_en);
  const yaSalio = Boolean(currentAttendance?.salida_en);
  const objetivos = detail.objetivos || [];
  const ranking = attendanceAnalytics.ranking || [];
  const roster = attendanceSummary?.items || [];

  const setGoal = (campo) => (e) => setGoalForm((prev) => ({ ...prev, [campo]: e.target.value }));
  const setConsumo = (campo) => (e) =>
    setProductConsumptionForm((prev) => ({ ...prev, [campo]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card
          title="Marcar asistencia"
          helper={attendanceSummary?.turno_actual_nombre || turnoActual || 'Sin turno abierto'}
          action={
            <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
              {attendanceSummary?.fecha_operativa || '—'}
            </span>
          }
        >
          <div className="space-y-3">
            {/* Los cuatro botones tenían el mismo peso visual y ninguno
                indicaba en qué estado está la persona ahora. Ahora el que
                corresponde al próximo paso se destaca y los ya hechos se
                deshabilitan: no se puede marcar ingreso dos veces. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => registrarAsistencia('presente')}
                disabled={saving || yaFicho}
                style={!yaFicho ? { background: BRAND } : undefined}
                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl text-[13px] font-semibold transition disabled:opacity-40 ${
                  yaFicho ? 'bg-gray-100 text-gray-500' : 'text-white hover:brightness-110'
                }`}
              >
                <LogIn size={15} strokeWidth={STROKE} />
                {yaFicho ? 'Ingreso marcado' : 'Marcar ingreso'}
              </button>
              <button
                type="button"
                onClick={() => registrarAsistencia('presente', true)}
                disabled={saving || !yaFicho || yaSalio}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
              >
                <LogOut size={15} strokeWidth={STROKE} />
                {yaSalio ? 'Salida marcada' : 'Marcar salida'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => registrarAsistencia('tarde')}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-amber-50 text-[13px] font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-40"
              >
                <Clock3 size={15} strokeWidth={STROKE} />
                Llegó tarde
              </button>
              <button
                type="button"
                onClick={() => registrarAsistencia('ausente')}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-50 text-[13px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40"
              >
                <UserX size={15} strokeWidth={STROKE} />
                Ausente
              </button>
            </div>

            <textarea
              value={attendanceForm.notas}
              onChange={(e) => setAttendanceForm((prev) => ({ ...prev, notas: e.target.value }))}
              className={`${CONTROL} h-20 resize-none py-2.5`}
              placeholder="Nota (opcional): motivo de la tardanza, cambio de turno…"
            />

            <div className="rounded-xl bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-gray-500">Estado de hoy</p>
                {estadoHoy ? (
                  <Pill label={estadoHoy.label} bg={estadoHoy.bg} fg={estadoHoy.fg} />
                ) : null}
              </div>

              {currentAttendance ? (
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[11px] text-gray-400">Ingreso</p>
                    <p className="text-[13px] font-medium tabular-nums text-gray-900">
                      {hora(currentAttendance.ingreso_en, 'HH:mm')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Salida</p>
                    <p className="text-[13px] font-medium tabular-nums text-gray-900">
                      {hora(currentAttendance.salida_en, 'HH:mm')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-400">Tardanza</p>
                    <p
                      className="text-[13px] font-medium tabular-nums"
                      style={{
                        color: Number(currentAttendance.minutos_tarde || 0) > 0 ? BRAND : '#111827',
                      }}
                    >
                      {currentAttendance.minutos_tarde || 0} min
                    </p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-gray-400">
                  Todavía no se marcó nada en este turno.
                </p>
              )}
            </div>
          </div>
        </Card>

        <Card title="El turno de hoy" helper="Quién está y quién falta">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
              <p className="text-[12px] text-emerald-800">Presentes</p>
              <p className="mt-0.5 text-[20px] font-bold tabular-nums text-emerald-900">
                {shiftMetrics.presentes}
              </p>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: shiftMetrics.tardes > 0 ? '#FDF3D3' : '#F9FAFB' }}
            >
              <p
                className="text-[12px]"
                style={{ color: shiftMetrics.tardes > 0 ? '#95661A' : '#6B7280' }}
              >
                Tarde
              </p>
              <p className="mt-0.5 text-[20px] font-bold tabular-nums text-gray-900">
                {shiftMetrics.tardes}
              </p>
            </div>
            <div
              className="rounded-xl px-3 py-2.5"
              style={{ background: shiftMetrics.ausentes > 0 ? '#FEF2F2' : '#F9FAFB' }}
            >
              <p
                className="text-[12px]"
                style={{ color: shiftMetrics.ausentes > 0 ? '#9E141E' : '#6B7280' }}
              >
                Ausentes
              </p>
              <p
                className="mt-0.5 text-[20px] font-bold tabular-nums"
                style={{ color: shiftMetrics.ausentes > 0 ? BRAND : '#111827' }}
              >
                {shiftMetrics.ausentes}
              </p>
            </div>
          </div>

          <div className="custom-scrollbar max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
            {roster.length === 0 ? (
              <Empty
                title="Nadie fichó todavía"
                description="A medida que el equipo marque ingreso vas a verlo acá."
              />
            ) : (
              roster.map((item) => {
                const tono = estadoAsistencia(item.estado);
                return (
                  <div
                    key={`${item.personal_id}-${item.turno_id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-gray-900">
                        {item.personal_nombre}
                      </p>
                      <p className="text-[11px] text-gray-500">{rolLabel(item.rol_operativo)}</p>
                    </div>
                    <Pill label={tono.label} bg={tono.bg} fg={tono.fg} />
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      <Card
        title="Ranking de asistencia"
        helper="Quién viene y quién llega a horario, en el rango elegido"
        action={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <input
              type="date"
              value={attendanceRange.desde}
              onChange={(e) => setAttendanceRange((prev) => ({ ...prev, desde: e.target.value }))}
              className="h-9 rounded-xl border border-gray-200 px-2.5 text-[12px] text-gray-700 outline-none focus:border-gray-400"
            />
            <span className="text-[12px] text-gray-400">a</span>
            <input
              type="date"
              value={attendanceRange.hasta}
              onChange={(e) => setAttendanceRange((prev) => ({ ...prev, hasta: e.target.value }))}
              className="h-9 rounded-xl border border-gray-200 px-2.5 text-[12px] text-gray-700 outline-none focus:border-gray-400"
            />
            <button
              type="button"
              onClick={() =>
                cargarAnaliticaAsistencia(attendanceRange.desde, attendanceRange.hasta)
              }
              className="h-9 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              Ver
            </button>
          </div>
        }
      >
        {ranking.length === 0 ? (
          <Empty
            title="Sin datos en ese rango"
            description="Elegí otras fechas o tomá asistencia para empezar a medir."
          />
        ) : (
          <div className="space-y-1.5">
            {ranking.map((item, index) => {
              const puntual = Number(item.puntualidadPct || 0);
              return (
                <div
                  key={item.personal_id}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[12px] font-semibold text-gray-600">
                    {index + 1}
                  </span>
                  {index === 0 ? (
                    <Trophy
                      size={14}
                      strokeWidth={STROKE}
                      className="shrink-0 text-amber-500"
                      title="Mejor del rango"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-gray-900">
                      {item.personal_nombre}
                    </p>
                    <p className="text-[11px] text-gray-500">{rolLabel(item.rol_operativo)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold tabular-nums text-gray-900">
                      {item.asistenciaPct}%
                      <span className="ml-1 text-[11px] font-normal text-gray-400">asistencia</span>
                    </p>
                    <p
                      className="text-[11px] tabular-nums"
                      style={{ color: puntual < 70 ? BRAND : '#6B7280' }}
                    >
                      {puntual}% puntualidad
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Metas y premios" helper="Objetivos con fecha y recompensa">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Desde">
              <input
                type="date"
                value={goalForm.fecha_desde}
                onChange={setGoal('fecha_desde')}
                className={CONTROL}
              />
            </Campo>
            <Campo label="Hasta">
              <input
                type="date"
                value={goalForm.fecha_hasta}
                onChange={setGoal('fecha_hasta')}
                className={CONTROL}
              />
            </Campo>
            <div className="col-span-2">
              <Campo label="Meta">
                <input
                  value={goalForm.objetivo}
                  onChange={setGoal('objetivo')}
                  className={CONTROL}
                  placeholder="Ej: vender 50 postres en la semana"
                />
              </Campo>
            </div>
            <Campo label="Progreso actual">
              <input
                value={goalForm.progreso}
                onChange={setGoal('progreso')}
                className={CONTROL}
                placeholder="0"
              />
            </Campo>
            <Campo label="Unidad">
              <input
                value={goalForm.unidad}
                onChange={setGoal('unidad')}
                className={CONTROL}
                placeholder="u"
              />
            </Campo>
            <Campo label="Premio en puntos">
              <input
                value={goalForm.premio_puntos}
                onChange={setGoal('premio_puntos')}
                className={CONTROL}
                placeholder="0"
              />
            </Campo>
            <Campo label="Premio en pesos">
              <input
                value={goalForm.premio_monto}
                onChange={setGoal('premio_monto')}
                className={CONTROL}
                placeholder="0"
              />
            </Campo>
          </div>

          <textarea
            value={goalForm.notas}
            onChange={setGoal('notas')}
            className={`${CONTROL} mt-3 h-20 resize-none py-2.5`}
            placeholder="Notas del objetivo o del bono"
          />

          <button
            type="button"
            onClick={guardarObjetivo}
            disabled={saving}
            style={{ background: BRAND }}
            className="mt-3 inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            <Target size={15} strokeWidth={STROKE} />
            Guardar meta
          </button>

          <div className="mt-4 space-y-1.5">
            {objetivos.length === 0 ? (
              <Empty
                title="Sin metas cargadas"
                description="Una meta con premio es la forma más simple de mover un número puntual."
              />
            ) : (
              objetivos.slice(0, 6).map((objetivo) => {
                const cumplido = Number(objetivo.cumplido || 0) === 1;
                const meta = Number(objetivo.objetivo || 0);
                const hecho = Number(objetivo.progreso || 0);
                const pct = meta > 0 ? Math.min(100, Math.round((hecho / meta) * 100)) : 0;

                return (
                  <div key={objetivo.id} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {/* El título era `objetivo.tipo` ("general"), y la meta
                            real quedaba escondida en la línea de progreso. */}
                        <p className="truncate text-[13px] font-medium text-gray-900">
                          {objetivo.objetivo || objetivo.tipo}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {hecho} de {meta} {objetivo.unidad || 'u'}
                          {objetivo.premio_puntos ? ` · ${objetivo.premio_puntos} pts` : ''}
                          {Number(objetivo.premio_monto || 0) > 0
                            ? ` · ${fmt(objetivo.premio_monto)}`
                            : ''}
                        </p>
                      </div>

                      {cumplido ? (
                        <Pill label="Cumplida" bg="#E7F5EF" fg="#0F6E56" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => marcarObjetivoCumplido(objetivo.id, objetivo.objetivo)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 transition hover:text-emerald-700"
                        >
                          <Check size={12} strokeWidth={STROKE} />
                          Cumplida
                        </button>
                      )}
                    </div>

                    {/* Se mostraba "3 / 50" y nada más. Una barra dice de un
                        vistazo si la meta está lejos o al alcance. */}
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${cumplido ? 100 : pct}%`,
                          background: cumplido ? '#10B981' : BRAND,
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card
          title="Consumo del empleado"
          helper="Lo que se lleva con descuento se descuenta del sueldo"
        >
          {productCatalog.length === 0 ? (
            <Empty
              title="No hay productos disponibles"
              description="Cargá productos en el catálogo para poder registrar consumo interno."
            />
          ) : (
            <div className="space-y-3">
              <Campo label="Producto">
                <select
                  value={productConsumptionForm.producto_id}
                  onChange={setConsumo('producto_id')}
                  className={SELECT}
                >
                  <option value="">Elegir producto…</option>
                  {productCatalog.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.nombre} — {fmt(product.precio)}
                    </option>
                  ))}
                </select>
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Cantidad">
                  <input
                    value={productConsumptionForm.cantidad}
                    onChange={setConsumo('cantidad')}
                    className={CONTROL}
                    inputMode="decimal"
                    placeholder="1"
                  />
                </Campo>
                <Campo label="Descuento (%)">
                  <input
                    value={productConsumptionForm.descuento_empleado_pct}
                    onChange={setConsumo('descuento_empleado_pct')}
                    className={CONTROL}
                    inputMode="numeric"
                    placeholder="20"
                  />
                </Campo>
              </div>

              <Campo label="Observación">
                <textarea
                  value={productConsumptionForm.descripcion}
                  onChange={setConsumo('descripcion')}
                  className={`${CONTROL} h-20 resize-none py-2.5`}
                  placeholder="Almuerzo del turno, etc."
                />
              </Campo>

              <button
                type="button"
                onClick={registrarConsumoProducto}
                disabled={saving || !productConsumptionForm.producto_id}
                className="inline-flex h-11 items-center rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
              >
                Cargar consumo
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  QrCode,
  RefreshCw,
  TimerReset,
  UserRound,
} from 'lucide-react';

import api from '../lib/api.js';

const PIN_ACTIONS = [
  {
    id: 'ingreso',
    label: 'Marcar ingreso',
    icon: LogIn,
    tone: 'bg-emerald-500 hover:bg-emerald-600',
  },
  { id: 'salida', label: 'Marcar salida', icon: LogOut, tone: 'bg-rose-500 hover:bg-rose-600' },
];

/*
  Las fechas de la base llegan a veces como "2026-08-06 09:15:00" (espacio en
  lugar de "T"). Safari no parsea ese formato y `new Date()` devuelve Invalid
  Date, así que la hora de ingreso del empleado se mostraba como "Invalid Date"
  en el iPhone del encargado. Se normaliza y se valida antes de formatear.
*/
function horaFichada(valor) {
  if (!valor) return '-';
  const fecha = new Date(String(valor).replace(' ', 'T'));
  if (!Number.isFinite(fecha.getTime())) return '-';
  return fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ url, nombre }) {
  if (url) {
    return (
      <img
        src={url}
        alt={nombre}
        className="h-14 w-14 rounded-2xl object-cover shadow-sm border border-gray-100"
      />
    );
  }
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
      <UserRound size={24} />
    </div>
  );
}

export default function PersonalClock() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roster, setRoster] = useState({ items: [] });
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [notas, setNotas] = useState('');

  const preselected = useMemo(() => {
    if (!selected && roster?.token_match) {
      return roster.items.find((item) => Number(item.id) === Number(roster.token_match)) || null;
    }
    return selected;
  }, [selected, roster]);

  const loadRoster = useCallback(
    async (keepSelected = false) => {
      setLoading(true);
      try {
        const query = token ? `?token=${encodeURIComponent(token)}` : '';
        const data = await api.get(`/personal/clock/board${query}`);
        setRoster(data || { items: [] });
        if (!keepSelected) {
          const initial =
            data?.items?.find((item) => Number(item.id) === Number(data?.token_match)) || null;
          setSelected(initial);
        }
      } catch (error) {
        toast.error(error?.error || 'No se pudo cargar el reloj del personal');
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  const currentEmployee = preselected;

  const doMark = async (action) => {
    if (!currentEmployee) return toast.error('Elegí un empleado');
    if (!token && pin.trim().length < 4) return toast.error('Ingresá el PIN');
    setSaving(true);
    try {
      const data = await api.post('/personal/clock/mark', {
        personal_id: currentEmployee.id,
        pin,
        token: token || '',
        action,
        notas,
      });
      setRoster(data?.roster || roster);
      setPin('');
      setNotas('');
      const refreshed =
        data?.roster?.items?.find((item) => Number(item.id) === Number(currentEmployee.id)) ||
        currentEmployee;
      setSelected(refreshed);
      toast.success(action === 'salida' ? 'Salida registrada' : 'Asistencia registrada');
    } catch (error) {
      toast.error(error?.error || 'No se pudo registrar la fichada');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold text-brand-500">Reloj de personal</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">
                Entrada y salida del equipo
              </h1>
            </div>
            <button
              type="button"
              onClick={() => loadRoster(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-gray-600">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
              Turno: {roster?.turno_actual_nombre || 'Sin turno activo'}
            </span>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
              Fecha operativa: {roster?.fecha_operativa || '-'}
            </span>
            {token ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-700">
                Acceso individual por QR
              </span>
            ) : (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-700">
                Dispositivo compartido con PIN
              </span>
            )}
          </div>
          {!roster?.turno_actual_id ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
              Ahora mismo no hay un turno operativo corriendo. El reloj igual queda visible para
              revisar el equipo, pero la fichada se habilita cuando entra un turno activo.
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.95fr]">
          <section className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <TimerReset size={18} className="text-brand-500" />
              <h2 className="text-sm font-semibold text-gray-500">Equipo del turno</h2>
            </div>
            {loading ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <RefreshCw size={30} className="animate-spin text-brand-500" />
              </div>
            ) : !(roster?.items || []).length ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-gray-50 text-center text-sm font-semibold text-gray-500">
                No hay personal activo para este turno todavía.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(roster?.items || []).map((item) => {
                  const active = Number(currentEmployee?.id) === Number(item.id);
                  const state = item?.attendance?.estado || 'sin fichar';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item)}
                      className={`rounded-[24px] border p-4 text-left transition ${active ? 'border-brand-500 bg-brand-50 shadow-sm' : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar url={item.avatar_url} nombre={item.nombre} />
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold text-gray-900">
                            {item.nombre}
                          </p>
                          <p className="text-[11px] font-semibold text-gray-400">
                            {item.rol_operativo}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-gray-500">
                            {item.turno_preferido || 'Sin turno'}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 border border-gray-100">
                          {state}
                        </span>
                        {item?.attendance?.ingreso_en ? (
                          <span className="text-[11px] font-semibold text-gray-500">
                            Ingreso {horaFichada(item.attendance.ingreso_en)}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="rounded-[28px] border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              {token ? (
                <QrCode size={18} className="text-emerald-600" />
              ) : (
                <KeyRound size={18} className="text-amber-500" />
              )}
              <h2 className="text-sm font-semibold text-gray-500">
                {token ? 'Fichada individual' : 'Confirmación con PIN'}
              </h2>
            </div>

            {!currentEmployee ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 text-center text-sm font-semibold text-gray-400">
                Elegí un empleado para registrar la asistencia.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-[24px] border border-gray-100 bg-gray-50 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar url={currentEmployee.avatar_url} nombre={currentEmployee.nombre} />
                    <div>
                      <p className="text-xl font-semibold text-gray-900">
                        {currentEmployee.nombre}
                      </p>
                      <p className="text-xs font-semibold text-gray-400">
                        {currentEmployee.rol_operativo}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-3 border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-400">Estado</p>
                      <p className="mt-1 font-bold text-gray-900">
                        {currentEmployee?.attendance?.estado || 'Sin fichar'}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-3 border border-gray-100">
                      <p className="text-[11px] font-semibold text-gray-400">Último ingreso</p>
                      <p className="mt-1 font-bold text-gray-900">
                        {horaFichada(currentEmployee?.attendance?.ingreso_en)}
                      </p>
                    </div>
                  </div>
                </div>

                {!token ? (
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="h-14 w-full rounded-2xl border border-gray-200 bg-white px-4 text-center text-2xl font-semibold tracking-[0.5em] text-gray-900 outline-none placeholder:tracking-normal placeholder:text-gray-300"
                    placeholder="PIN"
                    inputMode="numeric"
                  />
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                    Este acceso viene desde un QR individual. No hace falta escribir PIN.
                  </div>
                )}

                <textarea
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  className="min-h-[96px] w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 outline-none placeholder:text-gray-400"
                  placeholder="Nota opcional: llegó con retraso, cambio de turno, etc."
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  {PIN_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        disabled={saving}
                        onClick={() => doMark(action.id)}
                        className={`inline-flex min-h-[92px] flex-col items-center justify-center gap-2 rounded-[24px] ${action.tone} px-4 text-center text-white shadow-sm transition disabled:opacity-60`}
                      >
                        <Icon size={22} />
                        <span className="text-xs font-semibold">{action.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-[24px] border border-gray-100 bg-brand-50/60 p-4">
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    Recomendación práctica
                  </div>
                  <p className="text-sm font-medium leading-6 text-gray-600">
                    En el celular del local usen esta pantalla con PIN. Si más adelante querés
                    tarjetas o credenciales individuales, ya queda listo el acceso por QR único de
                    cada empleado.
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

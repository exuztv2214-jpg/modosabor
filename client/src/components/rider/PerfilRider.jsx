import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Package,
  DollarSign,
  Flame,
  Trophy,
  Calendar,
  LogOut,
  Award,
  SlidersHorizontal,
  Phone,
  Bike,
  Lock,
  Check,
  UserRound,
} from 'lucide-react';

const fmtPesos = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

/**
 * Niveles por entregas históricas.
 *
 * Los cortes están pensados para un rider interno de un local chico:
 * con ~10 entregas por turno, Bronce se pasa en la primera semana,
 * Plata en el primer mes y Oro a los ~4 meses. Si fueran los cortes de
 * una app masiva (miles de entregas) nadie llegaría nunca y el sistema
 * no motivaría nada.
 */
const NIVELES = [
  { key: 'bronce', label: 'Bronce', emoji: '🥉', min: 0, max: 50, color: '#b45309', bg: '#fef3c7' },
  { key: 'plata', label: 'Plata', emoji: '🥈', min: 50, max: 200, color: '#475569', bg: '#f1f5f9' },
  {
    key: 'oro',
    label: 'Oro',
    emoji: '🥇',
    min: 200,
    max: Infinity,
    color: '#a16207',
    bg: '#fef9c3',
  },
];

function nivelPorEntregas(entregas) {
  const n = Number(entregas) || 0;
  const nivel = NIVELES.find((x) => n >= x.min && n < x.max) || NIVELES[NIVELES.length - 1];
  const siguiente = NIVELES[NIVELES.indexOf(nivel) + 1] || null;
  const progreso = siguiente
    ? Math.min(100, ((n - nivel.min) / (siguiente.min - nivel.min)) * 100)
    : 100;
  return { nivel, siguiente, progreso, faltan: siguiente ? Math.max(0, siguiente.min - n) : 0 };
}

function StatBox({ icon: Icon, label, value, tone = 'text-gray-600' }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-3 text-center">
      <Icon size={16} className={`mx-auto ${tone}`} strokeWidth={2.6} />
      <p className="mt-1.5 text-lg font-bold tabular-nums text-gray-900">{value}</p>
      <p className="mt-0.5 text-[12px] font-medium text-gray-400">{label}</p>
    </div>
  );
}

/**
 * Pantalla de perfil del rider.
 *
 * Props:
 *   repartidor  datos del rider (nombre, codigo)
 *   stats       respuesta de /repartidores/:id/rider/:code/stats
 *   onLogout    fn
 *   onCambiarRider fn — wipe completo del dispositivo
 */
export default function PerfilRider({
  repartidor,
  stats,
  onLogout,
  onCambiarRider,
  preferencias,
  onCambiarPreferencia,
  perfil,
  onGuardarPerfil,
  guardandoPerfil = false,
}) {
  const [telefono, setTelefono] = useState(perfil?.telefono || '');
  const [vehiculo, setVehiculo] = useState(perfil?.vehiculo || '');

  // Cuando llegan los datos del servidor se cargan los campos, salvo que el
  // rider ya haya empezado a escribir.
  useEffect(() => {
    setTelefono(perfil?.telefono || '');
    setVehiculo(perfil?.vehiculo || '');
  }, [perfil?.telefono, perfil?.vehiculo]);

  const hayCambios = telefono !== (perfil?.telefono || '') || vehiculo !== (perfil?.vehiculo || '');
  const historico = stats?.historico || { entregas: 0, facturado: 0 };
  const mes = stats?.mes || { entregas: 0, facturado: 0 };
  const { nivel, siguiente, progreso, faltan } = nivelPorEntregas(historico.entregas);
  const inicial = String(repartidor?.nombre || '?')
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="space-y-4">
      {/* ── Identidad + nivel ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="overflow-hidden rounded-[28px] bg-white shadow-sm"
      >
        <div
          className="px-5 pb-6 pt-6 text-center text-white"
          style={{ background: 'linear-gradient(135deg,#dc1f2d,#b91c1c)' }}
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/20 text-3xl font-bold backdrop-blur">
            {inicial}
          </div>
          <h2 className="mt-3 text-xl font-bold leading-tight">
            {repartidor?.nombre || 'Repartidor'}
          </h2>
          <p className="mt-0.5 text-[12px] font-medium text-white/70">Rider · Modo Sabor</p>
        </div>

        {/* Nivel actual y progreso al siguiente */}
        <div className="px-5 py-5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl"
              style={{ background: nivel.bg }}
            >
              {nivel.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold" style={{ color: nivel.color }}>
                Nivel {nivel.label}
              </p>
              <p className="text-[12px] text-gray-400">{historico.entregas} entregas en total</p>
            </div>
          </div>

          {siguiente && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progreso}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: nivel.color }}
                />
              </div>
              <p className="mt-2 text-[13px] font-bold text-gray-500">
                Te faltan <b>{faltan}</b> entregas para {siguiente.emoji} {siguiente.label}
              </p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Este mes ── */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={16} className="text-gray-700" />
          <h3 className="text-[14px] font-semibold text-gray-900">Este mes</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatBox icon={Package} label="Entregas" value={mes.entregas} tone="text-gray-700" />
          <StatBox
            icon={DollarSign}
            label="Cobrado"
            value={fmtPesos(mes.facturado)}
            tone="text-emerald-700"
          />
        </div>
      </section>

      {/* ── Marcas personales ── */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Award size={16} className="text-amber-600" />
          <h3 className="text-[14px] font-semibold text-gray-900">Tus marcas</h3>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatBox
            icon={Flame}
            label="Racha"
            value={`${stats?.racha || 0}d`}
            tone="text-amber-600"
          />
          <StatBox
            icon={Trophy}
            label="Mejor día"
            value={stats?.mejorDia?.entregas || 0}
            tone="text-amber-600"
          />
          <StatBox
            icon={DollarSign}
            label="Histórico"
            value={fmtPesos(historico.facturado)}
            tone="text-emerald-600"
          />
        </div>
        {stats?.mejorDia?.fecha && (
          <p className="mt-3 text-center text-[13px] font-bold text-gray-400">
            Tu mejor jornada fue el {stats.mejorDia.fecha} con {stats.mejorDia.entregas} entregas
          </p>
        )}
      </section>

      {/*
        ── Mis datos ─────────────────────────────────────────────────────────

        El nombre va bloqueado a propósito: sale del legajo con el que se
        liquida y **es lo que ve el cliente** en la pantalla de seguimiento. Si
        el rider pudiera cambiarlo, un día aparece un apodo en el seguimiento
        de alguien y encima se desincroniza de Personal.

        El teléfono y el vehículo sí los edita: son datos operativos que él
        conoce mejor que nadie —cambió de moto, cambió de número— y no tocan la
        liquidación. El servidor los vuelve a validar y deja auditoría.
      */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <UserRound size={16} className="text-gray-700" />
          <h3 className="text-[14px] font-semibold text-gray-900">Mis datos</h3>
        </div>

        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-gray-400">Nombre</p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-gray-900">
              {perfil?.nombre || repartidor?.nombre || '—'}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-gray-400">
            <Lock size={13} />
            Lo cambia el local
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="rider-telefono"
              className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-gray-600"
            >
              <Phone size={13} />
              Mi teléfono
            </label>
            <input
              id="rider-telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 3815 12-3456"
              className="h-12 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 text-[15px] font-medium text-gray-900 outline-none transition focus:border-[#dc1f2d] focus:bg-white"
            />
          </div>

          <div>
            <label
              htmlFor="rider-vehiculo"
              className="mb-1.5 flex items-center gap-2 text-[13px] font-medium text-gray-600"
            >
              <Bike size={13} />
              Mi vehículo
            </label>
            <input
              id="rider-vehiculo"
              type="text"
              value={vehiculo}
              onChange={(e) => setVehiculo(e.target.value)}
              placeholder="Ej: Moto roja 110"
              className="h-12 w-full rounded-2xl border-2 border-gray-100 bg-gray-50 px-4 text-[15px] font-medium text-gray-900 outline-none transition focus:border-[#dc1f2d] focus:bg-white"
            />
          </div>
        </div>

        {/* El botón sólo aparece si hay algo para guardar: sin cambios no hay
            nada que confirmar y un botón siempre activo invita a tocarlo al
            pedo. */}
        {hayCambios ? (
          <button
            type="button"
            disabled={guardandoPerfil}
            onClick={() => onGuardarPerfil?.({ telefono, vehiculo })}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-60"
            style={{ background: '#dc1f2d' }}
          >
            <Check size={16} strokeWidth={2.5} />
            {guardandoPerfil ? 'Guardando...' : 'Guardar cambios'}
          </button>
        ) : null}
      </section>

      {/*
        ── Preferencias ──────────────────────────────────────────────────────

        Son del rider, no del legajo: cómo quiere que la app le avise y de qué
        tamaño quiere la letra. Antes estaba clavado en el código —sonaba
        siempre, nunca hablaba— y no se podía cambiar. Un repartidor con casco
        quiere la voz; otro que reparte de noche capaz prefiere sólo vibración.

        No se sincroniza con el servidor: es de este celular.
      */}
      <section className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-gray-700" />
          <h3 className="text-[14px] font-semibold text-gray-900">Cómo quiero la app</h3>
        </div>

        <div className="divide-y divide-gray-100">
          {[
            {
              clave: 'sonido',
              titulo: 'Sonido al entrar un pedido',
              detalle: 'Un aviso corto cuando te asignan uno nuevo',
            },
            {
              clave: 'voz',
              titulo: 'Que lo diga en voz alta',
              detalle: 'Útil si andás con casco o guantes',
            },
            {
              clave: 'vibracion',
              titulo: 'Vibración',
              detalle: 'Cada acción confirma con una vibración distinta',
            },
            {
              clave: 'letraGrande',
              titulo: 'Letra más grande',
              detalle: 'Para leer de un vistazo con sol',
            },
          ].map(({ clave, titulo, detalle }) => {
            const activo = Boolean(preferencias?.[clave]);
            return (
              <button
                key={clave}
                type="button"
                onClick={() => onCambiarPreferencia?.(clave, !activo)}
                className="flex w-full items-center justify-between gap-4 py-3.5 text-left"
                aria-pressed={activo}
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-medium text-gray-900">{titulo}</span>
                  <span className="mt-0.5 block text-[13px] text-gray-500">{detalle}</span>
                </span>

                {/* Interruptor: el estado se lee por posición y color, no por texto. */}
                <span
                  className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                    activo ? 'bg-emerald-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      activo ? 'left-6' : 'left-1'
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Sesión ── */}
      <section className="space-y-2">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white text-[14px] font-semibold text-gray-600 active:scale-[0.98]"
        >
          <LogOut size={15} /> Cerrar sesión
        </button>
        <button
          type="button"
          onClick={onCambiarRider}
          className="w-full py-2 text-[12px] font-medium text-gray-400 underline decoration-dotted underline-offset-4 hover:text-rose-500"
        >
          Este celular pasa a otro rider
        </button>
      </section>
    </div>
  );
}

import { motion } from 'framer-motion';
import { Package, DollarSign, Flame, Trophy, Calendar, LogOut, Award } from 'lucide-react';

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
export default function PerfilRider({ repartidor, stats, onLogout, onCambiarRider }) {
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

import { Star, Gift, TrendingUp, Award, Copy, ExternalLink, Share2 } from 'lucide-react';

const fmtMoney = (value) => `$${Number(value || 0).toLocaleString('es-AR')}`;

export default function StatsCliente({
  cliente,
  config,
  colorPrimario,
  clubUrl,
  onCopyLink,
  onShare,
}) {
  const puntos = Number(cliente?.puntos || 0);
  const premios = Number(cliente?.recompensas_pendientes || 0);
  const nivel = cliente?.nivel || 'Bronce';
  const compras = Number(cliente?.total_compras || 0);
  const valorPunto = Number(config?.valor_punto_real || 0);
  const valorPuntos = puntos * valorPunto;
  const stampGoal = Math.max(1, Number(config?.sellos_para_premio || 7));
  const stampCount = Math.max(0, Number(cliente?.sellos_actuales || 0));
  const rewardReady = stampCount >= stampGoal;

  const stats = [
    {
      label: 'Puntos',
      value: puntos,
      sub: valorPuntos > 0 ? `≈ ${fmtMoney(valorPuntos)}` : '',
      icon: Star,
      color: colorPrimario,
    },
    {
      label: 'Premios',
      value: premios,
      sub: 'Canjes pendientes',
      icon: Gift,
      color: rewardReady ? '#059669' : '#9ca3af',
    },
    {
      label: 'Nivel',
      value: nivel,
      sub: compras > 0 ? `${compras} compras` : '',
      icon: Award,
      color: '#7c3aed',
    },
    {
      label: 'Sellos',
      value: `${stampCount}/${stampGoal}`,
      sub: rewardReady ? '¡Premio listo!' : `${stampGoal - stampCount} más`,
      icon: TrendingUp,
      color: rewardReady ? '#059669' : '#f59e0b',
    },
  ];

  return (
    <div className="space-y-5">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-[24px] border border-gray-200/80 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              <div className="flex items-center gap-2">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${stat.color}15`, color: stat.color }}
                >
                  <Icon size={18} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
                  {stat.label}
                </span>
              </div>
              <p className="mt-3 text-2xl font-black text-gray-900">{stat.value}</p>
              {stat.sub && <p className="mt-1 text-xs font-medium text-gray-500">{stat.sub}</p>}
            </div>
          );
        })}
      </div>

      {/* Progreso visual */}
      <div className="rounded-[24px] border border-gray-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
              Progreso del premio
            </p>
            <p className="mt-1 text-lg font-black text-gray-900">
              {rewardReady ? (
                <span className="text-emerald-600">¡Premio disponible! 🎉</span>
              ) : (
                <span>
                  {stampGoal - stampCount} sello{stampGoal - stampCount === 1 ? '' : 's'} para tu
                  premio
                </span>
              )}
            </p>
          </div>
          {rewardReady && (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <Gift size={24} className="text-emerald-600" />
            </div>
          )}
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${Math.min(100, (stampCount / stampGoal) * 100)}%` }}
          />
        </div>
      </div>

      {/* Acciones */}
      {clubUrl && (
        <div className="rounded-[24px] border border-gray-200/80 bg-white p-5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">
            Tu tarjeta virtual
          </p>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Compartí o guardá tu tarjeta para acceder rápido.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            >
              <Copy size={14} />
              Copiar link
            </button>
            <a
              href={clubUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            >
              <ExternalLink size={14} />
              Abrir tarjeta
            </a>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100"
            >
              <Share2 size={14} />
              Compartir
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

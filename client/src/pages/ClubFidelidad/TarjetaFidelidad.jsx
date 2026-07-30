import {
  Gift,
  Star,
  Coffee,
  Croissant,
  IceCream,
  Cake,
  Pizza,
  UtensilsCrossed,
  Cookie,
  Salad,
  ChefHat,
  CupSoda,
  Beef,
  Sparkles,
  Crown,
  CheckCircle2,
  QrCode,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { shadeColor } from '../../lib/colorUtils.js';

function getMaskedCardNumber(telefono) {
  const digits = String(telefono || '').replace(/\D/g, '');
  if (digits.length < 4) return '•••• •••• ••••';
  const masked = digits.slice(-4).padStart(Math.max(12, digits.length), '•');
  return masked.replace(/(.{4})/g, '$1 ').trim();
}

const BACK_CARD_BACKGROUND_URL = '/assets/fidelidad/tarjeta-fide-dorso.png';

/** Dorso tipo tarjeta impresa: fondo de marca, QR limpio, sellos y datos ordenados. */
function TarjetaDorsoSellos({
  colorPrimario,
  clubUrl,
  stampGoal,
  stampCount,
  rewardReady,
  cardHolder,
  puntos,
}) {
  const visibleStampGoal = Math.min(Math.max(stampGoal, 5), 6);
  const stampProgress = Math.min(stampCount, stampGoal);

  return (
    <div
      className="relative mx-auto aspect-[8/5] w-full max-w-[480px] overflow-hidden rounded-[28px] border border-black/10 bg-black shadow-2xl"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 44%, rgba(0,0,0,0.24) 100%), url("${BACK_CARD_BACKGROUND_URL}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-inset ring-white/10" />
      <div
        className="pointer-events-none absolute left-0 top-0 h-full w-[34%]"
        style={{
          background: 'linear-gradient(90deg, rgba(0,0,0,0.7), rgba(0,0,0,0.08))',
        }}
      />

      <div className="absolute left-[7%] top-[13%] flex w-[22%] flex-col items-start">
        {clubUrl ? (
          <div className="rounded-[14px] bg-white p-[6px] shadow-[0_14px_30px_rgba(0,0,0,0.42)]">
            <QRCodeSVG
              value={clubUrl}
              size={88}
              bgColor="#ffffff"
              fgColor="#111827"
              includeMargin={false}
              className="h-auto w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-[14px] border border-dashed border-white/35 bg-white/8">
            <QrCode size={26} className="text-white/50" />
          </div>
        )}
        <p className="mt-3 max-w-[92px] text-[9px] font-black uppercase leading-tight tracking-[0.16em] text-white/76">
          Escaneá tu tarjeta
        </p>
      </div>

      <div className="absolute left-[32%] right-[7%] top-[12%]">
        <p
          className="text-[9px] font-black uppercase tracking-[0.42em]"
          style={{ color: colorPrimario }}
        >
          Modo Sabor
        </p>
        <h3 className="mt-1 text-[22px] font-black leading-none text-white sm:text-[26px]">
          Tarjeta de fidelidad
        </h3>
        <p className="mt-2 max-w-[260px] text-[10px] font-bold uppercase tracking-[0.14em] text-white/48">
          {rewardReady ? 'Premio listo para canjear' : `Completá ${stampGoal} sellos y ganá`}
        </p>
      </div>

      <div className="absolute left-[32%] right-[8%] top-[42%]">
        <div className="grid grid-cols-3 gap-x-8 gap-y-5">
          {Array.from({ length: visibleStampGoal }).map((_, index) => {
            const filled = index < stampCount;
            const isRewardSlot = index === visibleStampGoal - 1 && stampGoal <= visibleStampGoal;
            return (
              <div
                key={index}
                className={`relative flex aspect-square items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  filled ? 'border-transparent shadow-lg' : 'border-white/72 bg-black/6'
                }`}
                style={
                  filled
                    ? {
                        backgroundColor: colorPrimario,
                        boxShadow: `0 0 18px ${colorPrimario}80, 0 8px 18px rgba(0,0,0,0.36)`,
                      }
                    : {}
                }
              >
                {filled ? (
                  <CheckCircle2 size={17} className="text-white" strokeWidth={3} />
                ) : isRewardSlot ? (
                  <Star size={15} className="text-white/70" strokeWidth={2.5} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-[7%] left-[7%] right-[7%] flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[8px] font-black uppercase tracking-[0.22em] text-white/42">
            Tu nombre
          </p>
          <p className="truncate text-[12px] font-black text-white/82">{cardHolder}</p>
        </div>
        <span className="shrink-0 text-[12px] font-black" style={{ color: colorPrimario }}>
          {stampProgress}/{stampGoal} · {puntos} pts
        </span>
      </div>
    </div>
  );
}

export default function TarjetaFidelidad({
  cliente,
  config,
  branding,
  colorPrimario,
  clubUrl,
  customFrontImage,
}) {
  const stampGoal = Math.max(1, Number(config?.sellos_para_premio || 10));
  const stampCount = Math.max(0, Number(cliente?.sellos_actuales || 0));
  const stampsRemaining = Math.max(stampGoal - stampCount, 0);
  const rewardReady = stampsRemaining === 0 && Boolean(cliente);
  const cardHolder = cliente?.nombre || 'Tu nombre';
  const cardNumber = getMaskedCardNumber(cliente?.telefono || '');
  const nivel = cliente?.nivel || 'Bronce';
  const puntos = Number(cliente?.puntos || 0);

  // Iconos para los círculos según la temática del negocio (diseño por defecto)
  const foodIcons = [
    Coffee,
    Croissant,
    IceCream,
    Cake,
    Pizza,
    Cookie,
    CupSoda,
    Beef,
    Salad,
    ChefHat,
  ];

  const RewardIcon = rewardReady ? Sparkles : Gift;

  // — Si el negocio subió su propio diseño: frente = imagen limpia, dorso = sellos + QR —
  if (customFrontImage) {
    return (
      <div className="space-y-6">
        <div className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[28px] border border-gray-200/80 shadow-2xl">
          <img
            src={customFrontImage}
            alt={`${branding.negocio_nombre} - tarjeta de fidelidad`}
            className="block aspect-[8/5] w-full object-cover"
          />
        </div>
        <TarjetaDorsoSellos
          colorPrimario={colorPrimario}
          clubUrl={clubUrl}
          stampGoal={stampGoal}
          stampCount={stampCount}
          rewardReady={rewardReady}
          cardHolder={cardHolder}
          puntos={puntos}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* — Tarjeta frente (sellos) — */}
      <div
        className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[28px] border-2 border-white/30 shadow-2xl"
        style={{
          background: `linear-gradient(135deg, ${colorPrimario} 0%, ${shadeColor(colorPrimario, -10)} 55%, ${shadeColor(colorPrimario, -25)} 100%)`,
          boxShadow: `0 20px 60px ${colorPrimario}40, 0 8px 24px rgba(0,0,0,0.15)`,
        }}
      >
        {/* Patrón de fondo sutil */}
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div
            className="h-full w-full"
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 1px, transparent 1px),
                                radial-gradient(circle at 70% 60%, white 1px, transparent 1px),
                                radial-gradient(circle at 40% 80%, white 1px, transparent 1px)`,
              backgroundSize: '60px 60px, 80px 80px, 100px 100px',
            }}
          />
        </div>

        {/* Marco decorativo */}
        <div className="pointer-events-none absolute inset-3 rounded-[20px] border border-white/20" />

        <div className="relative p-6 sm:p-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex items-center justify-center gap-2">
              <Crown size={18} className="text-white/80" />
              <h2 className="text-sm font-black uppercase tracking-[0.25em] text-white/90">
                Tarjeta de Fidelización
              </h2>
              <Crown size={18} className="text-white/80" />
            </div>
            <p className="mt-2 text-xs font-bold text-white/70">
              ACUMULA {stampGoal} SELLOS Y CONSIGUE UN PREMIO GRATIS
            </p>
          </div>

          {/* Grid de sellos */}
          <div className="mt-6 grid grid-cols-5 gap-3">
            {Array.from({ length: stampGoal }).map((_, index) => {
              const filled = index < stampCount;
              const isLast = index === stampGoal - 1;
              const FoodIconComp = isLast ? RewardIcon : foodIcons[index % foodIcons.length];
              const FilledIcon = CheckCircle2;

              return (
                <div
                  key={index}
                  className={`relative flex aspect-square flex-col items-center justify-center rounded-full transition-all duration-500 ${
                    filled
                      ? 'border-2 border-white/80 bg-white/95 shadow-lg'
                      : 'border-2 border-dashed border-white/50 bg-white/10'
                  }`}
                  style={
                    filled
                      ? {
                          boxShadow: `0 0 20px ${colorPrimario}60, inset 0 0 10px ${colorPrimario}20`,
                          animation:
                            index === stampCount - 1 ? 'stampPop 0.5s ease-out' : undefined,
                        }
                      : {}
                  }
                >
                  {filled ? (
                    <>
                      <FilledIcon size={22} className="text-emerald-600" strokeWidth={2.5} />
                      <span className="mt-0.5 text-[8px] font-black text-emerald-700 uppercase">
                        {index + 1}
                      </span>
                    </>
                  ) : (
                    <>
                      <FoodIconComp size={18} className="text-white/50" />
                      <span className="mt-0.5 text-[8px] font-bold text-white/40">{index + 1}</span>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ilustración y redes */}
          <div className="mt-5 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <UtensilsCrossed size={18} className="text-white" />
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <CupSoda size={18} className="text-white" />
              </div>
            </div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
              {branding.negocio_nombre}
            </p>
          </div>

          {/* Datos del cliente */}
          {cliente && (
            <div className="mt-4 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                    Titular
                  </p>
                  <p className="text-sm font-black text-white">{cardHolder}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/60">
                    Nivel
                  </p>
                  <p className="text-sm font-black text-white">{nivel}</p>
                </div>
              </div>
              <p className="mt-1 text-xs font-bold tracking-[0.12em] text-white/50">{cardNumber}</p>
            </div>
          )}
        </div>
      </div>

      <TarjetaDorsoSellos
        colorPrimario={colorPrimario}
        clubUrl={clubUrl}
        stampGoal={stampGoal}
        stampCount={stampCount}
        rewardReady={rewardReady}
        cardHolder={cardHolder}
        puntos={puntos}
      />

      {/* Animación CSS inline */}
      <style>{`
        @keyframes stampPop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

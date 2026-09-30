import {
  Gift,
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

// Llamita de Modo Sabor como SVG inline. Se usa como "sello ganado":
// cuando el cliente completa una compra, en el circulo aparece esta llamita
// en vez del ícono placeholder gris.
function FlameStamp({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M16 0 C14 8, 6 10, 6 20 C6 28, 11 34, 16 40 C21 34, 26 28, 26 20 C26 14, 22 12, 20 8 C19 12, 17 12, 16 10 C15 12, 15 6, 16 0 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

// Hamburguesa simple como SVG inline para los sellos vacios.
// Estilo "outline" simple para que se lea claro aun en 20px.
function BurgerStamp({ size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Pan de arriba (cupula con semillitas) */}
      <path
        d="M5 14 C5 9, 10 5, 16 5 C22 5, 27 9, 27 14 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <circle cx="12" cy="10" r="0.9" fill="currentColor" />
      <circle cx="16" cy="8.5" r="0.9" fill="currentColor" />
      <circle cx="20" cy="10" r="0.9" fill="currentColor" />
      {/* Lechuga (linea ondulada) */}
      <path d="M4 17 Q7 15 10 17 T16 17 T22 17 T28 17" />
      {/* Medallon (rectangulo con relleno) */}
      <rect x="4" y="19" width="24" height="3.5" rx="1.5" fill="currentColor" fillOpacity="0.55" />
      {/* Pan de abajo */}
      <path
        d="M5 24 L27 24 C27 26.5, 23 28, 16 28 C9 28, 5 26.5, 5 24 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
    </svg>
  );
}

/** Dorso tipo tarjeta impresa: fondo de marca, QR limpio, sellos y datos ordenados. */
function TarjetaDorsoSellos({
  colorPrimario,
  clubUrl,
  stampGoal,
  stampCount,
  rewardReady,
  puntos,
}) {
  // La tarjeta pública debe respetar la cantidad configurada en el servidor.
  // Se mantiene un mínimo para que una configuración vacía no rompa el diseño.
  const visibleStampGoal = Math.max(1, Number(stampGoal) || 1);
  const stampProgress = Math.min(stampCount, stampGoal);

  return (
    <div
      className="relative mx-auto aspect-[8/5] w-full max-w-[480px] overflow-hidden rounded-[28px] border border-white/10 bg-black shadow-2xl"
      style={{
        backgroundImage: `linear-gradient(90deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 44%, rgba(0,0,0,0.55) 100%), url("${BACK_CARD_BACKGROUND_URL}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Halo de color de marca en la esquina */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${colorPrimario}55, transparent 70%)` }}
      />
      {/* Marco interno sutil */}
      <div className="pointer-events-none absolute inset-3 rounded-[22px] border border-white/12" />

      {/* Bloque izquierdo: QR + etiqueta + badge de progreso */}
      <div className="absolute left-[6%] top-[12%] flex w-[24%] flex-col items-center">
        {clubUrl ? (
          <div
            className="rounded-[16px] bg-white p-[7px] shadow-[0_18px_36px_rgba(0,0,0,0.55)]"
            style={{ boxShadow: `0 18px 36px rgba(0,0,0,0.55), 0 0 0 2px ${colorPrimario}30` }}
          >
            <QRCodeSVG
              value={clubUrl}
              size={92}
              bgColor="#ffffff"
              fgColor="#0f172a"
              includeMargin={false}
              className="h-auto w-full"
            />
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-[16px] border border-dashed border-white/35 bg-white/8">
            <QrCode size={28} className="text-white/60" />
          </div>
        )}
        <p className="mt-2 text-center text-[9px] font-black uppercase leading-tight tracking-[0.18em] text-white">
          Escaneá tu tarjeta
        </p>
        <div
          className="mt-2 rounded-full px-3 py-1 text-[10px] font-black text-white"
          style={{
            backgroundColor: colorPrimario,
            boxShadow: `0 6px 14px ${colorPrimario}55`,
          }}
        >
          {stampProgress}/{stampGoal} · {puntos} pts
        </div>
      </div>

      {/* Bloque superior derecho: título */}
      <div className="absolute left-[34%] right-[7%] top-[11%]">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-[10px] w-[10px] rounded-full"
            style={{ backgroundColor: colorPrimario, boxShadow: `0 0 10px ${colorPrimario}` }}
          />
          <p
            className="text-[10px] font-black uppercase tracking-[0.42em]"
            style={{ color: colorPrimario }}
          >
            Modo Sabor
          </p>
        </div>
        <h3 className="mt-1 text-[24px] font-black leading-tight text-white sm:text-[28px]">
          Tarjeta de fidelidad
        </h3>
        <p
          className="mt-2 max-w-[280px] text-[11px] font-black uppercase tracking-[0.16em]"
          style={{ color: rewardReady ? '#fde047' : 'rgba(255,255,255,0.82)' }}
        >
          {rewardReady
            ? '★ Premio listo para canjear'
            : `Completá ${visibleStampGoal} sellos y desbloqueá tu premio`}
        </p>
      </div>

      {/* Sellos 4x2: hamburguesa apagada, llamita cuando esta completado, ultimo = premio */}
      <div className="absolute left-[34%] right-[7%] top-[38%] max-w-[300px]">
        <div className="grid grid-cols-4 gap-x-2 gap-y-2">
          {Array.from({ length: visibleStampGoal }).map((_, index) => {
            const filled = index < stampCount;
            const isRewardSlot = index === visibleStampGoal - 1;
            const rewardWon = isRewardSlot && rewardReady;
            return (
              <div
                key={index}
                className={`relative flex aspect-square items-center justify-center rounded-full border-2 transition-all duration-300 ${
                  filled
                    ? 'border-transparent shadow-lg text-white'
                    : isRewardSlot
                      ? 'border-yellow-300/80 bg-yellow-300/10 text-yellow-300'
                      : 'border-white/55 bg-white/5 text-white/70'
                }`}
                style={
                  filled
                    ? {
                        backgroundColor: colorPrimario,
                        boxShadow: `0 0 16px ${colorPrimario}90, 0 6px 14px rgba(0,0,0,0.36)`,
                        animation: `flameStampIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 0.12}s both${index === stampCount - 1 ? ', flamePulse 2.4s ease-in-out infinite 1s' : ''}`,
                      }
                    : {}
                }
              >
                {filled ? (
                  <FlameStamp size={20} />
                ) : isRewardSlot ? (
                  <Gift
                    size={rewardWon ? 22 : 18}
                    className="text-yellow-300"
                    strokeWidth={2.5}
                    style={rewardWon ? { animation: 'giftGlow 1.8s ease-in-out infinite' } : {}}
                  />
                ) : (
                  <BurgerStamp size={20} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Animaciones de sellos ganados: entrada tipo "pop" cuando aparece
          la llamita, pulso suave en el sello mas nuevo, y brillo dorado
          cuando el premio esta destrabado. */}
      <style>{`
        @keyframes flameStampIn {
          0% { transform: scale(0.2) rotate(-25deg); opacity: 0; }
          55% { transform: scale(1.25) rotate(6deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes flamePulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.06); filter: brightness(1.18); }
        }
        @keyframes giftGlow {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(253, 224, 71, 0.4)); }
          50% { filter: drop-shadow(0 0 14px rgba(253, 224, 71, 0.9)); }
        }
      `}</style>
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
  const stampGoal = Math.max(1, Number(config?.sellos_para_premio || 8));
  const stampCount = Math.max(0, Number(cliente?.sellos_actuales || 0));
  const stampsRemaining = Math.max(stampGoal - stampCount, 0);
  const rewardReady =
    Boolean(cliente) && (Number(cliente?.recompensas_pendientes || 0) > 0 || stampsRemaining === 0);
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

  // — Si el negocio subió su propio diseño: frente = imagen + nombre del cliente en cursiva, dorso = sellos + QR —
  if (customFrontImage) {
    return (
      <div className="space-y-6">
        <div className="relative mx-auto w-full max-w-[480px] overflow-hidden rounded-[28px] border border-gray-200/80 shadow-2xl">
          <img
            src={customFrontImage}
            alt={`${branding.negocio_nombre} - tarjeta de fidelidad`}
            className="block aspect-[8/5] w-full object-cover"
          />
          {/* Nombre del titular: debajo del logo (aprox 62% del alto),
              en Poppins bold blanco, con sombra sutil para que resalte
              sobre cualquier imagen custom que suba el negocio. */}
          <div
            className="pointer-events-none absolute left-0 right-0 flex justify-center px-8"
            style={{ top: '62%' }}
          >
            <p
              className="text-center text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]"
              style={{
                fontFamily: '"Poppins", "Inter", sans-serif',
                fontWeight: 700,
                fontSize: 'clamp(18px, 4.6vw, 28px)',
                lineHeight: 1.1,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
              }}
            >
              {cardHolder}
            </p>
          </div>
        </div>
        <TarjetaDorsoSellos
          colorPrimario={colorPrimario}
          clubUrl={clubUrl}
          stampGoal={stampGoal}
          stampCount={stampCount}
          rewardReady={rewardReady}
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
              ACUMULA {stampGoal} SELLOS Y DESBLOQUEA TU PREMIO
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

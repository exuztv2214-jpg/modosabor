import { useEffect, useState } from 'react';
import { Sparkles, Phone, QrCode, Gift, ArrowRight } from 'lucide-react';

// Llamita chiquita para el demo animado.
function FlameMini({ size = 14 }) {
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

// Hamburguesa chiquita para el demo animado (sellos vacios).
function BurgerMini({ size = 12 }) {
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
      <path
        d="M5 14 C5 9, 10 5, 16 5 C22 5, 27 9, 27 14 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <circle cx="12" cy="10" r="0.9" fill="currentColor" />
      <circle cx="16" cy="8.5" r="0.9" fill="currentColor" />
      <circle cx="20" cy="10" r="0.9" fill="currentColor" />
      <path d="M4 17 Q7 15 10 17 T16 17 T22 17 T28 17" />
      <rect x="4" y="19" width="24" height="3.5" rx="1.5" fill="currentColor" fillOpacity="0.55" />
      <path
        d="M5 24 L27 24 C27 26.5, 23 28, 16 28 C9 28, 5 26.5, 5 24 Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
    </svg>
  );
}

// Demo mini de la tarjeta: se llena sola y respeta la cantidad real de sellos
// configurada en el Club. No debe enseñar una promoción distinta a la que
// aplica el servidor.
function TarjetaDemo({ colorPrimario, sellosParaPremio = 8 }) {
  const [filled, setFilled] = useState(0);
  const totalSlots = Math.max(1, Number(sellosParaPremio) || 8);

  useEffect(() => {
    const id = setInterval(() => {
      setFilled((prev) => (prev >= totalSlots ? 0 : prev + 1));
    }, 900);
    return () => clearInterval(id);
  }, [totalSlots]);

  const rewardReady = filled >= totalSlots;

  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <div
        className="relative overflow-hidden rounded-[20px] border border-gray-900/20 bg-black p-4 shadow-lg"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25) 45%, rgba(0,0,0,0.55))',
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl"
          style={{ background: `radial-gradient(circle, ${colorPrimario}55, transparent 70%)` }}
        />
        <div className="mb-3 flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: colorPrimario, boxShadow: `0 0 8px ${colorPrimario}` }}
          />
          <p
            className="text-[9px] font-black uppercase tracking-[0.32em]"
            style={{ color: colorPrimario }}
          >
            Así se ven tus sellos
          </p>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: totalSlots }).map((_, index) => {
            const isFilled = index < filled;
            const isRewardSlot = index === totalSlots - 1;
            const rewardWon = isRewardSlot && rewardReady;
            return (
              <div
                key={index}
                className={`relative flex aspect-square items-center justify-center rounded-full border-2 transition-all duration-500 ${
                  isFilled
                    ? 'border-transparent shadow-md text-white'
                    : isRewardSlot
                      ? 'border-yellow-300/70 bg-yellow-300/10 text-yellow-300'
                      : 'border-white/50 bg-white/5 text-white/70'
                }`}
                style={
                  isFilled
                    ? {
                        backgroundColor: colorPrimario,
                        boxShadow: `0 0 12px ${colorPrimario}90`,
                        animation:
                          index === filled - 1
                            ? 'flameStampInDemo 0.55s cubic-bezier(0.34, 1.56, 0.64, 1)'
                            : undefined,
                      }
                    : {}
                }
              >
                {isFilled ? (
                  <FlameMini size={14} />
                ) : isRewardSlot ? (
                  <Gift
                    size={rewardWon ? 15 : 13}
                    className="text-yellow-300"
                    strokeWidth={2.5}
                    style={rewardWon ? { animation: 'giftGlowDemo 1.4s ease-in-out infinite' } : {}}
                  />
                ) : (
                  <BurgerMini size={13} />
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] font-black uppercase tracking-wider text-white/70">
          {rewardReady
            ? '★ ¡Premio listo!'
            : `${filled}/${totalSlots} sellos · premio al completar la tarjeta`}
        </p>
      </div>
      <style>{`
        @keyframes flameStampInDemo {
          0% { transform: scale(0.2) rotate(-25deg); opacity: 0; }
          55% { transform: scale(1.25) rotate(6deg); opacity: 1; }
          100% { transform: scale(1) rotate(0); opacity: 1; }
        }
        @keyframes giftGlowDemo {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(253, 224, 71, 0.4)); }
          50% { filter: drop-shadow(0 0 10px rgba(253, 224, 71, 0.9)); }
        }
      `}</style>
    </div>
  );
}

export default function ComoFunciona({ colorPrimario, sellosParaPremio = 8 }) {
  const steps = [
    {
      icon: Phone,
      title: 'Completá tu ficha',
      desc: 'Ingresá nombre y teléfono. Si ya compraste, te vinculamos automáticamente.',
    },
    {
      icon: QrCode,
      title: 'Recibí tu tarjeta',
      desc: 'Te damos un QR y un link personalizado para acceder a tu tarjeta virtual.',
    },
    {
      icon: Gift,
      title: 'Acumulá sellos',
      desc: `Cada compra que cumpla la condición del programa suma un sello. Al completar ${Math.max(1, Number(sellosParaPremio) || 8)} sellos, desbloqueás tu premio.`,
    },
  ];

  return (
    <div className="w-full">
      <div className="text-center mb-8">
        <div
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full shadow-lg mb-4"
          style={{
            background: `linear-gradient(135deg, ${colorPrimario}24, ${colorPrimario}0f)`,
            boxShadow: `0 0 30px ${colorPrimario}20`,
          }}
        >
          <Sparkles size={28} style={{ color: colorPrimario }} />
        </div>
        <h3 className="text-2xl font-black text-gray-900">¿Cómo funciona?</h3>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Tres pasos para empezar a sumar premios
        </p>
      </div>

      {/* Layout 2 columnas: demo animado a la izquierda, pasos a la derecha.
          En mobile se apilan (demo arriba, pasos abajo). */}
      <div className="grid gap-6 md:grid-cols-2 md:items-start">
        <div className="md:sticky md:top-24">
          <TarjetaDemo colorPrimario={colorPrimario} sellosParaPremio={sellosParaPremio} />
        </div>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={step.title}
                className="flex items-start gap-4 rounded-[24px] border border-gray-200/80 bg-white p-5 shadow-sm transition hover:shadow-md"
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-sm"
                  style={{
                    backgroundColor: `${colorPrimario}12`,
                    color: colorPrimario,
                  }}
                >
                  <Icon size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black text-white"
                      style={{ backgroundColor: colorPrimario }}
                    >
                      {index + 1}
                    </span>
                    <h4 className="text-base font-black text-gray-900">{step.title}</h4>
                  </div>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-gray-500">
                    {step.desc}
                  </p>
                </div>
                <ArrowRight size={18} className="mt-3 shrink-0 text-gray-300" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

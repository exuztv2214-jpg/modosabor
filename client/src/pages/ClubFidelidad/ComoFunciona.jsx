import { Sparkles, Phone, QrCode, Gift, ArrowRight } from 'lucide-react';

export default function ComoFunciona({ colorPrimario }) {
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
      desc: 'Cada compra suma un sello. Cuando completes la tarjeta, ¡tu premio es gratis!',
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

      <div className="space-y-4">
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
  );
}

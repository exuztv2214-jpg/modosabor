import { motion } from 'framer-motion';

export default function TrustSection({
  trustBadges,
  orderSteps,
  totalItems,
  colorPrimario,
  theme,
}) {
  return (
    <section className="border-b border-black/5 bg-[#fff6ef] px-4 py-14 md:px-8">
      <div className="mx-auto grid gap-6 md:grid-cols-[1.1fr,0.9fr] max-w-[1400px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="rounded-[28px] border p-7 shadow-[0_18px_44px_rgba(20,20,20,0.05)]"
          style={{
            backgroundColor: theme?.panel || '#fffdfb',
            borderColor: theme?.border || '#f1dfd7',
          }}
        >
          <div className="mb-5">
            <p
              className="text-xs font-black uppercase tracking-[0.22em]"
              style={{ color: colorPrimario }}
            >
              Por qué pedir acá
            </p>
            <h2 className="mt-2 text-3xl font-black text-gray-900">Experiencia clara y rápida</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {trustBadges.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="rounded-2xl border p-5 shadow-sm transition hover:shadow-md"
                  style={{ backgroundColor: 'white', borderColor: theme?.border || '#f1dfd7' }}
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-white shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${colorPrimario} 0%, ${theme?.primaryStrong || colorPrimario} 100%)`,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <p className="mt-4 text-sm font-black text-gray-900">{item.title}</p>
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="rounded-[28px] border p-7 shadow-[0_18px_44px_rgba(20,20,20,0.05)]"
          style={{
            backgroundColor: theme?.panel || '#fffdfb',
            borderColor: theme?.border || '#f1dfd7',
          }}
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.22em]"
                style={{ color: colorPrimario }}
              >
                Cómo funciona
              </p>
              <h2 className="mt-2 text-3xl font-black text-gray-900">Pedí en 3 pasos</h2>
            </div>
            <div
              className="rounded-xl border px-3 py-2 text-xs font-bold text-gray-500 shadow-sm"
              style={{ backgroundColor: 'white', borderColor: theme?.border || '#f1dfd7' }}
            >
              {totalItems > 0
                ? `${totalItems} item${totalItems === 1 ? '' : 's'} listos`
                : 'Sin pedido aún'}
            </div>
          </div>
          <div className="space-y-3">
            {orderSteps.map((item, index) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-start gap-4 rounded-2xl border bg-white px-5 py-4 shadow-sm transition hover:shadow-md"
                  style={{ borderColor: theme?.border || '#f1dfd7' }}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm"
                    style={{
                      background: `linear-gradient(135deg, ${colorPrimario} 0%, ${theme?.primaryStrong || colorPrimario} 100%)`,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-gray-400 tracking-wide">
                      Paso {index + 1}
                    </p>
                    <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{item.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

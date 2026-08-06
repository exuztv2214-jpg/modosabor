export default function HighlightsGrid({ heroHighlights, colorPrimario, theme }) {
  return (
    <section className="px-4 py-6 md:px-6">
      <div className="mx-auto grid max-w-[1400px] gap-4 md:grid-cols-2 xl:grid-cols-4">
        {heroHighlights.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="rounded-[24px] border px-5 py-5 shadow-[0_16px_40px_rgba(20,20,20,0.06)]"
              style={{
                backgroundColor: theme?.panel || '#fffdfb',
                borderColor: theme?.border || '#f1dfd7',
              }}
            >
              <div className="flex items-start gap-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${colorPrimario} 0%, ${theme?.primaryStrong || colorPrimario} 100%)`,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-gray-900">{item.title}</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-gray-500">{item.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

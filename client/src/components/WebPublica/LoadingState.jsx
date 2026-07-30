export default function LoadingState() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="sticky top-0 z-[100] border-b border-gray-100 bg-white/90 px-4 py-3 backdrop-blur-xl md:px-6">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 animate-pulse rounded-xl bg-gray-100" />
            <div className="space-y-2">
              <div className="h-4 w-32 animate-pulse rounded-lg bg-gray-100" />
              <div className="h-2.5 w-20 animate-pulse rounded-lg bg-gray-100" />
            </div>
          </div>
          <div className="h-11 w-28 animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
      <div className="min-h-[420px] animate-pulse bg-gray-100" />
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"
            >
              <div className="aspect-[4/3] animate-pulse bg-gray-100" />
              <div className="space-y-2.5 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded-lg bg-gray-100" />
                <div className="h-3 w-full animate-pulse rounded-lg bg-gray-100" />
                <div className="h-6 w-1/3 animate-pulse rounded-lg bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

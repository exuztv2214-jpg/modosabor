/**
 * Skeleton loaders con shimmer para la app rider.
 *
 * Reemplazan el spinner genérico. Muestran la silueta de lo que está
 * por venir, lo que hace que la espera se perciba más corta.
 *
 * El shimmer usa una animación CSS con background-position (barato en
 * GPU) en vez de framer-motion, para no cargar el hilo de JS mientras
 * la app está justamente esperando datos.
 */

function Bar({ className = '' }) {
  return <div className={`rider-shimmer rounded-lg ${className}`} />;
}

/** Silueta de una card de pedido en la lista. */
export function SkeletonPedidoCard() {
  return (
    <div className="rounded-[22px] border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <Bar className="h-12 w-12 shrink-0 rounded-2xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bar className="h-3.5 w-1/3" />
          <Bar className="h-3 w-3/4" />
          <Bar className="h-3 w-1/2" />
        </div>
        <Bar className="h-6 w-16 shrink-0 rounded-full" />
      </div>
      <div className="mt-4 flex gap-2">
        <Bar className="h-9 flex-1 rounded-xl" />
        <Bar className="h-9 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

/** Silueta del header con métricas del turno. */
export function SkeletonHeaderTurno() {
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Bar className="h-3 w-24" />
          <Bar className="h-5 w-36" />
        </div>
        <Bar className="h-11 w-11 rounded-2xl" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-3 w-full" />
            <Bar className="h-6 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pantalla de carga completa: header + N cards. */
export default function RiderSkeleton({ cards = 3 }) {
  return (
    <div className="space-y-4 px-5 py-5">
      <SkeletonHeaderTurno />
      <div className="space-y-3">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonPedidoCard key={i} />
        ))}
      </div>
    </div>
  );
}

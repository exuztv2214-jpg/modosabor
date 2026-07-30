export default function DireccionesPanel({ direcciones }) {
  return (
    <div className="rounded-[32px] border border-white bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
          Direcciones
        </h4>
        <span className="text-[9px] font-black uppercase tracking-widest text-primary-500">
          {direcciones.length || 0} cargadas
        </span>
      </div>
      <div className="space-y-3">
        {direcciones.length > 0 ? (
          direcciones.map((direccion) => (
            <div key={direccion.id} className="rounded-[22px] bg-background p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-widest text-gray-800">
                  {direccion.etiqueta || 'Dirección'}
                </p>
                {direccion.principal ? (
                  <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-primary-500">
                    Principal
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-bold text-gray-700">{direccion.direccion}</p>
              {direccion.referencia ? (
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  {direccion.referencia}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 py-4 text-center text-xs font-bold uppercase text-gray-400">
            Sin direcciones registradas
          </p>
        )}
      </div>
    </div>
  );
}

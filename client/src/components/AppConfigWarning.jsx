import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { useAppConfig } from '../context/AppConfigContext.jsx';
import { isNativeRiderApp } from '../lib/nativeRiderGps.js';

export default function AppConfigWarning() {
  const { loading, configError, refreshConfig } = useAppConfig();
  const location = useLocation();
  const isRiderRoute = location.pathname.startsWith('/rider');

  if (loading || !configError || isNativeRiderApp() || isRiderRoute) return null;

  return (
    <div className="sticky top-0 z-[200] border-b border-amber-200 bg-warning-50/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-2xl bg-white p-2 text-warning-600 shadow-sm">
            <AlertTriangle size={18} />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-warning-700">
              Configuración no sincronizada
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-900">
              No se pudo actualizar la configuración global. El sistema sigue abierto con datos
              locales y puede faltar branding o módulos recientes.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refreshConfig().catch(() => {})}
          className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-warning-700 shadow-sm hover:bg-warning-100/40"
        >
          <RefreshCw size={14} />
          Reintentar
        </button>
      </div>
    </div>
  );
}

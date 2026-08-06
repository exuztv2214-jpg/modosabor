import { X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { CONTROL, SellosProgreso } from './clientesUi.jsx';

export default function FidelizacionConfigModal({
  open,
  onClose,
  fidelidadConfig,
  setFidelidadConfig,
  saveConfig,
  saving,
  canManageFidelidadConfig,
  fmtMoney,
}) {
  if (!open) return null;

  const sellos = Math.max(1, Number(fidelidadConfig.sellos_para_premio) || 1);
  const set = (campo, valor) => setFidelidadConfig({ ...fidelidadConfig, [campo]: valor });

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h3 className="text-[17px] font-semibold text-gray-900">Programa de fidelidad</h3>
            <p className="mt-0.5 text-[12px] text-gray-500">Aplica a todos los clientes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
          >
            <X size={18} strokeWidth={STROKE} />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3">
            <input
              type="checkbox"
              checked={Boolean(fidelidadConfig.activo)}
              onChange={(e) => set('activo', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
              style={{ accentColor: BRAND }}
            />
            <span>
              <span className="block text-[13px] font-medium text-gray-900">Programa activo</span>
              <span className="mt-0.5 block text-[12px] leading-4 text-gray-500">
                Si lo apagás, deja de sumarse cualquier sello en todo el sistema.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-gray-600">Compra mínima</label>
              <input
                type="number"
                min="0"
                value={fidelidadConfig.monto_minimo_sello}
                onChange={(e) => set('monto_minimo_sello', Number(e.target.value))}
                className={CONTROL + ' mt-1 tabular-nums'}
              />
              <p className="mt-1 text-[11px] text-gray-400">Para que la compra cuente un sello</p>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-600">Sellos por premio</label>
              <input
                type="number"
                // Sin mínimo se podía guardar 0 y el cálculo del progreso
                // quedaba dividiendo por cero.
                min="1"
                value={fidelidadConfig.sellos_para_premio}
                onChange={(e) =>
                  set('sellos_para_premio', Math.max(1, Number(e.target.value) || 1))
                }
                className={CONTROL + ' mt-1 tabular-nums'}
              />
              <p className="mt-1 text-[11px] text-gray-400">El premio sale al completarlos</p>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-gray-600">Qué se gana</label>
            <textarea
              value={fidelidadConfig.premio_descripcion}
              onChange={(e) => set('premio_descripcion', e.target.value)}
              className={CONTROL + ' mt-1 h-20 resize-none py-2.5'}
              placeholder="Ej: una pizza muzzarella grande"
            />
          </div>

          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-[12px] text-gray-500">Así lo va a ver el cliente</p>
            <div className="mt-2">
              <SellosProgreso actuales={Math.min(3, sellos)} total={sellos} size="sm" />
            </div>
            <p className="mt-2 text-[13px] leading-5 text-gray-700">
              Sumás 1 sello por cada compra de {fmtMoney(fidelidadConfig.monto_minimo_sello)} o más.
              Con {sellos} sellos te llevás {fidelidadConfig.premio_descripcion || 'tu premio'}.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-xl bg-gray-100 px-5 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={saveConfig}
            // El botón se veía habilitado aunque no hubiera permisos: recién al
            // apretarlo saltaba el toast de "no tenés permisos".
            disabled={saving || !canManageFidelidadConfig}
            title={canManageFidelidadConfig ? undefined : 'No tenés permisos para editar esto'}
            style={{ background: BRAND }}
            className="h-11 rounded-xl px-6 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

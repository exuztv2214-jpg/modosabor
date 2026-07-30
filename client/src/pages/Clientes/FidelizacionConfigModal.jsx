import { X } from 'lucide-react';
import { ToggleSwitch } from '../../components/Configuracion/ConfigComponents.jsx';

export default function FidelizacionConfigModal({
  open,
  onClose,
  fidelidadConfig,
  setFidelidadConfig,
  saveConfig,
  saving,
  canManageFidelidadConfig,
  control,
  fmtMoney,
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[40px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-black text-gray-900 tracking-tight uppercase">
            Configuración de Lealtad
          </h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100">
            <X size={24} className="text-gray-400" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
            <div>
              <p className="text-sm font-black text-gray-900 uppercase">Sistema Activo</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase">
                Habilitar sellos y puntos globalmente
              </p>
            </div>
            <ToggleSwitch
              checked={fidelidadConfig.activo}
              onChange={(v) => setFidelidadConfig({ ...fidelidadConfig, activo: v })}
              color="blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Monto Mín. Sello ($)
              </label>
              <input
                type="number"
                value={fidelidadConfig.monto_minimo_sello}
                onChange={(e) =>
                  setFidelidadConfig({
                    ...fidelidadConfig,
                    monto_minimo_sello: Number(e.target.value),
                  })
                }
                className={control + ' mt-1'}
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                Sellos p/ Premio
              </label>
              <input
                type="number"
                value={fidelidadConfig.sellos_para_premio}
                onChange={(e) =>
                  setFidelidadConfig({
                    ...fidelidadConfig,
                    sellos_para_premio: Number(e.target.value),
                  })
                }
                className={control + ' mt-1'}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
              Descripción del Premio (Bases)
            </label>
            <textarea
              value={fidelidadConfig.premio_descripcion}
              onChange={(e) =>
                setFidelidadConfig({ ...fidelidadConfig, premio_descripcion: e.target.value })
              }
              className={control + ' mt-1 h-24 py-3 resize-none'}
              placeholder="Ej: 1 Pizza Muzzarella gratis"
            />
          </div>

          <div className="p-4 bg-primary-50 rounded-2xl border border-primary-100">
            <p className="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-1">
              Regla de Negocio
            </p>
            <p className="text-xs font-bold text-gray-600 leading-relaxed italic">
              "Los clientes sumarán 1 sello por cada compra mayor a{' '}
              {fmtMoney(fidelidadConfig.monto_minimo_sello)}. Al completar{' '}
              {fidelidadConfig.sellos_para_premio} sellos, ganarán:{' '}
              {fidelidadConfig.premio_descripcion}."
            </p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl border border-gray-200 text-xs font-black text-gray-500 uppercase"
          >
            Cancelar
          </button>
          <button
            onClick={saveConfig}
            disabled={saving}
            className="flex-[2] h-12 rounded-2xl bg-primary-500 text-white text-xs font-black uppercase shadow-lg shadow-primary-100"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

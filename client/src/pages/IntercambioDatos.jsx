import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../lib/api.js';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';

const TIPOS = [
  {
    id: 'categorias',
    titulo: 'Categorías',
    descripcion: 'Nombre, icono, color, orden, estado y turno.',
  },
  {
    id: 'productos',
    titulo: 'Productos',
    descripcion: 'Precios en pesos, costo, categoría, estado y tiempo de preparación.',
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    descripcion: 'Datos de contacto, dirección y fidelización. No exporta estadísticas privadas.',
  },
];

function Summary({ result }) {
  if (!result) return null;
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-[12px] text-slate-600">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>{result.filas || 0} filas</span>
        <span className="font-semibold text-emerald-700">{result.crear || 0} nuevas</span>
        <span className="font-semibold text-blue-700">{result.actualizar || 0} a actualizar</span>
        <span>{result.omitir || 0} sin cambios</span>
      </div>
      {result.errores?.length ? (
        <div className="mt-3 space-y-1 border-t border-slate-200 pt-2 text-rose-700">
          {result.errores.slice(0, 8).map((error) => (
            <p key={`${error.fila}-${error.error}`}>
              Fila {error.fila}: {error.error}
            </p>
          ))}
          {result.errores.length > 8 ? <p>Y {result.errores.length - 8} errores más…</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default function IntercambioDatos() {
  const [files, setFiles] = useState({});
  const [results, setResults] = useState({});
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState('');

  const exportar = async (tipo) => {
    setBusy(`export-${tipo}`);
    try {
      const blob = await api.get(`/intercambio-datos/exportar/${tipo}`, { responseType: 'blob' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `modo-sabor-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error?.error || 'No se pudo exportar');
    } finally {
      setBusy('');
    }
  };

  const importar = async (tipo, aplicar = false) => {
    const file = files[tipo];
    if (!file) return toast.error('Elegí un archivo CSV primero');
    setBusy(`${aplicar ? 'apply' : 'preview'}-${tipo}`);
    try {
      const form = new FormData();
      form.append('archivo', file);
      form.append('sobrescribir', overwrite ? '1' : '0');
      form.append('aplicar', aplicar ? '1' : '0');
      const response = await api.post(`/intercambio-datos/importar/${tipo}`, form);
      setResults((current) => ({ ...current, [tipo]: response }));
      if (aplicar) toast.success(`Importación terminada. Backup: ${response.backup}`);
    } catch (error) {
      const result = error && typeof error === 'object' ? error : null;
      if (result?.errores) setResults((current) => ({ ...current, [tipo]: result }));
      toast.error(result?.error || 'No se pudo leer el CSV');
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-6xl">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Importar y exportar
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Mové datos con CSV sin tocar la base manualmente. Toda importación crea un backup antes
            de escribir.
          </p>
        </div>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle size={19} strokeWidth={STROKE} className="mt-0.5 shrink-0" />
          <p>
            Primero usá <strong>Revisar</strong>. El sistema no aplica una importación con errores
            y, por defecto, tampoco sobrescribe registros existentes.
          </p>
        </div>

        <label className="mt-5 flex w-fit items-center gap-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(event) => setOverwrite(event.target.checked)}
            className="h-4 w-4 rounded"
          />
          Sobrescribir coincidencias existentes
        </label>

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          {TIPOS.map((tipo) => {
            const result = results[tipo.id];
            const canApply = result?.preview && !result?.errores?.length && Boolean(files[tipo.id]);
            return (
              <article key={tipo.id} className="rounded-2xl bg-white p-5 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <FileSpreadsheet size={21} strokeWidth={STROKE} />
                </span>
                <h2 className="mt-3 text-base font-semibold text-slate-900">{tipo.titulo}</h2>
                <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{tipo.descripcion}</p>

                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => exportar(tipo.id)}
                  className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-semibold text-slate-700 disabled:opacity-50"
                >
                  <Download size={16} strokeWidth={STROKE} />
                  Descargar CSV
                </button>

                <label className="mt-3 block rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500 hover:border-slate-400">
                  <Upload size={17} strokeWidth={STROKE} className="mx-auto mb-1" />
                  {files[tipo.id]?.name || 'Elegir CSV para importar'}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0] || null;
                      setFiles((current) => ({ ...current, [tipo.id]: file }));
                      setResults((current) => ({ ...current, [tipo.id]: null }));
                    }}
                  />
                </label>

                <Summary result={result} />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!files[tipo.id] || Boolean(busy)}
                    onClick={() => importar(tipo.id, false)}
                    className="h-10 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-40"
                  >
                    Revisar
                  </button>
                  <button
                    type="button"
                    disabled={!canApply || Boolean(busy)}
                    onClick={() => importar(tipo.id, true)}
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: BRAND }}
                  >
                    <CheckCircle2 size={15} strokeWidth={STROKE} />
                    Aplicar
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}

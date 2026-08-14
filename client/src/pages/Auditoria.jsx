import { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  RefreshCw,
  Search,
  Download,
  Shield,
  Clock,
  User,
  Activity,
  ChevronDown,
  AlertCircle,
  FileText,
  Bot,
  Zap,
  AlertTriangle,
  Cpu,
  Timer,
} from 'lucide-react';

import api from '../lib/api.js';
import { parseFechaServidor } from '../lib/fechas.js';

const MODULE_COLORS = {
  configuracion: 'bg-gray-100 text-gray-700',
  inventario: 'bg-blue-100 text-blue-700',
  pedidos: 'bg-indigo-100 text-indigo-700',
  clientes: 'bg-violet-100 text-violet-700',
  usuarios: 'bg-pink-100 text-pink-700',
  caja: 'bg-emerald-100 text-emerald-700',
  productos: 'bg-amber-100 text-amber-700',
  cupones: 'bg-orange-100 text-orange-700',
  fidelizacion: 'bg-teal-100 text-teal-700',
  delivery: 'bg-sky-100 text-sky-700',
  compras: 'bg-lime-100 text-lime-700',
  marketing: 'bg-fuchsia-100 text-fuchsia-700',
};

const ACTION_COLORS = {
  crear: 'bg-emerald-50 text-emerald-700',
  create: 'bg-emerald-50 text-emerald-700',
  actualizar: 'bg-blue-50 text-blue-700',
  update: 'bg-blue-50 text-blue-700',
  editar: 'bg-blue-50 text-blue-700',
  eliminar: 'bg-rose-50 text-rose-700',
  delete: 'bg-rose-50 text-rose-700',
  login: 'bg-violet-50 text-violet-700',
  logout: 'bg-gray-100 text-gray-600',
  default: 'bg-gray-100 text-gray-600',
};

const IA_TIPO_COLORS = {
  consulta: 'bg-blue-50 text-blue-700',
  propuesta: 'bg-amber-50 text-amber-700',
  ejecucion: 'bg-emerald-50 text-emerald-700',
  prueba: 'bg-violet-50 text-violet-700',
  error: 'bg-rose-50 text-rose-700',
};

const LIMIT_OPTIONS = [25, 50, 100, 200];

function getModuleColor(modulo) {
  if (!modulo) return 'bg-gray-100 text-gray-600';
  const key = modulo.toLowerCase();
  for (const [k, v] of Object.entries(MODULE_COLORS)) {
    if (key.includes(k)) return v;
  }
  return 'bg-gray-100 text-gray-600';
}

function getActionColor(accion) {
  if (!accion) return ACTION_COLORS.default;
  const key = accion.toLowerCase();
  for (const [k, v] of Object.entries(ACTION_COLORS)) {
    if (key.includes(k)) return v;
  }
  return ACTION_COLORS.default;
}

function getIaTipoColor(tipo) {
  return IA_TIPO_COLORS[tipo] || 'bg-gray-100 text-gray-600';
}

function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const d = parseFechaServidor(dateString);
    if (!Number.isFinite(d.getTime())) return '—';
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateString;
  }
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function isToday(dateString) {
  if (!dateString) return false;
  const d = parseFechaServidor(dateString);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function Stat({ label, value, icon: Icon, tint = 'blue' }) {
  const tints = {
    blue: 'bg-[#FEF2F2] text-[#DC1F2D]',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    sky: 'bg-sky-50 text-sky-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold text-gray-400">{label}</p>
          <p className="text-xl font-semibold text-gray-900 tracking-tight">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${tints[tint]}`}
        >
          <Icon size={18} strokeWidth={2.5} />
        </div>
      </div>
    </div>
  );
}

function DetalleTooltip({ detalle }) {
  const [open, setOpen] = useState(false);
  if (!detalle) return <span className="text-xs text-gray-300">—</span>;

  let displayText = detalle;
  let isJson = false;

  if (typeof detalle === 'object') {
    displayText = JSON.stringify(detalle, null, 2);
    isJson = true;
  } else {
    try {
      const parsed = JSON.parse(detalle);
      displayText = JSON.stringify(parsed, null, 2);
      isJson = true;
    } catch {
      displayText = String(detalle);
    }
  }

  const preview = displayText.length > 40 ? displayText.slice(0, 40) + '…' : displayText;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`max-w-[200px] truncate rounded-lg px-2 py-1 text-xs font-medium transition hover:opacity-80 ${
          isJson ? 'bg-gray-100 font-mono text-gray-700' : 'bg-gray-50 text-gray-600'
        }`}
        title={displayText}
      >
        {preview}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 min-w-[280px] max-w-[380px] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl"
          style={{ maxHeight: '200px', overflowY: 'auto' }}
        >
          <pre className="whitespace-pre-wrap break-all text-xs text-gray-700 font-mono">
            {displayText}
          </pre>
          <button
            onClick={() => setOpen(false)}
            className="mt-2 text-xs text-gray-400 hover:text-gray-600"
          >
            Cerrar
          </button>
        </div>
      )}
    </div>
  );
}

function TextoExpandible({ texto, max = 80 }) {
  const [expandido, setExpandido] = useState(false);
  if (!texto) return <span className="text-xs text-gray-300">—</span>;
  if (texto.length <= max) return <span className="text-xs text-gray-700">{texto}</span>;
  return (
    <button
      type="button"
      onClick={() => setExpandido((e) => !e)}
      className="text-left text-xs text-gray-700 hover:text-[#DC1F2D] transition"
    >
      {expandido ? texto : texto.slice(0, max) + '…'}
    </button>
  );
}

function exportToCSV(logs, filename) {
  if (!logs.length) {
    toast.error('No hay datos para exportar');
    return;
  }
  const isIa = logs[0]?.pregunta !== undefined;
  const headers = isIa
    ? [
        'ID',
        'Fecha',
        'Usuario',
        'Tipo',
        'Pregunta',
        'Respuesta',
        'Accion',
        'Proveedor',
        'Modelo',
        'Duracion_ms',
        'Fallback',
        'Error',
      ]
    : ['ID', 'Fecha', 'Actor', 'Modulo', 'Accion', 'Entidad', 'Entidad ID', 'Detalle'];

  const rows = isIa
    ? logs.map((l) => [
        l.id,
        l.creado_en,
        l.usuario_nombre || l.usuario_id || '',
        l.tipo || '',
        l.pregunta || '',
        l.respuesta || '',
        l.accion || '',
        l.proveedor || '',
        l.modelo || '',
        l.duracion_ms || 0,
        l.fallback ? '1' : '0',
        l.error || '',
      ])
    : logs.map((l) => [
        l.id,
        l.creado_en,
        l.actor_nombre || l.actor_id || '',
        l.modulo || '',
        l.accion || '',
        l.entidad || '',
        l.entidad_id || '',
        typeof l.detalle === 'object' ? JSON.stringify(l.detalle) : l.detalle || '',
      ]);

  const csvContent = [headers, ...rows]
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    )
    .join('\n');

  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exportado');
}

/* =======================================================================
   SECCIÓN: Auditoría del Sistema (tabla auditoria general)
   ======================================================================= */

function SistemaSection({
  logs,
  loading,
  error,
  search,
  setSearch,
  limit,
  setLimit,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onReload,
}) {
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (l) =>
          (l.actor_nombre || '').toLowerCase().includes(q) ||
          (l.modulo || '').toLowerCase().includes(q) ||
          (l.accion || '').toLowerCase().includes(q) ||
          (l.entidad || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, search]);

  const stats = useMemo(() => {
    const todayLogs = logs.filter((l) => isToday(l.creado_en));
    const uniqueUsersToday = new Set(
      todayLogs.map((l) => l.actor_id || l.actor_nombre).filter(Boolean)
    ).size;
    return {
      totalHoy: todayLogs.length,
      usuariosHoy: uniqueUsersToday,
      totalVisible: filteredLogs.length,
    };
  }, [logs, filteredLogs]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Eventos hoy" value={stats.totalHoy} icon={Activity} tint="blue" />
        <Stat label="Usuarios activos hoy" value={stats.usuariosHoy} icon={User} tint="emerald" />
        <Stat label="Registros visibles" value={stats.totalVisible} icon={FileText} tint="amber" />
      </div>

      <FiltrosBar
        search={search}
        setSearch={setSearch}
        limit={limit}
        setLimit={setLimit}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onReload={onReload}
        onExport={() => exportToCSV(filteredLogs, 'auditoria_sistema')}
        loading={loading}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-amber-800">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-5 py-3 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                  Fecha
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Actor</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Módulo</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Acción</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Entidad</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <LoadingRow />
              ) : filteredLogs.length === 0 ? (
                <EmptyRow search={search} error={error} />
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log.id ?? idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="flex-shrink-0 text-gray-300" />
                        <span className="text-xs text-gray-600 font-mono">
                          {formatDate(log.creado_en)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                          <User size={13} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 leading-tight">
                            {log.actor_nombre || '—'}
                          </p>
                          {log.actor_id && (
                            <p className="text-[10px] text-gray-400">ID: {log.actor_id}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.modulo ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getModuleColor(
                            log.modulo
                          )}`}
                        >
                          {log.modulo}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {log.accion ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getActionColor(
                            log.accion
                          )}`}
                        >
                          {log.accion}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-gray-700">{log.entidad || '—'}</p>
                        {log.entidad_id != null && (
                          <p className="text-[10px] text-gray-400">#{log.entidad_id}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <DetalleTooltip detalle={log.detalle} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredLogs.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-400 flex items-center justify-between">
            <span>
              Mostrando <span className="font-bold text-gray-600">{filteredLogs.length}</span> de{' '}
              <span className="font-bold text-gray-600">{logs.length}</span> registros
            </span>
            {logs.length >= limit && (
              <span className="text-amber-500 font-semibold">
                Límite alcanzado — aumenta el límite para ver más
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =======================================================================
   SECCIÓN: Auditoría de IA (tabla auditoria_ia)
   ======================================================================= */

function IaSection({
  logs,
  loading,
  error,
  search,
  setSearch,
  limit,
  setLimit,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onReload,
  resumen,
}) {
  const filteredLogs = useMemo(() => {
    let result = logs;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (l) =>
          (l.usuario_nombre || '').toLowerCase().includes(q) ||
          (l.pregunta || '').toLowerCase().includes(q) ||
          (l.respuesta || '').toLowerCase().includes(q) ||
          (l.proveedor || '').toLowerCase().includes(q) ||
          (l.accion || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [logs, search]);

  const stats = useMemo(() => {
    const todayLogs = logs.filter((l) => isToday(l.creado_en));
    const fallbacksHoy = todayLogs.filter((l) => l.fallback).length;
    const erroresHoy = todayLogs.filter((l) => l.tipo === 'error').length;
    return {
      totalHoy: todayLogs.length,
      fallbacksHoy,
      erroresHoy,
      totalVisible: filteredLogs.length,
    };
  }, [logs, filteredLogs]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Consultas hoy" value={stats.totalHoy} icon={Bot} tint="blue" />
        <Stat label="Fallbacks hoy" value={stats.fallbacksHoy} icon={Zap} tint="amber" />
        <Stat label="Errores hoy" value={stats.erroresHoy} icon={AlertTriangle} tint="rose" />
        <Stat
          label="Registros visibles"
          value={stats.totalVisible}
          icon={FileText}
          tint="emerald"
        />
      </div>

      {/* Resumen agregado */}
      {resumen && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-400 mb-2">Por proveedor</p>
            <div className="space-y-1.5">
              {resumen.por_proveedor?.map((p) => (
                <div key={p.proveedor} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 capitalize">
                    {p.proveedor || 'N/A'}
                  </span>
                  <span className="font-bold text-gray-900">{p.total}</span>
                </div>
              )) || <p className="text-xs text-gray-400">Sin datos</p>}
            </div>
          </div>
          <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-400 mb-2">Por tipo</p>
            <div className="space-y-1.5">
              {resumen.por_tipo?.map((t) => (
                <div key={t.tipo} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 capitalize">{t.tipo}</span>
                  <span className="font-bold text-gray-900">{t.total}</span>
                </div>
              )) || <p className="text-xs text-gray-400">Sin datos</p>}
            </div>
          </div>
          <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-semibold text-gray-400 mb-2">Duración</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Promedio</span>
                <span className="font-bold text-gray-900">
                  {formatDuration(resumen.duracion?.promedio_ms)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Máximo</span>
                <span className="font-bold text-gray-900">
                  {formatDuration(resumen.duracion?.maximo_ms)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Mínimo</span>
                <span className="font-bold text-gray-900">
                  {formatDuration(resumen.duracion?.minimo_ms)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <FiltrosBar
        search={search}
        setSearch={setSearch}
        limit={limit}
        setLimit={setLimit}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        onReload={onReload}
        onExport={() => exportToCSV(filteredLogs, 'auditoria_ia')}
        loading={loading}
      />

      {error && (
        <div className="flex items-center gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-amber-800">{error}</p>
        </div>
      )}

      <div className="overflow-hidden rounded-[24px] border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 whitespace-nowrap">
                  Fecha
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Usuario</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Tipo</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Pregunta</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Respuesta</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Proveedor</th>
                <th className="px-4 py-3 text-[10px] font-semibold text-gray-400">Duración</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <LoadingRow colSpan={7} />
              ) : filteredLogs.length === 0 ? (
                <EmptyRow colSpan={7} search={search} error={error} />
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log.id ?? idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="flex-shrink-0 text-gray-300" />
                        <span className="text-xs text-gray-600 font-mono">
                          {formatDate(log.creado_en)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                          <User size={13} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800 leading-tight">
                            {log.usuario_nombre || '—'}
                          </p>
                          {log.usuario_id && (
                            <p className="text-[10px] text-gray-400">ID: {log.usuario_id}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getIaTipoColor(
                            log.tipo
                          )}`}
                        >
                          {log.tipo || '—'}
                        </span>
                        {log.fallback ? (
                          <span
                            title="Usó proveedor de respaldo"
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600"
                          >
                            <Zap size={10} />
                          </span>
                        ) : null}
                        {log.tipo === 'error' || log.error ? (
                          <span
                            title={log.error}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600"
                          >
                            <AlertTriangle size={10} />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <TextoExpandible texto={log.pregunta} max={60} />
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <TextoExpandible texto={log.respuesta} max={60} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Cpu size={12} className="text-gray-400" />
                        <div>
                          <p className="text-xs font-semibold text-gray-700">
                            {log.proveedor || '—'}
                          </p>
                          {log.modelo && <p className="text-[10px] text-gray-400">{log.modelo}</p>}
                          {log.proveedor_original && (
                            <p className="text-[10px] text-amber-500">
                              Fallback de {log.proveedor_original}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Timer size={12} className="text-gray-400" />
                        <span className="text-xs font-mono text-gray-600">
                          {formatDuration(log.duracion_ms)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filteredLogs.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-400 flex items-center justify-between">
            <span>
              Mostrando <span className="font-bold text-gray-600">{filteredLogs.length}</span> de{' '}
              <span className="font-bold text-gray-600">{logs.length}</span> registros
            </span>
            {logs.length >= limit && (
              <span className="text-amber-500 font-semibold">
                Límite alcanzado — aumenta el límite para ver más
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =======================================================================
   COMPONENTES AUXILIARES
   ======================================================================= */

function FiltrosBar({
  search,
  setSearch,
  limit,
  setLimit,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  onReload,
  onExport,
  loading,
}) {
  return (
    <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm outline-none transition focus:border-[#DC1F2D] focus:bg-white focus:ring-2 focus:ring-[#DC1F2D]/20"
          />
        </div>
        <div className="relative">
          <label
            htmlFor="field-Auditoria-jsx-759-0"
            className="mb-1 block text-[10px] font-semibold text-gray-400"
          >
            Registros
          </label>
          <div className="relative">
            <select
              id="field-Auditoria-jsx-759-0"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="appearance-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 pr-8 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#DC1F2D] focus:ring-2 focus:ring-[#DC1F2D]/20"
            >
              {LIMIT_OPTIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="field-Auditoria-jsx-779-1"
            className="mb-1 block text-[10px] font-semibold text-gray-400"
          >
            Desde
          </label>
          <input
            id="field-Auditoria-jsx-779-1"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#DC1F2D] focus:ring-2 focus:ring-[#DC1F2D]/20"
          />
        </div>
        <div>
          <label
            htmlFor="field-Auditoria-jsx-788-2"
            className="mb-1 block text-[10px] font-semibold text-gray-400"
          >
            Hasta
          </label>
          <input
            id="field-Auditoria-jsx-788-2"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#DC1F2D] focus:ring-2 focus:ring-[#DC1F2D]/20"
          />
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50"
        >
          <Download size={15} />
          Exportar CSV
        </button>
        <button
          onClick={onReload}
          disabled={loading}
          className="flex items-center gap-2 rounded-2xl bg-[#DC1F2D] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#B91C2A] disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Recargar
        </button>
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setSearch('');
              setDateFrom('');
              setDateTo('');
            }}
            className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-50"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function LoadingRow({ colSpan = 6 }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        <RefreshCw className="mx-auto mb-2 animate-spin text-[#DC1F2D]" size={24} />
        <p className="text-sm text-gray-400">Cargando registros...</p>
      </td>
    </tr>
  );
}

function EmptyRow({ colSpan = 6, search, error }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        <Shield className="mx-auto mb-2 text-gray-200" size={32} />
        <p className="text-sm font-semibold text-gray-400">
          {error ? 'No se pudieron cargar los registros' : 'No hay registros de auditoría'}
        </p>
        {search && (
          <p className="mt-1 text-xs text-gray-400">No coincide ningún resultado con “{search}”</p>
        )}
      </td>
    </tr>
  );
}

/* =======================================================================
   PÁGINA PRINCIPAL
   ======================================================================= */

export default function Auditoria() {
  const [tab, setTab] = useState('sistema'); // 'sistema' | 'ia'

  // ── Estado Sistema ──
  const [sysLogs, setSysLogs] = useState([]);
  const [sysLoading, setSysLoading] = useState(true);
  const [sysError, setSysError] = useState(null);
  const [sysSearch, setSysSearch] = useState('');
  const [sysLimit, setSysLimit] = useState(50);
  const [sysDateFrom, setSysDateFrom] = useState('');
  const [sysDateTo, setSysDateTo] = useState('');

  // ── Estado IA ──
  const [iaLogs, setIaLogs] = useState([]);
  const [iaLoading, setIaLoading] = useState(true);
  const [iaError, setIaError] = useState(null);
  const [iaSearch, setIaSearch] = useState('');
  const [iaLimit, setIaLimit] = useState(50);
  const [iaDateFrom, setIaDateFrom] = useState('');
  const [iaDateTo, setIaDateTo] = useState('');
  const [iaResumen, setIaResumen] = useState(null);

  const loadSistema = useCallback(async () => {
    setSysLoading(true);
    setSysError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(sysLimit));
      if (sysDateFrom) params.set('desde', sysDateFrom);
      if (sysDateTo) params.set('hasta', sysDateTo);
      const data = await api.get(`/configuracion/audit?${params.toString()}`);
      setSysLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?._httpStatus === 404) {
        setSysError('El endpoint de auditoría no está disponible en este servidor.');
        setSysLogs([]);
      } else {
        setSysError('Error al cargar los registros de auditoría.');
        toast.error('Error al cargar auditoría del sistema');
      }
    } finally {
      setSysLoading(false);
    }
  }, [sysLimit, sysDateFrom, sysDateTo]);

  const loadIa = useCallback(async () => {
    setIaLoading(true);
    setIaError(null);
    try {
      const params = new URLSearchParams();
      params.set('limite', String(iaLimit));
      if (iaDateFrom) params.set('fecha_desde', iaDateFrom);
      if (iaDateTo) params.set('fecha_hasta', iaDateTo);
      const data = await api.get(`/auditoria/ia?${params.toString()}`);
      setIaLogs(data?.resultados || []);

      // Cargar resumen
      const resParams = new URLSearchParams();
      if (iaDateFrom) resParams.set('fecha_desde', iaDateFrom);
      if (iaDateTo) resParams.set('fecha_hasta', iaDateTo);
      const resData = await api.get(`/auditoria/ia/resumen?${resParams.toString()}`);
      setIaResumen(resData);
    } catch (err) {
      if (err?._httpStatus === 404) {
        setIaError(
          'El endpoint de auditoría de IA no está disponible. Reiniciá el servidor para aplicar las migraciones.'
        );
        setIaLogs([]);
      } else {
        setIaError('Error al cargar la auditoría de IA.');
        toast.error('Error al cargar auditoría de IA');
      }
    } finally {
      setIaLoading(false);
    }
  }, [iaLimit, iaDateFrom, iaDateTo]);

  // Recargar automáticamente cuando cambian filtros de fecha/límite
  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === 'sistema') loadSistema();
    }, 300);
    return () => clearTimeout(t);
  }, [tab, sysLimit, sysDateFrom, sysDateTo, loadSistema]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (tab === 'ia') loadIa();
    }, 300);
    return () => clearTimeout(t);
  }, [tab, iaLimit, iaDateFrom, iaDateTo, loadIa]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Auditoría</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registro de acciones del sistema y del asistente de IA
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1 w-fit">
        <button
          onClick={() => setTab('sistema')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            tab === 'sistema'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Shield size={15} />
          Sistema
        </button>
        <button
          onClick={() => setTab('ia')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
            tab === 'ia' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Bot size={15} />
          Asistente IA
        </button>
      </div>

      {tab === 'sistema' ? (
        <SistemaSection
          logs={sysLogs}
          loading={sysLoading}
          error={sysError}
          search={sysSearch}
          setSearch={setSysSearch}
          limit={sysLimit}
          setLimit={setSysLimit}
          dateFrom={sysDateFrom}
          setDateFrom={setSysDateFrom}
          dateTo={sysDateTo}
          setDateTo={setSysDateTo}
          onReload={loadSistema}
        />
      ) : (
        <IaSection
          logs={iaLogs}
          loading={iaLoading}
          error={iaError}
          search={iaSearch}
          setSearch={setIaSearch}
          limit={iaLimit}
          setLimit={setIaLimit}
          dateFrom={iaDateFrom}
          setDateFrom={setIaDateFrom}
          dateTo={iaDateTo}
          setDateTo={setIaDateTo}
          onReload={loadIa}
          resumen={iaResumen}
        />
      )}
    </div>
  );
}

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
  Filter,
  ChevronDown,
  AlertCircle,
  FileText,
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

function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    // `creado_en` viene en UTC sin marcar: el registro de auditoría mostraba
    // cada acción 3 horas más tarde de lo que pasó. Ver lib/fechas.js.
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

function exportToCSV(logs) {
  if (!logs.length) {
    toast.error('No hay datos para exportar');
    return;
  }
  const headers = ['ID', 'Fecha', 'Actor', 'Módulo', 'Acción', 'Entidad', 'Entidad ID', 'Detalle'];
  const rows = logs.map((l) => [
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
  a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success('CSV exportado');
}

export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(50);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (dateFrom) params.set('desde', dateFrom);
      if (dateTo) params.set('hasta', dateTo);
      const data = await api.get(`/configuracion/audit?${params.toString()}`);
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err?.status === 404 || err?.statusCode === 404) {
        setError('El endpoint de auditoría no está disponible en este servidor.');
        setLogs([]);
      } else {
        setError('Error al cargar los registros de auditoría.');
        toast.error('Error al cargar auditoría');
      }
    } finally {
      setLoading(false);
    }
  }, [limit, dateFrom, dateTo]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

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

    // El rango de fechas (desde/hasta) ya se aplica en el servidor al cargar los datos.
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
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Auditoría del sistema
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Registro de todas las acciones realizadas en el sistema
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(filteredLogs)}
            className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-gray-50"
          >
            <Download size={15} />
            Exportar CSV
          </button>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="flex items-center gap-2 rounded-2xl bg-[#DC1F2D] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#B91C2A] disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Recargar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Eventos hoy" value={stats.totalHoy} icon={Activity} tint="blue" />
        <Stat label="Usuarios activos hoy" value={stats.usuariosHoy} icon={User} tint="emerald" />
        <Stat label="Registros visibles" value={stats.totalVisible} icon={FileText} tint="amber" />
      </div>

      {/* Filters */}
      <div className="rounded-[24px] border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Buscar por actor, módulo, acción..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm outline-none transition focus:border-[#DC1F2D] focus:bg-white focus:ring-2 focus:ring-[#DC1F2D]/20"
            />
          </div>

          {/* Limit */}
          <div className="relative">
            <label className="mb-1 block text-[10px] font-semibold text-gray-400">Registros</label>
            <div className="relative">
              <select
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

          {/* Date from */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-gray-400">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#DC1F2D] focus:ring-2 focus:ring-[#DC1F2D]/20"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="mb-1 block text-[10px] font-semibold text-gray-400">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-700 outline-none transition focus:border-[#DC1F2D] focus:ring-2 focus:ring-[#DC1F2D]/20"
            />
          </div>

          {/* Clear filters */}
          {(search || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setSearch('');
                setDateFrom('');
                setDateTo('');
              }}
              className="rounded-2xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-500 transition hover:bg-gray-50"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertCircle size={20} className="flex-shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-amber-800">{error}</p>
        </div>
      )}

      {/* Table */}
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
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <RefreshCw className="mx-auto mb-2 animate-spin text-[#DC1F2D]" size={24} />
                    <p className="text-sm text-gray-400">Cargando registros...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <Shield className="mx-auto mb-2 text-gray-200" size={32} />
                    <p className="text-sm font-semibold text-gray-400">
                      {error
                        ? 'No se pudieron cargar los registros'
                        : 'No hay registros de auditoría'}
                    </p>
                    {search && (
                      <p className="text-xs text-gray-400 mt-1">
                        No coincide ningún resultado con "{search}"
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, idx) => (
                  <tr key={log.id ?? idx} className="hover:bg-gray-50 transition-colors group">
                    {/* Fecha */}
                    <td className="px-5 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="flex-shrink-0 text-gray-300" />
                        <span className="text-xs text-gray-600 font-mono">
                          {formatDate(log.creado_en)}
                        </span>
                      </div>
                    </td>

                    {/* Actor */}
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

                    {/* Módulo */}
                    <td className="px-4 py-3">
                      {log.modulo ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getModuleColor(log.modulo)}`}
                        >
                          {log.modulo}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Acción */}
                    <td className="px-4 py-3">
                      {log.accion ? (
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${getActionColor(log.accion)}`}
                        >
                          {log.accion}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Entidad */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-gray-700">{log.entidad || '—'}</p>
                        {log.entidad_id != null && (
                          <p className="text-[10px] text-gray-400">#{log.entidad_id}</p>
                        )}
                      </div>
                    </td>

                    {/* Detalle */}
                    <td className="px-4 py-3">
                      <DetalleTooltip detalle={log.detalle} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!loading && filteredLogs.length > 0 && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-xs text-gray-400 flex items-center justify-between">
            <span>
              Mostrando <span className="font-bold text-gray-600">{filteredLogs.length}</span> de{' '}
              <span className="font-bold text-gray-600">{logs.length}</span> registros cargados
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

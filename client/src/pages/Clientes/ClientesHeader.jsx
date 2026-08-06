import { Download, Plus, RefreshCw, Search, Settings, X } from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';
import { CONTROL, SEGMENTOS, SELECT, Stat, NIVELES } from './clientesUi.jsx';

const BENEFICIOS = [
  'Con premio',
  'Fidelización activa',
  'Fidelización pausada',
  'Perfil incompleto',
];

export default function ClientesHeader({
  search,
  setSearch,
  filtroNivel,
  setFiltroNivel,
  filtroEstado,
  setFiltroEstado,
  filtroBeneficio,
  setFiltroBeneficio,
  stats,
  resultados,
  loading,
  canManageFidelidadConfig,
  onConfig,
  onExport,
  onNuevo,
  onRefresh,
  fmtMoney,
}) {
  const hayFiltros =
    Boolean(search.trim()) ||
    filtroNivel !== 'Todos' ||
    filtroEstado !== 'Todos' ||
    filtroBeneficio !== 'Todos';

  const limpiarFiltros = () => {
    setSearch('');
    setFiltroNivel('Todos');
    setFiltroEstado('Todos');
    setFiltroBeneficio('Todos');
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Clientes</h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            {stats.total === 0
              ? 'Todavía no hay clientes cargados'
              : `${stats.total} ${stats.total === 1 ? 'cliente registrado' : 'clientes registrados'}`}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onNuevo}
            style={{ background: BRAND }}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            <Plus size={16} strokeWidth={STROKE} />
            Nuevo cliente
          </button>
          <button
            type="button"
            onClick={onConfig}
            disabled={!canManageFidelidadConfig}
            title={
              canManageFidelidadConfig
                ? 'Configuración de fidelidad'
                : 'No tenés permisos para esta configuración'
            }
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 disabled:opacity-40"
          >
            <Settings size={16} strokeWidth={STROKE} />
            Fidelidad
          </button>
          <button
            type="button"
            onClick={onExport}
            title="Exportar los clientes filtrados a CSV"
            className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-600 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
          >
            <Download size={16} strokeWidth={STROKE} />
            CSV
          </button>
          <button
            type="button"
            onClick={onRefresh}
            title="Actualizar"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-gray-500 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50"
          >
            <RefreshCw size={16} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/*
        Eran tres tarjetas decorativas. "Ventas acumuladas" se llamaba LTV, que
        es otra cosa. Y faltaba lo accionable: cuántos tienen un premio esperando
        y cuántos no tienen teléfono —esos últimos no se pueden contactar por
        WhatsApp, que es el único canal real acá—.
      */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Clientes registrados" value={stats.total} tono="azul" />
        <Stat
          label="Con premio para canjear"
          value={stats.conPremio}
          helper={stats.conPremio > 0 ? 'Conviene avisarles' : 'Ninguno pendiente'}
          tono="verde"
        />
        <Stat label="Clientes VIP" value={stats.vip} helper="Por gasto y frecuencia" tono="ambar" />
        <Stat
          label="Facturado histórico"
          value={fmtMoney(stats.facturado)}
          helper="Solo pedidos con cliente identificado"
          tono="violeta"
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
              strokeWidth={STROKE}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o código"
              className={CONTROL + ' pl-9'}
            />
          </div>

          <select
            value={filtroNivel}
            onChange={(e) => setFiltroNivel(e.target.value)}
            className={SELECT}
          >
            <option value="Todos">Todos los niveles</option>
            {NIVELES.map((nivel) => (
              <option key={nivel} value={nivel}>
                {nivel}
              </option>
            ))}
          </select>

          {/*
            Las opciones guardaban la etiqueta ("En riesgo") mientras el estado
            del cliente era una clave ("riesgo"), así que el filtro tenía que
            traducir a mano y alguna variante siempre quedaba afuera.
          */}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className={SELECT}
          >
            <option value="Todos">Todos los estados</option>
            {Object.entries(SEGMENTOS).map(([key, tono]) => (
              <option key={key} value={key}>
                {tono.label}
              </option>
            ))}
          </select>

          <select
            value={filtroBeneficio}
            onChange={(e) => setFiltroBeneficio(e.target.value)}
            className={SELECT}
          >
            <option value="Todos">Todos los beneficios</option>
            {BENEFICIOS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        {/*
          Aplicabas tres filtros y no sabías si estabas viendo 4 de 300 o los
          300. Tampoco había forma de volver atrás sin tocar los tres selects.
        */}
        {hayFiltros ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3">
            <p className="text-[12px] text-gray-500">
              {resultados === 0 ? (
                'Ningún cliente coincide con estos filtros'
              ) : (
                <>
                  Mostrando <span className="font-semibold text-gray-900">{resultados}</span> de{' '}
                  {stats.total}
                </>
              )}
            </p>
            <button
              type="button"
              onClick={limpiarFiltros}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-500 transition hover:text-gray-900"
            >
              <X size={13} strokeWidth={STROKE} />
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}

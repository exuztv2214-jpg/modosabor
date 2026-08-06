import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Check,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
} from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';
import { Card, Empty, Stat } from './Clientes/clientesUi.jsx';

/**
 * Límites de Monteros.
 *
 * Es la misma caja que usa el backend (`MONTEROS_BOUNDS` en
 * utils/deliveryZones.js). Se repite acá para poder avisar mientras se
 * escribe, en vez de esperar el error del servidor.
 */
const BOUNDS = { minLat: -27.23, maxLat: -27.1, minLng: -65.57, maxLng: -65.42 };

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-[13px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';
const LABEL = 'mb-1.5 block text-[12px] font-medium text-gray-600';

const emptyForm = { latitud: '', longitud: '', notas: '', precision_m: '' };

function tieneCoords(lat, lng) {
  return (
    lat !== null &&
    lat !== undefined &&
    lat !== '' &&
    lng !== null &&
    lng !== undefined &&
    lng !== ''
  );
}

function fmtCoord(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(6) : String(value);
}

function dentroDeMonteros(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  return la >= BOUNDS.minLat && la <= BOUNDS.maxLat && ln >= BOUNDS.minLng && ln <= BOUNDS.maxLng;
}

/**
 * Diagnóstico del punto que se está por guardar.
 *
 * Antes no había ninguno: se guardaba y recién ahí el backend decía algo (y
 * hasta hoy ni siquiera validaba que el punto estuviera en Monteros).
 */
function revisarPunto(lat, lng) {
  if (lat === '' && lng === '')
    return { estado: 'vacio', mensaje: 'Todavía no cargaste un punto.' };

  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) {
    return { estado: 'error', mensaje: 'Latitud y longitud tienen que ser números.' };
  }
  if (dentroDeMonteros(la, ln)) {
    return { estado: 'ok', mensaje: 'El punto cae dentro de Monteros.' };
  }
  // El error más común y el más difícil de ver a ojo.
  if (dentroDeMonteros(ln, la)) {
    return {
      estado: 'invertido',
      mensaje: 'Parecen invertidas: la latitud va primero y en Monteros es cerca de -27.',
    };
  }
  return {
    estado: 'fuera',
    mensaje: 'Este punto queda fuera de Monteros. El rider lo va a seguir igual.',
  };
}

function parseCoordenadas(value) {
  const text = String(value || '').trim();
  const match = text.match(/(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  return { latitud: match[1].replace(',', '.'), longitud: match[2].replace(',', '.') };
}

export default function Direcciones() {
  const [barrios, setBarrios] = useState([]);
  const [selectedBarrioId, setSelectedBarrioId] = useState('');
  const [selectedManzanaId, setSelectedManzanaId] = useState('');
  const [selectedCasa, setSelectedCasa] = useState('');
  const [casas, setCasas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCasas, setLoadingCasas] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pegar, setPegar] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const selectedBarrio = useMemo(
    () => barrios.find((b) => String(b.id) === String(selectedBarrioId)) || null,
    [barrios, selectedBarrioId]
  );
  const selectedManzana = useMemo(
    () => selectedBarrio?.manzanas?.find((m) => String(m.id) === String(selectedManzanaId)) || null,
    [selectedBarrio, selectedManzanaId]
  );
  const selectedCasaRow = useMemo(
    () => casas.find((c) => String(c.casa) === String(selectedCasa)) || null,
    [casas, selectedCasa]
  );

  const barriosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return barrios;
    return barrios.filter((b) =>
      String(b.nombre || '')
        .toLowerCase()
        .includes(q)
    );
  }, [barrios, busqueda]);

  const stats = useMemo(() => {
    const manzanas = barrios.reduce((s, b) => s + (b.manzanas?.length || 0), 0);
    const barriosConGps = barrios.filter((b) => tieneCoords(b.centro_lat, b.centro_lng)).length;
    const manzanasConGps = barrios.reduce(
      (s, b) => s + (b.manzanas || []).filter((m) => tieneCoords(m.latitud, m.longitud)).length,
      0
    );
    return { barrios: barrios.length, manzanas, barriosConGps, manzanasConGps };
  }, [barrios]);

  const diagnostico = revisarPunto(form.latitud, form.longitud);
  const puntoUsable = diagnostico.estado === 'ok';
  const mapsUrl =
    form.latitud && form.longitud
      ? `https://www.google.com/maps?q=${encodeURIComponent(`${form.latitud},${form.longitud}`)}`
      : null;

  const cargarBarrios = async () => {
    setLoading(true);
    try {
      const response = await api.get('/direcciones/barrios');
      const items = Array.isArray(response?.barrios) ? response.barrios : [];
      setBarrios(items);
      if (!selectedBarrioId && items[0]) setSelectedBarrioId(String(items[0].id));
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar los barrios');
    } finally {
      setLoading(false);
    }
  };

  const cargarCasas = async (barrioId, manzana) => {
    if (!barrioId || !manzana) return setCasas([]);
    setLoadingCasas(true);
    try {
      const response = await api.get(
        `/direcciones/barrios/${barrioId}/manzanas/${encodeURIComponent(manzana)}/casas`
      );
      const items = Array.isArray(response?.casas) ? response.casas : [];
      setCasas(items);
      setSelectedCasa((c) => (items.some((i) => String(i.casa) === String(c)) ? c : ''));
    } catch (error) {
      setCasas([]);
      toast.error(error?.error || 'No se pudieron cargar las casas');
    } finally {
      setLoadingCasas(false);
    }
  };

  useEffect(() => {
    cargarBarrios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelectedManzanaId(
      selectedBarrio?.manzanas?.[0] ? String(selectedBarrio.manzanas[0].id) : ''
    );
    setSelectedCasa('');
    setCasas([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarrioId]);

  useEffect(() => {
    if (selectedBarrio && selectedManzana) cargarCasas(selectedBarrio.id, selectedManzana.letra);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBarrio?.id, selectedManzana?.id]);

  useEffect(() => {
    if (selectedCasaRow?.confirmado) {
      setForm({
        latitud: selectedCasaRow.latitud || '',
        longitud: selectedCasaRow.longitud || '',
        notas: selectedCasaRow.notas || '',
        precision_m: selectedCasaRow.precision_m || '',
      });
    } else {
      setForm(emptyForm);
    }
  }, [selectedCasaRow]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) return toast.error('Este equipo no permite leer ubicación');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitud: pos.coords.latitude.toFixed(7),
          longitud: pos.coords.longitude.toFixed(7),
          precision_m: Math.round(pos.coords.accuracy || 0),
        }));
        toast.success('Ubicación copiada');
      },
      () => toast.error('No se pudo obtener la ubicación'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const pegarCoordenadas = () => {
    const parsed = parseCoordenadas(pegar);
    if (!parsed) return toast.error('Pegá algo tipo -27.166, -65.500');
    setForm((f) => ({ ...f, ...parsed }));
    setPegar('');
  };

  const guardar = async (tipo) => {
    if (!puntoUsable) return toast.error(diagnostico.mensaje);
    setSaving(true);
    try {
      if (tipo === 'casa') {
        if (!selectedCasa) return toast.error('Elegí una casa');
        await api.post('/direcciones/casas', {
          barrio_id: selectedBarrio.id,
          manzana_id: selectedManzana.id,
          casa: selectedCasa,
          latitud: form.latitud,
          longitud: form.longitud,
          precision_m: form.precision_m,
          notas: form.notas,
          origen: 'manual_admin',
          confianza: 1,
        });
        toast.success(`Casa ${selectedCasa} confirmada`);
        await cargarCasas(selectedBarrio.id, selectedManzana.letra);
      } else if (tipo === 'manzana') {
        await api.put(
          `/direcciones/barrios/${selectedBarrio.id}/manzanas/${encodeURIComponent(selectedManzana.letra)}/centro`,
          { latitud: form.latitud, longitud: form.longitud, notas: form.notas }
        );
        toast.success(`Centro de la manzana ${selectedManzana.letra} guardado`);
        await cargarBarrios();
      } else {
        await api.put(`/direcciones/barrios/${selectedBarrio.id}/centro`, {
          latitud: form.latitud,
          longitud: form.longitud,
          notas: form.notas,
        });
        toast.success(`Centro de ${selectedBarrio.nombre} guardado`);
        await cargarBarrios();
      }
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar el punto');
    } finally {
      setSaving(false);
    }
  };

  const TONO_DIAG = {
    ok: { bg: '#E7F5EF', fg: '#0F6E56' },
    vacio: { bg: '#F9FAFB', fg: '#6B7280' },
    error: { bg: '#FEF2F2', fg: '#9E141E' },
    fuera: { bg: '#FEF2F2', fg: '#9E141E' },
    invertido: { bg: '#FDF3D3', fg: '#95661A' },
  };
  const tonoDiag = TONO_DIAG[diagnostico.estado] || TONO_DIAG.vacio;

  return (
    <div className="space-y-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Barrios y manzanas
          </h1>
          <p className="mt-0.5 text-[13px] text-gray-500">
            Puntos confirmados para que el rider no dependa de una búsqueda dudosa en Maps
          </p>
        </div>
        <button
          type="button"
          onClick={cargarBarrios}
          disabled={loading}
          className="flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition hover:bg-gray-50 disabled:opacity-40"
        >
          {loading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <RefreshCw size={15} strokeWidth={STROKE} />
          )}
          Actualizar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Barrios" value={stats.barrios} />
        <Stat
          label="Barrios con GPS"
          value={`${stats.barriosConGps} de ${stats.barrios}`}
          alerta={stats.barrios > 0 && stats.barriosConGps < stats.barrios}
          helper={
            stats.barriosConGps < stats.barrios
              ? 'Los que faltan caen en la dirección escrita'
              : 'Todos ubicados'
          }
        />
        <Stat label="Manzanas" value={stats.manzanas} />
        <Stat
          label="Manzanas con GPS"
          value={`${stats.manzanasConGps} de ${stats.manzanas}`}
          alerta={stats.manzanas > 0 && stats.manzanasConGps < stats.manzanas}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Card title="Barrios">
          <div className="relative mb-3">
            <Search
              size={15}
              strokeWidth={STROKE}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar barrio"
              className={`${CONTROL} pl-9`}
            />
          </div>

          <div className="max-h-[520px] space-y-1.5 overflow-y-auto">
            {barriosFiltrados.length === 0 ? (
              <Empty title="Sin barrios" description="No hay barrios que coincidan." />
            ) : (
              barriosFiltrados.map((barrio) => {
                const activo = String(barrio.id) === String(selectedBarrioId);
                const conGps = tieneCoords(barrio.centro_lat, barrio.centro_lng);
                return (
                  <button
                    key={barrio.id}
                    type="button"
                    onClick={() => setSelectedBarrioId(String(barrio.id))}
                    className={`relative flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                      activo ? 'bg-rose-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {activo ? (
                      <span
                        className="absolute inset-y-2 left-0 w-[3px] rounded-full"
                        style={{ background: BRAND }}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 pl-1">
                      <p
                        className="truncate text-[13px] font-medium"
                        style={{ color: activo ? BRAND : '#111827' }}
                      >
                        {barrio.nombre}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-gray-500">
                        {barrio.manzanas?.length || 0} manzanas
                        {conGps ? '' : ' · sin GPS'}
                      </p>
                    </div>
                    {conGps ? (
                      <Check size={15} strokeWidth={STROKE} className="shrink-0 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        size={15}
                        strokeWidth={STROKE}
                        className="shrink-0 text-amber-500"
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card
            title={selectedBarrio?.nombre || 'Elegí un barrio'}
            helper={
              selectedBarrio
                ? `Centro del barrio: ${fmtCoord(selectedBarrio.centro_lat)}, ${fmtCoord(selectedBarrio.centro_lng)}`
                : null
            }
          >
            {!selectedBarrio ? (
              <Empty title="Ningún barrio seleccionado" />
            ) : (selectedBarrio.manzanas || []).length === 0 ? (
              <Empty
                title="Este barrio no tiene manzanas"
                description="Se puede igual guardar el centro del barrio abajo."
              />
            ) : (
              <>
                <p className={LABEL}>Manzana</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedBarrio.manzanas.map((manzana) => {
                    const activa = String(manzana.id) === String(selectedManzanaId);
                    const conGps = tieneCoords(manzana.latitud, manzana.longitud);
                    return (
                      <button
                        key={manzana.id}
                        type="button"
                        onClick={() => setSelectedManzanaId(String(manzana.id))}
                        className="relative h-10 min-w-[44px] rounded-xl px-3 text-[13px] font-semibold transition"
                        style={{
                          background: activa ? BRAND : '#F3F4F6',
                          color: activa ? '#FFFFFF' : '#4B5563',
                        }}
                        title={conGps ? 'Con GPS' : 'Sin GPS'}
                      >
                        {manzana.letra}
                        {/* Un punto marca las manzanas que todavía no tienen
                            centro cargado, para saber cuáles faltan sin
                            entrar una por una. */}
                        {!conGps ? (
                          <span
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                            style={{ background: activa ? '#FFFFFF' : '#F59E0B' }}
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                {selectedManzana ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className="text-[12px] text-gray-500">Centro de la manzana</p>
                      <p className="mt-1 font-mono text-[13px] text-gray-900">
                        {fmtCoord(selectedManzana.latitud)}, {fmtCoord(selectedManzana.longitud)}
                      </p>
                      <p className="mt-1.5 text-[11px] text-gray-400">
                        {selectedManzana.casas_validas?.length || 0} casas en el plano
                      </p>
                    </div>

                    <div className="rounded-xl bg-gray-50 p-4">
                      <p className={LABEL}>Casa</p>
                      {loadingCasas ? (
                        <p className="flex items-center gap-2 text-[13px] text-gray-500">
                          <Loader2 size={14} className="animate-spin" /> Cargando…
                        </p>
                      ) : casas.length === 0 ? (
                        <p className="text-[12px] text-gray-400">
                          Este plano no tiene casas numeradas.
                        </p>
                      ) : (
                        <select
                          value={selectedCasa}
                          onChange={(e) => setSelectedCasa(e.target.value)}
                          className={CONTROL}
                        >
                          <option value="">Sin casa puntual</option>
                          {casas.map((casa) => (
                            <option key={casa.casa} value={casa.casa}>
                              Casa {casa.casa}
                              {casa.confirmado ? ' · con GPS' : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </Card>

          <Card
            title="Confirmar un punto"
            helper="Cargá las coordenadas y elegí a qué nivel corresponden"
            action={
              <button
                type="button"
                onClick={usarUbicacionActual}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                <Crosshair size={13} strokeWidth={STROKE} />
                Estoy acá
              </button>
            }
          >
            <div className="mb-3 flex gap-2">
              <input
                value={pegar}
                onChange={(e) => setPegar(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && pegarCoordenadas()}
                placeholder="Pegar de Maps: -27.166000, -65.500000"
                className={CONTROL}
              />
              <button
                type="button"
                onClick={pegarCoordenadas}
                className="h-11 shrink-0 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
              >
                Pegar
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="block">
                <span className={LABEL}>Latitud</span>
                <input
                  value={form.latitud}
                  onChange={set('latitud')}
                  className={`${CONTROL} font-mono`}
                  placeholder="-27.166"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Longitud</span>
                <input
                  value={form.longitud}
                  onChange={set('longitud')}
                  className={`${CONTROL} font-mono`}
                  placeholder="-65.500"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Precisión (m)</span>
                <input
                  value={form.precision_m}
                  onChange={set('precision_m')}
                  className={CONTROL}
                  inputMode="numeric"
                />
              </label>
              <label className="block">
                <span className={LABEL}>Referencia</span>
                <input
                  value={form.notas}
                  onChange={set('notas')}
                  className={CONTROL}
                  placeholder="Portón verde, esquina"
                />
              </label>
            </div>

            {/* Antes se guardaba a ciegas: no había forma de saber si el punto
                caía donde uno pensaba hasta que el rider se perdía. */}
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
              style={{ background: tonoDiag.bg }}
            >
              <p className="text-[12px] font-medium" style={{ color: tonoDiag.fg }}>
                {diagnostico.mensaje}
              </p>
              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-100"
                >
                  <ExternalLink size={12} strokeWidth={STROKE} />
                  Ver en Maps
                </a>
              ) : null}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <button
                type="button"
                onClick={() => guardar('barrio')}
                disabled={saving || !puntoUsable || !selectedBarrio}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
              >
                <MapPin size={14} strokeWidth={STROKE} />
                Centro del barrio
              </button>
              <button
                type="button"
                onClick={() => guardar('manzana')}
                disabled={saving || !puntoUsable || !selectedManzana}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
              >
                <MapPin size={14} strokeWidth={STROKE} />
                Centro de manzana {selectedManzana?.letra || ''}
              </button>
              <button
                type="button"
                onClick={() => guardar('casa')}
                disabled={saving || !puntoUsable || !selectedCasa}
                style={{ background: BRAND }}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
              >
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} strokeWidth={STROKE} />
                )}
                Casa {selectedCasa || 'exacta'}
              </button>
            </div>
          </Card>

          <div className="rounded-2xl bg-gray-50 px-4 py-3">
            <p className="text-[12px] leading-relaxed text-gray-600">
              Si un domicilio no tiene GPS confirmado, el sistema guarda barrio, manzana y casa como
              dirección escrita, pero <span className="font-medium">no inventa un punto</span> en el
              mapa. Es lo que evita que el rider termine en Concepción o Bella Vista.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

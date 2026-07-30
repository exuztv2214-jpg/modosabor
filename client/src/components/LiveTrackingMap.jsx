import { useEffect, useRef, useState } from 'react';
import { MapPin, Phone, Clock, AlertTriangle, Bike, Route } from 'lucide-react';

import { buildGoogleMapsDirectionsUrl, buildGoogleMapsSearchUrl } from '../lib/maps.js';

// ── Leaflet dinámico ──
function loadLeafletCSS() {
  if (document.getElementById('leaflet-css')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = 'leaflet-css';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    link.crossOrigin = '';
    link.onload = resolve;
    document.head.appendChild(link);
  });
}

function loadLeafletJS() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = '';
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ── Haversine distance ──
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── ETA dinámico basado en velocidad ──
const DEFAULT_SPEED_KMH = 20;
const SPEED_HISTORY_MAX = 10; // máximo de muestras de velocidad
const MIN_DISTANCE_FOR_SPEED = 5; // metros mínimos para considerar movimiento

function useDynamicEta(riderLat, riderLng, clientLat, clientLng, externalEtaMinutes) {
  const historyRef = useRef([]);
  const [eta, setEta] = useState(externalEtaMinutes);
  const [speedKmh, setSpeedKmh] = useState(null);

  useEffect(() => {
    if (!riderLat || !riderLng || !clientLat || !clientLng) {
      setEta(externalEtaMinutes);
      return;
    }

    const now = Date.now();
    const distanceMeters = calculateDistance(riderLat, riderLng, clientLat, clientLng);

    // Agregar muestra al historial
    const history = historyRef.current;
    history.push({ lat: riderLat, lng: riderLng, time: now, distance: distanceMeters });

    // Mantener solo las últimas N muestras
    if (history.length > SPEED_HISTORY_MAX) {
      history.shift();
    }

    // Calcular velocidad promedio si hay suficiente historial
    let avgSpeed = DEFAULT_SPEED_KMH;
    if (history.length >= 2) {
      // Encontrar la primera muestra válida (con distancia suficiente de movimiento)
      let firstValidIndex = 0;
      for (let i = 0; i < history.length - 1; i++) {
        const d = calculateDistance(
          history[i].lat,
          history[i].lng,
          history[history.length - 1].lat,
          history[history.length - 1].lng
        );
        if (d >= MIN_DISTANCE_FOR_SPEED) {
          firstValidIndex = i;
          break;
        }
      }

      const first = history[firstValidIndex];
      const last = history[history.length - 1];
      const timeDiffHours = (last.time - first.time) / (1000 * 60 * 60);
      const distDiffKm = calculateDistance(first.lat, first.lng, last.lat, last.lng) / 1000;

      if (timeDiffHours > 0 && distDiffKm > 0.01) {
        const calculatedSpeed = distDiffKm / timeDiffHours;
        // Clamp velocidad entre 5 y 60 km/h para evitar outliers
        avgSpeed = Math.max(5, Math.min(60, calculatedSpeed));
        setSpeedKmh(Math.round(avgSpeed * 10) / 10);
      }
    }

    // Calcular ETA: distancia / velocidad
    const distanceKm = distanceMeters / 1000;
    const etaMinutes = Math.max(1, Math.round((distanceKm / avgSpeed) * 60));
    setEta(etaMinutes);
  }, [riderLat, riderLng, clientLat, clientLng, externalEtaMinutes]);

  return { etaMinutes: eta, speedKmh };
}

export default function LiveTrackingMap({
  riderLat,
  riderLng,
  clientLat,
  clientLng,
  clientAddress,
  riderName,
  riderPhone,
  etaMinutes: externalEtaMinutes,
  isStale,
  mapConfig = {},
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const clientMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const deliveryZoneRef = useRef(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [distance, setDistance] = useState(null);
  const [isArriving, setIsArriving] = useState(false);
  const prevRiderRef = useRef({ lat: null, lng: null });

  // ETA dinámico basado en velocidad real del rider
  const { etaMinutes: dynamicEta, speedKmh } = useDynamicEta(
    riderLat,
    riderLng,
    clientLat,
    clientLng,
    externalEtaMinutes
  );

  // Cargar Leaflet
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !mapLoaded) {
        setLoadError('El mapa no respondió a tiempo');
      }
    }, 8000);

    Promise.all([loadLeafletCSS(), loadLeafletJS()])
      .then(() => {
        if (!cancelled) setMapLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError('No se pudo cargar el mapa');
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [mapLoaded]);

  const destinationUrl = buildGoogleMapsDirectionsUrl(
    {
      latitud: clientLat,
      longitud: clientLng,
      direccion: clientAddress,
    },
    mapConfig
  );
  const riderUrl =
    riderLat && riderLng
      ? buildGoogleMapsSearchUrl(
          { latitud: riderLat, longitud: riderLng, direccion: '' },
          mapConfig
        )
      : '';

  // Inicializar mapa
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || mapInstanceRef.current) return;

    const L = window.L;
    const center =
      clientLat && clientLng ? [clientLat, clientLng] : [riderLat || -26.95, riderLng || -65.3];

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    mapInstanceRef.current = map;

    // Zona de delivery (Monteros)
    const zoneCenter = [-26.975, -65.275];
    const deliveryZone = L.circle(zoneCenter, {
      color: '#93C5FD',
      fillColor: '#93C5FD',
      fillOpacity: 0.08,
      weight: 2,
      dashArray: '8, 6',
    })
      .addTo(map)
      .bindPopup('Zona de delivery - Monteros');
    deliveryZoneRef.current = deliveryZone;

    // Icono cliente (destino)
    const clientIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:40px;height:40px;border-radius:50%;background:#059669;border:3px solid white;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    // Icono repartidor (moto con animación)
    const riderIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width:48px;height:48px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 2px 12px rgba(37,99,235,0.5);display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;"><svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (clientLat && clientLng) {
      clientMarkerRef.current = L.marker([clientLat, clientLng], {
        icon: clientIcon,
      })
        .addTo(map)
        .bindPopup(clientAddress || 'Tu dirección');
    }

    if (riderLat && riderLng) {
      riderMarkerRef.current = L.marker([riderLat, riderLng], {
        icon: riderIcon,
      })
        .addTo(map)
        .bindPopup(riderName || 'Repartidor');
    }

    if (riderLat && riderLng && clientLat && clientLng) {
      const routeLine = L.polyline(
        [
          [riderLat, riderLng],
          [clientLat, clientLng],
        ],
        {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
          dashArray: '12, 8',
        }
      ).addTo(map);
      routeLineRef.current = routeLine;

      const bounds = L.latLngBounds([riderLat, riderLng], [clientLat, clientLng]);
      map.fitBounds(bounds, { padding: [80, 80] });

      // Calcular distancia inicial
      const dist = calculateDistance(riderLat, riderLng, clientLat, clientLng);
      setDistance(Math.round(dist));
      setIsArriving(dist < 150);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        deliveryZoneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, clientLat, clientLng, clientAddress, riderName]);

  // Actualizar posición del repartidor + distancia
  useEffect(() => {
    if (!mapInstanceRef.current || !riderMarkerRef.current) return;
    if (!riderLat || !riderLng) return;

    const prev = prevRiderRef.current;
    const hasMoved = prev.lat !== riderLat || prev.lng !== riderLng;

    if (hasMoved) {
      const newLatLng = [riderLat, riderLng];
      riderMarkerRef.current.setLatLng(newLatLng);
      mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 1 });

      if (routeLineRef.current && clientLat && clientLng) {
        routeLineRef.current.setLatLngs([newLatLng, [clientLat, clientLng]]);
      }

      prevRiderRef.current = { lat: riderLat, lng: riderLng };

      // Recalcular distancia
      if (clientLat && clientLng) {
        const dist = calculateDistance(riderLat, riderLng, clientLat, clientLng);
        setDistance(Math.round(dist));
        setIsArriving(dist < 150);
      }
    }
  }, [riderLat, riderLng, clientLat, clientLng]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
        <AlertTriangle size={32} className="text-amber-500" />
        <p className="mt-3 text-sm font-bold text-gray-700">{loadError}</p>
        <p className="mt-1 text-xs text-gray-500">
          El tracking sigue funcionando y podés abrir la ubicación en Google Maps.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {destinationUrl ? (
            <a
              href={destinationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-500 px-4 text-xs font-black uppercase tracking-wider text-white"
            >
              <Route size={15} />
              Abrir destino
            </a>
          ) : null}
          {riderUrl ? (
            <a
              href={riderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-xs font-black uppercase tracking-wider text-gray-700"
            >
              <MapPin size={15} />
              Ver rider
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (!mapLoaded) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-gray-200 bg-gray-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          <p className="mt-3 text-sm font-bold text-gray-500">Cargando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-gray-200">
      <div ref={mapRef} className="h-full w-full" style={{ zIndex: 1 }} />

      {/* ── BARRA SUPERIOR: estado del delivery + ETA dinámico ── */}
      <div className="absolute left-4 right-4 top-4 z-[400]">
        <div className="flex items-center justify-between rounded-2xl border border-gray-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                isArriving
                  ? 'bg-emerald-100 text-emerald-600'
                  : isStale
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-blue-100 text-blue-600'
              }`}
            >
              {isArriving ? (
                <MapPin size={20} />
              ) : isStale ? (
                <Clock size={20} />
              ) : (
                <Bike size={20} />
              )}
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">
                {isArriving
                  ? '¡Tu delivery está llegando!'
                  : isStale
                    ? 'Última ubicación registrada'
                    : 'Tu delivery en camino'}
              </p>
              {distance !== null && (
                <p className="text-xs font-medium text-gray-500">
                  {isArriving
                    ? `A ${distance} metros de tu puerta`
                    : `A ${distance} metros de distancia`}
                </p>
              )}
            </div>
          </div>
          {dynamicEta !== null && (
            <div className="text-right">
              <p className="text-xs font-medium text-gray-400">Llega en</p>
              <p className="text-lg font-black text-primary-600">{dynamicEta} min</p>
              {speedKmh !== null && (
                <p className="text-[10px] font-medium text-gray-400">{speedKmh} km/h promedio</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── BARRA INFERIOR: info del rider + acciones ── */}
      {riderName && (
        <div className="absolute bottom-4 left-4 right-4 z-[400]">
          <div className="rounded-2xl border border-gray-200/80 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`h-3 w-3 rounded-full ${
                    isStale ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                <div>
                  <p className="text-sm font-bold text-gray-900">{riderName}</p>
                  {riderPhone && (
                    <a href={`tel:${riderPhone}`} className="text-xs font-medium text-primary-600">
                      {riderPhone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {riderPhone && (
                  <a
                    href={`tel:${riderPhone}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-500 text-white shadow-md transition hover:bg-primary-600"
                    title="Llamar al repartidor"
                  >
                    <Phone size={16} />
                  </a>
                )}
                {destinationUrl && (
                  <a
                    href={destinationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md transition hover:bg-emerald-600"
                    title="Ver ruta en Google Maps"
                  >
                    <Route size={16} />
                  </a>
                )}
              </div>
            </div>
            {isStale && (
              <p className="mt-2 text-xs font-medium text-amber-600">
                La última ubicación tiene varios minutos. El tiempo estimado puede variar.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

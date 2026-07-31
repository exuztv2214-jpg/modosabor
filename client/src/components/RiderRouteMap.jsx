import { useEffect, useRef, useState } from 'react';
import { Navigation, AlertTriangle, MapPin } from 'lucide-react';

import {
  buildAddressForMaps,
  buildGoogleMapsDirectionsUrl,
  buildWazeUrl,
  isInsideServiceArea,
} from '../lib/maps.js';

function loadLeafletCSS() {
  if (document.getElementById('leaflet-css-rider')) return Promise.resolve();
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.id = 'leaflet-css-rider';
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

// ── OSRM: ruta real por calles ──
async function fetchRoute(lat1, lng1, lat2, lng2) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM error');
  const data = await res.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No route');
  // GeoJSON coordinates son [lng, lat]; Leaflet necesita [lat, lng]
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
}

// Dibuja una línea recta como fallback
function drawStraightLine(L, riderLat, riderLng, clientLat, clientLng) {
  return L.polyline(
    [
      [riderLat, riderLng],
      [clientLat, clientLng],
    ],
    { color: '#2563eb', weight: 5, opacity: 0.9, dashArray: '12, 8' }
  );
}

export default function RiderRouteMap({
  riderLat,
  riderLng,
  clientLat,
  clientLng,
  clientAddress,
  onNavigate,
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
  const arrivingNotifiedRef = useRef(false);
  const hasClientCoordinates =
    Number.isFinite(Number(clientLat)) &&
    Number.isFinite(Number(clientLng)) &&
    isInsideServiceArea(clientLat, clientLng, mapConfig);
  const effectiveClientLat = hasClientCoordinates ? Number(clientLat) : null;
  const effectiveClientLng = hasClientCoordinates ? Number(clientLng) : null;
  const safeAddress = buildAddressForMaps(clientAddress, mapConfig);
  const googleUrl = buildGoogleMapsDirectionsUrl(
    {
      latitud: clientLat,
      longitud: clientLng,
      direccion: clientAddress,
    },
    mapConfig
  );
  const wazeUrl = buildWazeUrl(
    {
      latitud: clientLat,
      longitud: clientLng,
      direccion: clientAddress,
    },
    mapConfig
  );

  // Cache de ruta + debounce
  const cachedRouteRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Calcular distancia en metros usando Haversine
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371000; // Radio de la Tierra en metros
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
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadLeafletCSS(), loadLeafletJS()])
      .then(([, L]) => {
        if (cancelled) return;
        setMapLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('No se pudo cargar el mapa');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (mapInstanceRef.current) return;

    const L = window.L;
    const center =
      riderLat && riderLng
        ? [riderLat, riderLng]
        : [effectiveClientLat || -27.16471, effectiveClientLng || -65.496712];

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(center, 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    mapInstanceRef.current = map;

    // ── Zona de delivery (Monteros) ──
    const zoneCenter = [-27.16471, -65.496712]; // Monteros, Tucuman
    // Radio amplio para cubrir la ciudad y barrios cercanos de reparto.
    const deliveryZone = L.circle(zoneCenter, {
      color: '#93C5FD',
      fillColor: '#93C5FD',
      fillOpacity: 0.1,
      weight: 2,
      dashArray: '8, 6',
    })
      .addTo(map)
      .bindPopup('Zona de delivery - Monteros');
    deliveryZoneRef.current = deliveryZone;

    const clientIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width: 40px; height: 40px; border-radius: 50%; background: #059669; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 40],
    });

    const riderIcon = L.divIcon({
      className: 'custom-marker',
      html: `<div style="width: 48px; height: 48px; border-radius: 50%; background: #2563eb; border: 3px solid white; box-shadow: 0 2px 12px rgba(37,99,235,0.5); display: flex; align-items: center; justify-content: center; animation: pulse 2s infinite;"><svg width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg></div>`,
      iconSize: [48, 48],
      iconAnchor: [24, 24],
    });

    if (effectiveClientLat && effectiveClientLng) {
      const clientMarker = L.marker([effectiveClientLat, effectiveClientLng], { icon: clientIcon })
        .addTo(map)
        .bindPopup(clientAddress || 'Destino');
      clientMarkerRef.current = clientMarker;
    }

    if (riderLat && riderLng) {
      const riderMarker = L.marker([riderLat, riderLng], { icon: riderIcon })
        .addTo(map)
        .bindPopup('Tu ubicación');
      riderMarkerRef.current = riderMarker;
    }

    if (riderLat && riderLng && effectiveClientLat && effectiveClientLng) {
      // Intentar ruta real por OSRM, fallback a línea recta
      fetchRoute(riderLat, riderLng, effectiveClientLat, effectiveClientLng)
        .then((coords) => {
          cachedRouteRef.current = coords;
          const routeLine = L.polyline(coords, {
            color: '#2563eb',
            weight: 5,
            opacity: 0.9,
            dashArray: '12, 8',
          }).addTo(map);
          routeLineRef.current = routeLine;

          const bounds = L.latLngBounds(coords);
          map.fitBounds(bounds, { padding: [80, 80] });
        })
        .catch(() => {
          // Fallback: línea recta
          const routeLine = drawStraightLine(
            L,
            riderLat,
            riderLng,
            effectiveClientLat,
            effectiveClientLng
          ).addTo(map);
          routeLineRef.current = routeLine;

          const bounds = L.latLngBounds(
            [riderLat, riderLng],
            [effectiveClientLat, effectiveClientLng]
          );
          map.fitBounds(bounds, { padding: [80, 80] });
        });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        deliveryZoneRef.current = null;
      }
    };
  }, [mapLoaded, effectiveClientLat, effectiveClientLng, clientAddress]);

  useEffect(() => {
    if (!mapInstanceRef.current || !riderMarkerRef.current) return;
    if (!riderLat || !riderLng) return;

    const prev = prevRiderRef.current;
    const hasMoved = prev.lat !== riderLat || prev.lng !== riderLng;

    if (hasMoved) {
      const newLatLng = [riderLat, riderLng];
      riderMarkerRef.current.setLatLng(newLatLng);
      prevRiderRef.current = { lat: riderLat, lng: riderLng };

      // Calcular distancia y verificar si está llegando
      if (effectiveClientLat && effectiveClientLng) {
        const dist = calculateDistance(riderLat, riderLng, effectiveClientLat, effectiveClientLng);
        setDistance(Math.round(dist));
        const arriving = dist < 150;
        setIsArriving(arriving);

        // Alerta sonora + vibración UNA SOLA VEZ cuando pasa de lejos a <150m
        if (arriving && !arrivingNotifiedRef.current) {
          arrivingNotifiedRef.current = true;
          // Vibración
          if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 200]);
          }
          // Beep con Web Audio API
          try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.type = 'sine';
              osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
              osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.15);
              gain.gain.setValueAtTime(0.3, ctx.currentTime);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.4);
            }
          } catch (e) {
            // Silencioso si no hay audio
          }
        }

        // Recalcular ruta solo si se movió significativamente (>50m) y con debounce 2s
        const movedDistance =
          prev.lat !== null ? calculateDistance(prev.lat, prev.lng, riderLat, riderLng) : 0;

        if (movedDistance > 50) {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = setTimeout(() => {
            if (!mapInstanceRef.current) return;
            fetchRoute(riderLat, riderLng, effectiveClientLat, effectiveClientLng)
              .then((coords) => {
                cachedRouteRef.current = coords;
                if (routeLineRef.current) {
                  routeLineRef.current.setLatLngs(coords);
                } else {
                  const L = window.L;
                  routeLineRef.current = L.polyline(coords, {
                    color: '#2563eb',
                    weight: 5,
                    opacity: 0.9,
                    dashArray: '12, 8',
                  }).addTo(mapInstanceRef.current);
                }
              })
              .catch(() => {
                // Fallback a línea recta
                if (routeLineRef.current) {
                  routeLineRef.current.setLatLngs([
                    newLatLng,
                    [effectiveClientLat, effectiveClientLng],
                  ]);
                }
              });
          }, 2000);
        } else if (routeLineRef.current && effectiveClientLat && effectiveClientLng) {
          // Movimiento menor: actualizar solo la primera coordenada de la ruta cacheada
          const cached = cachedRouteRef.current;
          if (cached && cached.length > 0) {
            cached[0] = newLatLng;
            routeLineRef.current.setLatLngs(cached);
          } else {
            routeLineRef.current.setLatLngs([newLatLng, [effectiveClientLat, effectiveClientLng]]);
          }
        }
      }
    }
  }, [riderLat, riderLng, effectiveClientLat, effectiveClientLng]);

  if (!hasClientCoordinates && clientAddress) {
    return (
      <div className="flex h-full flex-col justify-between rounded-2xl border border-gray-200 bg-white p-5">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <MapPin size={22} />
          </div>
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
            Destino sin GPS exacto
          </p>
          <p className="mt-2 text-base font-black leading-snug text-gray-900">{safeAddress}</p>
          <p className="mt-2 text-xs font-semibold leading-5 text-gray-500">
            Abrí la ruta con la dirección completa de Monteros. Al llegar, confirmá la ubicación si
            el cliente comparte GPS.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary-500 px-3 text-[11px] font-black uppercase tracking-wider text-white"
          >
            <Navigation size={15} />
            Maps
          </a>
          <a
            href={wazeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 text-[11px] font-black uppercase tracking-wider text-gray-700"
          >
            Waze
          </a>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 p-6 text-center">
        <AlertTriangle size={32} className="text-amber-500" />
        <p className="mt-3 text-sm font-bold text-gray-700">{loadError}</p>
        {googleUrl ? (
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary-500 px-4 text-xs font-black uppercase tracking-wider text-white"
          >
            <Navigation size={15} />
            Abrir ruta
          </a>
        ) : null}
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

      {/* Indicador de distancia / llegando */}
      {distance !== null && (
        <div
          className={`absolute left-4 top-4 z-[400] rounded-full px-4 py-2 text-xs font-black uppercase tracking-widest shadow-lg ${
            isArriving ? 'bg-emerald-500 text-white animate-pulse' : 'bg-white text-gray-700'
          }`}
        >
          {isArriving ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white animate-ping" />
              ¡Llegando! ({distance}m)
            </span>
          ) : (
            <span>A {distance}m del destino</span>
          )}
        </div>
      )}

      {onNavigate && clientLat && clientLng && (
        <button
          onClick={onNavigate}
          className="absolute right-4 top-4 z-[400] flex h-12 w-12 items-center justify-center rounded-full bg-primary-500 text-white shadow-lg transition hover:bg-primary-600"
          title="Navegar al destino"
        >
          <Navigation size={22} />
        </button>
      )}

      {/* Panel de dirección del cliente */}
      {clientAddress && (
        <div className="absolute bottom-4 left-4 right-4 z-[400] rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-2.5">
            <MapPin size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                Destino
              </p>
              <p className="mt-0.5 text-sm font-semibold text-gray-800 leading-snug">
                {clientAddress}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

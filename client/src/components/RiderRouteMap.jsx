import { useEffect, useRef, useState } from 'react';
import { Navigation, AlertTriangle, MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  buildAddressForMaps,
  buildGoogleMapsDirectionsUrl,
  isInsideServiceArea,
} from '../lib/maps.js';
import { obtenerRutaPorCalles } from '../lib/rutaCalles.js';

/*
  El pedido de ruta vivía acá con un `fetch` sin tiempo límite. Si el servicio
  de OSRM se quedaba pensando —cosa habitual en el servidor público gratuito, o
  con la señal floja andando por Monteros— la promesa no se resolvía nunca: el
  `catch` no llegaba a dispararse y el rider se quedaba sin ruta *y* sin la
  línea recta de respaldo. El mapa, mudo.

  Ahora usa el helper compartido, que corta a los 6 segundos, permite apuntar a
  otro servidor por configuración y devuelve `null` en vez de tirar. Ver
  lib/rutaCalles.js.
*/

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
  clientLocationExact = false,
  // Coordenadas puestas por geocoding del servidor (no compartidas por
  // el cliente). Son aproximadas pero suficientes para trazar la ruta:
  // sin esto el rider se quedaba sin mapa en casi todos los pedidos,
  // porque la mayoria entra con la direccion escrita a mano.
  clientGeocoded = false,
  geocodingPrecision = '',
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
  // Aceptamos tanto el punto exacto que comparte el cliente como el
  // aproximado que resolvio el geocoding. Un mapa con destino aproximado
  // es MUCHO mas util que ningun mapa: el rider ve por donde ir y ajusta
  // los ultimos metros mirando la numeracion.
  const hasClientCoordinates =
    (clientLocationExact || clientGeocoded) &&
    Number.isFinite(Number(clientLat)) &&
    Number.isFinite(Number(clientLng)) &&
    // El (0,0) es un punto real en Africa: hay que descartarlo explicitamente.
    (Math.abs(Number(clientLat)) > 0.0001 || Math.abs(Number(clientLng)) > 0.0001) &&
    isInsideServiceArea(clientLat, clientLng, mapConfig);

  // Si el punto vino del geocoding y no de la numeracion exacta, avisamos
  // para que el rider no confie ciegamente en el pin.
  const puntoAproximado = !clientLocationExact && clientGeocoded;
  const effectiveClientLat = hasClientCoordinates ? Number(clientLat) : null;
  const effectiveClientLng = hasClientCoordinates ? Number(clientLng) : null;
  const safeAddress = buildAddressForMaps(clientAddress, mapConfig);
  const googleUrl = buildGoogleMapsDirectionsUrl(
    {
      latitud: clientLat,
      longitud: clientLng,
      direccion: clientAddress,
      ubicacionExacta: clientLocationExact,
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
    setMapLoaded(true);
  }, []);

  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    if (mapInstanceRef.current) return;

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
      radius: 5500,
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
      obtenerRutaPorCalles({
        desdeLat: riderLat,
        desdeLng: riderLng,
        hastaLat: effectiveClientLat,
        hastaLng: effectiveClientLng,
        urlBase: mapConfig?.ruteo_url,
      })
        .then((ruta) => {
          // Sin ruta se cae al respaldo de abajo, igual que si fallara.
          if (!ruta?.puntos?.length) throw new Error('sin ruta');
          const coords = ruta.puntos;
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
            obtenerRutaPorCalles({
              desdeLat: riderLat,
              desdeLng: riderLng,
              hastaLat: effectiveClientLat,
              hastaLng: effectiveClientLng,
              urlBase: mapConfig?.ruteo_url,
            })
              .then((ruta) => {
                if (!ruta?.puntos?.length) throw new Error('sin ruta');
                const coords = ruta.puntos;
                cachedRouteRef.current = coords;
                if (routeLineRef.current) {
                  routeLineRef.current.setLatLngs(coords);
                } else {
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
      <div className="flex h-full flex-col justify-center rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <MapPin size={22} strokeWidth={2.4} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
              Navegación por dirección
            </p>
            <p className="mt-2 break-words text-lg font-black leading-snug text-gray-900">
              {safeAddress}
            </p>
            <p className="mt-3 text-xs font-semibold leading-5 text-gray-500">
              El cliente no compartió un punto GPS exacto. Maps abrirá la dirección completa en
              Monteros.
            </p>
          </div>
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
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-black uppercase tracking-wider text-white"
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
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="mt-3 text-sm font-bold text-gray-500">Cargando mapa...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-gray-200">
      <div ref={mapRef} className="h-full w-full" style={{ zIndex: 1 }} />

      {/* Indicador de distancia + ETA. Formato adaptado: metros bajo 1km,
          km con 1 decimal después. ETA estimado a ~28 km/h promedio moto
          urbana (Rappi/PedidosYa usan valores similares). */}
      {distance !== null &&
        (() => {
          const distText =
            distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`;
          const etaMin = Math.max(1, Math.round((distance / 1000 / 28) * 60));
          return (
            <div
              className={`absolute left-4 top-4 z-[400] rounded-2xl px-4 py-2.5 shadow-lg ${
                isArriving ? 'bg-emerald-500 text-white animate-pulse' : 'bg-white text-gray-800'
              }`}
            >
              {isArriving ? (
                <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest">
                  <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                  ¡Llegando! ({distance}m)
                </span>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-black leading-none">{distText}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    · {etaMin} min
                  </span>
                </div>
              )}
            </div>
          );
        })()}

      {onNavigate && clientLat && clientLng && (
        <button
          onClick={onNavigate}
          className="absolute right-4 top-4 z-[400] flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-lg transition hover:bg-brand-600"
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
              {/* El pin es aproximado: el rider tiene que confirmar la
                  numeracion al llegar. Mejor decirlo que dejarlo confiar
                  ciegamente en un punto que puede estar a media cuadra. */}
              {puntoAproximado && (
                <p className="mt-1.5 text-[10px] font-bold leading-snug text-amber-600">
                  {geocodingPrecision === 'numeracion'
                    ? 'Ubicación estimada por la dirección'
                    : 'Punto aproximado — confirmá la numeración al llegar'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

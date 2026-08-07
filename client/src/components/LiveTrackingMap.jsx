import { useEffect, useRef, useState } from 'react';
import { MapPin, Phone, Clock, AlertTriangle, Bike, Route } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsSearchUrl,
  isInsideServiceArea,
} from '../lib/maps.js';
import { necesitaRecalcular, obtenerRutaPorCalles } from '../lib/rutaCalles.js';

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
  clientLocationExact = false,
  mapConfig = {},
  // Puntos por los que ya pasó el repartidor, del más viejo al más nuevo.
  recorrido = [],
}) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const riderMarkerRef = useRef(null);
  const clientMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
  const deliveryZoneRef = useRef(null);
  const recorridoRef = useRef(null);
  // Desde qué posición se calculó la ruta vigente, para no pedirla de nuevo
  // en cada reporte de GPS.
  const origenRutaRef = useRef(null);
  // Si la línea que se ve es una ruta por calles, no hay que pisarla con la
  // recta cada vez que el rider avanza unos metros.
  const rutaPorCallesRef = useRef(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [distance, setDistance] = useState(null);
  const [isArriving, setIsArriving] = useState(false);
  const prevRiderRef = useRef({ lat: null, lng: null });
  const hasClientCoordinates =
    clientLocationExact &&
    Number.isFinite(Number(clientLat)) &&
    Number.isFinite(Number(clientLng)) &&
    isInsideServiceArea(clientLat, clientLng, mapConfig);
  const effectiveClientLat = hasClientCoordinates ? Number(clientLat) : null;
  const effectiveClientLng = hasClientCoordinates ? Number(clientLng) : null;

  // ETA dinámico basado en velocidad real del rider
  const { etaMinutes: dynamicEta, speedKmh } = useDynamicEta(
    riderLat,
    riderLng,
    effectiveClientLat,
    effectiveClientLng,
    externalEtaMinutes
  );

  useEffect(() => {
    setMapLoaded(true);
  }, []);

  const destinationUrl = buildGoogleMapsDirectionsUrl(
    {
      latitud: clientLat,
      longitud: clientLng,
      direccion: clientAddress,
      ubicacionExacta: clientLocationExact,
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

    const center =
      effectiveClientLat && effectiveClientLng
        ? [effectiveClientLat, effectiveClientLng]
        : [riderLat || -27.16471, riderLng || -65.496712];

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
    const zoneCenter = [-27.16471, -65.496712];
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

    if (effectiveClientLat && effectiveClientLng) {
      clientMarkerRef.current = L.marker([effectiveClientLat, effectiveClientLng], {
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

    if (riderLat && riderLng && effectiveClientLat && effectiveClientLng) {
      const routeLine = L.polyline(
        [
          [riderLat, riderLng],
          [effectiveClientLat, effectiveClientLng],
        ],
        {
          color: '#2563eb',
          weight: 5,
          opacity: 0.9,
          dashArray: '12, 8',
        }
      ).addTo(map);
      routeLineRef.current = routeLine;

      const bounds = L.latLngBounds([riderLat, riderLng], [effectiveClientLat, effectiveClientLng]);
      map.fitBounds(bounds, { padding: [80, 80] });

      // Calcular distancia inicial
      const dist = calculateDistance(riderLat, riderLng, effectiveClientLat, effectiveClientLng);
      setDistance(Math.round(dist));
      setIsArriving(dist < 150);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        deliveryZoneRef.current = null;
        recorridoRef.current = null;
        origenRutaRef.current = null;
        rutaPorCallesRef.current = false;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapLoaded, effectiveClientLat, effectiveClientLng, clientAddress, riderName]);

  /*
    ── El camino que ya hizo el repartidor ──────────────────────────────────

    El servidor venía guardando cada posición del rider en
    `repartidor_ubicaciones_log`, pero el cliente nunca las veía: el mapa
    mostraba un marcador que saltaba de un punto a otro y una línea recta hasta
    su casa. No se entendía si el pedido estaba viniendo o dando vueltas.

    Ahora se dibuja el trayecto real recorrido, en gris y por debajo del resto:
    la línea punteada sigue marcando lo que falta, y esta muestra por dónde
    vino. Es la diferencia entre "está a 800 metros" y "ya dobló en tu esquina".
  */
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const puntos = (recorrido || [])
      .map((p) => [Number(p.lat ?? p.latitud), Number(p.lng ?? p.longitud)])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    // Con menos de dos puntos no hay trayecto que mostrar.
    if (puntos.length < 2) {
      if (recorridoRef.current) {
        recorridoRef.current.remove();
        recorridoRef.current = null;
      }
      return;
    }

    if (recorridoRef.current) {
      recorridoRef.current.setLatLngs(puntos);
      return;
    }

    recorridoRef.current = L.polyline(puntos, {
      color: '#6B7280',
      weight: 4,
      opacity: 0.55,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(map);

    // Detrás de los marcadores y de la línea de lo que falta.
    recorridoRef.current.bringToBack();
  }, [recorrido, mapLoaded]);

  /*
    ── Lo que falta, por las calles ─────────────────────────────────────────

    La línea hasta la casa era una recta que cruzaba manzanas. En una ciudad
    con calles cortadas eso miente: el cliente lee "está a 300 metros" cuando
    al rider todavía le quedan seis cuadras de rodeo.

    Se le pide el trazado real a un servicio de ruteo. Si no contesta —el
    servidor público de OSRM puede estar caído, o el cliente sin señal— se
    deja la recta de antes: el seguimiento nunca depende de que esto funcione.

    Sólo se recalcula cuando la moto se corrió más de 150 metros, para no
    disparar un pedido en cada reporte de GPS.
  */
  useEffect(() => {
    if (!mapInstanceRef.current || !routeLineRef.current) return;
    if (!riderLat || !riderLng || !effectiveClientLat || !effectiveClientLng) return;
    if (!necesitaRecalcular(origenRutaRef.current, riderLat, riderLng)) return;

    let vigente = true;
    origenRutaRef.current = { lat: riderLat, lng: riderLng };

    obtenerRutaPorCalles({
      desdeLat: riderLat,
      desdeLng: riderLng,
      hastaLat: effectiveClientLat,
      hastaLng: effectiveClientLng,
      urlBase: mapConfig?.ruteo_url,
    }).then((ruta) => {
      // El rider pudo haberse movido, o el componente desmontado, mientras
      // esperábamos la respuesta.
      if (!vigente || !ruta?.puntos?.length || !routeLineRef.current) return;
      routeLineRef.current.setLatLngs(ruta.puntos);
      rutaPorCallesRef.current = true;
    });

    return () => {
      vigente = false;
    };
  }, [riderLat, riderLng, effectiveClientLat, effectiveClientLng, mapConfig?.ruteo_url]);

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

      /*
        Con ruta por calles vigente no se toca la línea: se redibuja sola en el
        próximo recálculo. Pisarla acá con la recta haría que parpadeara entre
        el trazado real y la línea que cruza manzanas en cada reporte de GPS.
      */
      if (
        routeLineRef.current &&
        !rutaPorCallesRef.current &&
        effectiveClientLat &&
        effectiveClientLng
      ) {
        routeLineRef.current.setLatLngs([newLatLng, [effectiveClientLat, effectiveClientLng]]);
      }

      prevRiderRef.current = { lat: riderLat, lng: riderLng };

      // Recalcular distancia
      if (effectiveClientLat && effectiveClientLng) {
        const dist = calculateDistance(riderLat, riderLng, effectiveClientLat, effectiveClientLng);
        setDistance(Math.round(dist));
        setIsArriving(dist < 150);
      }
    }
  }, [riderLat, riderLng, effectiveClientLat, effectiveClientLng]);

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
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-xs font-black uppercase tracking-wider text-white"
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
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
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
              <p className="text-lg font-black text-brand-600">{dynamicEta} min</p>
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
                    <a href={`tel:${riderPhone}`} className="text-xs font-medium text-brand-600">
                      {riderPhone}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {riderPhone && (
                  <a
                    href={`tel:${riderPhone}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white shadow-md transition hover:bg-brand-600"
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

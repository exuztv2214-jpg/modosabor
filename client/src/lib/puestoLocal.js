import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Puente con el puesto local.
 *
 * ── Qué es el puesto ───────────────────────────────────────────────────────
 *
 * Hay dos automatizaciones que no pueden vivir en Railway porque necesitan un
 * navegador de verdad corriendo en una máquina con sesión iniciada:
 *
 *   - El envío masivo de WhatsApp, que usa whatsapp-web.js y necesita el
 *     celular vinculado por QR.
 *   - El publicador de grupos de Facebook, que maneja Chrome con Playwright y
 *     busca el ejecutable en `C:\Program Files\...`.
 *
 * Las dos corren en la PC del local. A eso le llamamos "el puesto".
 *
 * Este archivo es la única puerta entre el panel —que se sirve desde
 * Railway— y ese puesto. El panel es la cara; el puesto es el que trabaja.
 *
 * ── Por qué se puede llamar a localhost desde una página HTTPS ─────────────
 *
 * Normalmente el navegador bloquea pedidos HTTP desde una página HTTPS. Pero
 * `127.0.0.1` y `localhost` son "orígenes potencialmente confiables" para el
 * navegador y quedan exentos de esa regla. Lo que sí hace falta es que el
 * puesto devuelva las cabeceras CORS, porque el origen es distinto.
 *
 * ── La regla que ordena todo ───────────────────────────────────────────────
 *
 * El puesto está apagado la mayor parte del día. Eso no es un error: es el
 * estado normal. Por eso nada de acá tira excepciones hacia arriba ni deja la
 * pantalla colgada esperando; si no contesta en dos segundos y medio, se
 * asume apagado y la pantalla muestra qué hay pendiente y cómo prenderlo.
 */

/** Puerto fijo del panel de masivos (`PORT` en su server.js). */
export const PUESTO_URL = 'http://127.0.0.1:3847';

/**
 * Corto a propósito. Cuando el puesto está apagado el sistema operativo
 * rechaza la conexión enseguida, pero si la PC está encendida y el proceso
 * caído, el pedido se queda esperando el timeout de TCP —que son decenas de
 * segundos— y la pantalla se ve trabada.
 */
const TIMEOUT_MS = 2500;

/** Cada cuánto se vuelve a preguntar si el puesto está vivo. */
const POLL_MS = 5000;

export class PuestoApagadoError extends Error {
  constructor() {
    super('El puesto local no está respondiendo');
    this.name = 'PuestoApagadoError';
    this.apagado = true;
  }
}

/**
 * Pide algo al puesto. Devuelve el JSON o tira `PuestoApagadoError`.
 *
 * Se distingue a propósito "el puesto no contesta" de "el puesto contestó un
 * error": lo primero se resuelve prendiendo la PC y lo segundo mirando qué
 * pasó, y mezclarlos manda al operador a buscar donde no es.
 */
export async function pedirAlPuesto(ruta, opciones = {}) {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), opciones.timeoutMs || TIMEOUT_MS);

  let respuesta;
  try {
    respuesta = await fetch(`${PUESTO_URL}${ruta}`, {
      ...opciones,
      signal: control.signal,
      headers: {
        ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
        ...(opciones.headers || {}),
      },
    });
  } catch {
    // Conexión rechazada, DNS, CORS, timeout: desde acá son lo mismo.
    throw new PuestoApagadoError();
  } finally {
    clearTimeout(corte);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    datos = null;
  }

  if (!respuesta.ok) {
    const error = new Error(datos?.error || `El puesto respondió ${respuesta.status}`);
    error.httpStatus = respuesta.status;
    throw error;
  }
  return datos;
}

export function postAlPuesto(ruta, cuerpo, opciones = {}) {
  return pedirAlPuesto(ruta, {
    ...opciones,
    method: 'POST',
    body: JSON.stringify(cuerpo || {}),
  });
}

/**
 * Estado del puesto, refrescado solo.
 *
 * Deja de preguntar cuando la pestaña no está visible: sin eso, una pantalla
 * abierta y olvidada le pega al puesto cada cinco segundos toda la noche.
 */
export function useEstadoPuesto({ activo = true, intervalo = POLL_MS } = {}) {
  const [estado, setEstado] = useState(null);
  const [conectado, setConectado] = useState(null); // null = todavía no se sabe
  const [cargando, setCargando] = useState(activo);
  const montado = useRef(true);

  const consultar = useCallback(async () => {
    try {
      const datos = await pedirAlPuesto('/api/status');
      if (!montado.current) return;
      setEstado(datos);
      setConectado(true);
    } catch {
      if (!montado.current) return;
      setEstado(null);
      setConectado(false);
    } finally {
      if (montado.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    montado.current = true;
    if (!activo) {
      setCargando(false);
      return () => {
        montado.current = false;
      };
    }

    consultar();
    let timer = setInterval(consultar, intervalo);

    const alCambiarVisibilidad = () => {
      clearInterval(timer);
      if (document.visibilityState === 'visible') {
        consultar();
        timer = setInterval(consultar, intervalo);
      }
    };
    document.addEventListener('visibilitychange', alCambiarVisibilidad);

    return () => {
      montado.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [activo, intervalo, consultar]);

  return { estado, conectado, cargando, refrescar: consultar };
}

/** Etiquetas del estado de la sesión de WhatsApp que devuelve el puesto. */
export const ESTADOS_WHATSAPP = {
  conectado: { label: 'WhatsApp conectado', tono: 'ok' },
  listo: { label: 'WhatsApp conectado', tono: 'ok' },
  qr: { label: 'Falta escanear el QR', tono: 'aviso' },
  cargando: { label: 'Conectando…', tono: 'neutro' },
  iniciando: { label: 'Conectando…', tono: 'neutro' },
  desconectado: { label: 'WhatsApp desconectado', tono: 'malo' },
  error: { label: 'Error de sesión', tono: 'malo' },
};

export function etiquetaWhatsapp(estadoWA) {
  return (
    ESTADOS_WHATSAPP[String(estadoWA || '').toLowerCase()] || {
      label: estadoWA ? String(estadoWA) : 'Sin datos',
      tono: 'neutro',
    }
  );
}

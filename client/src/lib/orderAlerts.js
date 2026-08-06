import { useEffect, useRef } from 'react';

import { API_BASE_URL } from './runtime.js';

const FALLBACK_ALERT_WAV =
  'data:audio/wav;base64,UklGRlQCAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YTACAACBhYqOkpWTlZaXmpyfoKGio6Sko6GfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjZCTlpmcn6OjoqCgn5yZlpOQj4+NjIyNkJOWmZyfo6OioKCfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjZCTlpmcn6OjoqCgn5yZlpOQj4+NjIyNkJOWmZyfo6OioKCfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjQ==';
const recentAlertClaims = new Map();
const PERSISTENT_ALERTS_KEY = 'ms_persistent_order_alerts_v1';
const DELIVERED_ALERT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NAME_PRONUNCIATIONS = new Map(
  [
    ['cristian', 'Cristián'],
    ['galvan', 'Galván'],
    ['gonzalez', 'González'],
    ['hernan', 'Hernán'],
    ['ivan', 'Iván'],
    ['matias', 'Matías'],
    ['mathias', 'Matías'],
    ['maximiliano', 'Maximiliano'],
  ].map(([source, target]) => [source.toLocaleLowerCase('es'), target])
);

export function claimAlertKey(key, ttlMs = 4000) {
  const normalized = String(key || '').trim();
  if (!normalized) return true;
  const now = Date.now();
  const persistent = normalized.startsWith('entregado:');
  const effectiveTtl = persistent ? Math.max(ttlMs, DELIVERED_ALERT_TTL_MS) : ttlMs;

  if (persistent && typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(window.localStorage.getItem(PERSISTENT_ALERTS_KEY) || '{}');
      const existingStored = Number(stored?.[normalized] || 0);
      if (existingStored && now - existingStored < effectiveTtl) return false;

      const fresh = Object.fromEntries(
        Object.entries(stored || {}).filter(([, timestamp]) => {
          const parsed = Number(timestamp || 0);
          return parsed && now - parsed < DELIVERED_ALERT_TTL_MS;
        })
      );
      fresh[normalized] = now;
      window.localStorage.setItem(PERSISTENT_ALERTS_KEY, JSON.stringify(fresh));
    } catch {
      // La memoria en proceso sigue evitando duplicados si el almacenamiento no está disponible.
    }
  }

  const existing = recentAlertClaims.get(normalized);
  if (existing && now - existing < effectiveTtl) {
    return false;
  }
  recentAlertClaims.set(normalized, now);
  if (recentAlertClaims.size > 200) {
    const fresh = [...recentAlertClaims.entries()].filter(
      ([entryKey, ts]) =>
        now - ts < (entryKey.startsWith('entregado:') ? DELIVERED_ALERT_TTL_MS : effectiveTtl)
    );
    recentAlertClaims.clear();
    fresh.forEach(([entryKey, ts]) => recentAlertClaims.set(entryKey, ts));
  }
  return true;
}

function cleanupAnnouncementText(value) {
  return String(value || '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.!?]){2,}/g, '$1')
    .trim();
}

export function normalizeOrderAlertEnabled(value, defaultValue = true) {
  if (value === undefined || value === null || value === '') return defaultValue;
  return String(value) === '1';
}

export function normalizeCustomerName(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase() === 'consumidor final') return '';
  return raw.split(/\s+/).slice(0, 2).join(' ');
}

function parsePronunciationReplacements(value) {
  const replacements = new Map(DEFAULT_NAME_PRONUNCIATIONS);
  String(value || '')
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separator = entry.includes('=') ? '=' : ':';
      const [source, ...targetParts] = entry.split(separator);
      const target = targetParts.join(separator).trim();
      if (!source?.trim() || !target) return;
      replacements.set(source.trim().toLocaleLowerCase('es'), target);
    });
  return replacements;
}

export function prepareNameForSpeech(value, replacements = '') {
  const name = normalizeCustomerName(value);
  if (!name) return '';
  const pronunciationMap = parsePronunciationReplacements(replacements);
  return name
    .split(/\s+/)
    .map((word) => {
      const clean = word.replace(/[^\p{L}'-]/gu, '');
      return pronunciationMap.get(clean.toLocaleLowerCase('es')) || word;
    })
    .join(' ');
}

export function buildOrderAnnouncementText(pedido = {}, config = {}) {
  const customer = prepareNameForSpeech(pedido?.cliente_nombre, config?.alertas_voz_reemplazos);
  const numero = pedido?.numero ? String(pedido.numero) : '';
  const template = String(config?.alertas_pedido_texto || '').trim();

  if (template) {
    return cleanupAnnouncementText(
      template.replaceAll('{cliente}', customer).replaceAll('{numero}', numero)
    );
  }

  if (customer && numero) {
    return `Nuevo pedido ingresado. ${customer}. Pedido ${numero}.`;
  }
  if (customer) {
    return `Nuevo pedido ingresado. ${customer}.`;
  }
  if (numero) {
    return `Nuevo pedido ingresado. Pedido ${numero}.`;
  }
  return 'Nuevo pedido ingresado.';
}

export function buildDeliveredAnnouncementText(pedido = {}, options = {}) {
  const replacements =
    options?.pronunciationReplacements || options?.config?.alertas_voz_reemplazos || '';
  const customer = prepareNameForSpeech(pedido?.cliente_nombre, replacements);
  const numero = pedido?.numero ? String(pedido.numero) : '';
  const rider = prepareNameForSpeech(options?.riderName || pedido?.repartidor_nombre, replacements);
  const scope = String(options?.scope || 'admin')
    .trim()
    .toLowerCase();

  if (scope === 'rider') {
    if (customer && numero) {
      return `Pedido entregado. ${customer}. Pedido ${numero}.`;
    }
    if (numero) {
      return `Pedido ${numero} entregado.`;
    }
    return 'Pedido entregado.';
  }

  if (customer && numero && rider) {
    return `Se entrego el pedido ${numero} de ${customer}. Repartidor ${rider}.`;
  }
  if (customer && numero) {
    return `Se entrego el pedido ${numero} de ${customer}.`;
  }
  if (numero) {
    return `Se entrego el pedido ${numero}.`;
  }
  return 'Se entrego el pedido.';
}

function voicePriority(voice) {
  const lang = String(voice?.lang || '').toLowerCase();
  const name = String(voice?.name || '').toLowerCase();
  if (lang === 'es-ar' && /argentin|elena/.test(name)) return 0;
  if (lang === 'es-ar') return 1;
  if (/argentin|elena/.test(name)) return 2;
  if (lang === 'es-419') return 3;
  if (lang.startsWith('es-mx') || lang.startsWith('es-us')) return 4;
  if (lang.startsWith('es')) return 5;
  return 10;
}

export function listSpanishSpeechVoices() {
  if (!('speechSynthesis' in window)) return null;
  return window.speechSynthesis
    .getVoices()
    .filter((voice) =>
      String(voice.lang || '')
        .toLowerCase()
        .startsWith('es')
    )
    .sort((a, b) => voicePriority(a) - voicePriority(b) || a.name.localeCompare(b.name));
}

export function pickSpanishSpeechVoice(preferredName = '') {
  if (!('speechSynthesis' in window)) return null;
  const voices = listSpanishSpeechVoices() || [];
  if (!voices.length) return null;

  const normalizedPreferred = String(preferredName || '')
    .trim()
    .toLocaleLowerCase('es');
  if (normalizedPreferred) {
    const preferred = voices.find(
      (voice) => String(voice.name || '').toLocaleLowerCase('es') === normalizedPreferred
    );
    if (preferred) return preferred;
  }

  return voices[0];
}

export function useOrderAlertPlayback() {
  const audioContextRef = useRef(null);
  const voiceRef = useRef(null);
  const fallbackAudioRef = useRef(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return undefined;

    const refreshVoices = () => {
      voiceRef.current = pickSpanishSpeechVoice();
    };

    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;

    return () => {
      if (window.speechSynthesis.onvoiceschanged === refreshVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => {
    const unlockAudio = async () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      } catch {}

      try {
        if (!fallbackAudioRef.current) {
          const audio = new Audio(FALLBACK_ALERT_WAV);
          audio.preload = 'auto';
          audio.volume = 1;
          fallbackAudioRef.current = audio;
        }
        fallbackAudioRef.current.load();
      } catch {}
    };

    window.addEventListener('pointerdown', unlockAudio);
    window.addEventListener('keydown', unlockAudio);

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  return {
    audioContextRef,
    voiceRef,
    fallbackAudioRef,
  };
}

export async function playOrderAlarm({ audioContextRef, enabled = true } = {}) {
  if (!enabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioContextRef?.current) {
    audioContextRef.current = new AudioContextClass();
  }

  if (audioContextRef.current.state === 'suspended') {
    await audioContextRef.current.resume();
  }

  const now = audioContextRef.current.currentTime;
  [0, 0.22, 0.44].forEach((offset, index) => {
    const osc = audioContextRef.current.createOscillator();
    const gain = audioContextRef.current.createGain();
    osc.connect(gain);
    gain.connect(audioContextRef.current.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(index === 1 ? 900 : 740, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.12, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
    osc.start(now + offset);
    osc.stop(now + offset + 0.18);
  });
}

export async function playFallbackOrderAlarm({ fallbackAudioRef, enabled = true } = {}) {
  if (!enabled) return;
  if (!fallbackAudioRef?.current) {
    const audio = new Audio(FALLBACK_ALERT_WAV);
    audio.preload = 'auto';
    audio.volume = 1;
    fallbackAudioRef.current = audio;
  }

  try {
    fallbackAudioRef.current.pause();
    fallbackAudioRef.current.currentTime = 0;
  } catch {}

  await fallbackAudioRef.current.play();
}

function clampSpeechValue(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

/*
  ── Voz de IA con vuelta atrás a la del navegador ──────────────────────────

  El servidor no genera nada cuando le preguntamos: contesta al toque con el
  audio si ya lo tenía guardado, o con `null` si no. Cuando contesta `null`,
  habla el navegador acá mismo y el servidor genera el audio por atrás para la
  próxima vez que aparezca esa frase.

  Así el aviso nunca se retrasa, y con los días los clientes habituales van
  quedando todos con voz de IA sin que nadie toque nada.

  El corte de 800 ms es solamente por si el servidor está caído o la red no
  responde: es una respuesta instantánea, no debería acercarse nunca.
*/
const audiosPorTexto = new Map();
const TIMEOUT_VOZ_IA_MS = 800;

async function urlDeVozIa(texto) {
  if (audiosPorTexto.has(texto)) return audiosPorTexto.get(texto);

  const controlador = new AbortController();
  const corte = setTimeout(() => controlador.abort(), TIMEOUT_VOZ_IA_MS);
  try {
    /*
      Se usa `API_BASE_URL` y no una ruta pelada: en la app nativa y cuando el
      panel corre en otro origen que la API, "/api/..." apunta al lugar
      equivocado y el audio nunca llega. Con `fetch` crudo no hay un axios que
      lo resuelva por nosotros.
    */
    const respuesta = await fetch(`${API_BASE_URL}/configuracion/voz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
      signal: controlador.signal,
    });
    if (!respuesta.ok) return null;
    const { url } = await respuesta.json();
    /*
      Solo se guarda cuando hay audio. El `null` no se cachea a propósito: el
      servidor lo está generando en este momento, así que la próxima vez que
      entre esta misma frase sí va a estar, y queremos volver a preguntar.
    */
    if (url) audiosPorTexto.set(texto, url);
    return url || null;
  } catch {
    return null;
  } finally {
    clearTimeout(corte);
  }
}

export function speakOrderAnnouncement(
  text,
  { voiceRef, enabled = true, voiceName = '', rate = 0.92, pitch = 1, usarVozIa = true } = {}
) {
  if (!enabled || !text) return;

  if (usarVozIa) {
    urlDeVozIa(text).then((url) => {
      if (!url) {
        hablarConNavegador(text, { voiceRef, voiceName, rate, pitch });
        return;
      }
      const audio = new Audio(url);
      audio.volume = 1;
      // Si el archivo no se puede reproducir, que igual se escuche algo.
      audio.onerror = () => hablarConNavegador(text, { voiceRef, voiceName, rate, pitch });
      audio.play().catch(() => hablarConNavegador(text, { voiceRef, voiceName, rate, pitch }));
    });
    return;
  }

  hablarConNavegador(text, { voiceRef, voiceName, rate, pitch });
}

/** La voz de siempre: la del sistema operativo. */
function hablarConNavegador(text, { voiceRef, voiceName = '', rate = 0.92, pitch = 1 } = {}) {
  if (!text || !('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  const selectedVoice = pickSpanishSpeechVoice(voiceName) || voiceRef?.current;
  utterance.lang = selectedVoice?.lang || 'es-AR';
  utterance.rate = clampSpeechValue(rate, 0.92, 0.7, 1.3);
  utterance.pitch = clampSpeechValue(pitch, 1, 0.7, 1.3);
  utterance.volume = 1;

  if (selectedVoice) {
    utterance.voice = selectedVoice;
    if (voiceRef) voiceRef.current = selectedVoice;
  }

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

export async function runOrderAlert({
  pedido,
  config,
  audioContextRef,
  voiceRef,
  fallbackAudioRef,
  delayMs = 250,
} = {}) {
  const soundEnabled = normalizeOrderAlertEnabled(config?.alertas_pedido_sonido, true);
  const voiceEnabled = normalizeOrderAlertEnabled(config?.alertas_pedido_voz, true);
  const announcementText = buildOrderAnnouncementText(pedido, config);

  try {
    await playOrderAlarm({
      audioContextRef,
      enabled: soundEnabled,
    });
  } catch {
    try {
      await playFallbackOrderAlarm({
        fallbackAudioRef,
        enabled: soundEnabled,
      });
    } catch {}
  }

  if (voiceEnabled) {
    window.setTimeout(() => {
      speakOrderAnnouncement(announcementText, {
        voiceRef,
        enabled: voiceEnabled,
        voiceName: config?.alertas_voz_nombre,
        rate: config?.alertas_voz_velocidad,
        pitch: config?.alertas_voz_tono,
      });
    }, delayMs);
  }

  return announcementText;
}

export async function runDeliveredAlert({
  pedido,
  config = {},
  audioContextRef,
  voiceRef,
  fallbackAudioRef,
  scope = 'admin',
  delayMs = 180,
} = {}) {
  const announcementText = buildDeliveredAnnouncementText(pedido, {
    scope,
    riderName: pedido?.repartidor_nombre,
    config,
  });

  try {
    await playOrderAlarm({
      audioContextRef,
      enabled: true,
    });
  } catch {
    try {
      await playFallbackOrderAlarm({
        fallbackAudioRef,
        enabled: true,
      });
    } catch {}
  }

  window.setTimeout(() => {
    speakOrderAnnouncement(announcementText, {
      voiceRef,
      enabled: true,
      voiceName: config?.alertas_voz_nombre,
      rate: config?.alertas_voz_velocidad,
      pitch: config?.alertas_voz_tono,
    });
  }, delayMs);

  return announcementText;
}

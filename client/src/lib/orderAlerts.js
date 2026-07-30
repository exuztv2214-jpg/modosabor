import { useEffect, useRef } from 'react';

const FALLBACK_ALERT_WAV =
  'data:audio/wav;base64,UklGRlQCAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YTACAACBhYqOkpWTlZaXmpyfoKGio6Sko6GfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjZCTlpmcn6OjoqCgn5yZlpOQj4+NjIyNkJOWmZyfo6OioKCfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjZCTlpmcn6OjoqCgn5yZlpOQj4+NjIyNkJOWmZyfo6OioKCfnJmWk5CPj42MjI2Qk5aZnJ+jo6KgoJ+cmZaTkI+PjYyMjQ==';
const recentAlertClaims = new Map();

export function claimAlertKey(key, ttlMs = 4000) {
  const normalized = String(key || '').trim();
  if (!normalized) return true;
  const now = Date.now();
  const existing = recentAlertClaims.get(normalized);
  if (existing && now - existing < ttlMs) {
    return false;
  }
  recentAlertClaims.set(normalized, now);
  if (recentAlertClaims.size > 200) {
    const fresh = [...recentAlertClaims.entries()].filter(([, ts]) => now - ts < ttlMs);
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

export function buildOrderAnnouncementText(pedido = {}, config = {}) {
  const customer = normalizeCustomerName(pedido?.cliente_nombre);
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
  const customer = normalizeCustomerName(pedido?.cliente_nombre);
  const numero = pedido?.numero ? String(pedido.numero) : '';
  const rider = normalizeCustomerName(options?.riderName || pedido?.repartidor_nombre);
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

export function pickSpanishSpeechVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const preferred = ['es-AR', 'es_AR', 'es-419', 'es-MX', 'es-ES', 'es'];
  for (const lang of preferred) {
    const found = voices.find((voice) => voice.lang?.toLowerCase().startsWith(lang.toLowerCase()));
    if (found) return found;
  }

  return voices[0] || null;
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

export function speakOrderAnnouncement(text, { voiceRef, enabled = true } = {}) {
  if (!enabled || !text || !('speechSynthesis' in window)) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = voiceRef?.current?.lang || 'es-AR';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (voiceRef?.current) {
    utterance.voice = voiceRef.current;
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
      });
    }, delayMs);
  }

  return announcementText;
}

export async function runDeliveredAlert({
  pedido,
  audioContextRef,
  voiceRef,
  fallbackAudioRef,
  scope = 'admin',
  delayMs = 180,
} = {}) {
  const announcementText = buildDeliveredAnnouncementText(pedido, {
    scope,
    riderName: pedido?.repartidor_nombre,
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
    });
  }, delayMs);

  return announcementText;
}

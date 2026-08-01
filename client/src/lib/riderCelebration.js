// Celebración simple sin dependencias: inyecta 24 confetis absolutos que
// caen con animación CSS y se autolimpian. Sirve para el momento
// "acabo de entregar un pedido" y le da esa dopamina extra al rider.

const COLORS = ['#dc1f2d', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#ec4899'];

export function fireRiderConfetti(count = 28) {
  if (typeof document === 'undefined') return;

  // Contenedor único global, para no duplicar ni pisarse con otros disparos.
  let host = document.getElementById('rider-confetti-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'rider-confetti-host';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:9999;';
    document.body.appendChild(host);
  }

  const styleId = 'rider-confetti-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes riderConfettiFall {
        0%   { transform: translate3d(var(--cx,0),-20vh,0) rotate(0deg); opacity: 1; }
        100% { transform: translate3d(var(--cx,0),110vh,0) rotate(var(--cr,720deg)); opacity: 0; }
      }
      .rider-confetti {
        position: absolute;
        top: 0;
        width: 10px;
        height: 14px;
        border-radius: 2px;
        will-change: transform, opacity;
        animation: riderConfettiFall var(--cd,2.8s) cubic-bezier(0.22,0.61,0.36,1) forwards;
      }
    `;
    document.head.appendChild(style);
  }

  for (let i = 0; i < count; i += 1) {
    const chip = document.createElement('span');
    chip.className = 'rider-confetti';
    const left = Math.random() * 100;
    const drift = (Math.random() - 0.5) * 30; // -15vw a +15vw
    const dur = 2.4 + Math.random() * 1.6;
    const rotate = 360 + Math.random() * 720;
    chip.style.left = `${left}vw`;
    chip.style.setProperty('--cx', `${drift}vw`);
    chip.style.setProperty('--cd', `${dur}s`);
    chip.style.setProperty('--cr', `${rotate}deg`);
    chip.style.background = COLORS[i % COLORS.length];
    chip.style.transform = 'translateY(-20vh)';
    host.appendChild(chip);
    // Autolimpieza para no acumular DOM nodes en un turno largo.
    window.setTimeout(() => chip.remove(), dur * 1000 + 200);
  }
}

// Voz TTS breve para anunciar cosas al rider mientras maneja. Usa la
// Web Speech API nativa del browser/WebView. Silent-fail si no está.
export function speakRider(text, { lang = 'es-AR', rate = 1.05, pitch = 1 } = {}) {
  if (typeof window === 'undefined' || !window.speechSynthesis || !text) return;
  try {
    // Interrumpir cualquier anuncio previo para no acumular colas.
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = lang;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch {
    // silent
  }
}

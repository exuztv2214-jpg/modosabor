const state = {
  route: 'inicio',
  status: null,
  health: null,
  config: null,
  analytics: null,
  campaignPlan: null,
  contacts: [],
  crm: [],
  campaigns: [],
  groups: [],
  events: [],
  message: '',
  media: [],
  pdf: null,
  selectedContact: null,
  selectedDetail: null,
  selectedContacts: [],
  selectedChat: 0,
  selectedChatNumber: '',
  conversation: null,
  conversations: [],
  unreadChats: 0,
  unreadByChat: {},
  chatDraft: '',
  chatAttachment: null,
  chatQuery: '',
  chatFilter: 'todos',
  campaignTab: 'general',
  contactsView: 'list',
  contactsFilter: 'todos',
  contactQuery: '',
  busy: false,
  identity: null,
  business: null,
  operador: null,
  motor: { corriendo: false, pausado: false, stats: {} },
  progress: null,
  wait: null,
  tanda: null,
  campaignDetail: null,
  logs: [],
  campaignStep: 1,
  contactsLimit: 60,
  chatsLimit: 80,
  campaignSegment: '',
  campaignGroup: '',
  chatOpen: false,
};
let qrRefreshTimer = null;
let waitTimer = null;

const ROLE_LABELS = { admin: 'Dueño', caja: 'Caja', cocina: 'Cocina', delivery: 'Delivery' };

const PANEL_BASE_PATH = String(window.__MODO_SABOR_MASIVOS_BASE_PATH__ || '').replace(/\/+$/, '');
const panelPath = (value) => {
  const raw = String(value || '');
  if (/^(?:https?:|data:|blob:)/i.test(raw)) return raw;
  return `${PANEL_BASE_PATH}${raw.startsWith('/') ? raw : `/${raw}`}`;
};

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]
  );
// Primeras letras o números de hasta dos palabras (ignora emojis y símbolos).
const initials = (name) =>
  String(name || '')
    .split(/\s+/)
    .map((palabra) => Array.from(palabra).find((ch) => /[\p{L}\p{N}]/u.test(ch)))
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';
const money = (value) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }).format(value);
function avatarMarkup(contact, className = 'avatar') {
  if (contact?.foto) {
    const source = /^https?:/i.test(contact.foto)
      ? contact.foto
      : panelPath(`/fotos/${encodeURIComponent(contact.foto)}`);
    return `<span class="${className} photo-avatar"><img src="${esc(source)}" alt="Foto de ${esc(contact.nombre || 'contacto')}" loading="lazy"></span>`;
  }
  return `<span class="${className}">${esc(initials(contact?.nombre || contact?.telefono))}</span>`;
}

async function api(path, options = {}) {
  const response = await fetch(panelPath(path), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(body.error || `No se pudo completar la operación (${response.status})`);
  return body;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3400);
}

function statusLabel() {
  return state.status?.whatsapp === 'listo' ? 'CONECTADO' : 'DESCONECTADO';
}

// Usuario y negocio salen del sistema Modo Sabor (mismo dominio en producción).
// En uso local, sin el sistema principal, quedan los valores de "Panel local".
async function loadIdentity() {
  const [me, negocio] = await Promise.allSettled([
    fetch('/api/auth/me', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
    fetch('/api/configuracion', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)),
  ]);
  const user = me.status === 'fulfilled' && me.value ? me.value.user || me.value : null;
  if (user?.nombre) state.identity = { nombre: user.nombre, rol: user.rol || '' };
  const cfg = negocio.status === 'fulfilled' ? negocio.value : null;
  if (cfg?.negocio_nombre)
    state.business = {
      nombre: cfg.negocio_nombre,
      localidad: cfg.negocio_localidad || '',
      logo: cfg.negocio_logo_url || cfg.negocio_logo || '',
    };
  syncShell();
  render();
}

function businessLabel() {
  const b = state.business;
  if (!b) return state.config?.NEGOCIO_NOMBRE || 'Modo Sabor';
  return b.localidad && !b.nombre.includes(b.localidad) ? `${b.nombre} ${b.localidad}` : b.nombre;
}

// Rutas del sistema principal (/uploads/...) no van bajo el prefijo del panel.
function assetUrl(url) {
  const raw = String(url || '');
  if (!raw) return '';
  if (/^(?:https?:|data:|blob:)/i.test(raw) || raw.startsWith('/uploads/')) return raw;
  return panelPath(raw);
}

function previewLogo() {
  const own = state.config?.NEGOCIO_LOGO;
  if (own && own !== '/assets/logo.png') return assetUrl(own);
  return assetUrl(state.business?.logo || '/assets/logo.png');
}

function syncShell() {
  const connected = state.status?.whatsapp === 'listo';
  const user = state.identity;
  const userName = $('#shell-user');
  if (userName) userName.textContent = user?.nombre || 'Panel local';
  const role = $('#shell-role');
  if (role)
    role.textContent = user
      ? ROLE_LABELS[user.rol] || user.rol || 'Usuario'
      : 'Sin sesión del sistema';
  const avatar = $('#shell-avatar');
  if (avatar) avatar.textContent = user ? initials(user.nombre) : '·';
  const business = $('#shell-business');
  if (business) business.textContent = businessLabel();
  const branch = $('#shell-branch');
  if (branch) branch.textContent = businessLabel();
  document.body.dataset.connected = connected ? 'true' : 'false';
  const title = $('.channel-title');
  if (title)
    title.innerHTML = `<b class="status-dot ${connected ? '' : 'offline'}"></b> WhatsApp <strong>${connected ? 'conectado' : 'desconectado'}</strong>`;
  const phone = $('#channel-phone');
  if (phone)
    phone.textContent = connected
      ? state.status.whatsappDetalle || 'Cuenta vinculada'
      : 'Conectá tu cuenta para comenzar';
  const n = $('#nav-contacts');
  if (n)
    n.textContent = state.contacts.length ? state.contacts.length.toLocaleString('es-AR') : '—';
  const unread = state.unreadChats || 0;
  const inbox = $('#nav-inbox');
  if (inbox) {
    inbox.textContent = unread;
    inbox.classList.toggle('hot', unread > 0);
  }
  document.querySelectorAll('[data-unread-chats]').forEach((item) => {
    item.textContent = unread;
  });
  const health = connected ? (state.health?.puntaje ?? state.health?.score) : null;
  const healthValue = $('#sidebar-health-value');
  if (healthValue) healthValue.textContent = health == null ? '—' : `${health}/100`;
  const bar = $('#sidebar-health-bar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, health || 0))}%`;
  const meter = $('#sidebar-health-meter');
  if (meter)
    meter.className = `meter ${state.health?.estado === 'rojo' ? 'bad' : state.health?.estado === 'amarillo' ? 'warn' : ''}`;
  const label = $('#sidebar-health-label');
  if (label) label.textContent = connected ? healthStateLabel(state.health) : 'Sin conexión';
  const batch = $('#shell-batch');
  if (batch) batch.textContent = motorLabel();
}

const HEALTH_LABELS = { verde: 'Ritmo sano', amarillo: 'Precaución', rojo: 'Riesgo alto' };
function healthStateLabel(health) {
  return HEALTH_LABELS[health?.estado] || 'Sin datos';
}

function motorLabel() {
  const m = state.motor || {};
  if (!m.corriendo) return 'en espera';
  const s = m.stats || {};
  const avance = `${s.hechos || 0} de ${s.total || 0}`;
  if (m.pausado) return `pausado · ${avance}`;
  return `${s.simulacro ? 'simulando' : 'enviando'} · ${avance}`;
}

// =========================================================================
// Vistas. Cada pantalla devuelve HTML armado con los componentes de styles.css
// (card, stat, gauge, badge, button, table…). La lógica vive en action().
// =========================================================================

const icon = (name) => `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
const fmt = (n) => Number(n || 0).toLocaleString('es-AR');

function card(content, className = '') {
  return `<section class="card ${className}">${content}</section>`;
}

function cardHead(title, subtitle = '', aside = '') {
  return `<div class="card-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${aside}</div>`;
}

function empty(iconName, title, copy) {
  return `<div class="empty-state">${icon(iconName)}<strong>${title}</strong><span>${copy}</span></div>`;
}

function pageHead(title, subtitle, actions = '') {
  return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
}

function metric(label, value, iconName, foot, tone = '') {
  return card(
    `<div class="stat"><span class="stat-icon ${tone}">${icon(iconName)}</span><div><span class="stat-label">${label}</span><strong class="stat-value">${value}</strong></div>${foot ? `<span class="stat-foot">${foot}</span>` : ''}</div>`
  );
}

// Medidor semicircular: pct de 0 a 100.
function gauge(pct, tone, value, caption) {
  const largo = Math.PI * 90;
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="gauge ${tone}"><svg viewBox="0 0 200 110" role="img" aria-label="${esc(caption)}: ${esc(value)}"><path class="track" d="M10 100 A90 90 0 0 1 190 100"/><path class="value" d="M10 100 A90 90 0 0 1 190 100" stroke-dasharray="${largo}" stroke-dashoffset="${largo * (1 - p / 100)}"/></svg><div class="gauge-label"><strong>${value}</strong><small>${caption}</small></div></div>`;
}

// ---------- Inicio ----------

function greeting() {
  const hora = new Date().getHours();
  const saludo = hora < 13 ? 'Buen día' : hora < 20 ? 'Buenas tardes' : 'Buenas noches';
  const nombre = state.identity?.nombre?.split(/\s+/)[0];
  return nombre ? `${saludo}, ${nombre}` : saludo;
}

function renderInicio() {
  const connected = state.status?.whatsapp === 'listo';
  const segments = campaignSegmentCounts();
  const motor = state.motor || {};
  const fecha = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const chip = connected
    ? `<span class="connection-chip"><b class="status-dot"></b>WhatsApp conectado</span>`
    : `<button class="connection-chip" data-action="qr"><b class="status-dot offline"></b>WhatsApp desconectado</button>`;
  return `
    <div class="hero"><div><h1>${esc(greeting())}</h1><p>${esc(fecha.charAt(0).toUpperCase() + fecha.slice(1))} · ${esc(businessLabel())}</p></div>${chip}</div>
    ${motor.corriendo ? liveCampaignCard() : nextStepCard(connected)}
    <div class="grid stats section-gap">
      ${metric('Habilitados', segments.loaded ? fmt(segments.total) : '—', 'groups', 'Reciben campañas', 'brand')}
      ${metric('Ya compraron', segments.loaded && state.status?.pedidosReales?.configurado ? fmt(segments.clientes) : '—', 'shopping_bag', 'Con pedidos en Modo Sabor', 'green')}
      ${metric('Activos', segments.loaded ? fmt(segments.recurrentes) : '—', 'local_fire_department', 'Respondieron en 14 días', 'amber')}
      ${metric('Enviados hoy', connected ? fmt(state.health?.enviadosHoy) : '—', 'send', connected ? `${fmt(state.health?.respuestasHoy)} respuestas hoy` : 'Sin conexión', 'blue')}
    </div>
    <div class="grid main-side section-gap">
      <div class="stack">${lastCampaignCard()}${activityCard()}</div>
      <div class="stack">${healthCard(connected)}<div class="card"><div class="page-actions" style="flex-direction:column;align-items:stretch">
        <button class="button secondary" data-action="test">${icon('send_to_mobile')}Enviar prueba a mi WhatsApp</button>
        <button class="button secondary" data-route="conversaciones">${icon('chat')}Revisar chats <b class="badge" data-unread-chats>0</b></button>
        <button class="button secondary" data-action="refresh">${icon('sync')}Actualizar contactos</button>
      </div></div></div>
    </div>`;
}

// Próximo paso real: lo calcula el servidor (/api/operador).
function nextStepCard(connected) {
  const op = state.operador;
  const accion = connected
    ? op?.proximaAccion || 'Preparar campaña por prioridad'
    : 'Conectar WhatsApp';
  const destinos = {
    'Responder pedidos probables': ['data-route="conversaciones"', 'Ver chats', 'forum'],
    'Conectar WhatsApp': ['data-action="qr"', 'Abrir conexión', 'qr_code_2'],
    'Bajar volumen y trabajar CRM': ['data-route="conversaciones"', 'Ver chats', 'forum'],
    'Enviar prueba': ['data-action="test"', 'Enviar prueba', 'send_to_mobile'],
  };
  const [boton, etiqueta, iconName] = destinos[accion] || [
    'data-route="campana"',
    'Ir a Campaña',
    'campaign',
  ];
  const notas = connected ? (op?.notificaciones || []).slice(0, 3) : [];
  return card(
    `<span class="next-icon">${icon(iconName)}</span><div class="next-copy"><span class="stat-label">Próximo paso</span><h2>${esc(accion)}</h2>${notas.length ? `<ul>${notas.map((nota) => `<li>${esc(nota)}</li>`).join('')}</ul>` : `<p class="muted">${connected ? 'Todo en orden para la próxima campaña.' : 'Escaneá el código QR con tu teléfono para habilitar contactos, chats y campañas.'}</p>`}</div><button class="button primary" ${boton}>${etiqueta} ${icon('arrow_forward')}</button>`,
    'next-step'
  );
}

function campaignTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
}

const CAMPAIGN_STATES = {
  corriendo: 'En curso',
  finalizada: 'Finalizada',
  detenida: 'Detenida',
};

function campaignBadge(c) {
  if (c.simulacro) return '<span class="badge">Simulacro</span>';
  const tono = c.estado === 'detenida' ? 'red' : c.estado === 'corriendo' ? 'brand' : 'green';
  return `<span class="badge ${tono}">${esc(CAMPAIGN_STATES[c.estado] || c.estado || '—')}</span>`;
}

function segmentLabel(segmento) {
  const value = String(segmento || '');
  if (!value || value === 'todos') return 'Todos los habilitados';
  if (value.startsWith('grupo:')) {
    const grupo = state.groups.find((item) => item.id === value.slice(6));
    return grupo ? `Grupo: ${grupo.nombre}` : 'Grupo guardado';
  }
  if (value.startsWith('reintento:')) return 'Reintento de fallidos';
  return SEGMENT_NAMES[value] || value;
}

const SEGMENT_NAMES = {
  activo: 'Activos',
  nuevo: 'Nuevos',
  nuevo_sin_enviar: 'Nuevos sin enviar',
  frio: 'Fríos',
  pidio: 'Pidieron',
  pidio_ayer: 'Pidieron ayer',
  cliente: 'Ya compraron',
  frecuente: 'Frecuentes',
  inactivo_30: 'No piden hace 30 días',
  respondio: 'Respondieron',
  sin_enviar: 'Sin envíos',
  viejo: 'Sin actividad',
  otro_pais: 'Otro país',
  empresa: 'Empresa',
  excluido: 'Excluido',
  pausado: 'Pausado',
};

function lastCampaignCard() {
  const last = state.campaigns[0];
  const cfg = state.config || {};
  const programacion = cfg.PROGRAMACION_ACTIVA
    ? `Automática a las ${esc(cfg.PROGRAMACION_HORA || '10:30')}`
    : 'Manual';
  const cuerpo = last
    ? `<div class="kv"><div><small>Enviados</small><strong>${fmt(last.stats?.ok)}</strong></div><div><small>Fallidos</small><strong>${fmt(last.stats?.fallidos)}</strong></div><div><small>Destinatarios</small><strong>${fmt(last.stats?.total)}</strong></div></div>`
    : empty(
        'campaign',
        'Todavía no hay campañas',
        'Prepará la primera: mensaje, flyer y a quién mandarlo.'
      );
  return card(
    `${cardHead('Última campaña', last ? `${esc(campaignTime(last.inicio))} · ${esc(segmentLabel(last.segmento))}` : '', last ? campaignBadge(last) : '')}${cuerpo}<p class="stat-foot" style="margin-top:12px">Programación: ${programacion} · máximo ${fmt(cfg.MAX_POR_CORRIDA || 50)} por tanda · ${Math.round(Number(cfg.DELAY_MIN_MS || 15000) / 1000)}–${Math.round(Number(cfg.DELAY_MAX_MS || 45000) / 1000)} s entre mensajes</p><div class="card-foot">${last ? `<button class="button secondary" data-route="resultados">${icon('monitoring')}Ver resultados</button>` : ''}<button class="button primary" data-route="campana">${icon('add')}Nueva campaña</button></div>`
  );
}

const HEALTH_TONES = { verde: 'green', amarillo: 'amber', rojo: 'red' };

function healthCard(connected) {
  const h = state.health || {};
  const cfg = state.config || {};
  const maxVentana = Number(cfg.MAX_POR_HORA || 0);
  const ventana = Number(h.enviadosVentana || 0);
  const warmup = state.status?.calentamiento;
  const score = connected && h.score != null ? Number(h.score) : null;
  return card(
    `${cardHead('Salud del número', 'Cuida que WhatsApp no bloquee la cuenta')}${gauge(score ?? 0, HEALTH_TONES[h.estado] || '', score == null ? '—' : score, connected ? healthStateLabel(h) : 'Sin conexión')}<div class="kv section-gap"><div><small>Últimos ${fmt(h.ventanaCupoMin || cfg.VENTANA_CUPO_MINUTOS || 60)} min</small><strong>${maxVentana ? `${ventana}/${maxVentana}` : ventana}</strong></div><div><small>Respuesta hoy</small><strong>${connected && h.enviadosHoy ? `${Math.round(Number(h.tasaRespuesta || 0) * 100)}%` : '—'}</strong></div><div><small>Calentamiento</small><strong>${warmup?.calentamiento ? `Día ${Number(warmup.diasPrevios || 0) + 1}` : 'No'}</strong></div></div>${connected && h.recomendaciones?.[0] ? `<p class="notice section-gap">${icon('lightbulb')}<span>${esc(h.recomendaciones[0])}</span></p>` : ''}`
  );
}

function activityCard() {
  const eventos = state.logs.slice(-6).reverse();
  return card(
    `${cardHead('Actividad del motor', 'Envíos, sincronizaciones y bajas', '<span class="badge green"><span class="dot"></span>En vivo</span>')}<div class="activity">${eventos.length ? eventos.map(eventRow).join('') : empty('history', 'Todavía no hay actividad', 'Lo que haga el motor aparece acá.')}</div>`
  );
}

// Las líneas del log vienen como "[8/10/2026, 15:43:29] texto".
function parseLogLine(linea) {
  const match = String(linea || '').match(/^\[([^\]]+)\]\s*(.*)$/);
  const hora = match ? (match[1].split(',')[1] || match[1]).trim().slice(0, 5) : '';
  return { hora, texto: match ? match[2] : String(linea || '') };
}

function eventRow(linea) {
  const { hora, texto } = parseLogLine(linea);
  const tono = /❌|ERROR|⛔|🚫/.test(texto) ? 'red' : /SIMULACRO|💾|📸/.test(texto) ? 'gray' : '';
  return `<div class="activity-row ${tono}"><i></i><p>${esc(texto)}</p><time>${esc(hora)}</time></div>`;
}

function liveCampaignCard() {
  const m = state.motor || {};
  const s = m.stats || {};
  const total = Number(s.total || 0);
  const hechos = Number(s.hechos || 0);
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  const ultimo = state.progress;
  const titulo = m.pausado
    ? 'Campaña en pausa'
    : s.simulacro
      ? 'Simulacro en curso'
      : 'Enviando campaña';
  return card(
    `${cardHead(titulo, s.tandas > 1 ? `Tanda ${Number(state.tanda?.actual || 1)} de ${Number(s.tandas)}` : '', `<span class="badge ${m.pausado ? 'amber' : 'brand'}"><span class="dot"></span>${s.simulacro ? 'Simulacro' : m.pausado ? 'Pausada' : 'En vivo'}</span>`)}<div class="live-grid">${gauge(pct, '', `${hechos}/${total}`, 'mensajes')}<div><div class="kv"><div><small>Enviados</small><strong>${fmt(s.ok)}</strong></div><div><small>Fallidos</small><strong>${fmt(s.fallidos)}</strong></div><div><small>Faltan</small><strong>${fmt(Math.max(0, total - hechos))}</strong></div></div>${ultimo ? `<p class="live-last ${ultimo.ok === false ? 'bad' : ''}">${ultimo.ok === false ? '✗' : '✓'} ${esc(ultimo.etiqueta || '')}${ultimo.error ? ` · ${esc(ultimo.error)}` : ''}</p>` : ''}<p class="live-wait" id="live-wait">${esc(waitLabel())}</p></div></div><div class="card-foot">${m.pausado ? `<button class="button primary" data-action="motor-reanudar">${icon('play_arrow')}Reanudar</button>` : `<button class="button secondary" data-action="motor-pausar">${icon('pause')}Pausar</button>`}<button class="button danger" data-action="motor-detener">${icon('stop')}Detener</button></div>`,
    'live-campaign'
  );
}

const WAIT_LABELS = {
  normal: 'Próximo mensaje en',
  larga: 'Pausa larga de seguridad:',
  cupo: 'Cupo por hora lleno; sigue en',
  tanda: 'Espera entre tandas:',
};

function waitLabel() {
  const m = state.motor || {};
  if (m.pausado) return 'Pausada: no sale nada hasta que la reanudes.';
  const w = state.wait;
  if (!w) return 'Preparando el próximo envío…';
  const restante = Math.max(0, Math.round((w.hasta - Date.now()) / 1000));
  if (!restante) return 'Enviando…';
  const tiempo = restante >= 90 ? `${Math.ceil(restante / 60)} min` : `${restante} s`;
  return `${WAIT_LABELS[w.tipo] || 'Esperando'} ${tiempo}`;
}

function tickWait() {
  const el = $('#live-wait');
  if (el) el.textContent = waitLabel();
}

// ---------- Campaña (asistente de 4 pasos) ----------

const CAMPAIGN_STEPS = [
  ['Mensaje', 'Qué decís'],
  ['Flyer', 'Imagen y menú'],
  ['Destinatarios', 'A quién'],
  ['Revisar y enviar', 'Chequeo final'],
];

function campaignStepDone(step) {
  if (step === 1) return Boolean(state.message.trim());
  if (step === 2) return state.media.length > 0 || Boolean(state.pdf);
  if (step === 3) return Boolean(state.campaignGroup || state.campaignSegment);
  return false;
}

function renderCampana() {
  const step = state.campaignPlan ? 4 : state.campaignStep || 1;
  const stepper = `<ol class="stepper">${CAMPAIGN_STEPS.map(([titulo, detalle], i) => {
    const n = i + 1;
    const clase = n === step ? 'active' : campaignStepDone(n) ? 'done' : '';
    return `<li><button class="${clase}" data-action="campaign-step" data-id="${n}" aria-current="${n === step ? 'step' : 'false'}"><b>${clase === 'done' ? icon('check') : n}</b><span>${titulo}<small>${detalle}</small></span></button></li>`;
  }).join('')}</ol>`;
  const pasos = { 1: messageStep, 2: mediaStep, 3: audienceStep, 4: reviewStep };
  const anterior =
    step > 1 && !state.campaignPlan
      ? `<button class="button secondary" data-action="campaign-step" data-id="${step - 1}">${icon('arrow_back')}Anterior</button>`
      : '<span></span>';
  const siguiente =
    step < 4
      ? `<button class="button primary" data-action="campaign-step" data-id="${step + 1}">Siguiente ${icon('arrow_forward')}</button>`
      : '';
  return `${pageHead('Nueva campaña', 'Prepará el mensaje, revisalo y recién ahí se envía. Nada sale sin tu confirmación.')}${state.motor?.corriendo ? `<div class="section-gap" style="margin:0 0 20px">${liveCampaignCard()}</div>` : ''}${stepper}<div class="studio"><div>${state.campaignPlan ? `<section class="card campaign-plan">${campaignPlanMarkup()}</section>` : ''}${card(pasos[step]())}<div class="wizard-nav">${anterior}${siguiente}</div></div><aside class="preview-dock">${renderWhatsappPreview()}</aside></div>`;
}

function messageStep() {
  const tabs = [
    ['general', 'General'],
    ['recurrentes', 'Ya pidieron'],
    ['nuevos', 'Nuevos'],
    ['frios', 'Recuperar fríos'],
  ];
  return `${cardHead('Mensaje', 'Podés tener un mensaje distinto para cada grupo; si uno queda vacío, ese grupo recibe el general.')}<div class="tabs" role="tablist">${tabs.map(([id, label]) => `<button role="tab" aria-selected="${state.campaignTab === id}" class="${state.campaignTab === id ? 'active' : ''}" data-action="campaign-tab" data-tab="${id}">${label}</button>`).join('')}</div><div class="editor-tools"><div class="tags"><span class="stat-foot">Insertar:</span><button class="var-pill" data-insert="{SALUDO}">{SALUDO}</button><button class="var-pill" data-insert="{NOMBRE}">{NOMBRE}</button></div><span class="stat-foot" id="message-count">0 caracteres</span></div><p class="notice warn" id="saludo-aviso" style="margin-bottom:12px" ${saludoDuplicado(state.message) ? '' : 'hidden'}>${icon('warning')}<span>Tu mensaje ya empieza saludando y el sistema agrega otro saludo automático: el cliente va a recibir dos. Borrá tu saludo o reemplazalo por <b>{SALUDO}</b>.</span></p><label class="sr-only" for="campaign-message">Mensaje de la campaña</label><textarea class="editor" id="campaign-message" placeholder="Ej: Hoy tenemos milanesa napolitana con papas a $8.500. ¡Hacé tu pedido!">${esc(state.message)}</textarea><div class="card-foot"><button class="button secondary" data-action="save-message">${icon('save')}Guardar borrador</button></div>`;
}

function mediaStep() {
  const imagenes = state.media
    .map(
      (item) =>
        `<figure class="media-item"><img src="${esc(assetUrl(item.dataUrl || item.url || ''))}" alt="${esc(item.nombre || 'Flyer')}"><footer><span>${esc(item.nombre || 'Imagen')}</span><button data-remove-image="${esc(item.nombre || '')}" aria-label="Quitar ${esc(item.nombre || 'imagen')}">${icon('delete')}</button></footer></figure>`
    )
    .join('');
  const pdf = state.pdf
    ? `<figure class="media-item"><div class="doc">${icon('picture_as_pdf')}</div><footer><span>${esc(state.pdf.nombre || 'menu.pdf')}</span><button data-remove-pdf="true" aria-label="Quitar PDF">${icon('delete')}</button></footer></figure>`
    : '';
  return `${cardHead('Flyer y menú', 'Opcional. La primera imagen va con el texto; las demás y el PDF salen en mensajes aparte.')}<label class="dropzone">${icon('add_photo_alternate')}<strong>Subir imágenes o PDF</strong><span>JPG, PNG, WEBP o PDF · hasta 16 MB cada uno</span><input id="campaign-file" type="file" hidden multiple accept="image/*,.pdf"></label>${imagenes || pdf ? `<div class="media-list">${imagenes}${pdf}</div>` : `<p class="notice section-gap">${icon('info')}<span>Sin flyer se manda sólo el texto.</span></p>`}`;
}

function audienceOption(value, titulo, detalle, total) {
  return `<label class="audience"><input type="radio" name="segment" value="${value}" ${state.campaignSegment === value && !state.campaignGroup ? 'checked' : ''}><div><strong>${titulo}</strong><p>${detalle}</p></div><span class="count">${total == null ? '—' : fmt(total)}</span></label>`;
}

function audienceStep() {
  const s = campaignSegmentCounts();
  const n = (v) => (s.loaded ? v : null);
  const reales = state.status?.pedidosReales?.configurado
    ? audienceOption(
        'cliente',
        'Ya compraron',
        'Tienen al menos un pedido en Modo Sabor.',
        n(s.clientes)
      ) +
      audienceOption('frecuente', 'Frecuentes', '4 o más pedidos en Modo Sabor.', n(s.frecuentes)) +
      audienceOption(
        'inactivo_30',
        'No piden hace 30 días',
        'Compraron antes, pero no en el último mes.',
        n(s.inactivos)
      )
    : '';
  const grupos = state.groups.length
    ? `<label class="field section-gap"><span>O un grupo guardado</span><select id="campaign-group"><option value="">Ninguno</option>${state.groups.map((g) => `<option value="${esc(g.id)}" ${state.campaignGroup === g.id ? 'selected' : ''}>${esc(g.nombre)} · ${g.numeros.length} contactos</option>`).join('')}</select><small>Los grupos se arman en Contactos, seleccionando y tocando "Guardar grupo".</small></label>`
    : `<p class="notice section-gap">${icon('bookmark_add')}<span>Para mandarle a pocos (por ejemplo una prueba), seleccioná contactos en <button class="link-button" data-route="contactos">Contactos</button> y guardalos como grupo.</span></p>`;
  return `${cardHead('Destinatarios', 'Siempre quedan afuera los excluidos, los pausados y quienes ya recibieron hoy.')}<div class="audience-grid">${audienceOption('todos', 'Todos los habilitados', 'Todos los que no están excluidos ni pausados.', n(s.total))}${reales}${audienceOption('activo', 'Activos', 'Respondieron en los últimos 14 días.', n(s.recurrentes))}${audienceOption('nuevo', 'Nuevos', 'Chats de los últimos 7 días sin promo.', n(s.nuevos))}${audienceOption('frio', 'Fríos', '3 o más promos sin respuesta.', n(s.frios))}</div>${grupos}`;
}

// Paso 4: chequeos calculados con el estado real; nada está tildado de antemano.
function reviewStep() {
  const cfg = state.config || {};
  const connected = state.status?.whatsapp === 'listo';
  const hoy = new Date().getDay();
  const diaNoEnvio = Array.isArray(cfg.DIAS_NO_ENVIO) && cfg.DIAS_NO_ENVIO.includes(hoy);
  const destino = state.campaignGroup
    ? segmentLabel(`grupo:${state.campaignGroup}`)
    : state.campaignSegment
      ? segmentLabel(state.campaignSegment)
      : '';
  const checks = [
    [
      connected,
      'WhatsApp conectado',
      connected ? 'Sesión activa.' : 'Escaneá el QR antes de enviar.',
    ],
    [
      Boolean(state.message.trim()),
      'Mensaje',
      state.message.trim()
        ? `${state.message.trim().length} caracteres.`
        : 'Falta escribirlo en el paso 1.',
    ],
    [
      state.media.length > 0,
      'Flyer',
      state.media.length
        ? `${state.media.length} imagen(es) por contacto.`
        : 'Sin imagen: se manda sólo texto.',
      true,
    ],
    [
      !saludoDuplicado(state.message),
      'Saludo',
      saludoDuplicado(state.message)
        ? 'El mensaje ya saluda y se suma el saludo automático: va a salir repetido.'
        : 'Un solo saludo por mensaje.',
      true,
    ],
    [Boolean(destino), 'Destinatarios', destino || 'Elegilos en el paso 3.'],
    [
      !cfg.MODO_SOLO_RESPUESTAS && !diaNoEnvio,
      'Día habilitado',
      cfg.MODO_SOLO_RESPUESTAS
        ? 'Modo "sólo respuestas" activo: no salen promos.'
        : diaNoEnvio
          ? 'Hoy está marcado como día sin envío.'
          : 'Hoy se puede enviar.',
    ],
    [
      true,
      'Ritmo',
      `${Math.round(Number(cfg.DELAY_MIN_MS || 15000) / 1000)}–${Math.round(Number(cfg.DELAY_MAX_MS || 45000) / 1000)} s entre mensajes · ${Number(cfg.MAX_POR_HORA || 0) ? `${cfg.MAX_POR_HORA} por hora` : 'sin límite por hora'} · máximo ${fmt(cfg.MAX_POR_CORRIDA || 50)} por tanda.`,
    ],
  ];
  const rows = checks
    .map(
      ([ok, titulo, detalle, opcional]) =>
        `<div class="check ${ok ? '' : opcional ? 'warn' : 'bad'}">${icon(ok ? 'check_circle' : opcional ? 'info' : 'cancel')}<div><strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></div></div>`
    )
    .join('');
  const ocupado = state.motor?.corriendo;
  return `${cardHead('Revisar y enviar', 'Primero hacé un simulacro o mandate una prueba; el envío real pide confirmación.')}<div class="checks">${rows}</div><div class="card-foot"><button class="button secondary" data-action="test" ${ocupado ? 'disabled' : ''}>${icon('send_to_mobile')}Enviar prueba a mi WhatsApp</button><button class="button secondary" data-action="simulate" ${ocupado ? 'disabled' : ''}>${icon('play_circle')}Hacer simulacro</button><button class="button primary" data-action="dispatch" ${ocupado ? 'disabled' : ''}>${icon('fact_check')}Preparar y revisar envío</button></div>${ocupado ? `<p class="notice warn section-gap">${icon('hourglass_top')}<span>Hay una campaña en curso: esperá a que termine o detenela.</span></p>` : ''}`;
}

function pedidosRealesBadge() {
  const info = state.status?.pedidosReales;
  if (!info?.configurado)
    return '<span class="badge" title="Falta configurar MODOSABOR_API_URL en el servicio Masivos">Sin conexión con pedidos</span>';
  if (info.error)
    return `<span class="badge red" title="${esc(info.error)}">Pedidos de Modo Sabor: error</span>`;
  return `<span class="badge green"><span class="dot"></span>${fmt(info.contactosConPedidos)} con pedidos en Modo Sabor</span>`;
}

function lastActivity(c) {
  const m = c.metricas || {};
  if (m.ultimoPedido) return `Pidió el ${m.ultimoPedido}`;
  if (m.ultimaRespuestaFecha) return `Respondió el ${m.ultimaRespuestaFecha}`;
  return 'Sin historial';
}

// Cada pestaña del editor guarda su propia plantilla en el servidor (mensaje-<tag>.txt).
const CAMPAIGN_TAB_TAGS = { recurrentes: 'pidio', nuevos: 'nuevo', frios: 'frio' };

function campaignTemplateTag() {
  return CAMPAIGN_TAB_TAGS[state.campaignTab] || null;
}

function campaignPlanMarkup() {
  const plan = state.campaignPlan;
  if (!plan) return '';
  const executeAction = plan.simulacro ? 'run-simulation' : 'run-campaign';
  return `${cardHead(plan.simulacro ? 'Simulacro listo' : 'Envío listo para confirmar', `${esc(segmentLabel(plan.segmento))}. Todavía no salió ningún mensaje.`, `<span class="badge ${plan.simulacro ? '' : 'red'}">${plan.simulacro ? 'Simulacro' : 'Envío real'}</span>`)}<div class="kv"><div><small>Destinatarios</small><strong>${fmt(plan.total || 0)}</strong></div><div><small>Tandas</small><strong>${fmt(plan.config?.tandas || 1)}</strong></div><div><small>Pausa</small><strong>${fmt(plan.config?.delayMinSeg)}–${fmt(plan.config?.delayMaxSeg)} s</strong></div></div><div class="card-foot"><button class="button ghost" data-action="clear-plan">Cancelar</button><button class="button ${plan.simulacro ? 'secondary' : 'primary'}" data-action="${executeAction}">${icon(plan.simulacro ? 'play_circle' : 'send')}${plan.simulacro ? 'Ejecutar simulacro' : 'Enviar ahora'}</button></div>`;
}

function contactMatchesFilter(contact, filter) {
  const segments = [contact.segmento, ...(contact.segmentosAuto || []), ...(contact.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('es-AR');
  const inactive = Boolean(contact.excluido || contact.pausado);
  if (filter === 'excluidos') return inactive;
  if (inactive) return false;
  if (filter === 'activos') return true;
  if (filter === 'nuevos') return segments.includes('nuevo');
  if (filter === 'frios') return segments.includes('frio') || segments.includes('frío');
  if (filter === 'clientes') return segments.includes('cliente');
  return true;
}

function campaignSegmentCounts() {
  const loaded = state.contacts.length > 0;
  const enabled = state.contacts.filter((contact) => !contact.excluido && !contact.pausado);
  const count = (segment) =>
    enabled.filter((contact) => (contact.segmentosAuto || []).includes(segment)).length;
  return {
    loaded,
    total: enabled.length,
    recurrentes: count('activo'),
    nuevos: count('nuevo'),
    frios: count('frio'),
    clientes: count('cliente'),
    frecuentes: count('frecuente'),
    inactivos: count('inactivo_30'),
  };
}

// ---------- Contactos ----------

function visibleContactNumbers() {
  const query = state.contactQuery.trim().toLocaleLowerCase('es-AR');
  return state.contacts
    .filter((c) => contactMatchesFilter(c, state.contactsFilter))
    .filter(
      (c) =>
        !query ||
        [c.nombre, c.telefono, c.numero, c.segmento, ...(c.tags || []), ...(c.segmentosAuto || [])]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es-AR')
          .includes(query)
    )
    .map((c) => String(c.numero));
}

function contactOperations() {
  const selected = state.selectedContacts.length;
  const options = state.groups
    .map((g) => `<option value="${esc(g.id)}">${esc(g.nombre)} · ${g.numeros.length}</option>`)
    .join('');
  const grupos = state.groups.length
    ? `<select id="contact-group-select" class="group-select" aria-label="Grupo guardado"><option value="">Grupos guardados</option>${options}</select><button class="button secondary small" data-action="apply-group">Seleccionar grupo</button><button class="button ghost small icon" data-action="delete-group" title="Eliminar grupo" aria-label="Eliminar grupo seleccionado">${icon('delete')}</button>`
    : '';
  if (!selected)
    return `<div class="toolbar selection-tools"><button class="button secondary small" data-action="select-visible">${icon('select_all')}Seleccionar visibles</button>${grupos}<span class="stat-foot">Seleccioná contactos para guardarlos como grupo, pausarlos o excluirlos.</span></div>`;
  const restore =
    state.contactsFilter === 'excluidos'
      ? `<button class="button secondary small" data-action="reactivar-selected">${icon('undo')}Reactivar</button>`
      : `<button class="button danger small" data-action="exclude-selected">${icon('block')}Excluir</button>`;
  return `<div class="bulk-bar" role="region" aria-label="Acciones sobre la selección"><strong>${selected} seleccionado${selected === 1 ? '' : 's'}</strong>${grupos}<button class="button secondary small" data-action="save-group">${icon('bookmark_add')}Guardar grupo</button><button class="button secondary small" data-action="pause-selected">${icon('pause_circle')}Pausar 7 días</button>${restore}<button class="button ghost small" data-action="clear-selection">Limpiar</button></div>`;
}

function parseCsvLine(line, separator) {
  const values = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) {
      values.push(value.trim());
      value = '';
    } else value += char;
  }
  values.push(value.trim());
  return values.map((item) => item.replace(/^"|"$/g, '').replace(/""/g, '"'));
}

function parseImportedContacts(text, fileName = '') {
  if (/\.vcf$/i.test(fileName) || /BEGIN:VCARD/i.test(text)) {
    return text
      .split(/BEGIN:VCARD/i)
      .slice(1)
      .map((block) => {
        const name = block.match(/^FN[^:]*:(.*)$/im)?.[1]?.trim() || '';
        const phone = block.match(/^TEL[^:]*:(.*)$/im)?.[1]?.trim() || '';
        return { nombre: name, telefono: phone };
      })
      .filter((item) => item.telefono);
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const separator = lines[0].includes(';') ? ';' : ',';
  const first = parseCsvLine(lines[0], separator).map((item) =>
    item.toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '')
  );
  const hasHeader = first.some((item) =>
    /^(nombre|name|telefono|tel|phone|numero|mobile)$/.test(item)
  );
  const headers = hasHeader ? first : ['nombre', 'telefono'];
  return (hasHeader ? lines.slice(1) : lines)
    .map((line) => {
      const values = parseCsvLine(line, separator);
      const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
      return {
        nombre: row.nombre || row.name || row.contacto,
        telefono:
          row.telefono ||
          row.tel ||
          row.phone ||
          row.numero ||
          row.mobile ||
          values[1] ||
          values[0],
      };
    })
    .filter((item) => item.telefono);
}

function openContactModal() {
  $('#modal-root').innerHTML =
    `<div class="modal-backdrop" data-action="close-modal"><div class="modal contact-modal" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title"><div class="modal-head"><h2 id="contact-modal-title">Agregar contacto</h2><button class="button ghost icon" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><p class="muted">Se guarda en tu lista. No envía ningún mensaje.</p><label class="field section-gap"><span>Nombre</span><input id="contact-modal-name" type="text" maxlength="120" placeholder="Ej. Juan Pérez"></label><label class="field"><span>Teléfono</span><input id="contact-modal-phone" type="tel" maxlength="40" placeholder="+54 9 3863 ..."></label><div class="modal-actions"><button class="button secondary" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-contact">${icon('person_add')}Guardar</button></div></div></div>`;
  $('#contact-modal-name')?.focus();
}

function openContactImport() {
  let input = $('#contact-import-input');
  if (!input) {
    input = document.createElement('input');
    input.id = 'contact-import-input';
    input.type = 'file';
    input.hidden = true;
    input.accept = '.csv,.vcf,text/csv,text/vcard';
    input.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const contactos = parseImportedContacts(text, file.name);
        if (!contactos.length) return showToast('No encontré teléfonos válidos en el archivo.');
        const result = await api('/api/contactos/importar', {
          method: 'POST',
          body: JSON.stringify({ contactos }),
        });
        await refresh();
        showToast(
          `Importación lista: ${result.agregados} nuevos, ${result.actualizados} actualizados.`
        );
      } catch (error) {
        showToast(error.message);
      } finally {
        input.value = '';
      }
    });
    document.body.append(input);
  }
  input.click();
}

function contactBadges(c, max = 2) {
  const tags = [...(c.segmentosAuto || []), ...(c.tags || [])]
    .filter((t) => !['excluido', 'pausado', 'sin_enviar'].includes(t))
    .slice(0, max);
  return tags.length
    ? tags
        .map(
          (t) =>
            `<span class="badge ${['cliente', 'frecuente', 'pidio', 'pidio_ayer'].includes(t) ? 'green' : t === 'activo' ? 'brand' : ''}">${esc(SEGMENT_NAMES[t] || t)}</span>`
        )
        .join('')
    : '<span class="stat-foot">—</span>';
}

function contactStatus(c) {
  return `<span class="badge ${c.excluido ? 'red' : c.pausado ? 'amber' : 'green'}">${c.excluido ? 'Excluido' : c.pausado ? 'Pausado' : 'Habilitado'}</span>`;
}

function renderContactos() {
  const filter = state.contactsFilter;
  const filteredContacts = state.contacts.filter((c) => contactMatchesFilter(c, filter));
  const visibles = new Set(visibleContactNumbers());
  const todosVisibles = filteredContacts.filter((c) => visibles.has(String(c.numero)));
  const visible = todosVisibles.slice(0, state.contactsLimit);
  const selected = state.selectedDetail?.cliente || state.selectedContact || visible[0];
  const counts = Object.fromEntries(
    ['todos', 'activos', 'clientes', 'nuevos', 'frios', 'excluidos'].map((f) => [
      f,
      state.contacts.filter((c) => contactMatchesFilter(c, f)).length,
    ])
  );
  const chips = [
    ['todos', 'Todos'],
    ['activos', 'Habilitados'],
    ...(state.status?.pedidosReales?.configurado ? [['clientes', 'Ya compraron']] : []),
    ['nuevos', 'Nuevos'],
    ['frios', 'Fríos'],
    ['excluidos', 'Excluidos / pausados'],
  ];
  const lista = visible.length
    ? state.contactsView === 'cards'
      ? `<div class="contact-card-grid">${visible.map((c) => contactCard(c, selected)).join('')}</div>`
      : `<div class="table-wrap"><table class="table"><thead><tr><th style="width:36px"><span class="sr-only">Seleccionar</span></th><th>Cliente</th><th class="hide-sm">Segmentos</th><th class="hide-sm">Actividad</th><th class="hide-sm">Estado</th></tr></thead><tbody>${visible.map((c) => contactRow(c, selected)).join('')}</tbody></table></div>`
    : empty(
        'group_off',
        state.contactQuery ? 'No encontramos contactos' : 'No hay contactos en este filtro',
        state.contactQuery
          ? 'Probá con otro nombre o teléfono.'
          : 'Conectá WhatsApp y tocá "Actualizar contactos".'
      );
  return `${pageHead('Contactos', 'Tus contactos de WhatsApp con su historial de envíos, respuestas y pedidos.', `${pedidosRealesBadge()}<button class="button secondary" data-action="import">${icon('upload_file')}Importar</button><button class="button primary" data-action="add-contact">${icon('person_add')}Agregar</button>`)}
    <div class="toolbar"><label class="search-box"><span class="sr-only">Buscar contactos</span>${icon('search')}<input class="input" id="contact-search" placeholder="Buscar por nombre, teléfono o segmento" value="${esc(state.contactQuery)}"></label><div class="tabs contacts-view" role="group" aria-label="Vista"><button class="${state.contactsView === 'list' ? 'active' : ''}" data-action="contacts-view" data-view="list" aria-pressed="${state.contactsView === 'list'}">${icon('view_list')}</button><button class="${state.contactsView === 'cards' ? 'active' : ''}" data-action="contacts-view" data-view="cards" aria-pressed="${state.contactsView === 'cards'}">${icon('grid_view')}</button></div><button class="button secondary" data-action="photos">${icon('account_circle')}Fotos</button></div>
    <div class="filter-chips contacts-filter" style="margin-bottom:16px">${chips.map(([f, label]) => `<button class="filter-chip ${filter === f ? 'active' : ''}" data-action="contacts-filter" data-filter="${f}">${label} <b>${fmt(counts[f])}</b></button>`).join('')}</div>
    ${contactOperations()}
    <div class="crm-layout">${card(`<p class="stat-foot" style="margin-bottom:8px">${fmt(todosVisibles.length)} de ${fmt(filteredContacts.length)} contactos</p>${lista}${todosVisibles.length > visible.length ? `<div class="card-foot" style="justify-content:center"><button class="button secondary" data-action="contacts-more">Ver ${fmt(Math.min(60, todosVisibles.length - visible.length))} más</button></div>` : ''}`)}${detailCard(selected)}</div>`;
}

function contactRow(c, selected) {
  const numero = String(c.numero || '');
  const m = c.metricas || {};
  return `<tr class="${selected?.numero === c.numero ? 'selected' : ''}" data-contact="${esc(numero)}"><td><input class="contact-select" type="checkbox" data-contact-select="${esc(numero)}" aria-label="Seleccionar ${esc(c.nombre || numero)}" ${state.selectedContacts.includes(numero) ? 'checked' : ''}></td><td><div class="person">${avatarMarkup(c)}<div style="min-width:0"><strong>${esc(c.nombre || 'Sin nombre')}</strong><small>${esc(c.telefono || 'Sin teléfono visible')}</small><span class="show-sm">${contactStatus(c)}</span></div></div></td><td class="hide-sm"><div class="tags">${contactBadges(c)}</div></td><td class="hide-sm"><span>${esc(lastActivity(c))}</span><br><small class="stat-foot">${m.pedidosReales ? `${m.pedidosReales} pedidos` : m.respondioTotal ? `${m.respondioTotal} respuestas` : 'Sin respuestas'}</small></td><td class="hide-sm">${contactStatus(c)}</td></tr>`;
}

function contactCard(c, selected) {
  const numero = String(c.numero || '');
  return `<article class="contact-card ${selected?.numero === c.numero ? 'selected' : ''}" data-contact="${esc(numero)}"><div class="contact-card-top">${avatarMarkup(c)}<div class="person" style="min-width:0"><div style="min-width:0"><strong>${esc(c.nombre || 'Sin nombre')}</strong><small>${esc(c.telefono || 'Sin teléfono')}</small></div></div><input class="contact-select" type="checkbox" data-contact-select="${esc(numero)}" aria-label="Seleccionar ${esc(c.nombre || numero)}" ${state.selectedContacts.includes(numero) ? 'checked' : ''}></div><div class="tags">${contactBadges(c, 3)}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><small class="stat-foot">${esc(lastActivity(c))}</small>${contactStatus(c)}</div></article>`;
}

function detailActivity(detail) {
  const responses = Array.isArray(detail.respuestas)
    ? detail.respuestas.map((item) => ({
        date: `${item.fecha || ''} ${item.hora || ''}`.trim(),
        label: item.posiblePedido ? 'Posible pedido' : 'Respondió',
        text: item.texto || '',
        tone: item.posiblePedido ? 'green' : '',
      }))
    : [];
  const sends = Array.isArray(detail.enviados)
    ? detail.enviados.map((date) => ({
        date,
        label: 'Recibió una campaña',
        text: '',
        tone: 'brand',
      }))
    : [];
  const activity = [...responses, ...sends]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  if (!activity.length) return '<p class="stat-foot">Todavía no hay envíos ni respuestas.</p>';
  return `<div class="timeline">${activity.map((item) => `<div class="timeline-item ${item.tone}"><strong>${esc(item.label)}</strong><small>${esc(item.date || 'Sin fecha')}</small>${item.text ? `<p class="muted">${esc(item.text)}</p>` : ''}</div>`).join('')}</div>`;
}

function detailCard(c) {
  if (!c)
    return `<aside class="card detail-card">${empty('person_search', 'Elegí un contacto', 'Su detalle aparece acá.')}</aside>`;
  const detail = state.selectedDetail || {};
  const m = c.metricas || {};
  const dm = detail.metricas || {};
  return `<aside class="card detail-card"><div class="detail-head">${avatarMarkup(c, 'avatar lg')}<div style="min-width:0"><h2>${esc(c.nombre || 'Sin nombre')}</h2><p>${esc(c.telefono || 'Sin teléfono visible')}</p></div></div><div class="page-actions section-gap"><button class="button primary" data-action="open-wa" data-number="${esc(c.numero)}">${icon('chat')}Abrir chat</button><button class="button secondary" data-action="note">${icon('edit_note')}Nota</button>${contactStatus(c)}</div><div class="kv section-gap"><div><small>Pedidos</small><strong>${m.pedidosReales ?? '—'}</strong></div><div><small>Respuestas</small><strong>${dm.respuestasTotal ?? m.respondioTotal ?? '—'}</strong></div><div><small>Envíos</small><strong>${dm.enviadosTotal ?? m.enviadosTotal ?? '—'}</strong></div></div><div class="detail-block"><h3>Segmentos</h3><div class="tags">${contactBadges(c, 6)}</div>${m.ultimoPedido ? `<p class="stat-foot" style="margin-top:8px">Último pedido: ${esc(m.ultimoPedido)}</p>` : ''}</div><div class="detail-block"><h3>Historial real</h3>${detailActivity(detail)}</div><div class="detail-block"><h3>Notas</h3><div class="note-box">${esc(detail.nota?.texto || 'Sin notas. Tocá "Nota" para agregar una.')}</div></div></aside>`;
}

// ---------- Chats ----------

function messageTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Como la lista de WhatsApp: hora si es hoy, "Ayer", día de la semana o fecha.
function chatListTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp) * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const hoy = new Date();
  const dias = Math.round(
    (new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) -
      new Date(date.getFullYear(), date.getMonth(), date.getDate())) /
      86400000
  );
  if (dias <= 0) return messageTime(timestamp);
  if (dias === 1) return 'Ayer';
  if (dias < 7) return date.toLocaleDateString('es-AR', { weekday: 'long' });
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function dayLabel(timestamp) {
  const etiqueta = chatListTime(timestamp);
  if (!etiqueta) return '';
  if (/^\d{1,2}:\d{2}$/.test(etiqueta)) return 'Hoy';
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1);
}

function chatContactLabel(contact) {
  if (contact?.grupo) return 'Grupo';
  if (contact?.telefono) return contact.telefono;
  const numero = String(contact?.numero || '');
  return numero.endsWith('@lid') ? '' : numero.replace(/@.*/, '');
}

function chatName(item) {
  return item?.nombre || chatContactLabel(item) || 'Sin nombre';
}

// Etiqueta del mensaje como en WhatsApp: "📷 Foto", "🎤 Audio"… con su texto si lo trae.
const MEDIA_LABELS = {
  image: '📷 Foto',
  video: '🎥 Video',
  audio: '🎤 Audio',
  ptt: '🎤 Audio',
  document: '📄 Documento',
  sticker: '🙂 Sticker',
  location: '📍 Ubicación',
  vcard: '👤 Contacto',
  multi_vcard: '👤 Contactos',
  revoked: '🚫 Mensaje eliminado',
  call_log: '📞 Llamada',
  poll_creation: '📊 Encuesta',
};

function messageLabel(message) {
  const media = MEDIA_LABELS[message.type];
  const texto = String(message.body || '').trim();
  if (media) return texto && message.type !== 'revoked' ? `${media.split(' ')[0]} ${texto}` : media;
  return texto || (message.hasMedia ? '📎 Archivo' : 'Mensaje');
}

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function chatAttachmentVisual(file) {
  if (file.kind === 'image')
    return `<img class="wa-media-image" src="${esc(file.data)}" alt="Vista previa de ${esc(file.name)}">`;
  if (file.kind === 'audio') return `<audio controls src="${esc(file.data)}"></audio>`;
  return `<div class="wa-document">${icon('description')}<div><strong>${esc(file.name)}</strong><span class="wa-doc-meta">PDF · ${formatBytes(file.size)}</span></div></div>`;
}

function pendingChatBubble() {
  const file = state.chatAttachment;
  if (!file) return '';
  return `<div class="wa-bubble tail pending-media">${chatAttachmentVisual(file)}${state.chatDraft.trim() ? `<span>${esc(state.chatDraft.trim())}</span>` : ''}<time>sin enviar</time></div>`;
}

function conversationMessages(chat) {
  const messages = state.conversation?.mensajes || [];
  if (state.conversation?.disponible && messages.length) {
    let diaAnterior = '';
    const filas = messages.map((message, i) => {
      const dia = dayLabel(message.timestamp);
      const separador =
        dia && dia !== diaAnterior ? `<span class="date-chip">${esc(dia)}</span>` : '';
      diaAnterior = dia || diaAnterior;
      const siguiente = messages[i + 1];
      const finDeGrupo =
        !siguiente ||
        Boolean(siguiente.fromMe) !== Boolean(message.fromMe) ||
        dayLabel(siguiente.timestamp) !== dia;
      const ticks = message.fromMe
        ? `<span class="ticks ${Number(message.ack) >= 3 ? 'read' : ''}">✓✓</span>`
        : '';
      return `${separador}<div class="wa-bubble ${message.fromMe ? '' : 'inbound'} ${finDeGrupo ? 'tail' : 'grouped'}">${waFormat(esc(messageLabel(message)))}<time>${messageTime(message.timestamp)}${ticks}</time></div>`;
    });
    return `<div class="conversation-messages">${filas.join('')}</div>`;
  }
  if (state.conversation && !messages.length)
    return `<span class="date-chip">${esc(state.conversation.motivo || 'Todavía no hay mensajes guardados de este chat.')}</span>`;
  return chat.numero ? '<span class="date-chip">Cargando…</span>' : '';
}

function scrollConversationToBottom() {
  const body = $('.conversation-body');
  if (body) body.scrollTop = body.scrollHeight;
}

function loadConversation(numero) {
  if (!numero) return Promise.resolve();
  return api(`/api/conversacion?numero=${encodeURIComponent(numero)}`, {
    signal: AbortSignal.timeout(10000),
  })
    .then((conversation) => {
      state.conversation = conversation;
      render();
      scrollConversationToBottom();
    })
    .catch((error) => {
      state.conversation = { disponible: false, mensajes: [], motivo: error.message };
      render();
      scrollConversationToBottom();
    });
}

function chatMatchesFilter(chat, filter) {
  if (filter === 'pedidos')
    return (
      chat.estado === 'pedido_probable' || /pedido|reserva|delivery|menu/i.test(chat.texto || '')
    );
  if (filter === 'consultas') return chat.estado === 'consulta';
  if (filter === 'problemas') return chat.estado === 'problema';
  if (filter === 'nuevos') return !chat.estado || chat.estado === 'nuevo';
  if (filter === 'grupos') return Boolean(chat.grupo);
  if (filter === 'personas') return !chat.grupo;
  return true;
}

function renderConversaciones() {
  const allChats = state.conversations.length ? state.conversations : state.crm;
  const query = state.chatQuery.trim().toLocaleLowerCase('es-AR');
  const chats = allChats.filter(
    (item) =>
      chatMatchesFilter(item, state.chatFilter) &&
      (!query ||
        [item.nombre, item.telefono, item.numero, item.texto]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('es-AR')
          .includes(query))
  );
  const chat = allChats.find((item) => item.numero === state.selectedChatNumber) || {
    nombre: '',
    numero: '',
    estado: 'nuevo',
  };
  const estados = [
    ['nuevo', 'Nuevo'],
    ['pedido_probable', 'Pedido'],
    ['consulta', 'Consulta'],
    ['respondido', 'Respondido'],
    ['problema', 'Problema'],
    ['baja', 'Baja'],
    ['cerrado', 'Cerrado'],
  ];
  const estadoActual = estados.some(([value]) => value === chat.estado) ? chat.estado : 'nuevo';
  const filtros = [
    ['todos', 'Todos'],
    ['personas', 'Personas'],
    ['grupos', 'Grupos'],
    ['pedidos', 'Pedidos'],
    ['consultas', 'Consultas'],
    ['problemas', 'Problemas'],
  ].map(([f, label]) => {
    const n = allChats.filter((item) => chatMatchesFilter(item, f)).length;
    return `<button class="chat-filter ${state.chatFilter === f ? 'active' : ''}" data-action="chat-filter" data-filter="${f}">${label} ${n}</button>`;
  });
  const conectado = state.status?.whatsapp === 'listo';
  const visibles = chats.slice(0, state.chatsLimit);
  const lista = visibles.length
    ? visibles.map((item) => chatRow(item)).join('') +
      (chats.length > visibles.length
        ? `<button class="chat-more" data-action="chats-more">Ver ${fmt(Math.min(80, chats.length - visibles.length))} chats más</button>`
        : '')
    : empty('search_off', 'No hay chats', 'Probá con otro nombre o filtro.');
  const cabecera = chat.numero
    ? `<div class="conversation-head"><button class="wa-back back-to-list" data-action="chat-back" aria-label="Volver a la lista">${icon('arrow_back_ios')}</button>${avatarMarkup(chat)}<div class="phone-identity"><strong>${esc(chatName(chat))}</strong><small>${esc(chatContactLabel(chat) || 'Contacto de WhatsApp')}</small></div><label class="sr-only" for="conversation-status">Clasificación</label><select class="chat-status" id="conversation-status" title="Clasificación">${estados.map(([value, label]) => `<option value="${value}" ${value === estadoActual ? 'selected' : ''}>${label}</option>`).join('')}</select></div>`
    : '';
  const cuerpo = chat.numero
    ? `${conversationMessages(chat)}${pendingChatBubble()}`
    : `<div class="chat-placeholder">${icon('forum')}<strong>Elegí un chat</strong><span>Los mensajes aparecen acá.</span></div>`;
  const composer = chat.numero
    ? `<div class="wa-compose composer"><label class="chat-attach-button" title="Adjuntar imagen, PDF o audio">${icon('add')}<input id="chat-file" type="file" hidden accept="image/*,application/pdf,audio/*"></label>${state.chatAttachment ? `<button class="wa-icon-button" data-action="remove-chat-attachment" aria-label="Quitar adjunto">${icon('close')}</button>` : ''}<label class="sr-only" for="chat-message">Mensaje</label><input id="chat-message" type="text" value="${esc(state.chatDraft)}" placeholder="Mensaje" autocomplete="off"><button class="wa-send" data-action="send-chat" aria-label="Enviar">${icon('arrow_upward')}</button></div>`
    : '';
  return `${pageHead('Chats', 'Tus conversaciones de WhatsApp: respondé, adjuntá y clasificá.', `<span class="badge ${conectado ? 'green' : 'red'}"><span class="dot"></span>${conectado ? 'WhatsApp conectado' : 'Sin conexión'}</span><button class="button secondary" data-action="refresh">${icon('sync')}Actualizar</button>`)}
  <div class="inbox-grid ${state.chatOpen && chat.numero ? 'chat-open' : ''}">
    <section class="card message-list"><div class="message-list-head"><label class="chat-search-wrap"><span class="sr-only">Buscar chats</span>${icon('search')}<input class="input" id="chat-search" placeholder="Buscar" value="${esc(state.chatQuery)}"></label><div class="chat-filters">${filtros.join('')}</div></div><div class="chat-scroll">${lista}</div></section>
    <section class="card conversation">${cabecera}<div class="conversation-body">${cuerpo}</div>${composer}</section>
  </div>`;
}

function chatPreviewText(item) {
  // Si la última línea es una respuesta de campaña, se muestra ese texto; si no, el último mensaje.
  const tipo = item.ultimoTipo || '';
  const texto = item.texto || item.ultimoTexto || '';
  const etiqueta = messageLabel({ type: tipo, body: texto });
  return etiqueta === 'Mensaje' ? '' : etiqueta;
}

function chatRow(item) {
  const unread = state.unreadByChat[item.numero] || 0;
  const hora = item.timestamp ? chatListTime(item.timestamp) : item.hora || '';
  const preview = chatPreviewText(item);
  const mio = item.ultimoMio ? '<span class="ticks">✓✓</span> ' : '';
  return `<div class="inbox-item ${item.numero === state.selectedChatNumber ? 'selected' : ''} ${unread ? 'unread' : ''}" data-chat-number="${esc(item.numero || '')}">${avatarMarkup(item, 'avatar chat-avatar')}<div class="chat-row-copy"><div class="chat-row-top"><strong>${esc(chatName(item))}</strong><time>${esc(hora)}</time></div><div class="chat-row-bottom"><p>${mio}${esc(preview || chatContactLabel(item))}</p>${unread ? `<b class="chat-unread">${unread > 99 ? '99+' : unread}</b>` : ''}</div></div></div>`;
}

// ---------- Resultados ----------

const DESTINATARIO_ESTADOS = {
  enviado: 'Enviado',
  fallido: 'Falló',
  detenido: 'Detenido',
  simulado: 'Simulado',
  pendiente: 'No se envió',
};

function campaignsTable() {
  if (!state.campaigns.length)
    return empty(
      'campaign',
      'Sin campañas todavía',
      'Cada campaña o simulacro queda registrado acá.'
    );
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Fecha</th><th class="hide-sm">Destinatarios</th><th>Resultado</th><th>Estado</th></tr></thead><tbody>${state.campaigns
    .map((c) => {
      const s = c.stats || {};
      return `<tr data-action="campaign-detail" data-id="${esc(c.id)}"><td><strong>${esc(campaignTime(c.inicio))}</strong></td><td class="hide-sm">${esc(segmentLabel(c.segmento))}</td><td class="num">${fmt(s.ok)} / ${fmt(s.total)}${s.fallidos ? ` · <span style="color:var(--error-700)">${fmt(s.fallidos)} fallidos</span>` : ''}</td><td>${campaignBadge(c)}</td></tr>`;
    })
    .join('')}</tbody></table></div>`;
}

function campaignDetailCard() {
  const c = state.campaignDetail;
  if (!c) return '';
  const destinatarios = Array.isArray(c.destinatarios) ? c.destinatarios : [];
  const fallidos = destinatarios.filter((d) => d.estado === 'fallido' || d.estado === 'detenido');
  const reintento =
    !c.simulacro && fallidos.length && c.estado !== 'corriendo'
      ? `<button class="button primary" data-action="retry-failed" data-id="${esc(c.id)}">${icon('replay')}Reintentar ${fallidos.length} fallidos</button>`
      : '';
  return card(
    `${cardHead(`Campaña del ${esc(campaignTime(c.inicio))}`, `${esc(segmentLabel(c.segmento))} · pausa ${Math.round(Number(c.config?.delayMinMs || 0) / 1000)}–${Math.round(Number(c.config?.delayMaxMs || 0) / 1000)} s`, `<button class="button ghost icon" data-action="close-campaign-detail" aria-label="Cerrar detalle">${icon('close')}</button>`)}<div class="recipient-list">${destinatarios.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Contacto</th><th>Estado</th><th class="hide-sm">Motivo</th></tr></thead><tbody>${destinatarios.map((d) => `<tr><td><div class="person"><div><strong>${esc(d.nombre || 'Sin nombre')}</strong><small>${esc(d.numero)}</small></div></div></td><td><span class="badge ${d.estado === 'enviado' || d.estado === 'simulado' ? 'green' : d.estado === 'pendiente' ? '' : 'red'}">${esc(DESTINATARIO_ESTADOS[d.estado] || d.estado)}</span></td><td class="hide-sm"><small class="stat-foot">${esc(d.error || '')}</small></td></tr>`).join('')}</tbody></table></div>` : empty('group_off', 'Sin destinatarios', 'No había nadie pendiente.')}</div>${reintento ? `<div class="card-foot">${reintento}</div>` : ''}`,
    'section-gap'
  );
}

function renderResultados() {
  const stats = state.analytics || {};
  const totals = stats.totales || {};
  const dias = Array.isArray(stats.dias) ? stats.dias.slice(0, 7).reverse() : [];
  const enviados = Number(totals.enviados || 0);
  const leidos = Number(totals.leidos || 0);
  const tasaLectura = enviados ? `${Math.round((leidos / enviados) * 100)}%` : '—';
  const maxDia = Math.max(1, ...dias.map((dia) => Number(dia.enviados || 0)));
  const barras = dias.length
    ? `<div class="chart-bars">${dias.map((dia) => `<div class="bar" title="${esc(dia.fecha)}: ${fmt(dia.enviados)} enviados"><b>${fmt(dia.enviados)}</b><i class="${Number(dia.enviados || 0) ? '' : 'zero'}" style="height:${Number(dia.enviados || 0) ? Math.max(3, Math.round((Number(dia.enviados || 0) / maxDia) * 100)) : 0}%"></i><small>${esc(String(dia.fecha || '').slice(5))}</small></div>`).join('')}</div>`
    : empty(
        'bar_chart',
        'Sin envíos registrados',
        'El gráfico aparece después de la primera campaña.'
      );
  const logs = state.logs.slice(-80).reverse();
  return `${pageHead('Resultados', 'Lo que registró el motor de envío: campañas, entregas, lecturas y respuestas.', `<button class="button secondary" data-action="refresh">${icon('sync')}Actualizar</button>`)}
    <div class="grid stats">${metric('Campañas', fmt(state.campaigns.length), 'campaign', `${state.campaigns.filter((c) => c.estado === 'finalizada' && !c.simulacro).length} reales`, 'brand')}${metric('Mensajes enviados', fmt(enviados), 'send', 'Histórico', 'blue')}${metric('Lecturas', fmt(leidos), 'done_all', `Tasa de lectura ${tasaLectura}`, 'green')}${metric('Respuestas', fmt(totals.respondieron), 'reply', 'Personas que escribieron', 'amber')}</div>
    ${campaignDetailCard()}
    <div class="grid halves section-gap">${card(`${cardHead('Campañas', 'Tocá una para ver a quién le llegó')}${campaignsTable()}`)}<div class="stack">${card(`${cardHead('Enviados por día', 'Últimos 7 días con actividad')}${barras}`)}${card(`${cardHead('Log del motor', 'Últimos registros')}<div class="log-list">${logs.length ? logs.map((linea) => `<div>${esc(linea)}</div>`).join('') : 'Sin registros'}</div>`)}</div></div>`;
}

// ---------- Configuración ----------

const THEMES = [
  ['rojo', 'Rojo Modo Sabor', ['#fef3f2', '#e3242b', '#a11017']],
  ['azul', 'Azul', ['#ecf3ff', '#465fff', '#2a31d8']],
  ['verde', 'Verde', ['#ecfdf3', '#12b76a', '#027a48']],
  ['grafito', 'Grafito', ['#f2f4f7', '#344054', '#101828']],
];

function currentTheme() {
  return document.documentElement.dataset.theme || 'rojo';
}

function scheduleSegmentSelect(actual) {
  const valor = actual || 'todos';
  const opciones = [
    ['todos', 'Todos los habilitados'],
    ['activo', SEGMENT_NAMES.activo],
    ['nuevo', SEGMENT_NAMES.nuevo],
    ['cliente', SEGMENT_NAMES.cliente],
    ['frecuente', SEGMENT_NAMES.frecuente],
    ['inactivo_30', SEGMENT_NAMES.inactivo_30],
    ...state.groups.map((grupo) => [`grupo:${grupo.id}`, `Grupo: ${grupo.nombre}`]),
  ];
  return `<select id="config-schedule-segment" aria-label="Destinatarios de la corrida programada">${opciones.map(([v, label]) => `<option value="${esc(v)}" ${v === valor ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
}

const switchMarkup = (setting, label, on) =>
  `<button class="switch ${on ? 'on' : ''}" data-setting="${setting}" role="switch" aria-label="${label}" aria-checked="${on ? 'true' : 'false'}" aria-pressed="${on ? 'true' : 'false'}"><i></i></button>`;

function settingRow(titulo, detalle, control) {
  return `<div class="setting-row"><div><strong>${titulo}</strong>${detalle ? `<small>${detalle}</small>` : ''}</div>${control}</div>`;
}

function renderConfiguracionCompleta() {
  const c = state.config || {};
  const seconds = (ms, fallback) => Math.max(0, Math.round(Number(ms || fallback) / 1000));
  const active = (key, fallback = false) => (c[key] == null ? fallback : Boolean(c[key]));
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const selectedDays = Array.isArray(c.DIAS_NO_ENVIO) ? c.DIAS_NO_ENVIO : [];
  const lines = (items) => esc((Array.isArray(items) ? items : []).join('\n'));
  const temaActual = currentTheme();
  const apariencia = card(
    `${cardHead('Apariencia', 'Color del panel. Se guarda en este navegador y no cambia los mensajes.')}<div class="theme-options">${THEMES.map(([id, nombre, colores]) => `<button class="theme-option ${temaActual === id ? 'active' : ''}" data-action="set-theme" data-id="${id}" aria-pressed="${temaActual === id}"><span class="theme-swatch">${colores.map((color) => `<i style="background:${color}"></i>`).join('')}</span>${nombre}</button>`).join('')}</div>`
  );
  return `${pageHead('Configuración', 'Ritmo de envío, protecciones del número y mensajes. Se aplica al motor al guardar.', `<button class="button primary" data-action="save-settings">${icon('save')}Guardar cambios</button>`)}
  ${apariencia}
  <div class="settings-grid section-gap">
    ${card(`${cardHead('Identidad', 'Cómo te ve el cliente en la vista previa')}${settingRow('Nombre', 'Aparece arriba del chat.', `<input id="config-business-name" type="text" value="${esc(c.NEGOCIO_NOMBRE || businessLabel())}" maxlength="80">`)}${settingRow('Descripción', 'Texto corto debajo del nombre.', `<input id="config-business-status" type="text" value="${esc(c.NEGOCIO_ESTADO || '')}" maxlength="80">`)}${settingRow('Logo', 'Ruta del logo de la vista previa.', `<input id="config-logo-path" type="text" value="${esc(c.NEGOCIO_LOGO || '/assets/logo.png')}" maxlength="300">`)}<div class="brand-preview"><img class="whatsapp-brand-logo" src="${esc(previewLogo())}" alt="">Logo actual</div>`)}
    ${card(`${cardHead('Ritmo y límites', 'Cuanto más lento, menos riesgo de bloqueo')}${settingRow('Pausa entre mensajes', 'Mínimo y máximo, en segundos.', `<span class="inline-inputs"><input id="config-delay-min" type="number" value="${seconds(c.DELAY_MIN_MS, 15000)}" min="0" max="300" aria-label="Pausa mínima"><input id="config-delay-max" type="number" value="${seconds(c.DELAY_MAX_MS, 45000)}" min="0" max="300" aria-label="Pausa máxima"></span>`)}${settingRow('Máximo por tanda', 'Mensajes en una corrida.', `<input id="config-max-run" type="number" value="${Number(c.MAX_POR_CORRIDA || 50)}" min="1" max="100">`)}${settingRow('Máximo por ventana', `Mensajes cada ${Number(c.VENTANA_CUPO_MINUTOS || 60)} minutos (0 = sin límite).`, `<span class="inline-inputs"><input id="config-max-hour" type="number" value="${Number(c.MAX_POR_HORA || 0)}" min="0" max="1000" aria-label="Mensajes"><input id="config-window-minutes" type="number" value="${Number(c.VENTANA_CUPO_MINUTOS || 60)}" min="1" max="240" aria-label="Minutos"></span>`)}${settingRow('Reintentos', 'Si falla un envío.', `<input id="config-retries" type="number" value="${Number(c.REINTENTOS || 0)}" min="0" max="3">`)}${settingRow('Pausa larga', 'Cada cuántos mensajes y cuántos segundos.', `<span class="inline-inputs"><input id="config-pause-long" type="number" value="${Number(c.PAUSA_LARGA_CADA || 0)}" min="0" max="500" aria-label="Cada cuántos mensajes"><input id="config-pause-long-seconds" type="number" value="${Number(c.PAUSA_LARGA_SEGUNDOS || 120)}" min="30" max="3600" aria-label="Segundos"></span>`)}`)}
    ${card(`${cardHead('Protecciones', 'Cuidan a tus clientes y al número')}${settingRow('No repetir el mismo día', 'Nadie recibe dos promos el mismo día.', switchMarkup('no-repetir', 'No repetir el mismo día', active('NO_REPETIR_MISMO_DIA', true)))}${settingRow('Adjuntar PDF', 'Manda el menú si lo subiste.', switchMarkup('attach-pdf', 'Adjuntar PDF', active('ADJUNTAR_PDF', true)))}${settingRow('Baja automática', 'Quien responde BAJA queda excluido.', switchMarkup('auto-optout', 'Baja automática', active('BAJA_AUTOMATICA', true)))}<label class="field section-gap"><span>Respuesta a la baja</span><textarea id="config-baja-response" rows="2">${esc(c.BAJA_RESPUESTA || '')}</textarea></label><label class="field section-gap"><span>Pie de cada promo</span><textarea id="config-optout-footer" rows="2">${esc(c.FOOTER_BAJA || '')}</textarea><small>Se agrega al final de cada mensaje. Vacío = sin pie.</small></label>`)}
    ${card(`${cardHead('Calentamiento y tandas', 'Para números nuevos o listas grandes')}${settingRow('Calentamiento progresivo', 'Sube el límite de a poco, día a día.', switchMarkup('warmup', 'Calentamiento progresivo', active('CALENTAMIENTO_ACTIVO')))}${settingRow('Inicio / aumento diario', 'Mensajes el primer día y cuánto sube.', `<span class="inline-inputs"><input id="config-warmup-start" type="number" value="${Number(c.CALENTAMIENTO_INICIO || 20)}" min="1" max="100" aria-label="Inicio"><input id="config-warmup-increment" type="number" value="${Number(c.CALENTAMIENTO_INCREMENTO || 10)}" min="1" max="100" aria-label="Aumento diario"></span>`)}${settingRow('Tandas automáticas', 'Sigue sola con pausas hasta cubrir la lista.', switchMarkup('batch-mode', 'Tandas automáticas', active('MODO_TANDAS')))}${settingRow('Espera entre tandas', 'Minutos.', `<input id="config-batch-wait" type="number" value="${Number(c.ESPERA_ENTRE_TANDAS_MINUTOS || 20)}" min="5" max="240">`)}<p class="notice warn section-gap">${icon('warning')}<span>Estas protecciones bajan el riesgo, pero no garantizan que WhatsApp no bloquee el número.</span></p>`)}
    ${card(`${cardHead('Programación', 'Envío automático diario')}${settingRow('Programación automática', 'No hace falta tener el panel abierto.', switchMarkup('programacion', 'Programación automática', active('PROGRAMACION_ACTIVA')))}${settingRow('Hora', 'Formato 24 h.', `<input id="config-schedule-time" type="time" value="${esc(c.PROGRAMACION_HORA || '10:30')}">`)}${settingRow('A quién manda', 'Segmento o grupo.', scheduleSegmentSelect(c.PROGRAMACION_SEGMENTO))}${settingRow('Modo sólo respuestas', 'Frena todas las promos; los chats siguen.', switchMarkup('solo-respuestas', 'Modo sólo respuestas', active('MODO_SOLO_RESPUESTAS')))}<div class="detail-block"><h3>Días sin envío</h3><div class="day-selector" id="config-days-no-send">${days.map((label, index) => `<label class="day-chip"><input class="config-day" type="checkbox" value="${index}" ${selectedDays.includes(index) ? 'checked' : ''}>${label}</label>`).join('')}</div></div>`)}
    ${card(`${cardHead('Saludos y cierres', 'Rotan al azar en cada mensaje')}<label class="field"><span>Saludos</span><textarea id="config-greetings" rows="4">${lines(c.SALUDOS)}</textarea><small>Uno por línea. {NOMBRE} pone el nombre del contacto.</small></label><label class="field section-gap"><span>Cierres</span><textarea id="config-closures" rows="4">${lines(c.CIERRES)}</textarea></label>${settingRow('Meta de pedidos por día', 'Referencia para el panel.', `<input id="config-daily-target" type="number" value="${Number(c.META_PEDIDOS_DIA || 20)}" min="1" max="10000">`)}`)}
  </div>`;
}

// ---------- Vista previa de WhatsApp ----------

// El motor agrega un saludo al principio si el mensaje no usa {SALUDO}: si el texto
// ya arranca saludando, el cliente recibe "¡Hola Ana! ¡Hola Ana!".
function saludoDuplicado(texto) {
  const t = String(texto || '').trim();
  return !/\{SALUDO\}/i.test(t) && /^[^\p{L}]*(hola|buenas|buen d[ií]a|qu[eé] tal)/iu.test(t);
}

// Formato de WhatsApp sobre texto ya escapado: *negrita*, _cursiva_, ~tachado~.
function waFormat(html) {
  return html
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s>(])_([^_\n]+)_(?=$|[\s<.,!?)])/g, '$1<em>$2</em>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>')
    .replace(/\n/g, '<br>');
}

// Arma el texto igual que el servidor (mensaje.js): saludo + cuerpo + cierre + pie de baja.
// El saludo y el cierre rotan al azar; la vista previa muestra el primero de cada lista.
function previewMessage() {
  const c = state.config || {};
  const cuerpo = state.message.trim();
  if (!cuerpo) return '';
  const saludo = String((c.SALUDOS || [])[0] || '¡Hola{NOMBRE}!').replace(
    /\{NOMBRE\}/gi,
    ' Cliente'
  );
  let texto = /\{SALUDO\}/i.test(cuerpo)
    ? cuerpo.replace(/\{SALUDO\}/gi, saludo)
    : `${saludo}\n\n${cuerpo}`;
  texto = texto.replace(/\{NOMBRE\}/gi, 'Cliente');
  const cierre = (c.CIERRES || [])[0];
  if (cierre) texto += `\n\n${cierre}`;
  if (String(c.FOOTER_BAJA || '').trim()) texto += `\n\n${String(c.FOOTER_BAJA).trim()}`;
  return texto.replace(/\n{3,}/g, '\n\n');
}

function renderWhatsappPreview() {
  const c = state.config || {};
  const name = c.NEGOCIO_NOMBRE || businessLabel();
  const status = c.NEGOCIO_ESTADO || 'tocá acá para ver la info';
  const imagenes = state.media.map((item) => item.dataUrl || item.url || '').filter(Boolean);
  const pdf = state.pdf?.nombre || '';
  const texto = previewMessage();
  const ahora = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const hora = `<time>${esc(ahora)}<span class="ticks">✓✓</span></time>`;
  const message = texto ? waFormat(esc(texto)) : '<em>Escribí el mensaje para ver cómo llega.</em>';
  // Así lo arma el motor: la primera imagen lleva el texto; el resto y el PDF van aparte.
  const principal = `<div class="wa-bubble ${imagenes.length > 1 || pdf ? '' : 'tail'}">${imagenes[0] ? `<img class="wa-media-image" src="${esc(assetUrl(imagenes[0]))}" alt="Flyer de la campaña">` : ''}<span class="wa-message-copy">${message}</span>${hora}</div>`;
  const otras = imagenes
    .slice(1)
    .map(
      (src, i, resto) =>
        `<div class="wa-bubble ${i === resto.length - 1 && !pdf ? 'tail' : ''}"><img class="wa-media-image" src="${esc(assetUrl(src))}" alt="Imagen adicional">${hora}</div>`
    )
    .join('');
  const documento = pdf
    ? `<div class="wa-bubble tail"><div class="wa-document">${icon('description')}<div><strong>${esc(pdf)}</strong><span class="wa-doc-meta">PDF</span></div></div>${hora}</div>`
    : '';
  return `<div class="card wa-preview">${cardHead('Vista previa', 'Así llega a cada cliente')}<div class="phone"><div class="wa-status-bar"><span>${esc(ahora)}</span><span class="icons">${icon('signal_cellular_alt')}${icon('wifi')}${icon('battery_full')}</span></div><div class="phone-bar"><span class="material-symbols-outlined back" aria-hidden="true">arrow_back_ios</span><img class="whatsapp-brand-logo" src="${esc(previewLogo())}" alt=""><div class="phone-identity"><strong>${esc(name)}</strong><small>${esc(status)}</small></div><span class="actions">${icon('videocam')}${icon('call')}</span></div><div class="phone-body"><span class="date-chip">Hoy</span>${principal}${otras}${documento}</div><div class="wa-compose">${icon('add')}<span class="input-fake"></span>${icon('photo_camera')}${icon('mic')}</div><div class="wa-home"><i></i></div></div><p class="preview-disclaimer">El saludo y el cierre rotan entre los que configuraste. {NOMBRE} usa el nombre de cada contacto.</p></div>`;
}

// ---------- Render ----------

function render() {
  const views = {
    inicio: renderInicio,
    campana: renderCampana,
    contactos: renderContactos,
    conversaciones: renderConversaciones,
    resultados: renderResultados,
    configuracion: renderConfiguracionCompleta,
  };
  const app = $('#app');
  app.innerHTML = views[state.route]();
  document
    .querySelectorAll('.nav-item, .mobile-nav button')
    .forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
  document.querySelectorAll('[data-unread-chats]').forEach((item) => {
    item.textContent = state.unreadChats || 0;
  });
  if ($('#campaign-message')) updateMessageCount();
}

function updateMessageCount() {
  const input = $('#campaign-message');
  const count = $('#message-count');
  if (input && count) count.textContent = `${input.value.length} caracteres`;
}

function closeQrModal() {
  if (qrRefreshTimer) clearInterval(qrRefreshTimer);
  qrRefreshTimer = null;
  $('#modal-root').innerHTML = '';
}

function syncAfterWhatsAppLink() {
  closeQrModal();
  showToast('WhatsApp vinculado correctamente. Sincronizando contactos…');
  api('/api/listar', { method: 'POST', body: '{}' }).catch((error) =>
    showToast(error.message || 'No se pudieron sincronizar los contactos.')
  );
}

async function refreshQrStatus() {
  if (!$('#modal-root')?.innerHTML) return closeQrModal();
  const live = await api('/api/status').catch(() => null);
  if (!live) return;
  const wasConnected = state.status?.whatsapp === 'listo';
  state.status = { ...(state.status || {}), ...live, qr: live.qr || null };
  if (!wasConnected && state.status.whatsapp === 'listo') {
    syncAfterWhatsAppLink();
  } else {
    syncShell();
    openQr();
  }
}

function openQr() {
  const connected = state.status?.whatsapp === 'listo';
  if (connected) closeQrModal();
  else if (!qrRefreshTimer) qrRefreshTimer = setInterval(refreshQrStatus, 3000);
  const qr = state.status?.qr;
  const qrMarkup = connected
    ? `<div class="qr-box">${icon('check_circle').replace('material-symbols-outlined', 'material-symbols-outlined ok')}</div>`
    : qr
      ? `<div class="qr-box real"><img src="${esc(qr)}" alt="Código QR de WhatsApp"></div>`
      : '<div class="qr-box"><span>Generando el código QR…</span></div>';
  const detail = connected
    ? 'WhatsApp ya está vinculado. No necesitás escanear otro código.'
    : state.status?.whatsappDetalle ||
      (qr ? 'El código se renueva solo cada pocos segundos.' : 'Esperá unos segundos.');
  $('#modal-root').innerHTML =
    `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="qr-title"><div class="modal-head"><h2 id="qr-title">${connected ? 'WhatsApp vinculado' : 'Conectar WhatsApp'}</h2><button class="button ghost icon" data-action="close-modal" aria-label="Cerrar">${icon('close')}</button></div><p class="muted">${connected ? 'La sesión queda guardada en el servidor.' : 'En tu teléfono: WhatsApp → Dispositivos vinculados → Vincular un dispositivo, y escaneá este código.'}</p>${qrMarkup}<p class="notice">${icon('info')}<span>${esc(detail)}</span></p></div></div>`;
}

async function refresh() {
  state.busy = true;
  const results = await Promise.allSettled([
    api('/api/status'),
    api('/api/clientes'),
    api('/api/crm'),
    api('/api/salud'),
    api('/api/campanas'),
    api('/api/config'),
    api('/api/mensaje'),
    api('/api/grupos-envio'),
  ]);
  if (results[0].status === 'fulfilled')
    state.status = {
      ...(state.status || {}),
      ...results[0].value,
      qr: results[0].value.qr || null,
    };
  if (results[1].status === 'fulfilled') state.contacts = results[1].value.clientes || [];
  if (results[2].status === 'fulfilled') state.crm = results[2].value.respuestas || [];
  if (results[3].status === 'fulfilled') state.health = results[3].value;
  if (results[4].status === 'fulfilled') state.campaigns = results[4].value.campanas || [];
  if (results[5].status === 'fulfilled') state.config = results[5].value;
  if (results[6].status === 'fulfilled' && results[6].value.texto)
    state.message = results[6].value.texto.trim();
  if (results[7].status === 'fulfilled') state.groups = results[7].value.grupos || [];
  if (state.status?.motor)
    state.motor = { ...state.status.motor, stats: state.status.stats || state.motor.stats };
  state.busy = false;
  syncShell();
  render();
  if (results.every((r) => r.status === 'rejected'))
    showToast('Panel listo: conectá WhatsApp para cargar datos reales.');

  api('/api/estadisticas')
    .then((analytics) => {
      state.analytics = analytics;
      render();
    })
    .catch(() => {});
  Promise.allSettled([api('/api/operador'), api('/api/logs')]).then(([operador, logs]) => {
    if (operador.status === 'fulfilled') state.operador = operador.value;
    if (logs.status === 'fulfilled') state.logs = logs.value.lineas || [];
    if (state.route === 'inicio' || state.route === 'resultados') render();
  });
  api('/api/conversaciones', { signal: AbortSignal.timeout(10000) })
    .then(async (chats) => {
      state.conversations = chats.conversaciones || [];
      if (chats.total > state.contacts.length) {
        const latestContacts = await api('/api/clientes');
        if (latestContacts?.clientes) state.contacts = latestContacts.clientes;
      }
      syncShell();
      render();
    })
    .catch(() => {});
  Promise.allSettled([api('/api/imagen'), api('/api/pdf')]).then((media) => {
    if (media[0].status === 'fulfilled') state.media = media[0].value.imagenes || [];
    if (media[1].status === 'fulfilled')
      state.pdf = media[1].value.existe ? { nombre: media[1].value.nombre || 'menu.pdf' } : null;
    render();
  });
}

function connectLive() {
  if (!window.EventSource) return;
  const stream = new EventSource(panelPath('/api/eventos'));
  stream.addEventListener('respuesta', (event) => {
    const info = JSON.parse(event.data || '{}');
    const numero = String(info.numero || '');
    if (!numero) return;
    const known = state.conversations.find((item) => item.numero === numero);
    if (known) {
      known.texto = info.texto || 'Nuevo mensaje';
      known.hora = 'Ahora';
      known.tipo = info.tipo || known.tipo;
      known.estado = info.estado || known.estado || 'nuevo';
      state.conversations = [
        known,
        ...state.conversations.filter((item) => item.numero !== numero),
      ];
    } else {
      api('/api/conversaciones')
        .then((result) => {
          state.conversations = result.conversaciones || [];
          if (state.route === 'conversaciones') render();
        })
        .catch(() => {});
    }
    if (state.selectedChatNumber === numero) {
      state.unreadByChat[numero] = 0;
      loadConversation(numero);
    } else {
      state.unreadByChat[numero] = (state.unreadByChat[numero] || 0) + 1;
      state.unreadChats += 1;
      syncShell();
      if (state.route === 'conversaciones') render();
      showToast('Nuevo mensaje recibido.');
    }
  });
  stream.addEventListener('estado', (event) => {
    const live = JSON.parse(event.data || '{}');
    const liveWhatsapp = live.estado || live.whatsapp || state.status?.whatsapp;
    const wasConnected = state.status?.whatsapp === 'listo';
    state.status = {
      ...(state.status || {}),
      whatsapp: liveWhatsapp,
      whatsappDetalle:
        liveWhatsapp === 'listo'
          ? live.detalle || live.whatsappDetalle || 'Cuenta conectada y lista para operar'
          : (live.detalle ?? live.whatsappDetalle ?? state.status?.whatsappDetalle),
      qr: live.qr || state.status?.qr,
    };
    const modal = $('#modal-root');
    if (!wasConnected && liveWhatsapp === 'listo') {
      syncAfterWhatsAppLink();
    } else if (modal?.innerHTML) {
      openQr();
    }
    syncShell();
    if (state.route === 'inicio' || state.route === 'configuracion') render();
  });
  stream.addEventListener('qr', (event) => {
    state.status = { ...(state.status || {}), qr: event.data };
    syncShell();
    if ($('#modal-root')?.innerHTML) openQr();
  });
  stream.addEventListener('lista', (event) => {
    const info = JSON.parse(event.data || '{}');
    if (info.tipo === 'inicio') showToast('Sincronizando agenda y chats de WhatsApp…');
    if (info.tipo === 'recuperando')
      showToast('Reiniciando la vista de WhatsApp para recuperar la sincronización…');
    if (info.tipo === 'chats') {
      refresh();
      showToast(
        `${info.chats || 0} chats cargados (${info.grupos || 0} grupos); completando agenda…`
      );
    }
    if (info.tipo === 'fin') {
      refresh();
      showToast(
        `${info.total || 0} contactos y ${info.chats || 0} chats sincronizados (${info.grupos || 0} grupos).`
      );
    }
    if (info.tipo === 'error') showToast(info.error || 'No se pudieron sincronizar los contactos.');
  });
  stream.addEventListener('fotos', (event) => {
    const info = JSON.parse(event.data || '{}');
    if (info.tipo === 'inicio') showToast(`Actualizando fotos de ${info.total || 0} contactos…`);
    if (info.tipo === 'fin') {
      refresh();
      showToast(`Fotos listas: ${info.conFoto || 0} descargadas.`);
    }
    if (info.tipo === 'error') showToast(info.error || 'No se pudieron actualizar las fotos.');
  });
  // Motor de envío en vivo: progreso, esperas, tandas y log.
  const liveRender = () => {
    syncShell();
    if (state.route === 'inicio' || state.route === 'campana') render();
  };
  stream.addEventListener('motor', (event) => {
    const info = JSON.parse(event.data || '{}');
    state.motor = {
      corriendo: Boolean(info.corriendo),
      pausado: Boolean(info.pausado),
      stats: info.stats || {},
    };
    if (!state.motor.corriendo) state.wait = null;
    liveRender();
  });
  stream.addEventListener('progreso', (event) => {
    state.progress = JSON.parse(event.data || '{}');
    state.wait = null;
    liveRender();
  });
  stream.addEventListener('espera', (event) => {
    const info = JSON.parse(event.data || '{}');
    state.wait = { tipo: info.tipo, hasta: Date.now() + Number(info.segundos || 0) * 1000 };
    tickWait();
  });
  stream.addEventListener('tanda', (event) => {
    const info = JSON.parse(event.data || '{}');
    state.tanda = info;
    if (info.tipo === 'espera')
      state.wait = { tipo: 'tanda', hasta: Date.now() + Number(info.minutos || 0) * 60000 };
    liveRender();
  });
  stream.addEventListener('log', (event) => {
    let linea = event.data || '';
    try {
      linea = JSON.parse(linea);
    } catch (e) {
      /* ya es texto */
    }
    state.logs = [...state.logs, String(linea)].slice(-300);
    if (state.route === 'inicio') {
      const feed = $('.activity');
      if (feed) render();
    }
  });
  stream.addEventListener('programado', () => {
    showToast('Arrancó el envío programado.');
  });
  stream.addEventListener('baja', () => {
    showToast('Un contacto pidió la BAJA: quedó excluido.');
    refresh();
  });
  stream.addEventListener('fin', (event) => {
    const info = JSON.parse(event.data || '{}');
    state.wait = null;
    state.progress = null;
    showToast(
      info.error
        ? `La campaña se cortó: ${info.error}`
        : `${info.detenido ? 'Campaña detenida' : 'Campaña terminada'}: ${Number(info.ok || 0)} enviados, ${Number(info.fallidos || 0)} fallidos.`
    );
    refresh();
  });
  stream.onerror = () => {
    /* el navegador reintenta con el retry del servidor */
  };
}

function settingsPayload() {
  const number = (id, fallback = 0) => Number($('#' + id)?.value ?? fallback);
  const enabled = (key) =>
    Boolean($('.switch[data-setting="' + key + '"]')?.classList.contains('on'));
  const lines = (id) =>
    String($('#' + id)?.value || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  return {
    NEGOCIO_NOMBRE: String($('#config-business-name')?.value || '').trim(),
    NEGOCIO_ESTADO: String($('#config-business-status')?.value || '').trim(),
    NEGOCIO_LOGO: String($('#config-logo-path')?.value || '/assets/logo.png').trim(),
    DELAY_MIN_MS: number('config-delay-min') * 1000,
    DELAY_MAX_MS: number('config-delay-max') * 1000,
    PAUSA_LARGA_CADA: number('config-pause-long'),
    PAUSA_LARGA_SEGUNDOS: number('config-pause-long-seconds', 120),
    REINTENTOS: number('config-retries'),
    MAX_POR_CORRIDA: number('config-max-run', 50),
    MAX_POR_HORA: number('config-max-hour'),
    VENTANA_CUPO_MINUTOS: number('config-window-minutes', 60),
    ESPERA_ENTRE_TANDAS_MINUTOS: number('config-batch-wait', 20),
    CALENTAMIENTO_INICIO: number('config-warmup-start', 20),
    CALENTAMIENTO_INCREMENTO: number('config-warmup-increment', 10),
    META_PEDIDOS_DIA: number('config-daily-target', 20),
    NO_REPETIR_MISMO_DIA: enabled('no-repetir'),
    ADJUNTAR_PDF: enabled('attach-pdf'),
    BAJA_AUTOMATICA: enabled('auto-optout'),
    BAJA_RESPUESTA: String($('#config-baja-response')?.value || '').trim(),
    FOOTER_BAJA: String($('#config-optout-footer')?.value || '').trim(),
    CALENTAMIENTO_ACTIVO: enabled('warmup'),
    MODO_TANDAS: enabled('batch-mode'),
    PROGRAMACION_ACTIVA: enabled('programacion'),
    PROGRAMACION_HORA: $('#config-schedule-time')?.value || '10:30',
    PROGRAMACION_SEGMENTO: $('#config-schedule-segment')?.value || 'todos',
    MODO_SOLO_RESPUESTAS: enabled('solo-respuestas'),
    DIAS_NO_ENVIO: [...document.querySelectorAll('.config-day:checked')].map((input) =>
      Number(input.value)
    ),
    SALUDOS: lines('config-greetings'),
    CIERRES: lines('config-closures'),
  };
}

async function saveSettings() {
  await api('/api/config', { method: 'POST', body: JSON.stringify(settingsPayload()) });
  state.config = await api('/api/config');
  render();
  showToast('Configuración completa guardada.');
}

async function action(name, value) {
  try {
    if (name === 'save-settings') return saveSettings();
    if (name === 'campaign-step') {
      state.campaignStep = Math.min(4, Math.max(1, Number(value) || 1));
      state.campaignPlan = null;
      render();
      return window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (name === 'set-theme') {
      if (value === 'rojo') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = value;
      try {
        localStorage.setItem('masivos-theme', value);
      } catch (e) {
        /* sin almacenamiento: dura hasta recargar */
      }
      return render();
    }
    if (name === 'chats-more') {
      state.chatsLimit += 80;
      return render();
    }
    if (name === 'contacts-more') {
      state.contactsLimit += 60;
      return render();
    }
    if (name === 'toggle-nav') return document.body.classList.toggle('nav-open');
    if (name === 'close-nav') return document.body.classList.remove('nav-open');
    if (name === 'chat-back') {
      state.chatOpen = false;
      return render();
    }
    if (name === 'qr') return openQr();
    if (name === 'close-modal') return closeQrModal();
    if (name === 'campaign-tab') {
      state.campaignTab = value || 'general';
      const tag = campaignTemplateTag();
      const data = await api(tag ? `/api/mensaje?tag=${tag}` : '/api/mensaje');
      state.message = String(data.texto || '').trim();
      return render();
    }
    if (name === 'save-message') {
      const texto = $('#campaign-message')?.value?.trim() || '';
      const tag = campaignTemplateTag();
      if (!texto && !tag) return showToast('Escribí un mensaje antes de guardar.');
      await api('/api/mensaje', { method: 'POST', body: JSON.stringify({ texto, tag }) });
      state.message = texto;
      return showToast(
        tag && !texto
          ? 'Mensaje del segmento borrado: ese grupo recibirá el mensaje general.'
          : 'Borrador guardado.'
      );
    }
    if (name === 'refresh') {
      await api('/api/listar', { method: 'POST', body: '{}' });
      return showToast('Sincronización iniciada; te aviso al terminar.');
    }
    if (name === 'photos') {
      await api('/api/fotos', { method: 'POST', body: '{}' });
      return showToast('Actualización de fotos iniciada.');
    }
    if (name === 'chat-filter') {
      state.chatFilter = [
        'todos',
        'personas',
        'grupos',
        'nuevos',
        'pedidos',
        'consultas',
        'problemas',
      ].includes(value)
        ? value
        : 'todos';
      state.chatsLimit = 80;
      return render();
    }
    if (name === 'contacts-view') {
      state.contactsView = value === 'cards' ? 'cards' : 'list';
      return render();
    }
    if (name === 'contacts-filter') {
      state.contactsFilter = ['todos', 'activos', 'nuevos', 'frios', 'excluidos'].includes(value)
        ? value
        : 'todos';
      state.selectedContact = null;
      state.selectedDetail = null;
      state.contactsLimit = 60;
      return render();
    }
    if (name === 'select-visible') {
      state.selectedContacts = [
        ...new Set([...state.selectedContacts, ...visibleContactNumbers()]),
      ];
      return render();
    }
    if (name === 'clear-selection') {
      state.selectedContacts = [];
      return render();
    }
    if (name === 'apply-group') {
      const id = $('#contact-group-select')?.value;
      const group = state.groups.find((item) => item.id === id);
      if (!group) return showToast('Elegí un grupo de envío.');
      state.selectedContacts = [...group.numeros];
      return render();
    }
    if (name === 'save-group') {
      if (!state.selectedContacts.length)
        return showToast('Seleccioná contactos antes de guardar el grupo.');
      const nombre = window.prompt('Nombre del grupo de envío:');
      if (!nombre?.trim()) return;
      const descripcion = window.prompt('Descripción opcional:') || '';
      await api('/api/grupos-envio', {
        method: 'POST',
        body: JSON.stringify({
          nombre: nombre.trim(),
          descripcion,
          numeros: state.selectedContacts,
        }),
      });
      await refresh();
      return showToast('Grupo de envío guardado.');
    }
    if (name === 'delete-group') {
      const id = $('#contact-group-select')?.value;
      if (!id) return showToast('Elegí un grupo para eliminar.');
      if (!window.confirm('¿Eliminar este grupo guardado? Los contactos no se borran.')) return;
      await api(`/api/grupos-envio/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await refresh();
      return showToast('Grupo eliminado.');
    }
    if (name === 'exclude-selected') {
      if (!state.selectedContacts.length) return showToast('Seleccioná al menos un contacto.');
      if (
        !window.confirm(
          `¿Excluir ${state.selectedContacts.length} contacto(s) de futuras campañas?`
        )
      )
        return;
      await api('/api/excluir', {
        method: 'POST',
        body: JSON.stringify({ numeros: state.selectedContacts, excluir: true }),
      });
      state.selectedContacts = [];
      await refresh();
      return showToast('Contactos excluidos de campañas.');
    }
    if (name === 'pause-selected') {
      if (!state.selectedContacts.length) return showToast('Seleccioná al menos un contacto.');
      await api('/api/pausar-contactos', {
        method: 'POST',
        body: JSON.stringify({
          numeros: state.selectedContacts,
          dias: 7,
          motivo: 'pausa manual desde Contactos',
        }),
      });
      state.selectedContacts = [];
      await refresh();
      return showToast('Contactos pausados por 7 días.');
    }
    if (name === 'reactivar-selected') {
      if (!state.selectedContacts.length) return showToast('Seleccioná al menos un contacto.');
      await api('/api/reactivar-contactos', {
        method: 'POST',
        body: JSON.stringify({ numeros: state.selectedContacts }),
      });
      // Reactivar devuelve el contacto a las campañas: saca la pausa y la exclusión.
      await api('/api/excluir', {
        method: 'POST',
        body: JSON.stringify({ numeros: state.selectedContacts, excluir: false }),
      });
      state.selectedContacts = [];
      await refresh();
      return showToast('Contactos reactivados: vuelven a recibir campañas.');
    }
    if (name === 'simulate' || name === 'dispatch') {
      const simulacro = name === 'simulate';
      // El paso 3 puede no estar en pantalla: los destinatarios viven en el estado.
      const segmento = state.campaignGroup
        ? `grupo:${state.campaignGroup}`
        : state.campaignSegment || '';
      if (!segmento) return showToast('Elegí a quién enviar: un segmento o un grupo guardado.');
      const texto = $('#campaign-message')?.value?.trim() || state.message.trim();
      if (!texto) return showToast('Escribí un mensaje antes de preparar la campaña.');
      await api('/api/mensaje', {
        method: 'POST',
        body: JSON.stringify({ texto, tag: campaignTemplateTag() }),
      });
      const plan = await api('/api/preparar-envio', {
        method: 'POST',
        body: JSON.stringify({ simulacro, segmento }),
      });
      state.campaignPlan = plan;
      state.route = 'campana';
      render();
      return showToast(
        simulacro
          ? 'Simulacro preparado para revisión.'
          : 'Campaña preparada: revisá el plan antes de enviar.'
      );
    }
    if (name === 'clear-plan') {
      state.campaignPlan = null;
      return render();
    }
    if (name === 'run-simulation' || name === 'run-campaign') {
      if (!state.campaignPlan?.token) return showToast('Prepará la campaña antes de ejecutarla.');
      const simulacro = name === 'run-simulation';
      if (
        !confirm(
          simulacro
            ? 'Se ejecutará el simulacro sin enviar mensajes. ¿Continuar?'
            : 'Esto enviará mensajes reales a los destinatarios preparados. ¿Continuar?'
        )
      )
        return;
      await api('/api/enviar', {
        method: 'POST',
        body: JSON.stringify({
          token: state.campaignPlan.token,
          simulacro,
          segmento: state.campaignPlan.segmento,
        }),
      });
      state.campaignPlan = null;
      await refresh();
      return showToast(simulacro ? 'Simulacro iniciado.' : 'Envío iniciado.');
    }
    if (name === 'test') {
      if (
        !confirm(
          'La prueba se enviará sólo a tu propio WhatsApp cuando la sesión esté conectada. ¿Continuar?'
        )
      )
        return;
      const textoPrueba = $('#campaign-message')?.value?.trim() || state.message.trim();
      if (!textoPrueba) return showToast('Escribí un mensaje antes de enviar la prueba.');
      await api('/api/mensaje', {
        method: 'POST',
        body: JSON.stringify({ texto: textoPrueba, tag: campaignTemplateTag() }),
      });
      await api('/api/enviar-prueba', {
        method: 'POST',
        body: JSON.stringify({ tag: campaignTemplateTag() }),
      });
      return showToast('Prueba enviada.');
    }
    if (name === 'remove-image') {
      await api(`/api/imagen?nombre=${encodeURIComponent(value || '')}`, { method: 'DELETE' });
      await refresh();
      return showToast('Imagen quitada.');
    }
    if (name === 'remove-pdf') {
      await api('/api/pdf', { method: 'DELETE' });
      await refresh();
      return showToast('PDF quitado.');
    }
    if (name === 'add-contact') return openContactModal();
    if (name === 'import') return openContactImport();
    if (name === 'save-contact') {
      const nombre = $('#contact-modal-name')?.value.trim();
      const telefono = $('#contact-modal-phone')?.value.trim();
      if (!telefono) return showToast('Ingresá un teléfono.');
      await api('/api/contactos', { method: 'POST', body: JSON.stringify({ nombre, telefono }) });
      $('#modal-root').innerHTML = '';
      await refresh();
      return showToast('Contacto guardado.');
    }
    if (name === 'open-wa') {
      if (!value) return showToast('Elegí un contacto para abrir su conversación.');
      state.selectedChatNumber = value;
      state.chatOpen = true;
      state.route = 'conversaciones';
      state.conversation = null;
      render();
      return loadConversation(value);
    }
    if (name === 'remove-chat-attachment') {
      state.chatAttachment = null;
      return render();
    }
    if (name === 'send-chat') {
      const chat =
        state.conversations.find((item) => item.numero === state.selectedChatNumber) ||
        state.crm.find((item) => item.numero === state.selectedChatNumber);
      const texto = state.chatDraft.trim();
      if (!chat?.numero) return showToast('Elegí una conversación real.');
      if (!texto && !state.chatAttachment)
        return showToast('Escribí un mensaje o adjuntá un archivo.');
      const destino = chat.nombre || chat.numero;
      const detalle = state.chatAttachment
        ? `el archivo ${state.chatAttachment.name}`
        : `el mensaje: «${texto.slice(0, 120)}»`;
      if (!window.confirm(`¿Enviar ${detalle} al chat ${destino}?`)) return;
      if (state.chatAttachment)
        await api('/api/conversacion/adjunto', {
          method: 'POST',
          body: JSON.stringify({
            numero: chat.numero,
            texto,
            nombre: state.chatAttachment.name,
            mimetype: state.chatAttachment.type,
            data: state.chatAttachment.data,
          }),
        });
      else
        await api('/api/conversacion/mensaje', {
          method: 'POST',
          body: JSON.stringify({ numero: chat.numero, texto }),
        });
      state.chatDraft = '';
      state.chatAttachment = null;
      state.conversation = null;
      await loadConversation(chat.numero);
      return showToast('Mensaje enviado.');
    }
    if (name === 'motor-pausar') {
      await api('/api/pausar', { method: 'POST', body: '{}' });
      return showToast('Campaña en pausa: no sale nada hasta que la reanudes.');
    }
    if (name === 'motor-reanudar') {
      await api('/api/reanudar', { method: 'POST', body: '{}' });
      return showToast('Campaña reanudada.');
    }
    if (name === 'motor-detener') {
      if (!window.confirm('¿Detener la campaña? Los que faltan no reciben el mensaje.')) return;
      await api('/api/detener', { method: 'POST', body: '{}' });
      return showToast('Deteniendo: termina el mensaje en curso y frena.');
    }
    if (name === 'note') {
      const numero = state.selectedDetail?.cliente?.numero || state.selectedContact?.numero;
      if (!numero) return showToast('Elegí un contacto.');
      const actual = state.selectedDetail?.nota?.texto || '';
      const nota = window.prompt('Nota para este cliente:', actual);
      if (nota == null) return;
      await api('/api/cliente-nota', { method: 'POST', body: JSON.stringify({ numero, nota }) });
      state.selectedDetail = await api(`/api/cliente-detalle?numero=${encodeURIComponent(numero)}`);
      render();
      return showToast('Nota guardada.');
    }
    if (name === 'campaign-detail') {
      state.campaignDetail = await api(`/api/campanas/${encodeURIComponent(value)}`);
      return render();
    }
    if (name === 'close-campaign-detail') {
      state.campaignDetail = null;
      return render();
    }
    if (name === 'retry-failed') {
      const plan = await api('/api/preparar-envio', {
        method: 'POST',
        body: JSON.stringify({ simulacro: false, segmento: `reintento:${value}` }),
      });
      if (!plan.total)
        return showToast('No quedan fallidos para reintentar (o ya recibieron hoy).');
      state.campaignPlan = plan;
      state.campaignDetail = null;
      state.route = 'campana';
      render();
      return showToast(`Reintento preparado para ${plan.total} contactos: revisalo y confirmá.`);
    }
  } catch (error) {
    showToast(error.message);
  }
}

document.addEventListener('click', (event) => {
  const settingSwitch = event.target.closest('.switch');
  if (settingSwitch) {
    settingSwitch.classList.toggle('on');
    settingSwitch.setAttribute(
      'aria-pressed',
      settingSwitch.classList.contains('on') ? 'true' : 'false'
    );
    return;
  }
  const removeImage = event.target.closest('[data-remove-image]')?.dataset.removeImage;
  if (removeImage != null) {
    action('remove-image', removeImage);
    return;
  }
  if (event.target.closest('[data-remove-pdf]')) {
    action('remove-pdf');
    return;
  }
  const route = event.target.closest('[data-route]')?.dataset.route;
  if (route) {
    state.route = route;
    document.body.classList.remove('nav-open');
    if (location.hash !== `#${route}`) history.pushState(null, '', `#${route}`);
    render();
    window.scrollTo({ top: 0 });
    if (route === 'conversaciones' && state.conversations.length) {
      const numero = state.selectedChatNumber || state.conversations[0].numero;
      state.selectedChatNumber = numero;
      loadConversation(numero);
    }
    return;
  }
  if (event.target.closest('.contact-select')) return;
  const actionButton = event.target.closest('[data-action]');
  const actionName = actionButton?.dataset.action;
  // El fondo del modal cierra sólo si se toca el fondo, no lo que está adentro.
  if (
    actionName === 'close-modal' &&
    actionButton.classList.contains('modal-backdrop') &&
    event.target !== actionButton
  )
    return;
  if (actionName) {
    action(
      actionName,
      actionButton.dataset.view ||
        actionButton.dataset.filter ||
        actionButton.dataset.tab ||
        actionButton.dataset.reply ||
        actionButton.dataset.number ||
        actionButton.dataset.id
    );
    return;
  }
  const contact = event.target.closest('[data-contact]')?.dataset.contact;
  if (contact) {
    state.selectedContact = state.contacts.find((c) => String(c.numero) === contact);
    state.selectedDetail = null;
    render();
    api(`/api/cliente-detalle?numero=${encodeURIComponent(contact)}`)
      .then((detail) => {
        state.selectedDetail = detail;
        render();
      })
      .catch(() => {});
  }
  const chatNumber = event.target.closest('[data-chat-number]')?.dataset.chatNumber;
  if (chatNumber) {
    state.selectedChatNumber = chatNumber;
    state.chatOpen = true;
    state.unreadChats = Math.max(0, state.unreadChats - (state.unreadByChat[chatNumber] || 0));
    state.unreadByChat[chatNumber] = 0;
    state.conversation = null;
    syncShell();
    render();
    loadConversation(chatNumber);
  }
  const insert = event.target.closest('[data-insert]')?.dataset.insert;
  if (insert) {
    const input = $('#campaign-message');
    if (input) {
      input.value += ` ${insert}`;
      updateMessageCount();
      input.focus();
    }
  }
});
document.addEventListener('input', (event) => {
  if (event.target.id === 'campaign-message') {
    state.message = event.target.value;
    updateMessageCount();
    const copy = $('.wa-message-copy');
    if (copy) copy.innerHTML = waFormat(esc(previewMessage()));
    const aviso = $('#saludo-aviso');
    if (aviso) aviso.hidden = !saludoDuplicado(state.message);
  }
  if (event.target.id === 'contact-search') {
    state.contactQuery = event.target.value;
    state.contactsLimit = 60;
    const cursor = event.target.selectionStart;
    render();
    const search = $('#contact-search');
    if (search) {
      search.focus();
      search.setSelectionRange(cursor, cursor);
    }
  }
  if (event.target.id === 'chat-search') {
    state.chatQuery = event.target.value;
    state.chatsLimit = 80;
    const cursor = event.target.selectionStart;
    render();
    const search = $('#chat-search');
    if (search) {
      search.focus();
      search.setSelectionRange(cursor, cursor);
    }
  }
  if (event.target.id === 'chat-message') state.chatDraft = event.target.value;
});
document.addEventListener('change', async (event) => {
  if (event.target.name === 'segment') {
    state.campaignSegment = event.target.value;
    state.campaignGroup = '';
    const grupo = $('#campaign-group');
    if (grupo) grupo.value = '';
    return;
  }
  if (event.target.id === 'campaign-group') {
    state.campaignGroup = event.target.value;
    if (state.campaignGroup)
      document.querySelectorAll('input[name="segment"]').forEach((radio) => {
        radio.checked = false;
      });
    return;
  }
  if (event.target.matches('.contact-select')) {
    const numero = String(event.target.dataset.contactSelect || '');
    state.selectedContacts = event.target.checked
      ? [...new Set([...state.selectedContacts, numero])]
      : state.selectedContacts.filter((item) => item !== numero);
    render();
    return;
  }
  if (event.target.id === 'conversation-status') {
    const chat =
      state.conversations.find((item) => item.numero === state.selectedChatNumber) ||
      state.crm.find((item) => item.numero === state.selectedChatNumber);
    if (!chat?.numero && !chat?.id) return;
    try {
      await api('/api/crm/estado', {
        method: 'POST',
        body: JSON.stringify({ id: chat.id, numero: chat.numero, estado: event.target.value }),
      });
      chat.estado = event.target.value;
      render();
      showToast('Clasificación guardada.');
    } catch (error) {
      showToast(error.message);
    }
    return;
  }
  if (event.target.id === 'chat-file' && event.target.files?.length) {
    const file = event.target.files[0];
    const kind = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('audio/')
        ? 'audio'
        : file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
          ? 'pdf'
          : '';
    if (!kind) return showToast('Sólo se permiten imágenes, PDF o audio.');
    if (file.size > 16 * 1024 * 1024) return showToast('El adjunto supera el máximo de 16 MB.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    state.chatAttachment = {
      name: file.name,
      type: file.type || 'application/pdf',
      size: file.size,
      kind,
      data,
    };
    render();
    scrollConversationToBottom();
    return;
  }
  if (event.target.id !== 'campaign-file' || !event.target.files?.length) return;
  try {
    for (const file of event.target.files) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
        await api('/api/pdf', {
          method: 'POST',
          body: JSON.stringify({ nombre: file.name, data }),
        });
      else
        await api('/api/imagen', {
          method: 'POST',
          body: JSON.stringify({ nombre: file.name, data }),
        });
    }
    await refresh();
    showToast('Adjuntos agregados a la campaña.');
  } catch (error) {
    showToast(error.message);
  }
});

// Cada pantalla tiene su dirección (#campana, #contactos…): sirve el botón "atrás".
const RUTAS = ['inicio', 'campana', 'contactos', 'conversaciones', 'resultados', 'configuracion'];
function routeFromHash() {
  const ruta = location.hash.slice(1);
  return RUTAS.includes(ruta) ? ruta : 'inicio';
}
window.addEventListener('popstate', () => {
  state.route = routeFromHash();
  render();
});
state.route = routeFromHash();

syncShell();
render();
refresh();
loadIdentity();
connectLive();
waitTimer = setInterval(tickWait, 1000);

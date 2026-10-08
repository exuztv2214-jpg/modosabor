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
const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join('')
    .toUpperCase();
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
  const dot = $('.channel-title .status-dot');
  if (dot) dot.className = `status-dot ${connected ? '' : 'offline'}`;
  const title = $('.channel-title');
  if (title)
    title.innerHTML = `<b class="status-dot ${connected ? '' : 'offline'}"></b> WHATSAPP <span>${statusLabel()}</span>`;
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
  if (inbox) inbox.textContent = unread;
  document.querySelectorAll('[data-unread-chats]').forEach((item) => {
    item.textContent = unread;
  });
  const health = connected ? (state.health?.puntaje ?? state.health?.score) : null;
  const healthValue = $('#sidebar-health-value');
  if (healthValue) healthValue.textContent = health == null ? '—' : `${health}%`;
  const bar = $('#sidebar-health-bar');
  if (bar) bar.style.width = `${Math.max(0, Math.min(100, health || 0))}%`;
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

function card(title, content, className = '') {
  return `<section class="card ${className}">${content}</section>`;
}
function empty(icon, title, copy) {
  return `<div class="empty-state"><span class="material-symbols-outlined">${icon}</span><strong>${title}</strong>${copy}</div>`;
}

function renderInicio() {
  const connected = state.status?.whatsapp === 'listo';
  const segments = campaignSegmentCounts();
  const total = segments.total;
  const active = segments.recurrentes;
  const nuevos = segments.nuevos;
  const cold = segments.frios;
  const health = state.health || {};
  const motor = state.motor || {};
  const pendientes = motor.corriendo
    ? Math.max(0, Number(motor.stats?.total || 0) - Number(motor.stats?.hechos || 0))
    : 0;
  return `
    <div class="connection-row">
      ${card('', `<div class="connection-top"><div class="connection-icon"><span class="material-symbols-outlined">phone_iphone</span></div><div><h2>WhatsApp Web<br>${connected ? 'Vinculado' : 'Sin vincular'}</h2><p>${esc(state.status?.whatsappDetalle || (connected ? 'Cuenta conectada y lista para operar' : 'Escaneá el QR para conectar tu cuenta'))}</p></div><span class="badge ${connected ? 'green' : 'red'}">${connected ? 'Sesión activa' : 'Esperando QR'}</span><button class="button ghost" data-action="qr"><span class="material-symbols-outlined">qr_code_2</span> Revisar conexión</button></div><div class="status-grid"><div><small>CHATS SINCRONIZADOS</small><strong>${state.conversations.length ? state.conversations.length.toLocaleString('es-AR') : '—'}</strong></div><div><small>ENVIADOS HOY</small><strong>${connected ? Number(health.enviadosHoy || 0).toLocaleString('es-AR') : '—'}</strong></div><div><small>EN COLA</small><strong class="good">${motor.corriendo ? `${pendientes} msgs` : 'Sin campaña'}</strong></div></div>`, 'connection-card')}
      ${nextStepCard(connected)}
    </div>
    <div class="metric-grid">
      ${metric('HABILITADOS', total ? total.toLocaleString('es-AR') : '—', 'contacts', total ? 'Reciben campañas' : 'Sin lista cargada', 'green')}
      ${metric('ACTIVOS', segments.loaded ? active.toLocaleString('es-AR') : '—', 'local_fire_department', 'Respondieron en 14 días')}
      ${metric('NUEVOS', segments.loaded ? nuevos.toLocaleString('es-AR') : '—', 'person_add', 'Chats de los últimos 7 días', 'red')}
      ${metric('FRÍOS', segments.loaded ? cold.toLocaleString('es-AR') : '—', 'ac_unit', '3+ promos sin respuesta')}
    </div>
    <div class="card shortcuts"><strong><span class="material-symbols-outlined">bolt</span> ATAJOS:</strong><button class="shortcut" data-action="refresh"><span class="material-symbols-outlined">sync</span>Actualizar Contactos</button><button class="shortcut primary" data-route="campana"><span class="material-symbols-outlined">campaign</span>Preparar Campaña</button><button class="shortcut" data-action="test"><span class="material-symbols-outlined">send_to_mobile</span>Enviar Prueba Personal</button><button class="shortcut" data-route="conversaciones"><span class="material-symbols-outlined">chat</span>Revisar Chats <b data-unread-chats>0</b></button></div>
    <div class="grid two" style="margin-top:18px">
      ${motor.corriendo ? liveCampaignCard() : lastCampaignCard()}
      <div>${healthCard(connected)}${activityCard()}</div>
    </div>`;
}

// Próximo paso real: lo calcula el servidor (/api/operador) con pedidos, mensaje, prueba y salud.
function nextStepCard(connected) {
  const op = state.operador;
  const accion = connected
    ? op?.proximaAccion || 'Preparar campaña por prioridad'
    : 'Conectar WhatsApp';
  const destinos = {
    'Responder pedidos probables': ['data-route="conversaciones"', 'Ver chats'],
    'Conectar WhatsApp': ['data-action="qr"', 'Abrir conexión'],
    'Bajar volumen y trabajar CRM': ['data-route="conversaciones"', 'Ver chats'],
  };
  const [boton, etiqueta] = destinos[accion] || ['data-route="campana"', 'Ir a Campaña'];
  const notas = connected ? (op?.notificaciones || []).slice(0, 3) : [];
  return card(
    '',
    `<div class="suggestion-top"><span><span class="material-symbols-outlined">auto_awesome</span> PRÓXIMO PASO</span></div><h3>${esc(accion)}</h3>${notas.length ? `<ul class="next-step-notes">${notas.map((nota) => `<li>${esc(nota)}</li>`).join('')}</ul>` : `<p>${connected ? 'Todo en orden para preparar la próxima campaña.' : 'Escaneá el código QR para habilitar contactos, chats y campañas.'}</p>`}<button class="button primary" ${boton}>${etiqueta} <span class="material-symbols-outlined">arrow_forward</span></button>`,
    'suggestion'
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
};

function lastCampaignCard() {
  const last = state.campaigns[0];
  const cfg = state.config || {};
  const programacion = cfg.PROGRAMACION_ACTIVA
    ? `Automática ${esc(cfg.PROGRAMACION_HORA || '10:30')}`
    : 'Manual';
  const resumen = last
    ? `<div class="campaign-head"><div><div class="eyebrow">ÚLTIMA CAMPAÑA · ${esc(campaignTime(last.inicio))}</div><h2 class="campaign-title">${esc(segmentLabel(last.segmento))}</h2></div><span class="badge ${last.simulacro ? 'slate' : last.estado === 'detenida' ? 'red' : 'green'}">${last.simulacro ? 'Simulacro' : esc(CAMPAIGN_STATES[last.estado] || last.estado || '—')}</span></div><div class="mini-stats"><div class="mini-stat"><small>ENVIADOS</small><strong>${Number(last.stats?.ok || 0)}</strong></div><div class="mini-stat"><small>FALLIDOS</small><strong>${Number(last.stats?.fallidos || 0)}</strong></div><div class="mini-stat"><small>DESTINATARIOS</small><strong>${Number(last.stats?.total || 0)}</strong></div></div>`
    : `<div class="campaign-head"><div><div class="eyebrow">CAMPAÑAS</div><h2 class="campaign-title">Todavía no hay campañas</h2></div></div><p class="muted-copy">Prepará la primera desde Campaña: elegís mensaje, flyer y a quién mandarlo.</p>`;
  return card(
    '',
    `${resumen}<div class="mini-stats"><div class="mini-stat"><small>PROGRAMACIÓN</small><strong>${programacion}</strong></div><div class="mini-stat"><small>MÁXIMO POR TANDA</small><strong>${Number(cfg.MAX_POR_CORRIDA || 50)}</strong></div><div class="mini-stat"><small>PAUSA ENTRE MENSAJES</small><strong>${Math.round(Number(cfg.DELAY_MIN_MS || 15000) / 1000)}–${Math.round(Number(cfg.DELAY_MAX_MS || 45000) / 1000)} s</strong></div></div><div class="campaign-actions">${last ? '<button class="button secondary" data-route="resultados"><span class="material-symbols-outlined">query_stats</span>Ver resultados</button>' : ''}<button class="button primary" data-route="campana"><span class="material-symbols-outlined">edit</span>Nueva campaña</button></div>`,
    'campaign-card'
  );
}

function healthCard(connected) {
  const h = state.health || {};
  const cfg = state.config || {};
  const maxVentana = Number(cfg.MAX_POR_HORA || 0);
  const ventana = Number(h.enviadosVentana || 0);
  const uso = maxVentana ? Math.min(100, Math.round((ventana / maxVentana) * 100)) : 0;
  const warmup = state.status?.calentamiento;
  const tono = h.estado === 'rojo' ? 'red' : h.estado === 'amarillo' ? 'slate' : 'green';
  return card(
    '',
    `<div class="health-score"><div><div class="eyebrow">SALUD DEL NÚMERO</div><h2>${connected && h.score != null ? h.score : '—'}<small>/100</small></h2></div><span class="badge ${tono}">${connected ? healthStateLabel(h) : 'Sin conexión'}</span></div><div class="health-box"><div><small>ENVIADOS HOY</small><strong>${connected ? Number(h.enviadosHoy || 0) : '—'}</strong></div><div><small>RESPUESTA HOY</small><strong>${connected && h.enviadosHoy ? `${Math.round(Number(h.tasaRespuesta || 0) * 100)}%` : '—'}</strong></div><div><small>CALENTAMIENTO</small><strong>${warmup?.calentamiento ? `Día ${Number(warmup.diasPrevios || 0) + 1}` : 'Apagado'}</strong></div></div><div style="margin-top:15px;font-size:11px;color:var(--brown)">Cupo de los últimos ${Number(h.ventanaCupoMin || cfg.VENTANA_CUPO_MINUTOS || 60)} min: <b style="float:right">${maxVentana ? `${ventana} / ${maxVentana}` : `${ventana} · sin límite`}</b></div><div class="progress"><i style="width:${uso}%"></i></div>${connected && h.recomendaciones?.[0] ? `<p class="muted-copy">${esc(h.recomendaciones[0])}</p>` : ''}`,
    'side-card'
  );
}

function activityCard() {
  const eventos = state.logs.slice(-5).reverse();
  return card(
    '',
    `<div class="activity"><div style="display:flex;justify-content:space-between;align-items:center"><h3>Actividad del motor</h3><span class="eyebrow">En vivo</span></div>${eventos.length ? eventos.map(eventRow).join('') : empty('history', 'Todavía no hay actividad', 'Los envíos, sincronizaciones y bajas aparecen acá.')}</div>`,
    'side-card'
  );
}

// Las líneas del log vienen como "[8/10/2026, 15:43:29] texto".
function parseLogLine(linea) {
  const match = String(linea || '').match(/^\[([^\]]+)\]\s*(.*)$/);
  const hora = match ? (match[1].split(',')[1] || match[1]).trim().slice(0, 5) : '';
  return { hora, texto: match ? match[2] : String(linea || '') };
}

function liveCampaignCard() {
  const m = state.motor || {};
  const s = m.stats || {};
  const total = Number(s.total || 0);
  const hechos = Number(s.hechos || 0);
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  const ultimo = state.progress;
  return card(
    '',
    `<div class="campaign-head"><div><div class="eyebrow">CAMPAÑA EN CURSO${s.tandas > 1 ? ` · TANDA ${Number(state.tanda?.actual || 1)} DE ${Number(s.tandas)}` : ''}</div><h2 class="campaign-title">${m.pausado ? 'En pausa' : s.simulacro ? 'Simulacro en curso' : 'Enviando mensajes'}</h2></div><span class="badge ${m.pausado ? 'slate' : s.simulacro ? 'slate' : 'green'}">${s.simulacro ? 'Simulacro' : m.pausado ? 'Pausada' : 'En vivo'}</span></div><div class="live-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${hechos}"><i style="width:${pct}%"></i></div><div class="mini-stats"><div class="mini-stat"><small>ENVIADOS</small><strong>${Number(s.ok || 0)}</strong></div><div class="mini-stat"><small>FALLIDOS</small><strong>${Number(s.fallidos || 0)}</strong></div><div class="mini-stat"><small>FALTAN</small><strong>${Math.max(0, total - hechos)}</strong></div></div>${ultimo ? `<p class="live-last ${ultimo.ok === false ? 'bad' : ''}">${ultimo.ok === false ? '✗' : '✓'} ${esc(ultimo.etiqueta || '')}${ultimo.error ? ` · ${esc(ultimo.error)}` : ''}</p>` : ''}<p class="live-wait" id="live-wait">${esc(waitLabel())}</p><div class="campaign-actions">${m.pausado ? '<button class="button primary" data-action="motor-reanudar"><span class="material-symbols-outlined">play_arrow</span>Reanudar</button>' : '<button class="button secondary" data-action="motor-pausar"><span class="material-symbols-outlined">pause</span>Pausar</button>'}<button class="button danger" data-action="motor-detener"><span class="material-symbols-outlined">stop</span>Detener</button></div>`,
    'campaign-card live-campaign'
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

function metric(title, value, icon, foot, tone = '') {
  return `<div class="card metric-card"><div class="metric-head"><span>${title}</span><span class="metric-icon material-symbols-outlined">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot"><span class="${tone === 'green' ? 'positive' : tone === 'red' ? 'negative' : ''}">${foot}</span></div></div>`;
}
function eventRow(linea) {
  const { hora, texto } = parseLogLine(linea);
  const tono = /❌|ERROR|⛔|🚫/.test(texto) ? 'red' : /SIMULACRO|💾|📸/.test(texto) ? 'gray' : '';
  return `<div class="activity-row ${tono}"><i></i><div><p>${esc(texto)}</p></div><time>${esc(hora)}</time></div>`;
}

function renderCampana() {
  const segments = campaignSegmentCounts();
  const total = segments.total;
  return `<div class="page-head"><div class="page-title"><div class="page-icon"><span class="material-symbols-outlined">rocket_launch</span></div><div><div class="eyebrow">CENTRO OPERATIVO / CAMPAÑA</div><h1>Constructor y Simulacro de Campaña</h1><p>Mensaje, flyer y destinatarios. Primero se prepara y revisa; nada sale sin tu confirmación.</p></div></div><span class="badge green">Línea ${state.status?.whatsapp === 'listo' ? 'activa' : 'pendiente'}</span></div><div class="step-rail"><div class="step active"><b>1</b> Mensaje</div><div class="step-line"></div><div class="step"><b>2</b> Multimedia</div><div class="step-line"></div><div class="step"><b>3</b> Audiencia</div><div class="step-line"></div><div class="step"><b>4</b> Despacho</div></div><div class="studio"><div class="studio-main">${state.motor?.corriendo ? liveCampaignCard() : ''}
    ${card('', `<div class="section-title"><span class="number">1</span><h2>Redacción de Mensaje & Variables</h2></div><div class="tabs"><button class="${state.campaignTab === 'general' ? 'active' : ''}" data-action="campaign-tab" data-tab="general">General</button><button class="${state.campaignTab === 'recurrentes' ? 'active' : ''}" data-action="campaign-tab" data-tab="recurrentes">Ya Pidieron (Recurrentes)</button><button class="${state.campaignTab === 'nuevos' ? 'active' : ''}" data-action="campaign-tab" data-tab="nuevos">Nuevos (Bienvenida)</button><button class="${state.campaignTab === 'frios' ? 'active' : ''}" data-action="campaign-tab" data-tab="frios">Recuperar Fríos</button></div><div class="eyebrow">INYECTAR VARIABLES PERSONALIZADAS</div><div class="var-pills"><button class="var-pill" data-insert="{SALUDO}">+ {SALUDO}</button><button class="var-pill" data-insert="{NOMBRE}">+ {NOMBRE}</button></div><textarea class="editor" id="campaign-message" placeholder="Escribí el mensaje de tu campaña...">${esc(state.message)}</textarea><div class="editor-note"><span>Variables simples y claras para personalizar cada conversación.</span><b id="message-count">0 caracteres</b></div><button class="button secondary" data-action="save-message"><span class="material-symbols-outlined">save</span>Guardar borrador</button>`, 'section-card')}
    ${card('', `<div class="section-title"><span class="number">2</span><h2>Contenido Multimedia & Adjuntos</h2><small>Máx. 16 MB por archivo</small></div><div class="attachment-list">${state.media.length ? state.media.map((item) => `<div class="attachment"><div class="attachment-thumb" style="background-image:url('${esc(item.dataUrl || item.url || '')}');background-size:cover"><span class="material-symbols-outlined">image</span></div><div><strong>${esc(item.nombre || 'Imagen de campaña')}</strong><small>Imagen lista para usar</small></div><span class="material-symbols-outlined" data-remove-image="${esc(item.nombre || '')}">delete</span></div>`).join('') : '<div class="attachment"><div class="attachment-thumb"><span class="material-symbols-outlined">image</span></div><div><strong>Imagen de campaña</strong><small>JPG, PNG o WEBP</small></div></div>'}${state.pdf ? `<div class="attachment"><div class="attachment-thumb" style="background:#ffd8d2;color:#b51b07"><span class="material-symbols-outlined">picture_as_pdf</span></div><div><strong>${esc(state.pdf.nombre || 'Menú o promoción')}</strong><small>PDF listo para adjuntar</small></div><span class="material-symbols-outlined" data-remove-pdf="true">delete</span></div>` : '<div class="attachment"><div class="attachment-thumb" style="background:#ffd8d2;color:#b51b07"><span class="material-symbols-outlined">picture_as_pdf</span></div><div><strong>Menú o promoción</strong><small>PDF opcional</small></div></div>'}</div><label class="upload-row"><span class="material-symbols-outlined">upload_file</span> Agregar imágenes o PDF <input id="campaign-file" type="file" hidden multiple accept="image/*,.pdf"></label>`, 'section-card')}
    ${card('', `<div class="section-title"><span class="number">3</span><h2>Selección de Segmento Objetivo</h2><button class="link-button" data-route="contactos" style="width:auto;margin-left:auto;color:var(--coral-dark)">Gestionar filtros CRM</button></div><div class="audience-grid"><label class="audience"><span><input type="radio" name="segment" value="activo" ${state.campaignSegment === 'activo' ? 'checked' : ''}> Clientes Activos</span><p>Respondieron en los últimos 14 días.</p><strong>${segments.loaded ? segments.recurrentes.toLocaleString('es-AR') : '—'} destinatarios</strong></label><label class="audience"><span><input type="radio" name="segment" value="nuevo" ${state.campaignSegment === 'nuevo' ? 'checked' : ''}> Clientes Nuevos</span><p>Chats nuevos de los últimos 7 días que todavía no recibieron promo.</p><strong>${segments.loaded ? segments.nuevos.toLocaleString('es-AR') : '—'} destinatarios</strong></label><label class="audience"><span><input type="radio" name="segment" value="frio" ${state.campaignSegment === 'frio' ? 'checked' : ''}> Contactos Fríos</span><p>Recibieron 3 o más promos y nunca respondieron.</p><strong>${segments.loaded ? segments.frios.toLocaleString('es-AR') : '—'} destinatarios</strong></label>${realOrderAudiences(segments)}<label class="audience"><span><input type="radio" name="segment" value="todos" ${state.campaignSegment === 'todos' ? 'checked' : ''}> Base Total Habilitada</span><p>Todos los contactos que no están excluidos ni pausados.</p><strong>${segments.loaded ? total.toLocaleString('es-AR') : '—'} contactos</strong></label></div>${state.groups.length ? `<div class="campaign-group-picker"><span class="material-symbols-outlined">bookmark</span><div><strong>Grupo guardado</strong><small>Usá una selección preparada desde Contactos.</small></div><select id="campaign-group" aria-label="Grupo guardado"><option value="">Elegir grupo...</option>${state.groups.map((group) => `<option value="${esc(group.id)}">${esc(group.nombre)} · ${group.numeros.length} contactos</option>`).join('')}</select></div>` : `<div class="campaign-group-hint"><span class="material-symbols-outlined">bookmark_add</span>Guardá una selección desde Contactos para reutilizarla como grupo de envío.</div>`}`, 'section-card')}
    ${dispatchCard()}
  </div><aside class="preview-dock">${renderWhatsappPreview()}</aside></div>`;
}

// Segmentos que salen de los pedidos reales del sistema (sólo si está conectado).
function realOrderAudiences(segments) {
  if (!state.status?.pedidosReales?.configurado) return '';
  const opcion = (value, titulo, detalle, total) =>
    `<label class="audience"><span><input type="radio" name="segment" value="${value}" ${state.campaignSegment === value ? 'checked' : ''}> ${titulo}</span><p>${detalle}</p><strong>${segments.loaded ? total.toLocaleString('es-AR') : '—'} destinatarios</strong></label>`;
  return (
    opcion(
      'cliente',
      'Ya compraron',
      'Tienen al menos un pedido en Modo Sabor.',
      segments.clientes
    ) +
    opcion('frecuente', 'Frecuentes', '4 o más pedidos en Modo Sabor.', segments.frecuentes) +
    opcion(
      'inactivo_30',
      'No piden hace 30 días',
      'Compraron antes pero no en el último mes.',
      segments.inactivos
    )
  );
}

function pedidosRealesBadge() {
  const info = state.status?.pedidosReales;
  if (!info?.configurado)
    return '<span class="badge slate" title="Falta configurar MODOSABOR_API_URL en el servicio Masivos">Sin conexión con pedidos</span>';
  if (info.error)
    return `<span class="badge red" title="${esc(info.error)}">Pedidos de Modo Sabor: error</span>`;
  return `<span class="badge green">${Number(info.contactosConPedidos || 0)} contactos con pedidos en Modo Sabor</span>`;
}

function lastActivity(c) {
  const m = c.metricas || {};
  if (m.ultimoPedido) return `Pidió el ${m.ultimoPedido}`;
  if (m.ultimaRespuestaFecha) return `Respondió el ${m.ultimaRespuestaFecha}`;
  return 'Sin historial';
}

// Paso 4: chequeos calculados con el estado real; nada está tildado de antemano.
function dispatchCard() {
  const cfg = state.config || {};
  const connected = state.status?.whatsapp === 'listo';
  const hoy = new Date().getDay();
  const diaNoEnvio = Array.isArray(cfg.DIAS_NO_ENVIO) && cfg.DIAS_NO_ENVIO.includes(hoy);
  const checks = [
    [
      connected,
      'WhatsApp conectado',
      connected ? 'Sesión activa.' : 'Escaneá el QR antes de enviar.',
    ],
    [
      Boolean(state.message.trim()),
      'Mensaje cargado',
      state.message.trim()
        ? `${state.message.trim().length} caracteres.`
        : 'Escribí el mensaje en el paso 1.',
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
      'Ritmo de envío',
      `${Math.round(Number(cfg.DELAY_MIN_MS || 15000) / 1000)}–${Math.round(Number(cfg.DELAY_MAX_MS || 45000) / 1000)} s entre mensajes · ${Number(cfg.MAX_POR_HORA || 0) || 'sin'} límite por hora · máximo ${Number(cfg.MAX_POR_CORRIDA || 50)} por tanda.`,
    ],
  ];
  const rows = checks
    .map(
      ([ok, titulo, detalle, opcional]) =>
        `<div class="check-row ${ok ? '' : opcional ? 'warn' : 'bad'}"><span class="material-symbols-outlined">${ok ? 'check_circle' : opcional ? 'info' : 'cancel'}</span><div><strong>${esc(titulo)}</strong><small>${esc(detalle)}</small></div></div>`
    )
    .join('');
  const ocupado = state.motor?.corriendo;
  return card(
    '',
    `<div class="section-title"><span class="number">4</span><h2>Revisión y envío</h2></div><div class="check-list">${rows}</div><div class="campaign-actions"><button class="button secondary" data-action="simulate" ${ocupado ? 'disabled' : ''}><span class="material-symbols-outlined">play_circle</span>Hacer Simulacro</button><button class="button secondary" data-action="test" ${ocupado ? 'disabled' : ''}><span class="material-symbols-outlined">send_to_mobile</span>Enviar Prueba Personal</button><button class="button primary" data-action="dispatch" ${ocupado ? 'disabled' : ''}><span class="material-symbols-outlined">schedule_send</span>Preparar y revisar envío</button></div>${ocupado ? '<small>Hay una campaña en curso: esperá a que termine o detenela.</small>' : ''}`,
    'section-card'
  );
}

// Cada pestaña del editor guarda su propia plantilla en el servidor (mensaje-<tag>.txt).
const CAMPAIGN_TAB_TAGS = { recurrentes: 'pidio', nuevos: 'nuevo', frios: 'frio' };

function campaignTemplateTag() {
  return CAMPAIGN_TAB_TAGS[state.campaignTab] || null;
}

function campaignPlanMarkup() {
  const plan = state.campaignPlan;
  if (!plan) return '';
  const mode = plan.simulacro ? 'SIMULACRO' : 'ENVÍO REAL';
  const executeAction = plan.simulacro ? 'run-simulation' : 'run-campaign';
  return `<div class="section-title"><span class="material-symbols-outlined">fact_check</span><h2>Plan listo para revisión</h2><span class="badge ${plan.simulacro ? 'slate' : 'red'}">${mode}</span></div><p>Se prepararon <strong>${Number(plan.total || plan.candidatos || 0).toLocaleString('es-AR')}</strong> destinatarios para el segmento <strong>${esc(plan.segmento || 'seleccionado')}</strong>. Todavía no se envió ningún mensaje.</p><div class="campaign-actions"><button class="button secondary" data-action="clear-plan">Cancelar plan</button><button class="button ${plan.simulacro ? 'secondary' : 'primary'}" data-action="${executeAction}">${plan.simulacro ? 'Ejecutar simulacro' : 'Ejecutar envío real'}</button></div>${plan.simulacro ? '' : '<small>El envío real tiene efecto externo y sólo comienza al pulsar este botón.</small>'}`;
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
    .map(
      (group) =>
        `<option value="${esc(group.id)}">${esc(group.nombre)} · ${group.numeros.length}</option>`
    )
    .join('');
  const deleteGroup = state.groups.length
    ? `<button class="button ghost icon-button" data-action="delete-group" title="Eliminar grupo seleccionado" aria-label="Eliminar grupo seleccionado"><span class="material-symbols-outlined">delete</span></button>`
    : '';
  const restore =
    state.contactsFilter === 'excluidos'
      ? `<button class="button secondary" data-action="reactivar-selected">Reactivar seleccionados</button>`
      : `<button class="button danger" data-action="exclude-selected">Ocultar y excluir</button>`;
  return `<div class="contact-operations"><div class="selection-summary"><span class="material-symbols-outlined">checklist</span><strong>${selected} seleccionados</strong><button class="button ghost" data-action="select-visible">Seleccionar visibles</button><button class="button ghost" data-action="clear-selection">Limpiar</button></div><div class="group-tools"><select id="contact-group-select" aria-label="Grupo de envío"><option value="">Grupos de envío</option>${options}</select>${deleteGroup}<button class="button secondary" data-action="apply-group" ${state.groups.length ? '' : 'disabled'}>Usar grupo</button><button class="button secondary" data-action="save-group" ${selected ? '' : 'disabled'}><span class="material-symbols-outlined">bookmark_add</span>Guardar grupo</button></div>${selected ? `<div class="bulk-actions"><button class="button secondary" data-action="pause-selected">Pausar 7 días</button>${restore}</div>` : ''}</div>`;
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
    item
      .toLocaleLowerCase('es-AR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
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
    `<div class="modal-backdrop" data-action="close-modal"><div class="modal contact-modal"><div class="modal-head"><h2>Agregar contacto</h2><button class="close" data-action="close-modal">×</button></div><p class="modal-copy">Guardalo en el CRM local sin tocar WhatsApp ni enviar mensajes.</p><label class="stack-field"><span>Nombre</span><input id="contact-modal-name" type="text" maxlength="120" placeholder="Ej. Juan Pérez"></label><label class="stack-field"><span>Teléfono</span><input id="contact-modal-phone" type="tel" maxlength="40" placeholder="+54 9 381 ..." autofocus></label><div class="modal-actions"><button class="button ghost" data-action="close-modal">Cancelar</button><button class="button primary" data-action="save-contact"><span class="material-symbols-outlined">person_add</span>Guardar contacto</button></div></div></div>`;
  $('#contact-modal-phone')?.focus();
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
function renderContactos() {
  const filter = state.contactsFilter;
  const filteredContacts = state.contacts.filter((c) => contactMatchesFilter(c, filter));
  const query = state.contactQuery.trim().toLocaleLowerCase('es-AR');
  const visible = filteredContacts.filter(
    (c) =>
      !query ||
      [c.nombre, c.telefono, c.numero, c.segmento, ...(c.tags || []), ...(c.segmentosAuto || [])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('es-AR')
        .includes(query)
  );
  const selected = state.selectedDetail?.cliente || state.selectedContact || visible[0];
  const counts = {
    todos: state.contacts.filter((c) => contactMatchesFilter(c, 'todos')).length,
    activos: state.contacts.filter((c) => contactMatchesFilter(c, 'activos')).length,
    nuevos: state.contacts.filter((c) => contactMatchesFilter(c, 'nuevos')).length,
    frios: state.contacts.filter((c) => contactMatchesFilter(c, 'frios')).length,
    excluidos: state.contacts.filter((c) => contactMatchesFilter(c, 'excluidos')).length,
  };
  const content = visible.length
    ? state.contactsView === 'cards'
      ? `<div class="contact-card-grid">${visible.map((c) => contactCard(c, selected)).join('')}</div>`
      : `<div class="table-head"><span>CLIENTE / TELÉFONO</span><span>SEGMENTO / ETIQUETAS</span><span>ÚLTIMA ACTIVIDAD</span><span>ESTADO</span></div><div class="contact-table-scroll">${visible.map((c) => contactRow(c, selected)).join('')}</div>`
    : empty(
        'group_off',
        query
          ? 'No encontramos contactos'
          : filter !== 'todos'
            ? 'No hay contactos en este filtro'
            : 'Todavía no hay contactos cargados',
        query
          ? 'Probá con otro nombre, teléfono o etiqueta.'
          : filter !== 'todos'
            ? 'Elegí otro segmento para seguir explorando la base.'
            : 'Conectá WhatsApp y usá “Actualizar Contactos” para traer la agenda disponible.'
      );
  return `<div class="page-head"><div class="page-title"><div class="page-icon"><span class="material-symbols-outlined">groups</span></div><div><div class="eyebrow">CENTRO OPERATIVO / CONTACTOS</div><h1>Contactos y clientes</h1><p>Tus contactos de WhatsApp con su historial de envíos, respuestas y pedidos.</p></div></div><div class="page-actions">${pedidosRealesBadge()}<button class="button secondary" data-action="photos"><span class="material-symbols-outlined">account_circle</span>Actualizar fotos</button><button class="button secondary" data-action="import"><span class="material-symbols-outlined">upload_file</span>Importar Excel / VCF</button><button class="button primary" data-action="add-contact"><span class="material-symbols-outlined">person_add</span>Agregar Contacto</button></div></div><div class="card toolbar"><span class="material-symbols-outlined">search</span><input class="search" id="contact-search" placeholder="Buscar por nombre, teléfono o etiqueta..." value="${esc(state.contactQuery)}"><span class="result-count">${visible.length} de ${filteredContacts.length} contactos</span><div class="view-toggle" aria-label="Vista de contactos"><button class="view-button ${state.contactsView === 'list' ? 'active' : ''}" data-action="contacts-view" data-view="list" aria-pressed="${state.contactsView === 'list'}"><span class="material-symbols-outlined">view_list</span>Lista</button><button class="view-button ${state.contactsView === 'cards' ? 'active' : ''}" data-action="contacts-view" data-view="cards" aria-pressed="${state.contactsView === 'cards'}"><span class="material-symbols-outlined">grid_view</span>Tarjetas</button></div><button class="button ghost" data-action="refresh"><span class="material-symbols-outlined">sync</span>Actualizar</button></div><div class="filter-chips"><button class="filter-chip ${filter === 'todos' ? 'active' : ''}" data-action="contacts-filter" data-filter="todos">Todos ${counts.todos}</button><button class="filter-chip ${filter === 'activos' ? 'active' : ''}" data-action="contacts-filter" data-filter="activos"><b class="status-dot"></b> Habilitados ${counts.activos}</button><button class="filter-chip ${filter === 'nuevos' ? 'active' : ''}" data-action="contacts-filter" data-filter="nuevos"><b class="status-dot warn"></b> Nuevos ${counts.nuevos}</button><button class="filter-chip ${filter === 'frios' ? 'active' : ''}" data-action="contacts-filter" data-filter="frios">Fríos ${counts.frios}</button><button class="filter-chip ${filter === 'excluidos' ? 'active' : ''}" data-action="contacts-filter" data-filter="excluidos">Excluidos / Pausados ${counts.excluidos}</button></div>${contactOperations()}<div class="crm-layout"><section class="card table-card">${content}</section>${detailCard(selected)}</div>`;
}
function contactRow(c, selected) {
  const numero = String(c.numero || '');
  return `<div class="contact-row ${selected?.numero === c.numero ? 'selected' : ''}" data-contact="${esc(numero)}"><div class="person"><input class="contact-select" type="checkbox" data-contact-select="${esc(numero)}" aria-label="Seleccionar ${esc(c.nombre || numero)}" ${state.selectedContacts.includes(numero) ? 'checked' : ''}><span class="select-avatar">${avatarMarkup(c)}</span><div><strong>${esc(c.nombre || 'Sin nombre')}</strong><small>${esc(c.telefono || c.numero || 'Sin teléfono')}</small></div></div><div class="tags"><span class="tag">${esc(c.segmentosAuto?.[0] || c.segmento || 'Contacto')}</span>${c.tags?.[0] ? `<span class="tag green">${esc(c.tags[0])}</span>` : ''}</div><div class="contact-meta">${esc(lastActivity(c))}<small>${c.metricas?.pedidosReales ? `${c.metricas.pedidosReales} pedidos` : c.metricas?.respondioTotal ? `${c.metricas.respondioTotal} respuestas` : 'Sin respuestas'}</small></div><span class="badge ${c.excluido || c.pausado ? 'red' : 'green'}">${c.excluido ? 'Excluido' : c.pausado ? 'Pausado' : 'Habilitado'}</span></div>`;
}
function contactCard(c, selected) {
  const metrics = c.metricas || {};
  const numero = String(c.numero || '');
  const tags = [...(c.segmentosAuto || []), ...(c.tags || [])].filter(Boolean).slice(0, 3);
  return `<article class="contact-card ${selected?.numero === c.numero ? 'selected' : ''}" data-contact="${esc(numero)}"><div class="contact-card-top"><label class="card-select"><input class="contact-select" type="checkbox" data-contact-select="${esc(numero)}" aria-label="Seleccionar ${esc(c.nombre || numero)}" ${state.selectedContacts.includes(numero) ? 'checked' : ''}><span>Seleccionar</span></label>${avatarMarkup(c, 'avatar contact-card-avatar')}<span class="badge ${c.excluido || c.pausado ? 'red' : 'green'}">${c.excluido ? 'Excluido' : c.pausado ? 'Pausado' : 'Habilitado'}</span></div><h3>${esc(c.nombre || 'Sin nombre')}</h3><p class="contact-handle">${esc(c.telefono || c.numero || 'Sin teléfono')}</p><div class="tags">${(tags.length ? tags : ['Contacto']).map((tag, i) => `<span class="tag ${i === 1 ? 'green' : ''}">${esc(tag)}</span>`).join('')}</div><div class="contact-card-meta"><span><small>Última actividad</small><strong>${esc(lastActivity(c))}</strong></span><span><small>Respuestas</small><strong>${metrics.respondioTotal ?? '—'}</strong></span></div><div class="contact-card-actions"><button class="button ghost" data-action="open-wa" data-number="${esc(numero)}"><span class="material-symbols-outlined">chat</span>WhatsApp</button><span class="material-symbols-outlined">arrow_forward</span></div></article>`;
}
function detailActivity(detail) {
  const responses = Array.isArray(detail.respuestas)
    ? detail.respuestas.map((item) => ({
        date: `${item.fecha || ''} ${item.hora || ''}`.trim(),
        label: item.posiblePedido ? 'Pedido detectado' : 'Respuesta recibida',
        text: item.texto || 'Respuesta sin texto',
        tone: item.posiblePedido ? 'green' : '',
      }))
    : [];
  const sends = Array.isArray(detail.enviados)
    ? detail.enviados.map((date) => ({
        date,
        label: 'Envío registrado',
        text: 'Campaña enviada a este contacto',
        tone: 'red',
      }))
    : [];
  const activity = [...responses, ...sends]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  if (!activity.length)
    return `<div class="detail-empty">Todavía no hay mensajes ni envíos registrados.</div>`;
  return `<div class="detail-timeline">${activity.map((item) => `<div class="detail-event ${item.tone}"><span class="detail-event-dot"></span><div><strong>${esc(item.label)}</strong><small>${esc(item.date || 'Sin fecha')}</small><p>${esc(item.text)}</p></div></div>`).join('')}</div>`;
}
function detailCard(c) {
  if (!c)
    return `<aside class="card detail-card">${empty('person_search', 'Elegí un contacto', 'El detalle aparecerá al seleccionar un registro.')}</aside>`;
  const detail = state.selectedDetail || {};
  const metrics = detail.metricas || c.metricas || {};
  const tags = [...(detail.tags || c.tags || []), ...(c.segmentosAuto || [])]
    .filter(Boolean)
    .slice(0, 4);
  return `<aside class="card detail-card"><div class="detail-head">${avatarMarkup(c)}<div><h2>${esc(c.nombre || 'Sin nombre')}</h2><p>${esc(c.telefono || c.numero || 'Sin teléfono')}</p></div><span class="badge ${c.excluido || c.pausado ? 'red' : 'green'}" style="margin-left:auto">${c.excluido ? 'Excluido' : c.pausado ? 'Pausado' : 'Cliente'}</span></div><div class="detail-actions"><button class="button primary" data-action="open-wa" data-number="${esc(c.numero)}"><span class="material-symbols-outlined">chat</span>Abrir WhatsApp</button><button class="button ghost" data-action="note"><span class="material-symbols-outlined">edit_note</span></button></div><div class="detail-kpis"><div><small>Pedidos</small><strong>${c.metricas?.pedidosReales ?? '—'}</strong></div><div><small>Respuestas</small><strong>${metrics.respuestasTotal ?? metrics.respondioTotal ?? '—'}</strong></div><div><small>Envíos</small><strong>${metrics.enviadosTotal ?? '—'}</strong></div></div><div class="detail-block"><h4>SEGMENTOS Y ETIQUETAS</h4><div class="tags">${(tags.length ? tags : ['Sin segmento']).map((tag) => `<span class="tag">${esc(tag)}</span>`).join('')}</div><p class="detail-last-contact">Último mensaje: ${esc(c.ultimoMensaje || 'Sin fecha registrada')}</p></div><div class="detail-block"><h4>HISTORIAL REAL</h4>${detailActivity(detail)}</div><div class="detail-block"><h4>NOTAS</h4><div class="note-box">${esc(detail.nota?.texto || 'Sin notas. Usá el lápiz para agregar una.')}</div></div></aside>`;
}

function messageTime(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(Number(timestamp) * 1000);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}
function chatContactLabel(contact) {
  if (contact?.grupo) return 'Grupo de WhatsApp';
  return (
    contact?.telefono ||
    (String(contact?.numero || '').endsWith('@lid')
      ? 'Identificador privado de WhatsApp'
      : contact?.numero || 'Contacto sin identificador')
  );
}
function messageLabel(message) {
  const labels = {
    image: 'Imagen adjunta',
    video: 'Video adjunto',
    audio: 'Audio adjunto',
    document: 'Documento adjunto',
    sticker: 'Sticker adjunto',
  };
  return (
    labels[message.type] ||
    message.body ||
    (message.hasMedia ? 'Archivo multimedia' : 'Mensaje sin texto')
  );
}
function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
function chatAttachmentVisual(file) {
  if (file.kind === 'image')
    return `<img src="${esc(file.data)}" alt="Vista previa de ${esc(file.name)}">`;
  if (file.kind === 'audio')
    return `<span class="material-symbols-outlined">graphic_eq</span><audio controls src="${esc(file.data)}"></audio>`;
  return `<span class="material-symbols-outlined">picture_as_pdf</span>`;
}
function pendingChatBubble() {
  const file = state.chatAttachment;
  if (!file) return '';
  return `<div class="wa-bubble outbound pending-media"><div class="pending-media-visual kind-${file.kind}">${chatAttachmentVisual(file)}</div><strong>${esc(file.name)}</strong><small>${esc(file.kind === 'pdf' ? 'PDF' : file.kind === 'audio' ? 'Audio' : 'Imagen')} · ${formatBytes(file.size)}</small>${state.chatDraft.trim() ? `<p>${esc(state.chatDraft.trim())}</p>` : ''}<time>Vista previa · no enviado</time></div>`;
}
function conversationMessages(chat) {
  const messages = state.conversation?.mensajes || [];
  if (state.conversation?.disponible && messages.length)
    return `<div class="conversation-messages">${messages.map((message) => `<div class="wa-bubble ${message.fromMe ? 'outbound' : 'inbound'}">${esc(messageLabel(message))}<time>${messageTime(message.timestamp)}${message.fromMe ? ' ✓✓' : ''}</time></div>`).join('')}</div>`;
  if (state.conversation && !messages.length)
    return empty(
      'chat_bubble_outline',
      'No hay mensajes visibles',
      esc(state.conversation.motivo || 'WhatsApp no devolvió mensajes recientes para este chat.')
    );
  return `<div class="conversation-messages"><div class="wa-bubble inbound">${esc(chat.texto || chat.mensaje || 'Seleccioná un contacto para cargar su conversación.')}<time>${esc(chat.hora || '—')}</time></div></div>`;
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
  const chat = allChats.find((item) => item.numero === state.selectedChatNumber) ||
    chats[0] || {
      nombre: 'Sin conversación seleccionada',
      numero: '',
      texto: 'Los mensajes nuevos aparecerán cuando WhatsApp esté conectado.',
      estado: 'consulta',
    };
  const estados = [
    ['nuevo', 'Nuevo'],
    ['pedido_probable', 'Pedido / Reserva'],
    ['consulta', 'Consulta'],
    ['respondido', 'Respondido'],
    ['problema', 'Problema'],
    ['baja', 'Baja'],
    ['cerrado', 'Cerrado'],
  ];
  const estadoActual = estados.some(([value]) => value === chat.estado) ? chat.estado : 'nuevo';
  const estadoSelect = `<select id="conversation-status" aria-label="Clasificar conversación">${estados.map(([value, label]) => `<option value="${value}" ${value === estadoActual ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
  const counts = {
    todos: allChats.length,
    pedidos: allChats.filter((item) => chatMatchesFilter(item, 'pedidos')).length,
    consultas: allChats.filter((item) => chatMatchesFilter(item, 'consultas')).length,
    problemas: allChats.filter((item) => chatMatchesFilter(item, 'problemas')).length,
    nuevos: allChats.filter((item) => chatMatchesFilter(item, 'nuevos')).length,
  };
  return `<div class="page-head"><div class="page-title"><div class="page-icon"><span class="material-symbols-outlined">forum</span></div><div><div class="eyebrow">CENTRO OPERATIVO / WHATSAPP</div><h1>Chats y conversaciones</h1><p>Todos tus chats disponibles, con fotos y respuesta directa desde el panel.</p></div></div><div class="page-actions"><span class="badge ${state.status?.whatsapp === 'listo' ? 'green' : 'red'}">${state.status?.whatsapp === 'listo' ? 'WhatsApp conectado' : 'Esperando conexión'}</span><button class="button secondary" data-action="refresh"><span class="material-symbols-outlined">sync</span>Actualizar chats</button></div></div><div class="inbox-grid"><aside class="card inbox-rail"><div class="inbox-stat"><div><small>CHATS VISIBLES</small><strong>${chats.length}</strong></div><div><small>SINCRONIZADOS</small><strong class="good">✓</strong></div></div><div class="folder-list"><div class="folder active"><span class="material-symbols-outlined">chat</span>Todos los chats <em>${allChats.length}</em></div><div class="folder"><span class="material-symbols-outlined">fiber_new</span>Nuevos sin clasificar <em>${counts.nuevos}</em></div><div class="folder"><span class="material-symbols-outlined">local_fire_department</span>Pedidos y reservas <em>${counts.pedidos}</em></div><div class="folder"><span class="material-symbols-outlined">help</span>Consultas <em>${counts.consultas}</em></div><div class="folder"><span class="material-symbols-outlined">warning</span>Problemas <em>${counts.problemas}</em></div></div></aside><section class="card message-list"><div class="list-head"><h2>WhatsApp</h2><span class="badge slate">${chats.length} chats</span></div><div class="chat-tools"><label class="chat-search-wrap"><span class="material-symbols-outlined">search</span><input id="chat-search" placeholder="Buscar chats..." value="${esc(state.chatQuery)}" aria-label="Buscar chats"></label><div class="chat-filters"><button class="chat-filter ${state.chatFilter === 'todos' ? 'active' : ''}" data-action="chat-filter" data-filter="todos">Todos</button><button class="chat-filter ${state.chatFilter === 'nuevos' ? 'active' : ''}" data-action="chat-filter" data-filter="nuevos">Nuevos</button><button class="chat-filter ${state.chatFilter === 'pedidos' ? 'active' : ''}" data-action="chat-filter" data-filter="pedidos">Pedidos</button><button class="chat-filter ${state.chatFilter === 'consultas' ? 'active' : ''}" data-action="chat-filter" data-filter="consultas">Consultas</button><button class="chat-filter ${state.chatFilter === 'problemas' ? 'active' : ''}" data-action="chat-filter" data-filter="problemas">Problemas</button></div></div>${chats.length ? chats.map((item) => chatRow(item)).join('') : empty('search_off', 'No encontramos chats', 'Probá con otro nombre o filtro.')}</section><section class="card conversation"><div class="conversation-head">${avatarMarkup(chat)}<div><h2>${esc(chat.nombre)}</h2><p>${esc(chatContactLabel(chat))} · ${esc(chat.estado || 'Consulta general')}</p></div><span class="badge slate" style="margin-left:auto">${state.conversation?.disponible ? 'Chat real' : 'Seleccionar chat'}</span></div><div class="conversation-toolbar"><label>Clasificación ${estadoSelect}</label></div><div class="conversation-body"><span class="date-chip">${state.conversation?.disponible ? 'Historial de WhatsApp' : 'Elegí un chat'}</span>${conversationMessages(chat)}${pendingChatBubble()}</div><div class="composer"><label class="chat-attach-button" title="Adjuntar imagen, PDF o audio"><span class="material-symbols-outlined">attach_file</span><input id="chat-file" type="file" hidden accept="image/*,application/pdf,audio/*"></label><input id="chat-message" value="${esc(state.chatDraft)}" placeholder="Escribí un mensaje de WhatsApp..." aria-label="Mensaje"><button class="button secondary" data-action="remove-chat-attachment" ${state.chatAttachment ? '' : 'disabled'}><span class="material-symbols-outlined">close</span></button><button class="button primary" data-action="send-chat"><span class="material-symbols-outlined">send</span>Enviar</button></div></section></div>`;
}
function chatRow(item) {
  const unread = state.unreadByChat[item.numero] || 0;
  return `<div class="inbox-item ${item.numero === state.selectedChatNumber ? 'selected' : ''}" data-chat-number="${esc(item.numero || '')}">${avatarMarkup(item)}<div class="chat-row-copy"><div class="chat-row-top"><strong>${esc(item.nombre || 'Sin nombre')}</strong><time>${esc(item.hora || 'Hoy')}</time>${unread ? `<b class="chat-unread">${unread > 9 ? '9+' : unread}</b>` : ''}</div><small>${esc(chatContactLabel(item))}</small><p>${esc(item.texto || item.mensaje || 'Sin mensajes registrados')}</p></div></div>`;
}

function campaignsTable() {
  if (!state.campaigns.length)
    return empty(
      'campaign',
      'Sin campañas todavía',
      'Cada campaña o simulacro queda registrado acá.'
    );
  const filas = state.campaigns
    .map((c) => {
      const s = c.stats || {};
      return `<button class="campaign-row" data-action="campaign-detail" data-id="${esc(c.id)}"><span><strong>${esc(campaignTime(c.inicio))}</strong><small>${esc(segmentLabel(c.segmento))}</small></span><span class="badge ${c.simulacro ? 'slate' : c.estado === 'detenida' ? 'red' : 'green'}">${c.simulacro ? 'Simulacro' : esc(CAMPAIGN_STATES[c.estado] || c.estado || '—')}</span><span class="campaign-row-stats">${Number(s.ok || 0)} ok · ${Number(s.fallidos || 0)} fallidos · ${Number(s.total || 0)} total</span></button>`;
    })
    .join('');
  return `<div class="campaign-rows">${filas}</div>`;
}

const DESTINATARIO_ESTADOS = {
  enviado: 'Enviado',
  fallido: 'Falló',
  detenido: 'Detenido',
  simulado: 'Simulado',
  pendiente: 'No se envió',
};

function campaignDetailCard() {
  const c = state.campaignDetail;
  if (!c) return '';
  const destinatarios = Array.isArray(c.destinatarios) ? c.destinatarios : [];
  const fallidos = destinatarios.filter((d) => d.estado === 'fallido' || d.estado === 'detenido');
  const filas = destinatarios
    .map(
      (d) =>
        `<div class="recipient-row ${d.estado === 'enviado' || d.estado === 'simulado' ? '' : 'bad'}"><span><strong>${esc(d.nombre || 'Sin nombre')}</strong><small>${esc(d.numero)}</small></span><span>${esc(DESTINATARIO_ESTADOS[d.estado] || d.estado)}</span><small>${esc(d.error || '')}</small></div>`
    )
    .join('');
  const reintento =
    !c.simulacro && fallidos.length && c.estado !== 'corriendo'
      ? `<button class="button primary" data-action="retry-failed" data-id="${esc(c.id)}"><span class="material-symbols-outlined">replay</span>Reintentar ${fallidos.length} fallidos</button>`
      : '';
  return card(
    '',
    `<div class="section-title"><h2>Campaña del ${esc(campaignTime(c.inicio))}</h2><button class="button ghost" data-action="close-campaign-detail">Cerrar</button></div><p class="muted-copy">${esc(segmentLabel(c.segmento))} · ${c.simulacro ? 'Simulacro' : esc(CAMPAIGN_STATES[c.estado] || c.estado)} · pausa ${Math.round(Number(c.config?.delayMinMs || 0) / 1000)}–${Math.round(Number(c.config?.delayMaxMs || 0) / 1000)} s</p><div class="recipient-list">${filas || empty('group_off', 'Sin destinatarios', 'La campaña no tenía a nadie pendiente.')}</div><div class="campaign-actions">${reintento}</div>`,
    'section-card campaign-detail'
  );
}

function renderResultados() {
  const stats = state.analytics || {};
  const totals = stats.totales || {};
  const dias = Array.isArray(stats.dias) ? stats.dias.slice(0, 7) : [];
  const enviados = Number(totals.enviados || 0);
  const leidos = Number(totals.leidos || 0);
  const respondieron = Number(totals.respondieron || 0);
  const tasaLectura = enviados ? `${Math.round((leidos / enviados) * 100)}%` : '—';
  const maxDia = Math.max(1, ...dias.map((dia) => Number(dia.enviados || 0)));
  const barras = dias.length
    ? dias
        .slice()
        .reverse()
        .map(
          (dia) =>
            `<i title="${esc(dia.fecha)}: ${Number(dia.enviados || 0)} enviados" style="height:${Math.max(6, Math.round((Number(dia.enviados || 0) / maxDia) * 100))}%"></i>`
        )
        .join('')
    : '<span class="result-empty">Sin despachos registrados</span>';
  const logs = state.logs.slice(-60).reverse();
  return `<div class="page-head"><div class="page-title"><div class="page-icon"><span class="material-symbols-outlined">query_stats</span></div><div><div class="eyebrow">CENTRO OPERATIVO / RESULTADOS</div><h1>Resultados de campañas</h1><p>Lo que registró el motor de envío: campañas, entregas, lecturas y respuestas.</p></div></div><button class="button secondary" data-action="refresh"><span class="material-symbols-outlined">sync</span>Actualizar</button></div><div class="metric-grid">${metric('CAMPAÑAS', state.campaigns.length.toLocaleString('es-AR'), 'campaign', `${state.campaigns.filter((campana) => campana.estado === 'finalizada' && !campana.simulacro).length} enviadas de verdad`)}${metric('MENSAJES ENVIADOS', enviados.toLocaleString('es-AR'), 'send', 'Histórico registrado')}${metric('LECTURAS', leidos.toLocaleString('es-AR'), 'done_all', `Tasa de lectura: ${tasaLectura}`)}${metric('RESPUESTAS', respondieron.toLocaleString('es-AR'), 'reply', 'Personas que escribieron')}</div>${campaignDetailCard()}<div class="grid two" style="margin-top:18px">${card('', `<div class="section-title"><h2>Campañas</h2><span class="badge slate">Últimas ${state.campaigns.length}</span></div>${campaignsTable()}`, 'section-card')}${card('', `<div class="section-title"><h2>Enviados por día</h2></div><div class="result-chart"><div class="bars">${barras}</div></div><div class="section-title" style="margin-top:18px"><h2>Log del motor</h2></div><div class="log-list">${logs.length ? logs.map((linea) => `<div>${esc(linea)}</div>`).join('') : '<span class="result-empty">Sin registros</span>'}</div>`, 'section-card')}</div>`;
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

function renderConfiguracionCompleta() {
  const c = state.config || {};
  const seconds = (ms, fallback) => Math.max(0, Math.round(Number(ms || fallback) / 1000));
  const active = (key, fallback = false) => (c[key] == null ? fallback : Boolean(c[key]));
  const switchMarkup = (setting, label, on) =>
    `<button class="switch ${on ? 'on' : ''}" data-setting="${setting}" aria-label="${label}" aria-pressed="${on ? 'true' : 'false'}"><i></i></button>`;
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const selectedDays = Array.isArray(c.DIAS_NO_ENVIO) ? c.DIAS_NO_ENVIO : [];
  const dayMarkup = days
    .map(
      (label, index) =>
        `<label class="day-chip"><input class="config-day" type="checkbox" value="${index}" ${selectedDays.includes(index) ? 'checked' : ''}>${label}</label>`
    )
    .join('');
  const lines = (items) => esc((Array.isArray(items) ? items : []).join('\n'));
  return `<div class="page-head"><div class="page-title"><div class="page-icon"><span class="material-symbols-outlined">settings</span></div><div><div class="eyebrow">CENTRO OPERATIVO / CONFIGURACIÓN</div><h1>Configuración completa</h1><p>Todo lo que el motor puede modificar, agrupado por tarea y guardado en este proyecto.</p></div></div><button class="button primary" data-action="save-settings"><span class="material-symbols-outlined">save</span>Guardar cambios</button></div><div class="settings-grid full-settings"><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">storefront</span></span><h2>Identidad del delivery</h2></div><div class="setting-row"><div><strong>Nombre que verá el cliente</strong><small>Aparece en la vista previa de WhatsApp.</small></div><input id="config-business-name" type="text" value="${esc(c.NEGOCIO_NOMBRE || businessLabel())}" maxlength="80"></div><div class="setting-row"><div><strong>Descripción de la cuenta</strong><small>Texto corto debajo del nombre.</small></div><input id="config-business-status" type="text" value="${esc(c.NEGOCIO_ESTADO || 'Cuenta oficial del delivery')}" maxlength="80"></div><div class="setting-row"><div><strong>Logo vinculado</strong><small>Ruta actual usada por la previsualización.</small></div><input id="config-logo-path" type="text" value="${esc(c.NEGOCIO_LOGO || '/assets/logo.png')}" maxlength="300"></div><div class="brand-preview"><img class="whatsapp-brand-logo" src="${esc(c.NEGOCIO_LOGO || '/assets/logo.png')}" alt="Logo del delivery"><span>Logo activo en la previsualización</span></div></section><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">speed</span></span><h2>Ritmo y límites</h2></div><div class="setting-row"><div><strong>Pausa mínima / máxima</strong><small>Segundos entre mensajes.</small></div><span class="inline-inputs"><input id="config-delay-min" type="number" value="${seconds(c.DELAY_MIN_MS, 15000)}" min="0" max="300"><input id="config-delay-max" type="number" value="${seconds(c.DELAY_MAX_MS, 45000)}" min="0" max="300"></span></div><div class="setting-row"><div><strong>Máximo por tanda</strong><small>Mensajes en una corrida.</small></div><input id="config-max-run" type="number" value="${Number(c.MAX_POR_CORRIDA || 50)}" min="1" max="100"></div><div class="setting-row"><div><strong>Máximo por ventana</strong><small>Mensajes cada ${Number(c.VENTANA_CUPO_MINUTOS || 60)} minutos.</small></div><span class="inline-inputs"><input id="config-max-hour" type="number" value="${Number(c.MAX_POR_HORA || 0)}" min="0" max="1000"><input id="config-window-minutes" type="number" value="${Number(c.VENTANA_CUPO_MINUTOS || 60)}" min="1" max="240"></span></div><div class="setting-row"><div><strong>Reintentos</strong><small>Si falla un envío individual.</small></div><input id="config-retries" type="number" value="${Number(c.REINTENTOS || 0)}" min="0" max="3"></div><div class="setting-row"><div><strong>Pausa larga</strong><small>Cada tantos mensajes, durante tantos segundos.</small></div><span class="inline-inputs"><input id="config-pause-long" type="number" value="${Number(c.PAUSA_LARGA_CADA || 0)}" min="0" max="500"><input id="config-pause-long-seconds" type="number" value="${Number(c.PAUSA_LARGA_SEGUNDOS || 120)}" min="30" max="3600"></span></div></section><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">shield</span></span><h2>Protecciones</h2></div><div class="setting-row"><div><strong>No repetir el mismo día</strong><small>Evita duplicados.</small></div>${switchMarkup('no-repetir', 'No repetir el mismo día', active('NO_REPETIR_MISMO_DIA', true))}</div><div class="setting-row"><div><strong>Adjuntar PDF</strong><small>Incluye el menú si existe.</small></div>${switchMarkup('attach-pdf', 'Adjuntar PDF', active('ADJUNTAR_PDF', true))}</div><div class="setting-row"><div><strong>Baja automática</strong><small>Excluye a quien responde BAJA.</small></div>${switchMarkup('auto-optout', 'Baja automática', active('BAJA_AUTOMATICA', true))}</div><label class="stack-field"><span>Respuesta de baja</span><textarea id="config-baja-response" rows="2">${esc(c.BAJA_RESPUESTA || '')}</textarea></label><label class="stack-field"><span>Footer de baja</span><textarea id="config-optout-footer" rows="2">${esc(c.FOOTER_BAJA || '')}</textarea></label></section><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">model_training</span></span><h2>Calentamiento y tandas</h2></div><div class="setting-row"><div><strong>Calentamiento progresivo</strong><small>Sube el límite gradualmente según días con envíos reales.</small></div>${switchMarkup('warmup', 'Calentamiento progresivo', active('CALENTAMIENTO_ACTIVO'))}</div><div class="setting-row"><div><strong>Inicio / incremento</strong><small>Mensajes del primer día y aumento diario.</small></div><span class="inline-inputs"><input id="config-warmup-start" type="number" value="${Number(c.CALENTAMIENTO_INICIO || 20)}" min="1" max="100"><input id="config-warmup-increment" type="number" value="${Number(c.CALENTAMIENTO_INCREMENTO || 10)}" min="1" max="100"></span></div><div class="setting-row"><div><strong>Modo tandas automáticas</strong><small>Sigue sola con pausas entre tandas hasta cubrir la lista.</small></div>${switchMarkup('batch-mode', 'Modo tandas automáticas', active('MODO_TANDAS'))}</div><div class="setting-row"><div><strong>Espera entre tandas</strong><small>Minutos.</small></div><input id="config-batch-wait" type="number" value="${Number(c.ESPERA_ENTRE_TANDAS_MINUTOS || 20)}" min="5" max="240"></div><div class="warning-note"><span class="material-symbols-outlined">warning</span>Estas protecciones reducen ráfagas, pero no garantizan evitar bloqueos. La API oficial sigue siendo el camino de producción.</div></section><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">schedule</span></span><h2>Programación y días</h2></div><div class="setting-row"><div><strong>Programación automática</strong><small>Sale sola todos los días a esa hora. No hace falta tener el panel abierto.</small></div>${switchMarkup('programacion', 'Programación automática', active('PROGRAMACION_ACTIVA'))}</div><div class="setting-row"><div><strong>Hora programada</strong><small>Formato de 24 horas.</small></div><input id="config-schedule-time" type="time" value="${esc(c.PROGRAMACION_HORA || '10:30')}"></div><div class="setting-row"><div><strong>A quién manda</strong><small>Segmento o grupo de la corrida programada.</small></div>${scheduleSegmentSelect(c.PROGRAMACION_SEGMENTO)}</div><div class="setting-row"><div><strong>Modo sólo respuestas</strong><small>Bloquea promociones.</small></div>${switchMarkup('solo-respuestas', 'Modo sólo respuestas', active('MODO_SOLO_RESPUESTAS'))}</div><div class="day-selector"><strong>Días sin envío</strong><div id="config-days-no-send">${dayMarkup}</div></div></section><section class="card section-card"><div class="section-title"><span class="number"><span class="material-symbols-outlined">forum</span></span><h2>Mensajes y objetivos</h2></div><label class="stack-field"><span>Saludos rotativos</span><textarea id="config-greetings" rows="4">${lines(c.SALUDOS)}</textarea></label><label class="stack-field"><span>Cierres rotativos</span><textarea id="config-closures" rows="4">${lines(c.CIERRES)}</textarea></label><div class="setting-row"><div><strong>Meta de pedidos diarios</strong><small>Se usa como referencia del panel.</small></div><input id="config-daily-target" type="number" value="${Number(c.META_PEDIDOS_DIA || 20)}" min="1" max="10000"></div><p class="settings-help">Una línea por saludo o cierre. Guardar cambios aplica estas opciones al motor local.</p></section></div>`;
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
  const status = c.NEGOCIO_ESTADO || '';
  const imagen = state.media?.[0]?.dataUrl || state.media?.[0]?.url || '';
  const pdf = state.pdf?.nombre || '';
  const texto = previewMessage();
  const ahora = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const message = texto
    ? esc(texto).replace(/\n/g, '<br>')
    : '<em>Escribí el mensaje en el paso 1 para ver cómo llega.</em>';
  const extras =
    state.media.length > 1
      ? `<small class="wa-extra">+ ${state.media.length - 1} imagen(es) más, en mensajes aparte</small>`
      : '';
  const documentMarkup = pdf
    ? `<div class="wa-document"><span class="material-symbols-outlined">picture_as_pdf</span><div><strong>${esc(pdf)}</strong><small>PDF · se manda aparte</small></div></div>`
    : '';
  return `<div class="card phone-card wa-preview"><div class="phone-head"><h3><span class="status-dot"></span> Vista previa de WhatsApp</h3><small>Así llega · no envía nada</small></div><div class="phone wa-phone"><div class="wa-status-bar"><span>WhatsApp</span><span>${esc(ahora)}</span></div><div class="phone-bar"><span class="material-symbols-outlined">arrow_back</span><img class="whatsapp-brand-logo phone-brand-logo" src="${esc(previewLogo())}" alt="Logo de ${esc(name)}"><div class="phone-identity"><strong>${esc(name)}</strong>${status ? `<small>${esc(status)}</small>` : ''}</div></div><div class="phone-body"><span class="date-chip">HOY</span><div class="wa-bubble outgoing">${imagen ? `<img class="wa-media-image" src="${esc(assetUrl(imagen))}" alt="Flyer de la campaña">` : ''}<div class="wa-message-copy">${message}</div><time>${esc(ahora)}</time></div>${extras}${documentMarkup}</div></div><p class="preview-disclaimer">El saludo y el cierre rotan al azar entre los que configuraste; {NOMBRE} usa el nombre de cada contacto.</p></div>`;
}

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
  const rendered = views[state.route]();
  app.innerHTML = rendered;
  if (state.route === 'campana' && state.campaignPlan) {
    const plan = document.createElement('section');
    plan.className = 'card campaign-plan';
    plan.innerHTML = campaignPlanMarkup();
    app.querySelector('.studio-main')?.prepend(plan);
  }
  app.focus({ preventScroll: true });
  document
    .querySelectorAll('[data-route]')
    .forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
  document
    .querySelectorAll('.nav-item, .mobile-nav button')
    .forEach((button) => button.classList.toggle('active', button.dataset.route === state.route));
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
    ? '<div class="qr-box"><b style="font:700 72px/1 sans-serif;color:var(--green)">✓</b></div>'
    : qr
      ? `<div class="qr-box real"><img src="${esc(qr)}" alt="Código QR de WhatsApp"></div>`
      : '<div class="qr-box"><span>Esperando QR del servidor</span></div>';
  const detail = connected
    ? 'WhatsApp ya está vinculado. No necesitás escanear otro código.'
    : state.status?.whatsappDetalle ||
      (qr ? 'QR disponible para escanear' : 'El backend todavía no generó un QR');
  $('#modal-root').innerHTML =
    `<div class="modal-backdrop" data-action="close-modal"><div class="modal"><div class="modal-head"><h2>${connected ? 'WhatsApp vinculado' : 'Conectar WhatsApp Web'}</h2><button class="close" data-action="close-modal">×</button></div><p style="color:var(--brown);font-size:12px;line-height:18px">${connected ? 'La sesión queda guardada en el servidor.' : 'Abrí WhatsApp en tu teléfono, entrá a Dispositivos vinculados y escaneá este código. La sesión queda guardada en el servidor.'}</p>${qrMarkup}<div class="empty-state" style="padding:12px"><strong>${esc(detail)}</strong>${connected ? ' Ya podés cerrar esta ventana y usar el panel.' : ' Podés cerrar esta ventana y volver a revisar el estado.'}</div></div></div>`;
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
      state.chatFilter = ['todos', 'nuevos', 'pedidos', 'consultas', 'problemas'].includes(value)
        ? value
        : 'todos';
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
      const groupId = $('#campaign-group')?.value || '';
      const segmento = groupId
        ? `grupo:${groupId}`
        : document.querySelector('input[name="segment"]:checked')?.value || '';
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
    render();
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
    if (copy) copy.innerHTML = esc(previewMessage()).replace(/\n/g, '<br>');
  }
  if (event.target.id === 'contact-search') {
    state.contactQuery = event.target.value;
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

syncShell();
render();
refresh();
loadIdentity();
connectLive();
waitTimer = setInterval(tickWait, 1000);

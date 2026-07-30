const badge = document.getElementById('badge');
const qrBox = document.getElementById('qrBox');
const operatorKey = document.getElementById('operatorKey');
const autoState = document.getElementById('autoState');
const n8nState = document.getElementById('n8nState');
const apiState = document.getElementById('apiState');
const lastError = document.getElementById('lastError');
const eventsBox = document.getElementById('events');
const chatsBox = document.getElementById('chats');
const refreshBtn = document.getElementById('refreshBtn');
const refreshChatsBtn = document.getElementById('refreshChatsBtn');
const testBtn = document.getElementById('testBtn');

function renderEvent(event) {
  const detail = event.detail ? JSON.stringify(event.detail) : '';
  return `
    <div class="event">
      <strong>${event.type}</strong>
      <span>${new Date(event.at).toLocaleString('es-AR')} ${detail}</span>
    </div>
  `;
}

async function loadStatus() {
  const status = await fetch('/api/status').then((res) => res.json());
  badge.textContent = status.ready ? 'Conectado' : status.qr_available ? 'Escanear QR' : 'Cargando';
  badge.classList.toggle('ready', status.ready);
  operatorKey.textContent = status.operator_key || '-';
  autoState.textContent = status.auto_on_operator_key
    ? status.delete_operator_key
      ? 'Activo y borra clave'
      : 'Activo'
    : 'Desactivado';
  n8nState.textContent = status.n8n_configured ? 'Configurado' : 'No configurado';
  apiState.textContent = status.modosabor_configured ? 'Configurado' : 'No configurado';
  lastError.textContent = status.last_error || '-';
  eventsBox.innerHTML =
    (status.events || []).map(renderEvent).join('') ||
    '<div class="event"><strong>Sin eventos</strong><span>El puente esta iniciando.</span></div>';

  if (status.qr_available && !status.ready) {
    const qr = await fetch('/api/qr').then((res) => res.json());
    qrBox.innerHTML = qr.data_url
      ? `<img src="${qr.data_url}" alt="QR WhatsApp" />`
      : '<span>Esperando QR...</span>';
  } else if (status.ready) {
    qrBox.innerHTML = '<span>WhatsApp conectado. Ya podes usar #dale.</span>';
  } else {
    qrBox.innerHTML = '<span>Esperando QR...</span>';
  }
}

function renderChat(chat) {
  const title = chat.nombre || chat.telefono || chat.chat_id;
  const last = chat.ultimo_texto || 'Sin texto';
  const when = chat.ultimo_en ? new Date(chat.ultimo_en).toLocaleString('es-AR') : '-';
  return `
    <article class="chat-card">
      <div>
        <h3>${title}</h3>
        <p>${last}</p>
        <p>${when} · ${chat.total_mensajes || 0} mensajes guardados</p>
      </div>
      <button type="button" data-chat-id="${chat.chat_id}">Mandar al copiloto</button>
    </article>
  `;
}

async function loadChats() {
  const chats = await fetch('/api/chats').then((res) => res.json());
  chatsBox.innerHTML = chats.length
    ? chats.map(renderChat).join('')
    : '<div class="event"><strong>Sin chats recientes</strong><span>Cuando entren o salgan mensajes, van a aparecer aca.</span></div>';
}

refreshBtn.addEventListener('click', () => {
  loadStatus().catch(() => {});
});

refreshChatsBtn.addEventListener('click', () => {
  loadChats().catch(() => {});
});

chatsBox.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-chat-id]');
  if (!button) return;
  button.disabled = true;
  button.textContent = 'Enviando...';
  try {
    const response = await fetch('/api/chats/disparar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: button.dataset.chatId }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'No se pudo disparar');
    }
    await loadStatus();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
    button.textContent = 'Mandar al copiloto';
  }
});

testBtn.addEventListener('click', async () => {
  testBtn.disabled = true;
  testBtn.textContent = 'Probando...';
  try {
    await fetch('/api/test-disparo', { method: 'POST' });
    await loadStatus();
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = 'Probar disparo';
  }
});

loadStatus().catch(() => {});
loadChats().catch(() => {});
setInterval(() => loadStatus().catch(() => {}), 3000);
setInterval(() => loadChats().catch(() => {}), 8000);

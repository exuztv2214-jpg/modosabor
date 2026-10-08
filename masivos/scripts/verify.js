const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function expectFile(file) {
  assert.equal(fs.existsSync(path.join(root, file)), true, `falta ${file}`);
}

function verifyIsolation() {
  expectFile('package.json');
  expectFile('server.js');
  expectFile('config.js');
  expectFile('session-utils.js');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.panel, 'node server.js');

  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /const PORT = Number\(process\.env\.PORT \|\| 3867\)/);
  assert.match(server, /const HOST = process\.env\.HOST \|\| ['"]127\.0\.0\.1['"]/);
  assert.match(server, /path\.join\(ROOT, ['"]sesion['"]/);
  assert.match(server, /MASIVOS_SESSION_DIR/);
  assert.match(server, /function limpiarBloqueosChromium\(\)/);
  assert.match(server, /'SingletonLock'/);
  assert.match(server, /'SingletonCookie'/);
  assert.match(server, /'SingletonSocket'/);
  assert.match(server, /'DevToolsActivePort'/);
  assert.doesNotMatch(server, /D:\\ModoSaborPromoPro/);
  assert.doesNotMatch(server, /Documents\\kimi\\Workspaces\\masivos/);
  assert.match(server, /Contact\.getModelsArray\(\)/);
  assert.match(server, /normalizarContactosLivianos/);
  assert.match(server, /client\.getChats\(\)/);
  assert.match(server, /client\.getProfilePicUrl/);
  assert.match(server, /const ORIGENES_PANEL = new Set\(\s*\[/s);
  assert.match(server, /localhost:3867/);
  assert.doesNotMatch(server, /modosabor-api-production\.up\.railway\.app/);
  assert.match(server, /fs\.renameSync\(/);

  console.log('verify: isolation contract OK');
}

function verifyFrontendContract() {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'public', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const conversationSource = server.slice(
    server.indexOf('async function obtenerConversacion'),
    server.indexOf('async function obtenerConversacionesPanel')
  );
  // Menú: cada pantalla tiene su entrada en la barra lateral.
  for (const ruta of [
    'inicio',
    'campana',
    'contactos',
    'conversaciones',
    'resultados',
    'configuracion',
  ]) {
    assert.match(html, new RegExp(`class="nav-item[^"]*" data-route="${ruta}"`));
  }
  assert.match(html, /Escanear QR/i);
  assert.match(html, /Actualizar Contactos/i);
  assert.match(html, /Nueva Campaña/i);
  assert.doesNotMatch(html, /24ms/);
  assert.match(html, /id="shell-batch"/);
  assert.match(app, /renderInicio/);
  assert.match(app, /renderCampana/);
  assert.match(app, /renderContactos/);
  assert.match(app, /renderConversaciones/);
  assert.match(app, /\/api\/status/);
  assert.match(app, /new EventSource\(panelPath\('\/api\/eventos'\)\)/);
  assert.match(app, /\/api\/cliente-detalle/);
  assert.match(app, /\/fotos\//);
  assert.match(app, /data-action="photos"/);
  assert.match(app, /\/api\/fotos/);
  assert.match(app, /contactsView/);
  assert.match(app, /contacts-view/);
  assert.match(app, /contact-card-grid/);
  assert.match(app, /contact-search/);
  assert.match(app, /contactsFilter/);
  assert.match(app, /contacts-filter/);
  assert.match(app, /selectedContacts/);
  assert.match(app, /contact-select/);
  assert.match(app, /save-group/);
  assert.match(app, /contact-modal/);
  assert.match(app, /contact-import-input/);
  assert.match(app, /parseImportedContacts/);
  assert.doesNotMatch(app, /onclick="event\.stopPropagation\(\)"/);
  assert.match(app, /data-action="campaign-tab"/);
  assert.doesNotMatch(app, /data-action="preview-reply"/); // sin botones falsos en la vista previa
  assert.match(app, /data-route="contactos"/);
  assert.match(app, /data-action="open-wa" data-number="\$\{esc\(c\.numero\)\}"/);
  assert.match(app, /state\.route = 'conversaciones'/);
  assert.doesNotMatch(app, /window\.open\('https:\/\/wa\.me\//);
  assert.match(app, /reactivar-selected/);
  assert.match(app, /contact\.excluido \|\| contact\.pausado/);
  assert.match(app, /api\/grupos-envio/);
  assert.match(app, /Historial real/i);
  assert.match(app, /detail\.respuestas/);
  assert.match(app, /detail\.enviados/);
  assert.match(app, /\/api\/conversacion/);
  assert.match(app, /\/api\/conversaciones/);
  assert.match(app, /state\.conversations/);
  assert.match(app, /chat-search/);
  assert.match(app, /chat-filter/);
  assert.match(app, /chatQuery/);
  assert.doesNotMatch(app, /filter === 'consultas'\) return chat\.estado === 'consulta' \|\|/);
  assert.match(app, /function chatMatchesFilter\(chat, filter\)[\s\S]*filter === ['"]nuevos['"]/);
  assert.match(app, /unreadChats/);
  assert.match(app, /addEventListener\('respuesta'/);
  assert.match(app, /data-unread-chats/);
  assert.match(app, /chat-unread/);
  assert.match(app, /avatarMarkup\(item/);
  assert.doesNotMatch(app, /chats\.slice\(0,7\)/);
  assert.match(app, /state\.conversation\?\.mensajes/);
  assert.match(app, /data-action="save-message"/);
  assert.match(app, /AbortSignal\.timeout\(10000\)/);
  // Mensajes con multimedia como en WhatsApp, sin miniaturas en base64 como texto.
  assert.match(app, /image: '📷 Foto'/);
  assert.match(app, /function chatListTime\(/);
  assert.match(app, /conversation-status/);
  assert.match(app, /api\/conversacion\/mensaje/);
  assert.match(app, /chatAttachment/);
  assert.match(app, /chat-file/);
  assert.match(app, /pending-media/);
  assert.match(app, /Vista previa/);
  assert.match(app, /state\.config/);
  assert.match(app, /config-delay-min/);
  assert.match(app, /config-max-run/);
  assert.match(app, /api\('\/api\/config'/);
  assert.match(app, /api\('\/api\/mensaje'/);
  assert.match(app, /texto:.*campaign-message|text.*campaign-message/s);
  assert.match(app, /campaignPlan/);
  assert.match(app, /state\.analytics/);
  assert.match(app, /api\('\/api\/estadisticas'\)/);
  assert.match(app, /stats\.totales/);
  assert.match(app, /¿Enviar.*chat/);
  assert.match(app, /run-campaign/);
  assert.match(app, /run-simulation/);
  assert.match(app, /token: plan\.token/);
  assert.doesNotMatch(app, /32 ms/);
  assert.doesNotMatch(app, /Fase 1/);
  assert.match(app, /function healthCard\(connected\)/);
  assert.match(app, /Preparar y revisar envío/);
  assert.match(app, /renderWhatsappPreview/);
  assert.match(app, /WhatsApp ya está vinculado/);
  assert.match(app, /const connected = state\.status\?\.whatsapp === 'listo';/);
  assert.match(app, /const wasConnected = state\.status\?\.whatsapp === 'listo';/);
  assert.match(app, /WhatsApp vinculado correctamente/);
  assert.match(app, /stream\.addEventListener\('lista'/);
  assert.match(app, /contactos y .*chats sincronizados/);
  assert.match(app, /async function refreshQrStatus\(\)/);
  assert.match(app, /setInterval\(refreshQrStatus, 3000\)/);
  assert.match(app, /data-action=["']qr["'][^>]*>.*Abrir conexión/s);
  assert.doesNotMatch(app, /qr:\s*state\.status\?\.qr \|\| results\[0\]\.value\.qr/);
  assert.match(app, /wa-preview/);
  assert.match(app, /whatsapp-brand-logo/);
  assert.match(app, /wa-status-bar/);
  assert.doesNotMatch(app, /wa-action-row/); // WhatsApp común no tiene botones
  assert.match(app, /wa-document/);
  assert.match(app, /config-pause-long/);
  assert.match(app, /config-retries/);
  assert.match(app, /config-warmup-start/);
  assert.match(app, /switchMarkup\('batch-mode'/);
  assert.match(app, /config-baja-response/);
  assert.match(app, /config-days-no-send/);
  assert.match(app, /config-business-name/);
  assert.match(server, /ARCHIVO_CHAT_ESTADOS/);
  assert.match(server, /chat-estados\.json/);
  assert.match(server, /numero.*estado|estado.*numero/s);
  assert.match(server, /app\.get\(["']\/api\/conversacion["']/);
  assert.match(server, /app\.get\(["']\/api\/conversaciones["']/);
  assert.match(
    server,
    /app\.get\(["']\/api\/status["'][\s\S]*?qr:\s*estadoWA\.qr/,
    'el estado debe incluir el QR para que el panel remoto pueda mostrarlo'
  );
  assert.match(server, /app\.post\(["']\/api\/conversacion\/mensaje["']/);
  assert.match(server, /app\.post\(["']\/api\/conversacion\/adjunto["']/);
  assert.match(server, /MessageMedia/);
  assert.match(server, /ARCHIVO_GRUPOS_ENVIO/);
  assert.match(server, /api\/grupos-envio/);
  assert.match(server, /api\/reactivar-contactos/);
  assert.match(server, /api\/contactos\/importar/);
  assert.match(server, /app\.post\(["']\/api\/contactos["']/);
  assert.match(server, /mergeSyncedContacts\(chatsRaw, \[\], previos, lidMappings\)/);
  assert.match(server, /const actualizados = mergeSyncedContacts\(/);
  assert.match(server, /if \(!analisis\.corriendo\) vincularFotosCache\(\)/);
  assert.match(server, /ARCHIVO_CHATS/);
  assert.match(server, /listaJob\.corriendo/);
  assert.match(server, /enforceLidAndPnRetrieval/);
  assert.match(server, /listaJob\.enriqueciendo/);
  assert.match(server, /client\.getProfilePicUrl/);
  assert.match(app, /Sincronización iniciada; te aviso al terminar/);
  assert.match(server, /function sincronizarConversacionesEnCRM/);
  assert.match(server, /sincronizarConversacionesEnCRM\(chats\)/);
  assert.match(server, /escribirJsonSeguro\(ARCHIVO_CLIENTES, listaSincronizada\)/);
  assert.doesNotMatch(server, /fs\.writeFileSync\(ARCHIVO_CLIENTES, JSON\.stringify\(encontrados/);
  assert.match(server, /WAWebCollections['"]\)\s*\.Chat\.getModelsArray\(\)/);
  assert.match(server, /mensajes:\s*lastMessage/);
  assert.doesNotMatch(server, /WAWebChatLoadMessages/);
  assert.match(conversationSource, /leerJsonSeguro\(ARCHIVO_CHATS/);
  assert.doesNotMatch(conversationSource, /pupPage\.evaluate/);
  assert.match(server, /path\.join\(DIR_DATA, ['"]mensaje-general\.txt['"]\)/);
  assert.match(server, /estadoAutomaticoDesdeTipo/);
  assert.match(server, /clasificarRespuestaTexto\(msg\.body\)/);
  assert.match(server, /estado: estadoAutomaticoDesdeTipo/);
  assert.match(server, /function guardarMensajeConversacion/);
  assert.match(
    server,
    /client\.on\(['"]message['"][\s\S]*guardarMensajeConversacion\(msg, msg\.from\)/
  );
  assert.match(
    server,
    /client\.sendMessage\(numero, texto[\s\S]*guardarMensajeConversacion\(enviado, numero\)/
  );
  assert.doesNotMatch(app, /¡Hola <b>Martín<\/b>/);
  assert.match(server, /NEGOCIO_NOMBRE/);
  assert.match(server, /NEGOCIO_LOGO/);
  assert.match(app, /function campaignSegmentCounts/);
  assert.match(app, /campaignSegmentCounts\(\)/);
  assert.match(app, /chats\.total > state\.contacts\.length/);
  assert.doesNotMatch(app, /NUEVOS REGISTROS', total \? '—' : '—'/);
  assert.doesNotMatch(app, /Math\.min\(total, 620\)/);
  // Campaña: nada preseleccionado, "todos" llega al servidor como base completa.
  assert.doesNotMatch(app, /value="activo" checked/);
  assert.match(app, /Elegí a quién enviar/);
  assert.match(server, /normalizarSegmento\(opciones\.segmento\)/);
  assert.doesNotMatch(app, /data-insert="\{(ULTIMO_PEDIDO|MENU_LINK)\}"/);
  assert.doesNotMatch(app, /SpinTax/);
  assert.match(app, /CAMPAIGN_TAB_TAGS/);
  // Reactivar también saca la exclusión.
  assert.match(app, /reactivar-selected'[\s\S]{0,1000}excluir: false/);
  // Medios en el volumen, historial de chats unido y mensajes salientes registrados.
  assert.match(server, /const DIR_MEDIA = path\.join\(DIR_DATA, 'media'\)/);
  assert.doesNotMatch(server, /path\.join\(ROOT, ['"]menu\.pdf['"]\)/);
  assert.match(server, /mergeChats\(leerJsonSeguro\(ARCHIVO_CHATS, \[\]\), chatsRaw\)/);
  assert.match(
    server,
    /client\.on\('message_create'[\s\S]{0,200}guardarMensajeConversacion\(msg, msg\.to\)/
  );
  // Sin datos inventados: usuario y negocio salen del sistema.
  for (const relleno of [
    /Facundo/,
    /Jefe de Sal/,
    /Palermo/,
    /Calentamiento OK/,
    /RIESGO CONTROLADO/,
  ]) {
    assert.doesNotMatch(html + app + server, relleno);
  }
  assert.match(app, /fetch\('\/api\/auth\/me'/);
  assert.match(app, /fetch\('\/api\/configuracion'/);
  assert.match(html, /id="shell-user"/);
  assert.doesNotMatch(app, /Simulación de Rendimiento|Reservas \/ Mesas/);
  // Control de la campaña en curso.
  for (const ruta of ['/api/pausar', '/api/reanudar', '/api/detener'])
    assert.ok(app.includes(ruta));
  for (const evento of ['motor', 'progreso', 'espera', 'tanda', 'log'])
    assert.match(app, new RegExp(`addEventListener\\('${evento}'`));
  assert.match(server, /async function esperarMotor\(/);
  assert.match(server, /app\.get\('\/api\/campanas\/:id'/);
  assert.match(server, /numerosFallidosCampana\(segmento\.slice\(10\)\)/);
  // Pedidos reales del sistema.
  assert.match(server, /\/api\/masivos-datos\/pedidos-por-telefono/);
  assert.match(server, /cruzarPedidos\(clientes,/);
  // Hora argentina aunque el contenedor arranque en UTC.
  assert.match(
    server,
    /process\.env\.TZ = process\.env\.TZ \|\| 'America\/Argentina\/Buenos_Aires'/
  );
  assert.match(server, /hour12: false/);
  // Sistema de diseño: tokens de marca y paletas alternativas.
  assert.match(css, /--brand-500: #e3242b/);
  for (const tema of ['azul', 'verde', 'grafito'])
    assert.match(css, new RegExp(`\\[data-theme='${tema}'\\]`));
  assert.match(html, /localStorage\.getItem\('masivos-theme'\)/);
  assert.match(app, /function waFormat\(/);
  assert.match(app, /function saludoDuplicado\(/);
  assert.match(app, /contactsLimit/);
  assert.match(css, /contact-card-grid/);
  assert.match(css, /conversation-body\s*\{[^}]*overflow-y\s*:\s*auto/);
  assert.match(css, /#075e54/);
  assert.match(css, /chat-row-copy/);
  assert.match(css, /chat-search-wrap/);
  assert.match(css, /chat-filter/);
  assert.match(css, /photo-avatar img[^}]*border-radius\s*:\s*50%/s);
  console.log('verify: frontend contract OK');
}

function verifyLauncherContract() {
  expectFile('launcher.ps1');
  expectFile('launch-hidden.vbs');
  expectFile('public/manifest.webmanifest');
  expectFile('public/assets/logo.png');
  const launcher = fs.readFileSync(path.join(root, 'launcher.ps1'), 'utf8');
  const vbs = fs.readFileSync(path.join(root, 'launch-hidden.vbs'), 'utf8');
  assert.match(launcher, /3867/);
  assert.match(vbs, /server\.js/);
  assert.match(vbs, /WinHttp\.WinHttpRequest/);
  assert.match(vbs, /nodejs\\node\.exe/);
  assert.doesNotMatch(vbs, /powershell\.exe/i);
  assert.doesNotMatch(launcher, /ModoSaborPromoPro/);
  assert.doesNotMatch(vbs, /ModoSaborPromoPro/);
  console.log('verify: launcher contract OK');
}

verifyIsolation();
verifyFrontendContract();
verifyLauncherContract();

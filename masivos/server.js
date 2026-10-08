// server.js — Panel web local de Modo Sabor para la promo diaria.
//
//   node server.js   ->  http://localhost:3867
//
// Backend: Express + SSE (progreso en vivo) + whatsapp-web.js.
// Mantiene UNA sola sesión de WhatsApp viva (carpeta ./sesion).
// No usar los scripts de consola (npm run enviar) mientras el panel esté abierto.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const configBase = require('./config');
const { liberarSesionWhatsApp } = require('./session-utils');

const PORT = Number(process.env.PORT || 3867);
const HOST = process.env.HOST || '127.0.0.1';
const PANEL_PROXY_TOKEN = String(process.env.MASIVOS_PROXY_TOKEN || '').trim();
const PANEL_BASE_PATH = String(process.env.MASIVOS_BASE_PATH || '').replace(/\/+$/, '');
const ROOT = __dirname;
const SESSION_AUTH_PATH = String(
  process.env.MASIVOS_SESSION_DIR || path.join(ROOT, 'sesion')
).trim();
const BROWSER_EXECUTABLE =
  process.env.MODO_SABOR_BROWSER ||
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));
const ARCHIVO_MENSAJE = path.join(ROOT, 'mensaje.txt');
const ARCHIVO_CLIENTES = path.join(ROOT, 'data', 'clientes.json');
const ARCHIVO_EXCLUIDOS = path.join(ROOT, 'data', 'excluidos.json');
const ARCHIVO_OVERRIDE = path.join(ROOT, 'data', 'config-override.json');
const ARCHIVO_LOG = path.join(ROOT, 'logs', 'log.txt');
const DIR_DATA = path.join(ROOT, 'data');
const DIR_CAMPANAS = path.join(DIR_DATA, 'campanas');
const ARCHIVO_PAUSADOS = path.join(DIR_DATA, 'pausados.json');
const ARCHIVO_CRM = path.join(DIR_DATA, 'crm-respuestas.json');
const ARCHIVO_PRUEBAS = path.join(DIR_DATA, 'pruebas.json');
const ARCHIVO_LOCK_PANEL = path.join(DIR_DATA, 'panel.lock.json');
const ARCHIVO_ACCIONES = path.join(DIR_DATA, 'acciones-masivas.json');
const ARCHIVO_NOTAS = path.join(DIR_DATA, 'notas-clientes.json');
const ARCHIVO_RECORDATORIOS = path.join(DIR_DATA, 'recordatorios.json');
const ARCHIVO_CIERRES_DIA = path.join(DIR_DATA, 'cierres-dia.json');
const ARCHIVO_CHAT_ESTADOS = path.join(DIR_DATA, 'chat-estados.json');
const ARCHIVO_GRUPOS_ENVIO = path.join(DIR_DATA, 'grupos-envio.json');

function procesoVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function tomarLockPanel() {
  let previo = null;
  try {
    previo = JSON.parse(fs.readFileSync(ARCHIVO_LOCK_PANEL, 'utf8'));
  } catch (e) {
    /* sin lock */
  }
  if (previo && procesoVivo(Number(previo.pid))) {
    console.error(
      `Ya hay un panel Modo Sabor abierto (PID ${previo.pid}). Usá http://${HOST}:${PORT}`
    );
    process.exit(2);
  }
  fs.mkdirSync(DIR_DATA, { recursive: true });
  fs.writeFileSync(
    ARCHIVO_LOCK_PANEL,
    JSON.stringify(
      {
        pid: process.pid,
        root: ROOT,
        startedAt: new Date().toISOString(),
        url: `http://${HOST}:${PORT}`,
      },
      null,
      2
    )
  );
}

function soltarLockPanel() {
  try {
    const lock = JSON.parse(fs.readFileSync(ARCHIVO_LOCK_PANEL, 'utf8'));
    if (Number(lock.pid) === process.pid) fs.unlinkSync(ARCHIVO_LOCK_PANEL);
  } catch (e) {
    /* sin lock */
  }
}

tomarLockPanel();

// ---------- Config (base + override del panel, fresco en cada lectura) ----------

function getConfig() {
  let ov = {};
  try {
    ov = JSON.parse(fs.readFileSync(ARCHIVO_OVERRIDE, 'utf8'));
  } catch (e) {
    /* sin override */
  }
  return Object.assign({}, configBase, ov);
}

function leerGruposEnvio() {
  const grupos = leerJsonSeguro(ARCHIVO_GRUPOS_ENVIO, []);
  return Array.isArray(grupos)
    ? grupos.filter((grupo) => grupo && grupo.id && grupo.nombre && Array.isArray(grupo.numeros))
    : [];
}

function guardarGruposEnvio(grupos) {
  escribirJsonSeguro(ARCHIVO_GRUPOS_ENVIO, grupos.slice(-100));
}

function grupoEnvioPorId(id) {
  return leerGruposEnvio().find((grupo) => grupo.id === String(id || '')) || null;
}

// ---------- Utilidades ----------

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ERRORES_SESION_FATAL = [
  'detached frame',
  'target closed',
  'protocol error',
  'session closed',
  'execution context was destroyed',
  'page crashed',
  'browser has disconnected',
];

function esErrorSesionFatal(err) {
  const texto = String((err && (err.stack || err.message)) || err || '').toLowerCase();
  return ERRORES_SESION_FATAL.some((patron) => texto.includes(patron));
}

function numeroAcotado(valor, fallback, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function registrarLog(linea) {
  const texto = `[${new Date().toLocaleString('es-AR')}] ${linea}`;
  try {
    fs.mkdirSync(path.dirname(ARCHIVO_LOG), { recursive: true });
    fs.appendFileSync(ARCHIVO_LOG, texto + '\n');
  } catch (e) {
    /* no critico */
  }
  emit('log', texto);
}

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function archivoEnviadosHoy() {
  return path.join(ROOT, 'data', `enviados-${hoy()}.json`);
}

function cargarEnviadosHoy() {
  try {
    return new Set(JSON.parse(fs.readFileSync(archivoEnviadosHoy(), 'utf8')));
  } catch (e) {
    return new Set();
  }
}

function guardarEnviadosHoy(set) {
  try {
    fs.writeFileSync(archivoEnviadosHoy(), JSON.stringify([...set], null, 2));
  } catch (e) {
    /* no critico */
  }
}

function primerNombre(nombre) {
  const limpio = (nombre || '').trim();
  if (!/\p{L}.*\p{L}/u.test(limpio)) return ''; // evita nombres tipo ".", ":)"
  return limpio.split(/\s+/)[0];
}

function armarMensaje(plantilla, nombre, config) {
  const saludoBase = azar(config.SALUDOS);
  const nombreCorto = primerNombre(nombre);
  const saludo = saludoBase.replace(/\{NOMBRE\}/gi, nombreCorto ? ` ${nombreCorto}` : '');
  let cuerpo = plantilla.trim();
  let mensaje = /\{SALUDO\}/i.test(cuerpo)
    ? cuerpo.replace(/\{SALUDO\}/gi, saludo)
    : `${saludo}\n\n${cuerpo}`;
  mensaje = mensaje.replace(/\{NOMBRE\}/gi, nombreCorto);
  mensaje = `${mensaje}\n\n${azar(config.CIERRES)}`;
  return mensaje
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_IMAGENES_PROMO = 10;

// Ruta del "slot" de imagen: slot 1 => promo.ext, slot 2 => promo-2.ext, etc.
function rutaImagenPromo(slot, ext) {
  return path.join(ROOT, slot <= 1 ? `promo.${ext}` : `promo-${slot}.${ext}`);
}

// Ruta existente de un slot (probando cada extensión) o null.
function rutaSlotExistente(slot) {
  for (const ext of IMG_EXTS) {
    const p = rutaImagenPromo(slot, ext);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Todas las imágenes de la promo, en orden de slot (1, 2, 3…).
function buscarImagenesPromo() {
  const out = [];
  for (let slot = 1; slot <= MAX_IMAGENES_PROMO; slot++) {
    const p = rutaSlotExistente(slot);
    if (p) out.push(p);
  }
  return out;
}

// Compatibilidad: primera imagen de la promo o null.
function buscarImagenPromo() {
  return buscarImagenesPromo()[0] || null;
}

// Borra todas las variantes de extensión de un slot.
function borrarSlotImagen(slot) {
  for (const ext of IMG_EXTS) {
    const p = rutaImagenPromo(slot, ext);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// Primer slot sin imagen, o null si están todos ocupados.
function primerSlotLibrePromo() {
  for (let slot = 1; slot <= MAX_IMAGENES_PROMO; slot++) {
    if (!rutaSlotExistente(slot)) return slot;
  }
  return null;
}

function leerExcluidos() {
  try {
    return new Set(JSON.parse(fs.readFileSync(ARCHIVO_EXCLUIDOS, 'utf8')));
  } catch (e) {
    return new Set();
  }
}

function guardarExcluidos(set) {
  fs.mkdirSync(path.dirname(ARCHIVO_EXCLUIDOS), { recursive: true });
  fs.writeFileSync(ARCHIVO_EXCLUIDOS, JSON.stringify([...set], null, 2));
}

function leerPausados() {
  const raw = leerJsonSeguro(ARCHIVO_PAUSADOS, {});
  const hoyStr = hoy();
  let cambio = false;
  for (const [numero, info] of Object.entries(raw)) {
    if (!info || !info.hasta || info.hasta < hoyStr) {
      delete raw[numero];
      cambio = true;
    }
  }
  if (cambio) escribirJsonSeguro(ARCHIVO_PAUSADOS, raw);
  return raw;
}

function guardarPausados(obj) {
  escribirJsonSeguro(ARCHIVO_PAUSADOS, obj);
}

function pausarNumeros(numeros, dias, motivo) {
  const pausados = leerPausados();
  const hasta = sumarDias(hoy(), dias);
  for (const n of numeros) {
    pausados[n] = { hasta, motivo: motivo || 'pausa operativa', creado: new Date().toISOString() };
  }
  guardarPausados(pausados);
  return { total: numeros.length, hasta };
}

function reactivarNumeros(numeros) {
  const pausados = leerPausados();
  let total = 0;
  for (const n of numeros) {
    if (pausados[n]) {
      delete pausados[n];
      total++;
    }
  }
  guardarPausados(pausados);
  return { total };
}

function normalizarNumeroContacto(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return null;
  if (/@(?:c\.us|lid)$/i.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16 ? `${digits}@c.us` : null;
}

function normalizarContactoEntrada(item) {
  const numeroOriginal =
    item && (item.numero || item.telefono || item.phone || item.tel || item.mobile);
  const numero = normalizarNumeroContacto(numeroOriginal);
  if (!numero) return null;
  const nombre =
    String(item.nombre || item.name || item.contacto || item.displayName || '')
      .trim()
      .slice(0, 120) || 'Contacto importado';
  const telefono = /@/.test(String(numeroOriginal || ''))
    ? ''
    : String(numeroOriginal || '')
        .trim()
        .slice(0, 40);
  return { origen: 'crm', numero, nombre, ...(telefono ? { telefono } : {}) };
}

function fusionarContactosEntrantes(entrantes, motivo) {
  const actuales = leerJsonSeguro(ARCHIVO_CLIENTES, []);
  const mapa = new Map(
    actuales.filter((item) => item && item.numero).map((item) => [item.numero, item])
  );
  let agregados = 0;
  let actualizados = 0;
  for (const entrada of entrantes) {
    const previo = mapa.get(entrada.numero);
    if (!previo) {
      mapa.set(entrada.numero, { ...entrada, ultimoMensaje: null });
      agregados++;
      continue;
    }
    const nombreUtil =
      previo.nombre &&
      !['Sin nombre', 'Contacto WhatsApp', 'Contacto importado'].includes(previo.nombre);
    const fusionado = {
      ...previo,
      ...entrada,
      nombre: nombreUtil ? previo.nombre : entrada.nombre,
    };
    if (JSON.stringify(fusionado) !== JSON.stringify(previo)) {
      mapa.set(entrada.numero, fusionado);
      actualizados++;
    }
  }
  if (agregados || actualizados) {
    hacerBackup(motivo);
    const clientes = [...mapa.values()].sort((a, b) =>
      (a.nombre || a.numero).localeCompare(b.nombre || b.numero)
    );
    escribirJsonSeguro(ARCHIVO_CLIENTES, clientes);
    registrarLog(`📥 Contactos incorporados: ${agregados} nuevos, ${actualizados} actualizados.`);
  }
  return { total: mapa.size, agregados, actualizados };
}

function combinarClientesSincronizados(encontrados, previos) {
  const mapa = new Map(
    encontrados.filter((item) => item && item.numero).map((item) => [item.numero, item])
  );
  for (const previo of previos) {
    if (!previo || !previo.numero || mapa.has(previo.numero)) continue;
    mapa.set(previo.numero, { ...previo, origen: previo.origen || 'historico' });
  }
  return [...mapa.values()].sort((a, b) =>
    (a.nombre || a.numero).localeCompare(b.nombre || b.numero)
  );
}

function sincronizarConversacionesEnCRM(chats) {
  const actuales = leerJsonSeguro(ARCHIVO_CLIENTES, []);
  const conocidos = new Set(actuales.map((item) => item && item.numero).filter(Boolean));
  const faltantes = chats
    .filter(
      (chat) =>
        chat &&
        chat.numero &&
        !chat.grupo &&
        ['c.us', 'lid'].includes(chat.numero.split('@')[1]) &&
        !conocidos.has(chat.numero)
    )
    .map((chat) => ({
      origen: 'chat',
      numero: chat.numero,
      nombre: chat.nombre || 'Contacto WhatsApp',
      ...(chat.timestamp
        ? { ultimoMensaje: new Date(chat.timestamp * 1000).toISOString().slice(0, 10) }
        : {}),
    }));
  if (!faltantes.length) return { total: actuales.length, agregados: 0, actualizados: 0 };
  return fusionarContactosEntrantes(faltantes, 'sincronización de conversaciones');
}

function leerJsonSeguro(archivo, fallback) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function escribirJsonSeguro(archivo, data) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  const temporal = `${archivo}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporal, JSON.stringify(data, null, 2));
    // ponytail: reemplazo atómico mínimo; un lock por archivo sólo si aparece concurrencia real.
    fs.rmSync(archivo, { force: true });
    fs.renameSync(temporal, archivo);
  } catch (e) {
    fs.rmSync(temporal, { force: true });
    throw e;
  }
}

function parseFechaLocal(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) return null;
  const [y, m, d] = String(fecha).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function diasDesde(fecha) {
  const d = parseFechaLocal(fecha);
  if (!d) return null;
  const hoyLocal = parseFechaLocal(hoy());
  return Math.max(0, Math.floor((hoyLocal - d) / 86400000));
}

function sumarDias(fecha, dias) {
  const d = parseFechaLocal(fecha) || new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function archivosPorPatron(patron) {
  try {
    return fs
      .readdirSync(DIR_DATA)
      .filter((f) => patron.test(f))
      .sort();
  } catch (e) {
    return [];
  }
}

function guardarCampana(campana) {
  try {
    fs.mkdirSync(DIR_CAMPANAS, { recursive: true });
    fs.writeFileSync(
      path.join(DIR_CAMPANAS, `${campana.id}.json`),
      JSON.stringify(campana, null, 2)
    );
  } catch (e) {
    /* no crítico */
  }
}

function crearCampanaPersistente(simulacro, opciones, objetivo, config) {
  const id = `campana-${hoy()}-${Date.now().toString(36)}`;
  const campana = {
    id,
    fecha: hoy(),
    inicio: new Date().toISOString(),
    fin: null,
    simulacro: !!simulacro,
    segmento: opciones.segmento || '',
    estado: 'corriendo',
    config: {
      delayMinMs: config.DELAY_MIN_MS,
      delayMaxMs: config.DELAY_MAX_MS,
      maxPorCorrida: config.MAX_POR_CORRIDA,
      maxPorHora: config.MAX_POR_HORA || 0,
      modoTandas: !!config.MODO_TANDAS,
    },
    stats: { total: objetivo.length, ok: 0, fallidos: 0 },
    destinatarios: objetivo.map((c) => ({
      numero: c.numero,
      nombre: c.nombre || '',
      estado: 'pendiente',
      error: null,
      segmentosAuto: c.segmentosAuto || [],
    })),
  };
  guardarCampana(campana);
  return campana;
}

// ---------- Etiquetas / segmentación ----------

const ARCHIVO_ETIQUETAS = path.join(ROOT, 'data', 'etiquetas.json');
const TAGS_VALIDOS = [
  'frecuente',
  'ejecutivo',
  'economico',
  'nuevo',
  'pidio',
  'activo',
  'frio',
  'respondio',
  'pidio_ayer',
  'nuevo_sin_enviar',
];
const PRIORIDAD_CAMPANA = [
  'pidio_ayer',
  'pidio',
  'activo',
  'nuevo_sin_enviar',
  'nuevo',
  'respondio',
  'sin_enviar',
  'frio',
  'viejo',
];

function leerEtiquetas() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_ETIQUETAS, 'utf8'));
  } catch (e) {
    return {};
  }
}

function guardarEtiquetas(obj) {
  fs.mkdirSync(path.dirname(ARCHIVO_ETIQUETAS), { recursive: true });
  fs.writeFileSync(ARCHIVO_ETIQUETAS, JSON.stringify(obj, null, 2));
}

// Plantillas por segmento: mensaje.txt es la general y data/mensaje-<tag>.txt
// la específica de cada grupo (opcional).
function cargarPlantillas() {
  const plantillas = { general: fs.readFileSync(ARCHIVO_MENSAJE, 'utf8') };
  for (const tag of TAGS_VALIDOS) {
    const p = path.join(ROOT, 'data', `mensaje-${tag}.txt`);
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8').trim();
      if (txt) plantillas[tag] = fs.readFileSync(p, 'utf8');
    }
  }
  return plantillas;
}

function plantillaPara(tags, plantillas) {
  for (const t of tags || []) {
    if (plantillas[t]) return plantillas[t];
  }
  return plantillas.general;
}

function tagsParaPlantilla(cliente, mapaTags) {
  const manuales = mapaTags[cliente.numero] || [];
  const automaticos = (cliente.segmentosAuto || []).filter((tag) => {
    if (tag === 'nuevo') return ((cliente.metricas && cliente.metricas.enviadosTotal) || 0) === 0;
    return true;
  });
  return [...manuales, ...automaticos];
}

// ---------- Calentamiento ----------

function limiteHoy(config) {
  const max = Number(config.MAX_POR_CORRIDA) || 50;
  if (!config.CALENTAMIENTO_ACTIVO) return { limite: max, calentamiento: false, diasPrevios: 0 };
  const dir = path.join(ROOT, 'data');
  let diasPrevios = 0;
  try {
    diasPrevios = fs
      .readdirSync(dir)
      .filter((f) => /^enviados-\d{4}-\d{2}-\d{2}\.json$/.test(f) && !f.includes(hoy()))
      .filter((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).length > 0;
        } catch (e) {
          return false;
        }
      }).length;
  } catch (e) {
    /* sin carpeta data todavía */
  }
  const inicio = Number(config.CALENTAMIENTO_INICIO) || 20;
  const inc = Number(config.CALENTAMIENTO_INCREMENTO) || 10;
  return { limite: Math.min(inicio + inc * diasPrevios, max), calentamiento: true, diasPrevios };
}

// ---------- Backup automático ----------

function hacerBackup(motivo) {
  try {
    const dir = path.join(ROOT, 'data', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = `${hoy()}-${Date.now().toString(36)}`;
    for (const f of ['clientes.json', 'excluidos.json', 'etiquetas.json']) {
      const src = path.join(ROOT, 'data', f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `${stamp}-${f}`));
    }
    // Rotación: conservar los últimos 30 backups
    const stamps = [
      ...new Set(
        fs.readdirSync(dir).map((f) => f.replace(/-(clientes|excluidos|etiquetas)\.json$/, ''))
      ),
    ].sort();
    while (stamps.length > 30) {
      const viejo = stamps.shift();
      for (const f of ['clientes', 'excluidos', 'etiquetas']) {
        const p = path.join(dir, `${viejo}-${f}.json`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
    registrarLog(`💾 Backup automático (${motivo}): ${stamp}`);
  } catch (e) {
    /* backup no es crítico */
  }
}

// ---------- Acks (doble tilde / leído) del día, persistidos ----------

let acksPorNumero = null;
let acksFecha = null;

function acksDelDia() {
  if (acksFecha !== hoy() || !acksPorNumero) {
    acksFecha = hoy();
    acksPorNumero = new Map();
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'data', `acks-${hoy()}.json`), 'utf8')
      );
      acksPorNumero = new Map(Object.entries(data));
    } catch (e) {
      /* primer ack del día */
    }
  }
  return acksPorNumero;
}

function persistirAcks() {
  try {
    fs.writeFileSync(
      path.join(ROOT, 'data', `acks-${hoy()}.json`),
      JSON.stringify(Object.fromEntries(acksDelDia()), null, 2)
    );
  } catch (e) {
    /* no crítico */
  }
}

// ---------- Protección del número: límite por hora y días sin envío ----------

function archivoEnviosHora() {
  return path.join(ROOT, 'data', `envios-hora-${hoy()}.json`);
}

function enviosUltimaVentana(minutos = 60) {
  try {
    const arr = JSON.parse(fs.readFileSync(archivoEnviosHora(), 'utf8'));
    const ventanaMs = numeroAcotado(minutos, 60, 1, 240) * 60000;
    const desde = Date.now() - ventanaMs;
    return arr.filter((t) => t > desde);
  } catch (e) {
    return [];
  }
}

function enviosUltimaHora() {
  return enviosUltimaVentana(60);
}

function registrarEnvioHora(ventanaMin = 60) {
  try {
    const recientes = enviosUltimaVentana(ventanaMin);
    recientes.push(Date.now());
    fs.writeFileSync(archivoEnviosHora(), JSON.stringify(recientes));
  } catch (e) {
    /* no crítico */
  }
}

function minutosHastaCupoHora(maxHora, ventanaMin = 60) {
  const ventana = numeroAcotado(ventanaMin, 60, 1, 240);
  const recientes = enviosUltimaVentana(ventana);
  if (recientes.length < maxHora) return 0;
  const masViejo = Math.min(...recientes);
  return Math.max(1, Math.ceil((masViejo + ventana * 60000 - Date.now()) / 60000));
}

function esDiaNoEnvio(config) {
  const dias = config.DIAS_NO_ENVIO;
  return Array.isArray(dias) && dias.includes(new Date().getDay());
}

// ---------- Respuestas de clientes (para estadísticas y pedidos) ----------

function registrarRespuesta(msg) {
  try {
    if (!msg.from || msg.from.endsWith('@g.us') || msg.from.includes('broadcast')) return;
    const archivo = path.join(ROOT, 'data', `respuestas-${hoy()}.json`);
    let arr = [];
    try {
      arr = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    } catch (e) {
      /* primer mensaje del día */
    }
    const tipo = clasificarRespuestaTexto(msg.body);
    arr.push({
      numero: msg.from,
      hora: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      texto: (msg.body || '').slice(0, 120),
      tipo,
      estado: estadoAutomaticoDesdeTipo(tipo),
    });
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(arr, null, 2));
  } catch (e) {
    /* no crítico */
  }
}

// ---------- Baja automática (opt-out) ----------

const PALABRAS_BAJA = [
  'baja',
  'stop',
  'sacame',
  'no mandar',
  'no me mandes',
  'no me manden',
  'basta de mensajes',
  'no quiero recibir',
  'deja de mandar',
  'dejen de mandar',
  'unsubscribe',
  'cancelar suscripcion',
];

async function manejarEntrante(msg) {
  const config = getConfig();
  if (!config.BAJA_AUTOMATICA) return;
  if (!msg.from || msg.from.endsWith('@g.us') || msg.from.includes('broadcast')) return;
  const texto = (msg.body || '').trim().toLowerCase();
  if (!texto || !PALABRAS_BAJA.some((p) => texto === p || texto.startsWith(p + ' '))) return;

  const excluidos = leerExcluidos();
  if (excluidos.has(msg.from)) return; // ya estaba afuera
  excluidos.add(msg.from);
  guardarExcluidos(excluidos);
  registrarLog(`🚫 BAJA automática: ${msg.from} pidió no recibir más ("${texto.slice(0, 40)}")`);
  emit('baja', { numero: msg.from });
  try {
    await client.sendMessage(msg.from, config.BAJA_RESPUESTA || '¡Listo! No te mando más promos.');
  } catch (e) {
    /* si falla la confirmación, la baja igual queda */
  }
}

// ---------- Segmentación automática ----------

const SEGMENTOS_AUTO = [
  { id: 'pidio', nombre: 'Pidieron / posible pedido' },
  { id: 'pidio_ayer', nombre: 'Pidieron ayer' },
  { id: 'respondio', nombre: 'Respondieron' },
  { id: 'nuevo', nombre: 'Nuevos' },
  { id: 'nuevo_sin_enviar', nombre: 'Nuevos sin enviar' },
  { id: 'activo', nombre: 'Activos' },
  { id: 'frio', nombre: 'Fríos' },
  { id: 'viejo', nombre: 'Viejos' },
  { id: 'sin_enviar', nombre: 'Sin enviar' },
  { id: 'sin_numero', nombre: 'Sin número visible' },
  { id: 'otro_pais', nombre: 'Otros países' },
  { id: 'empresa', nombre: 'Empresas' },
  { id: 'pausado', nombre: 'Pausados' },
  { id: 'excluido', nombre: 'Excluidos' },
];

const PALABRAS_PEDIDO = [
  'pedido',
  'pedir',
  'pido',
  'quiero',
  'quiero pedir',
  'mandame',
  'mandarme',
  'me mandas',
  'me mandás',
  'envia',
  'enviame',
  'enviá',
  'delivery',
  'llevar',
  'llevalo',
  'reserva',
  'reservame',
  'precio',
  'cuanto',
  'cuánto',
  'menu',
  'menú',
  'economico',
  'económico',
  'ejecutivo',
  'milanesa',
  'pollo',
  'ñoquis',
  'noquis',
  'canelones',
  'wok',
  'guiso',
  'direccion',
  'dirección',
  'suprema',
  'costeleta',
  'empanada',
  'postre',
  'limonada',
  'jugo',
  'pepsi',
  'encargo',
  'encargar',
  'encargalo',
];

const PALABRAS_NO_PEDIDO = ['baja', 'stop', 'gracias', 'ok', 'dale gracias', 'no gracias'];

function parecePedido(texto) {
  const t = String(texto || '').toLowerCase();
  if (!t.trim()) return false;
  if (PALABRAS_NO_PEDIDO.some((p) => t === p || t.startsWith(p + ' '))) return false;
  return PALABRAS_PEDIDO.some((p) => t.includes(p));
}

function construirHistorialClientes() {
  const enviadosPorNumero = new Map();
  const respuestasPorNumero = new Map();

  for (const f of archivosPorPatron(/^enviados-\d{4}-\d{2}-\d{2}\.json$/)) {
    const fecha = f.match(/(\d{4}-\d{2}-\d{2})/)[1];
    const arr = leerJsonSeguro(path.join(DIR_DATA, f), []);
    for (const numero of arr) {
      if (!enviadosPorNumero.has(numero)) enviadosPorNumero.set(numero, []);
      enviadosPorNumero.get(numero).push(fecha);
    }
  }

  for (const f of archivosPorPatron(/^respuestas-\d{4}-\d{2}-\d{2}\.json$/)) {
    const fecha = f.match(/(\d{4}-\d{2}-\d{2})/)[1];
    const arr = leerJsonSeguro(path.join(DIR_DATA, f), []);
    for (const r of arr) {
      const numero = r && r.numero;
      if (!numero) continue;
      if (!respuestasPorNumero.has(numero)) respuestasPorNumero.set(numero, []);
      respuestasPorNumero.get(numero).push({
        fecha,
        hora: r.hora || '',
        texto: String(r.texto || ''),
        posiblePedido: parecePedido(r.texto),
      });
    }
  }

  return { enviadosPorNumero, respuestasPorNumero };
}

function leerNotasClientes() {
  return leerJsonSeguro(ARCHIVO_NOTAS, {});
}

function guardarNotaCliente(numero, nota) {
  const notas = leerNotasClientes();
  const id = String(numero || '').trim();
  if (!id) throw new Error('Falta número de cliente.');
  notas[id] = { texto: String(nota || '').trim(), actualizado: new Date().toISOString() };
  escribirJsonSeguro(ARCHIVO_NOTAS, notas);
  return notas[id];
}

function leerRecordatorios() {
  const arr = leerJsonSeguro(ARCHIVO_RECORDATORIOS, []);
  return Array.isArray(arr) ? arr : [];
}

function guardarRecordatorios(arr) {
  escribirJsonSeguro(ARCHIVO_RECORDATORIOS, arr.slice(-500));
}

function crearRecordatorio(numero, texto, minutos) {
  const id = String(numero || '').trim();
  if (!id) throw new Error('Falta número de cliente.');
  const min = Math.max(5, Math.min(10080, Number(minutos) || 30));
  const arr = leerRecordatorios();
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    numero: id,
    texto: String(texto || 'Volver a contactar').trim(),
    vence: new Date(Date.now() + min * 60000).toISOString(),
    creado: new Date().toISOString(),
    hecho: false,
  };
  arr.push(item);
  guardarRecordatorios(arr);
  return item;
}

function completarRecordatorio(id) {
  const arr = leerRecordatorios();
  const item = arr.find((r) => r.id === id);
  if (!item) throw new Error('Recordatorio no encontrado.');
  item.hecho = true;
  item.completado = new Date().toISOString();
  guardarRecordatorios(arr);
  return item;
}

function recordatoriosPendientes(limite = 30) {
  return leerRecordatorios()
    .filter((r) => !r.hecho)
    .sort((a, b) => String(a.vence).localeCompare(String(b.vence)))
    .slice(0, limite);
}

function detalleCliente(numero) {
  const id = String(numero || '').trim();
  if (!id) throw new Error('Falta número de cliente.');
  const clientes = leerClientesEnriquecidos();
  const cliente = clientes.find((c) => c.numero === id) || {
    numero: id,
    nombre: '',
    telefono: '',
    segmentosAuto: [],
    scoreAuto: 0,
    metricas: {},
  };

  const historial = construirHistorialClientes();
  const mapaTags = leerEtiquetas();
  const excluidos = leerExcluidos();
  const pausados = leerPausados();
  const acks = acksDelDia();
  const enviados = (historial.enviadosPorNumero.get(id) || []).slice().sort();
  const notas = leerNotasClientes();
  const recordatorios = leerRecordatorios().filter((r) => r.numero === id && !r.hecho);
  const respuestas = respuestasRecientes(500)
    .filter((r) => r.numero === id)
    .map((r) => ({
      id: r.id,
      fecha: r.fecha,
      hora: r.hora || '',
      texto: r.texto || '',
      estado: r.estado,
      posiblePedido: parecePedido(r.texto),
    }));

  return {
    cliente,
    tags: mapaTags[id] || [],
    excluido: excluidos.has(id),
    pausado: pausados[id] || null,
    estadoAck: acks.get(id) || null,
    abrirUrl: cliente.telefono ? `https://wa.me/${cliente.telefono}` : '',
    nota: notas[id] || null,
    recordatorios,
    enviados,
    respuestas,
    metricas: {
      enviadosTotal: enviados.length,
      respuestasTotal: respuestas.length,
      pedidosProbables: respuestas.filter((r) => r.posiblePedido).length,
      ultimoEnvio: enviados[enviados.length - 1] || null,
      ultimaRespuesta: respuestas[0] || null,
    },
  };
}

function enriquecerCliente(cliente, contexto) {
  const enviados = contexto.enviadosPorNumero.get(cliente.numero) || [];
  const respuestas = contexto.respuestasPorNumero.get(cliente.numero) || [];
  const ultimaRespuesta = respuestas[respuestas.length - 1] || null;
  const pidio = respuestas.some((r) => r.posiblePedido);
  const ayer = sumarDias(hoy(), -1);
  const diasUltimoMensaje = diasDesde(cliente.ultimoMensaje);
  const diasUltimaRespuesta = ultimaRespuesta ? diasDesde(ultimaRespuesta.fecha) : null;
  const segmentos = [];

  if (contexto.excluidos.has(cliente.numero)) segmentos.push('excluido');
  if (pidio) segmentos.push('pidio');
  if (respuestas.some((r) => r.posiblePedido && r.fecha === ayer)) segmentos.push('pidio_ayer');
  if (respuestas.length) segmentos.push('respondio');
  if (diasUltimoMensaje !== null && diasUltimoMensaje <= 7 && enviados.length <= 1)
    segmentos.push('nuevo');
  if (diasUltimoMensaje !== null && diasUltimoMensaje <= 7 && enviados.length === 0)
    segmentos.push('nuevo_sin_enviar');
  if (
    (diasUltimaRespuesta !== null && diasUltimaRespuesta <= 14) ||
    (diasUltimoMensaje !== null && diasUltimoMensaje <= 14 && respuestas.length)
  )
    segmentos.push('activo');
  if (enviados.length >= 3 && respuestas.length === 0) segmentos.push('frio');
  if (diasUltimoMensaje !== null && diasUltimoMensaje >= 45) segmentos.push('viejo');
  if (enviados.length === 0) segmentos.push('sin_enviar');
  if (cliente.analizado && !cliente.telefono) segmentos.push('sin_numero');
  if (cliente.analizado && cliente.telefono && cliente.pais !== '54') segmentos.push('otro_pais');
  if (cliente.negocio) segmentos.push('empresa');

  const score =
    (pidio ? 50 : 0) +
    Math.min(respuestas.length * 8, 32) +
    (diasUltimaRespuesta !== null ? Math.max(0, 20 - diasUltimaRespuesta) : 0) -
    (segmentos.includes('frio') ? 18 : 0) -
    (segmentos.includes('viejo') ? 12 : 0);

  return {
    ...cliente,
    segmentosAuto: segmentos,
    scoreAuto: score,
    metricas: {
      enviadosTotal: enviados.length,
      respondioTotal: respuestas.length,
      pidioTotal: respuestas.filter((r) => r.posiblePedido).length,
      ultimaRespuestaFecha: ultimaRespuesta ? ultimaRespuesta.fecha : null,
      diasUltimoMensaje,
      diasUltimaRespuesta,
    },
  };
}

function leerClientesEnriquecidos() {
  const clientes = leerJsonSeguro(ARCHIVO_CLIENTES, []);
  const pausados = leerPausados();
  const contexto = {
    ...construirHistorialClientes(),
    excluidos: leerExcluidos(),
  };
  return clientes.map((c) => {
    const enriched = enriquecerCliente(c, contexto);
    if (pausados[c.numero]) {
      enriched.pausado = true;
      enriched.pausa = pausados[c.numero];
      enriched.segmentosAuto = [...new Set([...(enriched.segmentosAuto || []), 'pausado'])];
    }
    return enriched;
  });
}

function resumenSegmentos(clientes) {
  const conteo = Object.fromEntries(SEGMENTOS_AUTO.map((s) => [s.id, 0]));
  for (const c of clientes) {
    for (const s of c.segmentosAuto || []) {
      conteo[s] = (conteo[s] || 0) + 1;
    }
  }
  return SEGMENTOS_AUTO.map((s) => ({ ...s, total: conteo[s.id] || 0 }));
}

function ordenarPorPrioridadCampana(clientes) {
  return clientes.slice().sort((a, b) => {
    const pa = PRIORIDAD_CAMPANA.findIndex((s) => (a.segmentosAuto || []).includes(s));
    const pb = PRIORIDAD_CAMPANA.findIndex((s) => (b.segmentosAuto || []).includes(s));
    const ia = pa === -1 ? 99 : pa;
    const ib = pb === -1 ? 99 : pb;
    if (ia !== ib) return ia - ib;
    return (b.scoreAuto || 0) - (a.scoreAuto || 0);
  });
}

function fueEnviadoDesde(numero, dias) {
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  const limite = desde.toISOString().slice(0, 10);
  for (const f of archivosPorPatron(/^enviados-\d{4}-\d{2}-\d{2}\.json$/)) {
    const fecha = f.match(/(\d{4}-\d{2}-\d{2})/)[1];
    if (fecha < limite) continue;
    const arr = leerJsonSeguro(path.join(DIR_DATA, f), []);
    if (arr.includes(numero)) return true;
  }
  return false;
}

function clasificarRespuestaTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (PALABRAS_BAJA.some((p) => t === p || t.startsWith(p + ' '))) return 'baja';
  if (parecePedido(t)) return 'pedido';
  if (
    /(precio|cuanto|cuánto|sale|valor|menu|menú|hay|tenes|tenés|horario|zona|envio|envío)/.test(t)
  )
    return 'consulta';
  if (/(gracias|ok|dale|joya|perfecto|genial)/.test(t)) return 'ok';
  if (/(caro|tarde|mal|reclamo|queja|cancel|no lleg)/.test(t)) return 'alerta';
  return 'otro';
}

function estadoAutomaticoDesdeTipo(tipo) {
  return (
    {
      pedido: 'pedido_probable',
      consulta: 'consulta',
      baja: 'baja',
      alerta: 'problema',
      ok: 'respondido',
    }[tipo] || 'nuevo'
  );
}

const ESTADOS_CRM = [
  'nuevo',
  'pedido_probable',
  'consulta',
  'respondido',
  'cerrado',
  'baja',
  'problema',
];

function idRespuesta(r) {
  const base = `${r.fecha}|${r.hora}|${r.numero}|${String(r.texto || '').slice(0, 80)}`;
  return Buffer.from(base).toString('base64url').slice(0, 64);
}

function leerCrm() {
  return leerJsonSeguro(ARCHIVO_CRM, {});
}

function guardarCrm(obj) {
  escribirJsonSeguro(ARCHIVO_CRM, obj);
}

function respuestasRecientes(limite = 80) {
  const archivos = archivosPorPatron(/^respuestas-\d{4}-\d{2}-\d{2}\.json$/).reverse();
  const crm = leerCrm();
  const out = [];
  for (const f of archivos) {
    const fecha = f.match(/(\d{4}-\d{2}-\d{2})/)[1];
    const arr = leerJsonSeguro(path.join(DIR_DATA, f), []);
    for (const r of arr.slice().reverse()) {
      const item = {
        fecha,
        hora: r.hora || '',
        numero: r.numero || '',
        texto: String(r.texto || ''),
        tipo: r.tipo || clasificarRespuestaTexto(r.texto),
      };
      item.id = idRespuesta(item);
      const estadoGuardado =
        crm[item.id] && crm[item.id].estado === 'pedido'
          ? 'pedido_probable'
          : crm[item.id] && crm[item.id].estado;
      const estadoAuto = estadoAutomaticoDesdeTipo(item.tipo);
      item.estado = estadoGuardado || estadoAuto;
      item.nota = (crm[item.id] && crm[item.id].nota) || '';
      out.push(item);
      if (out.length >= limite) return out;
    }
  }
  return out;
}

function guardarEstadoCrm(id, estado, nota = '') {
  if (estado === 'pedido') estado = 'pedido_probable';
  if (!ESTADOS_CRM.includes(estado)) throw new Error('Estado CRM inválido.');
  const crm = leerCrm();
  crm[id] = {
    estado,
    nota: String(nota || '').slice(0, 240),
    actualizado: new Date().toISOString(),
  };
  guardarCrm(crm);
  return crm[id];
}

function leerEstadosChats() {
  return leerJsonSeguro(ARCHIVO_CHAT_ESTADOS, {});
}

function guardarEstadoChat(numero, estado, nota = '') {
  if (!numero || !ESTADOS_CRM.includes(estado)) throw new Error('Estado de chat inválido.');
  const estados = leerEstadosChats();
  estados[numero] = {
    estado,
    nota: String(nota || '').slice(0, 240),
    actualizado: new Date().toISOString(),
  };
  escribirJsonSeguro(ARCHIVO_CHAT_ESTADOS, estados);
  return estados[numero];
}

function esCrmAbierto(r) {
  return !['respondido', 'cerrado', 'baja'].includes(r.estado);
}

function construirPlanOperativo() {
  const clientes = leerClientesEnriquecidos();
  const segmentos = resumenSegmentos(clientes);
  const porId = Object.fromEntries(segmentos.map((s) => [s.id, s.total]));
  const respuestas = respuestasRecientes(80);
  const pedidosPendientes = respuestas
    .filter((r) => r.tipo === 'pedido' && esCrmAbierto(r))
    .slice(0, 20);
  const consultas = respuestas.filter((r) => r.tipo === 'consulta' && esCrmAbierto(r)).slice(0, 20);
  const cfg = getConfig();
  const pasos = [
    {
      id: 'pedido',
      titulo: 'Responder pedidos calientes',
      detalle: `${pedidosPendientes.length} respuestas parecen pedido. Revisalas antes de mandar más promo.`,
      accion: 'Ver bandeja',
      tab: 'inicio',
      prioridad: pedidosPendientes.length ? 1 : 4,
    },
    {
      id: 'pidio',
      titulo: 'Campaña para quienes ya pidieron',
      detalle: `${porId.pidio || 0} clientes con señales de pedido. Mensaje corto y directo suele rendir mejor.`,
      segmento: 'pidio',
      accion: 'Preparar segmento',
      prioridad: porId.pidio ? 2 : 5,
    },
    {
      id: 'nuevo',
      titulo: 'Bienvenida a nuevos',
      detalle: `${porId.nuevo || 0} chats nuevos o casi sin envíos. Conviene tono suave.`,
      segmento: 'nuevo',
      accion: 'Preparar segmento',
      prioridad: porId.nuevo ? 3 : 6,
    },
    {
      id: 'frio',
      titulo: 'Recuperar fríos sin castigar el número',
      detalle: `${porId.frio || 0} recibieron varias promos sin responder. Usar solo promo fuerte o pausar.`,
      segmento: 'frio',
      accion: 'Preparar segmento',
      prioridad: porId.frio ? 7 : 8,
    },
  ].sort((a, b) => a.prioridad - b.prioridad);

  return {
    estado: {
      whatsapp: estadoWA.estado,
      motor: { corriendo: motor.corriendo, pausado: motor.pausado },
      config: {
        maxPorCorrida: numeroAcotado(cfg.MAX_POR_CORRIDA, 50, 1, 100),
        maxPorHora: numeroAcotado(cfg.MAX_POR_HORA, 0, 0, 1000),
        ventanaCupoMin: numeroAcotado(cfg.VENTANA_CUPO_MINUTOS, 60, 1, 240),
        delayMinSeg: Math.round(numeroAcotado(cfg.DELAY_MIN_MS, 15000, 0, 300000) / 1000),
        delayMaxSeg: Math.round(numeroAcotado(cfg.DELAY_MAX_MS, 45000, 0, 300000) / 1000),
        programacionActiva: !!cfg.PROGRAMACION_ACTIVA,
      },
    },
    segmentos,
    pasos,
    bandeja: {
      pedidos: pedidosPendientes,
      consultas,
      alertas: respuestas
        .filter((r) => esCrmAbierto(r) && (r.tipo === 'alerta' || r.tipo === 'baja'))
        .slice(0, 20),
      recientes: respuestas.slice(0, 20),
      recordatorios: recordatoriosPendientes(20),
    },
  };
}

function calcularSaludNumero() {
  const cfg = getConfig();
  const ventanaCupoMin = numeroAcotado(cfg.VENTANA_CUPO_MINUTOS, 60, 1, 240);
  const clientes = leerClientesEnriquecidos();
  const segmentos = Object.fromEntries(resumenSegmentos(clientes).map((s) => [s.id, s.total]));
  const enviadosHora = enviosUltimaVentana(ventanaCupoMin).length;
  const enviadosHoy = cargarEnviadosHoy().size;
  const respuestasHoy = leerJsonSeguro(path.join(DIR_DATA, `respuestas-${hoy()}.json`), []);
  const acks = Object.values(leerJsonSeguro(path.join(DIR_DATA, `acks-${hoy()}.json`), {}));
  const leidosHoy = acks.filter((e) => e === 'leido').length;
  const tasaRespuesta = enviadosHoy ? respuestasHoy.length / enviadosHoy : 0;
  const tasaLectura = enviadosHoy ? leidosHoy / enviadosHoy : 0;
  const frioRatio = clientes.length ? (segmentos.frio || 0) / clientes.length : 0;

  let score = 100;
  const maxVentana = numeroAcotado(cfg.MAX_POR_HORA, 0, 0, 1000);
  if (maxVentana > 0 && enviadosHora >= Math.max(1, Math.round(maxVentana * 0.85))) score -= 25;
  if (enviadosHoy > 120) score -= 25;
  if (frioRatio > 0.5) score -= 20;
  if (enviadosHoy > 30 && tasaRespuesta < 0.08) score -= 15;
  if (enviadosHoy > 30 && tasaLectura < 0.25) score -= 10;
  score = Math.max(0, Math.min(100, score));

  const estado = score >= 75 ? 'verde' : score >= 45 ? 'amarillo' : 'rojo';
  const recomendaciones = [];
  if (estado === 'rojo')
    recomendaciones.push('Frenar envíos masivos hoy y trabajar solo pedidos/activos.');
  if (maxVentana > 0 && enviadosHora >= Math.max(1, Math.round(maxVentana * 0.85)))
    recomendaciones.push(
      `Bajar ritmo: estás cerca del límite de ${maxVentana} mensajes cada ${ventanaCupoMin} min.`
    );
  if (frioRatio > 0.5) recomendaciones.push('No enviar a fríos salvo promo fuerte y lote chico.');
  if (respuestasHoy.length)
    recomendaciones.push('Responder la bandeja antes de lanzar otra campaña.');
  if (!recomendaciones.length)
    recomendaciones.push('Ritmo sano: priorizá prueba, pedidos y activos.');

  return {
    score,
    estado,
    enviadosHora,
    enviadosVentana: enviadosHora,
    ventanaCupoMin,
    enviadosHoy,
    respuestasHoy: respuestasHoy.length,
    tasaRespuesta,
    tasaLectura,
    frioRatio,
    recomendaciones,
  };
}

function reporteDelDia() {
  const respuestas = leerJsonSeguro(path.join(DIR_DATA, `respuestas-${hoy()}.json`), []);
  const enviados = cargarEnviadosHoy().size;
  const acks = Object.values(leerJsonSeguro(path.join(DIR_DATA, `acks-${hoy()}.json`), {}));
  const tipos = { pedido: 0, consulta: 0, baja: 0, alerta: 0, ok: 0, otro: 0 };
  for (const r of respuestas)
    tipos[clasificarRespuestaTexto(r.texto)] = (tipos[clasificarRespuestaTexto(r.texto)] || 0) + 1;
  const embudo = embudoVentasDelDia();
  return {
    fecha: hoy(),
    enviados,
    entregados: acks.filter((e) => e === 'entregado' || e === 'leido').length,
    leidos: acks.filter((e) => e === 'leido').length,
    respuestas: respuestas.length,
    tipos,
    embudo,
    salud: calcularSaludNumero(),
    segmentos: resumenSegmentos(leerClientesEnriquecidos()),
  };
}

function embudoVentasDelDia() {
  const respuestas = respuestasRecientes(500).filter((r) => r.fecha === hoy());
  const total = respuestas.length;
  const abiertos = respuestas.filter(esCrmAbierto).length;
  const pedidosProbables = respuestas.filter(
    (r) => r.estado === 'pedido_probable' || r.tipo === 'pedido'
  ).length;
  const respondidos = respuestas.filter((r) => r.estado === 'respondido').length;
  const cerrados = respuestas.filter((r) => r.estado === 'cerrado').length;
  const bajas = respuestas.filter((r) => r.estado === 'baja' || r.tipo === 'baja').length;
  const problemas = respuestas.filter((r) => r.estado === 'problema').length;
  const consultas = respuestas.filter(
    (r) => r.estado === 'consulta' || r.tipo === 'consulta'
  ).length;
  const conversionPedido = total ? Math.round((pedidosProbables / total) * 100) : 0;
  const cierreSobrePedido = pedidosProbables ? Math.round((cerrados / pedidosProbables) * 100) : 0;
  const alertas = [];
  if (pedidosProbables > cerrados)
    alertas.push(`Hay ${pedidosProbables - cerrados} pedidos probables sin cerrar.`);
  if (consultas > respondidos)
    alertas.push('Hay consultas que conviene responder antes de enviar otra promo.');
  if (bajas + problemas > 3)
    alertas.push('Subieron bajas/problemas: revisá presión y mensaje antes de escalar.');
  if (!alertas.length) alertas.push('Embudo ordenado: podés seguir con prueba y campaña chica.');
  return {
    total,
    abiertos,
    pedidosProbables,
    respondidos,
    cerrados,
    consultas,
    bajas,
    problemas,
    conversionPedido,
    cierreSobrePedido,
    alertas,
  };
}

function cierreJornada() {
  const reporte = reporteDelDia();
  const plan = construirPlanOperativo();
  const pendientes = respuestasRecientes(200).filter(esCrmAbierto).slice(0, 30);
  const accionesManana = [];
  if (reporte.embudo.pedidosProbables > reporte.embudo.cerrados)
    accionesManana.push('Primero cerrar pedidos probables pendientes.');
  if ((plan.segmentos.find((s) => s.id === 'pidio_ayer') || {}).total > 0)
    accionesManana.push('Crear campaña corta para pidieron ayer.');
  if ((plan.segmentos.find((s) => s.id === 'nuevo_sin_enviar') || {}).total > 0)
    accionesManana.push('Enviar bienvenida a nuevos sin enviar.');
  if (reporte.salud.estado !== 'verde')
    accionesManana.push('Mantener volumen bajo hasta recuperar respuesta/lectura.');
  if (!accionesManana.length)
    accionesManana.push('Preparar menú del día, prueba y campaña priorizada.');
  return {
    generado: new Date().toISOString(),
    reporte,
    pendientes: pendientes.map((r) => ({
      id: r.id,
      numero: r.numero,
      hora: r.hora,
      texto: r.texto,
      estado: r.estado,
      tipo: r.tipo,
    })),
    accionesManana,
  };
}

function historialCierres(limite = 10) {
  const cierres = leerJsonSeguro(ARCHIVO_CIERRES_DIA, {});
  return Object.entries(cierres)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limite)
    .map(([fecha, cierre]) => ({ fecha, cierre }));
}

function pruebasDelDia() {
  return leerJsonSeguro(ARCHIVO_PRUEBAS, {});
}

function registrarPruebaDelDia(destino) {
  const pruebas = pruebasDelDia();
  pruebas[hoy()] = { destino, fecha: new Date().toISOString() };
  escribirJsonSeguro(ARCHIVO_PRUEBAS, pruebas);
}

function calcularNotificaciones(plan, salud, reporte) {
  const cfg = getConfig();
  const img = buscarImagenPromo();
  const plantilla = fs.existsSync(ARCHIVO_MENSAJE)
    ? fs.readFileSync(ARCHIVO_MENSAJE, 'utf8').trim()
    : '';
  const respuestas = respuestasRecientes(120);
  const pedidosAbiertos = respuestas.filter(
    (r) => esCrmAbierto(r) && (r.estado === 'pedido_probable' || r.tipo === 'pedido')
  ).length;
  const notas = [];
  if (pedidosAbiertos > 0) notas.push(`Hay ${pedidosAbiertos} pedidos probables sin cerrar.`);
  if (!plantilla) notas.push('Falta cargar el mensaje del día.');
  if (!img) notas.push('Falta imagen del día: podés mandar texto, pero conviene revisar antes.');
  if (!pruebasDelDia()[hoy()]) notas.push('Todavía no se envió prueba hoy.');
  if (salud.estado === 'rojo') notas.push('Salud roja: no conviene enviar campañas masivas ahora.');
  if (salud.estado === 'amarillo')
    notas.push('Salud amarilla: bajar volumen y priorizar clientes calientes.');
  if (salud.enviadosVentana >= numeroAcotado(cfg.MAX_POR_HORA, 0, 0, 1000) && cfg.MAX_POR_HORA > 0)
    notas.push(`Ya llegaste a ${cfg.MAX_POR_HORA} mensajes cada ${salud.ventanaCupoMin} min.`);
  if ((plan.segmentos.find((s) => s.id === 'frio') || {}).total > 0 && salud.estado !== 'verde')
    notas.push('No conviene enviar a fríos hoy.');
  if (pedidosAbiertos > 0) notas.push('Hay respuestas calientes: respondé antes de otra campaña.');
  return notas;
}

function construirOperadorDia() {
  const plan = construirPlanOperativo();
  const salud = calcularSaludNumero();
  const reporte = reporteDelDia();
  const plantilla = fs.existsSync(ARCHIVO_MENSAJE)
    ? fs.readFileSync(ARCHIVO_MENSAJE, 'utf8').trim()
    : '';
  const img = buscarImagenPromo();
  const porId = Object.fromEntries(plan.segmentos.map((s) => [s.id, s.total]));
  const respuestas = respuestasRecientes(120);
  const pedidosPendientes = respuestas.filter(
    (r) => esCrmAbierto(r) && (r.estado === 'pedido_probable' || r.tipo === 'pedido')
  ).length;
  const clientesCalientes = (porId.pidio || 0) + (porId.activo || 0);
  const siguiente = pedidosPendientes
    ? 'Responder pedidos probables'
    : !plantilla
      ? 'Cargar mensaje del día'
      : estadoWA.estado !== 'listo'
        ? 'Conectar WhatsApp'
        : !pruebasDelDia()[hoy()]
          ? 'Enviar prueba'
          : salud.estado === 'rojo'
            ? 'Bajar volumen y trabajar CRM'
            : 'Preparar campaña por prioridad';
  return {
    mensajeCargado: !!plantilla,
    imagenCargada: !!img,
    whatsappListo: estadoWA.estado === 'listo',
    pedidosPendientes,
    clientesCalientes,
    proximaAccion: siguiente,
    notificaciones: calcularNotificaciones(plan, salud, reporte),
  };
}

function leerAccionesMasivas() {
  return leerJsonSeguro(ARCHIVO_ACCIONES, []);
}

function guardarAccionesMasivas(arr) {
  escribirJsonSeguro(ARCHIVO_ACCIONES, arr.slice(-50));
}

function muestraAccion(clientes, nums, motivo) {
  const porNumero = new Map(clientes.map((c) => [c.numero, c]));
  return nums.slice(0, 40).map((numero) => {
    const c = porNumero.get(numero) || {};
    return {
      numero,
      nombre: c.nombre || '',
      segmentosAuto: c.segmentosAuto || [],
      enviadosTotal: (c.metricas && c.metricas.enviadosTotal) || 0,
      respondioTotal: (c.metricas && c.metricas.respondioTotal) || 0,
      motivo,
    };
  });
}

function registrarAccionMasiva(accion, numeros, snapshot) {
  const acciones = leerAccionesMasivas();
  const item = {
    id: `accion-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    accion,
    fecha: new Date().toISOString(),
    total: numeros.length,
    numeros,
    snapshot,
    deshecha: false,
  };
  acciones.push(item);
  guardarAccionesMasivas(acciones);
  return item;
}

function deshacerUltimaAccionMasiva() {
  const acciones = leerAccionesMasivas();
  const idx = acciones
    .map((a, i) => ({ a, i }))
    .reverse()
    .find((x) => x.a && !x.a.deshecha);
  if (!idx) throw new Error('No hay acciones masivas para deshacer.');
  const item = idx.a;
  const snapshot = item.snapshot || {};
  if (item.accion === 'excluir_frios_extremos') {
    const excluidos = leerExcluidos();
    for (const [numero, estaba] of Object.entries(snapshot.excluidos || {})) {
      if (estaba) excluidos.add(numero);
      else excluidos.delete(numero);
    }
    guardarExcluidos(excluidos);
  }
  if (
    [
      'pausar_frios_extremos',
      'pausar_sin_respuesta',
      'pausar_otros_paises',
      'reactivar_respondieron',
    ].includes(item.accion)
  ) {
    const pausados = leerPausados();
    for (const [numero, previo] of Object.entries(snapshot.pausados || {})) {
      if (previo) pausados[numero] = previo;
      else delete pausados[numero];
    }
    guardarPausados(pausados);
  }
  acciones[idx.i].deshecha = true;
  acciones[idx.i].deshechaEn = new Date().toISOString();
  guardarAccionesMasivas(acciones);
  return { id: item.id, accion: item.accion, total: item.total };
}

function ejecutarAccionInteligente(accion, opts = {}) {
  const clientes = leerClientesEnriquecidos();
  if (accion === 'excluir_frios_extremos') {
    const nums = clientes
      .filter(
        (c) =>
          (c.segmentosAuto || []).includes('frio') &&
          (c.metricas.enviadosTotal || 0) >= 5 &&
          !(c.metricas.respondioTotal || 0)
      )
      .map((c) => c.numero);
    if (opts.dryRun)
      return {
        accion,
        total: nums.length,
        preview: true,
        muestra: muestraAccion(clientes, nums, 'frío extremo sin respuestas'),
      };
    const excluidos = leerExcluidos();
    const snapshot = { excluidos: Object.fromEntries(nums.map((n) => [n, excluidos.has(n)])) };
    for (const n of nums) excluidos.add(n);
    guardarExcluidos(excluidos);
    const registro = registrarAccionMasiva(accion, nums, snapshot);
    return { accion, total: nums.length, accionId: registro.id };
  }
  if (accion === 'pausar_frios_extremos') {
    const nums = clientes
      .filter(
        (c) =>
          (c.segmentosAuto || []).includes('frio') &&
          (c.metricas.enviadosTotal || 0) >= 5 &&
          !(c.metricas.respondioTotal || 0)
      )
      .map((c) => c.numero);
    if (opts.dryRun)
      return {
        accion,
        total: nums.length,
        preview: true,
        muestra: muestraAccion(clientes, nums, 'frío extremo sin respuestas'),
      };
    const pausados = leerPausados();
    const snapshot = { pausados: Object.fromEntries(nums.map((n) => [n, pausados[n] || null])) };
    const result = pausarNumeros(nums, 7, 'frío extremo sin respuestas');
    const registro = registrarAccionMasiva(accion, nums, snapshot);
    return { accion, ...result, accionId: registro.id };
  }
  if (accion === 'pausar_sin_respuesta') {
    const nums = clientes
      .filter((c) => (c.metricas.enviadosTotal || 0) >= 3 && !(c.metricas.respondioTotal || 0))
      .map((c) => c.numero);
    if (opts.dryRun)
      return {
        accion,
        total: nums.length,
        preview: true,
        muestra: muestraAccion(clientes, nums, 'sin respuesta tras varias promos'),
      };
    const pausados = leerPausados();
    const snapshot = { pausados: Object.fromEntries(nums.map((n) => [n, pausados[n] || null])) };
    const result = pausarNumeros(nums, 7, 'sin respuesta tras varias promos');
    const registro = registrarAccionMasiva(accion, nums, snapshot);
    return { accion, ...result, accionId: registro.id };
  }
  if (accion === 'reactivar_respondieron') {
    const nums = clientes
      .filter((c) => c.pausado && (c.metricas.respondioTotal || 0) > 0)
      .map((c) => c.numero);
    if (opts.dryRun)
      return {
        accion,
        total: nums.length,
        preview: true,
        muestra: muestraAccion(clientes, nums, 'respondió estando pausado'),
      };
    const pausados = leerPausados();
    const snapshot = { pausados: Object.fromEntries(nums.map((n) => [n, pausados[n] || null])) };
    const result = reactivarNumeros(nums);
    const registro = registrarAccionMasiva(accion, nums, snapshot);
    return { accion, ...result, accionId: registro.id };
  }
  if (accion === 'pausar_otros_paises') {
    const nums = clientes
      .filter((c) => (c.segmentosAuto || []).includes('otro_pais'))
      .map((c) => c.numero);
    if (opts.dryRun)
      return {
        accion,
        total: nums.length,
        preview: true,
        muestra: muestraAccion(clientes, nums, 'otro país'),
      };
    const pausados = leerPausados();
    const snapshot = { pausados: Object.fromEntries(nums.map((n) => [n, pausados[n] || null])) };
    const result = pausarNumeros(nums, 30, 'otro país');
    const registro = registrarAccionMasiva(accion, nums, snapshot);
    return { accion, ...result, accionId: registro.id };
  }
  throw new Error('Acción inteligente no soportada.');
}

// ---------- Clasificación de teléfonos (país y característica) ----------

const AREAS_AR = {
  11: 'CABA / GBA',
  220: 'Moreno/Merlo',
  221: 'La Plata',
  222: 'Zona Sur GBA',
  223: 'Mar del Plata',
  230: 'Zona Oeste GBA',
  232: 'Zona Sur GBA',
  234: 'Zona Norte GBA',
  236: 'Junín/9 de Julio',
  261: 'Mendoza',
  263: 'Mendoza Sur',
  264: 'San Juan',
  266: 'San Luis',
  280: 'Pto. Madryn',
  290: 'Ushuaia/Río Grande',
  294: 'Bariloche',
  297: 'Comodoro Rivadavia',
  299: 'Neuquén',
  341: 'Rosario',
  342: 'Santa Fe',
  343: 'Paraná',
  345: 'Concordia',
  346: 'Gualeguaychú',
  351: 'Córdoba',
  353: 'Villa María',
  354: 'Córdoba Norte',
  358: 'Río Cuarto',
  362: 'Resistencia',
  364: 'Sgo. del Estero (norte)',
  370: 'Formosa',
  376: 'Posadas',
  379: 'Corrientes',
  380: 'La Rioja',
  381: 'Tucumán capital',
  383: 'Catamarca',
  385: 'Sgo. del Estero',
  387: 'Salta',
  388: 'Jujuy',
  3862: 'Trancas',
  3863: 'Monteros',
  3865: 'Concepción',
  3867: 'Tafí del Valle',
  3869: 'Aguilares',
  3886: 'S.S. de Jujuy (interior)',
  3876: 'Salta (interior)',
  3885: 'La Quiaca',
  3837: 'Catamarca (interior)',
  3822: 'La Rioja (interior)',
  3854: 'Sgo. del Estero (interior)',
};

const PAISES_CONOCIDOS = [
  ['1', 'EE.UU. / Canadá'],
  ['7', 'Rusia'],
  ['20', 'Egipto'],
  ['27', 'Sudáfrica'],
  ['30', 'Grecia'],
  ['31', 'Países Bajos'],
  ['32', 'Bélgica'],
  ['33', 'Francia'],
  ['34', 'España'],
  ['39', 'Italia'],
  ['40', 'Rumania'],
  ['41', 'Suiza'],
  ['43', 'Austria'],
  ['44', 'Reino Unido'],
  ['45', 'Dinamarca'],
  ['46', 'Suecia'],
  ['47', 'Noruega'],
  ['48', 'Polonia'],
  ['49', 'Alemania'],
  ['51', 'Perú'],
  ['52', 'México'],
  ['53', 'Cuba'],
  ['55', 'Brasil'],
  ['56', 'Chile'],
  ['57', 'Colombia'],
  ['58', 'Venezuela'],
  ['591', 'Bolivia'],
  ['593', 'Ecuador'],
  ['595', 'Paraguay'],
  ['598', 'Uruguay'],
  ['506', 'Costa Rica'],
  ['507', 'Panamá'],
  ['502', 'Guatemala'],
  ['503', 'El Salvador'],
  ['504', 'Honduras'],
  ['505', 'Nicaragua'],
  ['1809', 'Rep. Dominicana'],
  ['1829', 'Rep. Dominicana'],
  ['1849', 'Rep. Dominicana'],
  ['86', 'China'],
  ['91', 'India'],
  ['90', 'Turquía'],
  ['972', 'Israel'],
  ['971', 'Emiratos'],
];

function clasificarTelefono(tel) {
  const vacio = { pais: null, paisNombre: 'Sin número', area: null, areaNombre: null };
  if (!tel || !/^\d{8,15}$/.test(tel)) return vacio;
  if (tel.startsWith('54')) {
    let resto = tel.slice(2);
    if (resto.startsWith('9')) resto = resto.slice(1); // celulares: 54 9 <área> <número>
    for (const len of [4, 3, 2]) {
      const cand = resto.slice(0, len);
      if (AREAS_AR[cand]) {
        return { pais: '54', paisNombre: 'Argentina', area: cand, areaNombre: AREAS_AR[cand] };
      }
    }
    return {
      pais: '54',
      paisNombre: 'Argentina',
      area: resto.slice(0, 3),
      areaNombre: `AR (${resto.slice(0, 3)})`,
    };
  }
  for (const [pref, nombre] of PAISES_CONOCIDOS) {
    if (tel.startsWith(pref))
      return { pais: pref, paisNombre: nombre, area: null, areaNombre: null };
  }
  return { pais: 'otro', paisNombre: 'Otro país', area: null, areaNombre: null };
}

// ---------- SSE (eventos en vivo al navegador) ----------

const sseClientes = new Set();
function emit(evento, data) {
  const payload = `event: ${evento}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClientes) {
    try {
      res.write(payload);
    } catch (e) {
      /* cliente desconectado */
    }
  }
}

// ---------- Cliente WhatsApp (único, persistente) ----------

let client = null;
let estadoWA = { estado: 'iniciando', qr: null };

function iniciarWhatsApp() {
  if (client) {
    try {
      client.destroy();
    } catch (e) {
      /* ignorar */
    }
  }
  estadoWA = { estado: 'iniciando', qr: null };
  emit('estado', estadoWA);

  try {
    liberarSesionWhatsApp((msg) => registrarLog(`⚙️ ${msg}`));
  } catch (e) {
    estadoWA = { estado: 'error', qr: null, detalle: e.message };
    emit('estado', estadoWA);
    registrarLog(`❌ ${e.message}`);
    return;
  }

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_AUTH_PATH }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(BROWSER_EXECUTABLE ? { executablePath: BROWSER_EXECUTABLE } : {}),
    },
    ...(configBase.WA_WEB_VERSION ? { webVersion: configBase.WA_WEB_VERSION } : {}),
  });

  client.on('qr', async (qr) => {
    try {
      const dataUrl = await QRCode.toDataURL(qr, { scale: 6, margin: 2 });
      estadoWA = { estado: 'qr', qr: dataUrl };
    } catch (e) {
      estadoWA = { estado: 'qr', qr: null };
    }
    emit('estado', estadoWA);
  });

  client.on('authenticated', () => registrarLog('✅ Sesión autenticada.'));
  client.on('loading_screen', (pct) => console.log(`WhatsApp cargando: ${pct}%`));
  client.on('change_state', (st) => console.log(`WhatsApp estado: ${st}`));

  client.on('ready', () => {
    estadoWA = { estado: 'listo', qr: null };
    emit('estado', estadoWA);
    registrarLog('✅ WhatsApp listo (panel web).');
  });

  client.on('auth_failure', (msg) => {
    estadoWA = { estado: 'error', qr: null, detalle: String(msg) };
    emit('estado', estadoWA);
    registrarLog(`❌ Falló la autenticación: ${msg}`);
  });

  client.on('disconnected', (reason) => {
    estadoWA = { estado: 'desconectado', qr: null, detalle: String(reason) };
    emit('estado', estadoWA);
    registrarLog(`⚠️ WhatsApp desconectado: ${reason}. Reconectando en 5s...`);
    setTimeout(iniciarWhatsApp, 5000);
  });

  client.on('message', (msg) => {
    // Los estados de WhatsApp llegan como mensajes de status@broadcast: no son respuestas.
    if (msg.from === 'status@broadcast' || msg.isStatus) return;
    if (!msg.fromMe) {
      registrarRespuesta(msg);
      const tipo = clasificarRespuestaTexto(msg.body);
      emit('respuesta', {
        numero: msg.from,
        texto: (msg.body || '').slice(0, 80),
        tipo,
        estado: estadoAutomaticoDesdeTipo(tipo),
      });
    }
    manejarEntrante(msg).catch((e) =>
      registrarLog(`⚠️ Error procesando mensaje entrante: ${e.message}`)
    );
  });

  client.on('message_ack', (msg, ack) => {
    const destino = msg.to || msg.from;
    const estado = ack >= 3 ? 'leido' : ack >= 2 ? 'entregado' : 'enviado';
    acksDelDia().set(destino, estado);
    persistirAcks();
    emit('ack', { numero: destino, estado });
  });

  Promise.resolve(client.initialize()).catch((e) => {
    estadoWA = { estado: 'error', qr: null, detalle: e.message };
    emit('estado', estadoWA);
    registrarLog(`❌ No se pudo iniciar WhatsApp: ${e.message}`);
    console.error(
      '❌ No se pudo iniciar WhatsApp. Si dice que el navegador ya está corriendo, cerrá la otra instancia del panel/script.'
    );
  });
}

// ---------- Motor de envío ----------

const motor = {
  corriendo: false,
  pausado: false,
  detener: false,
  stats: { total: 0, hechos: 0, ok: 0, fallidos: 0, simulacro: false },
};

let confirmacionCampana = null;

function emitirMotor() {
  emit('motor', { corriendo: motor.corriendo, pausado: motor.pausado, stats: motor.stats });
}

function calcularObjetivoCampana(config, opciones = {}) {
  const clientes = leerClientesEnriquecidos();
  const excluidos = leerExcluidos();
  const pausados = leerPausados();
  const enviadosHoy = config.NO_REPETIR_MISMO_DIA ? cargarEnviadosHoy() : new Set();
  const segmento = String(opciones.segmento || '');
  const grupoId = segmento.startsWith('grupo:')
    ? segmento.slice(6)
    : String(opciones.grupoId || '');
  const grupo = grupoId ? grupoEnvioPorId(grupoId) : null;
  const forzarFriosRecientes = !!opciones.forzarFriosRecientes;
  const candidatos = grupo
    ? clientes.filter((c) => grupo.numeros.includes(c.numero))
    : segmento
      ? clientes.filter((c) => (c.segmentosAuto || []).includes(segmento))
      : ordenarPorPrioridadCampana(clientes);
  const pendientes = ordenarPorPrioridadCampana(
    candidatos.filter((c) => {
      if (excluidos.has(c.numero) || pausados[c.numero] || enviadosHoy.has(c.numero)) return false;
      if (
        (c.segmentosAuto || []).includes('frio') &&
        fueEnviadoDesde(c.numero, 7) &&
        !forzarFriosRecientes
      )
        return false;
      if (
        (segmento === 'nuevo' || segmento === 'nuevo_sin_enviar') &&
        (c.metricas.enviadosTotal || 0) > 0
      )
        return false;
      return true;
    })
  );
  const infoLimite = limiteHoy(config);
  const modoTandas = !!config.MODO_TANDAS;
  const tamanoTanda = numeroAcotado(config.MAX_POR_CORRIDA, 50, 1, 100);
  const totalDia = infoLimite.calentamiento
    ? Math.min(pendientes.length, infoLimite.limite)
    : modoTandas
      ? pendientes.length
      : Math.min(pendientes.length, tamanoTanda);
  return {
    clientes,
    candidatos,
    pendientes,
    objetivo: pendientes.slice(0, totalDia),
    infoLimite,
    modoTandas,
    tamanoTanda,
    segmento,
    forzarFriosRecientes,
  };
}

function crearResumenCampana(simulacro, opciones = {}) {
  const config = getConfig();
  const calc = calcularObjetivoCampana(config, opciones);
  const salud = calcularSaludNumero();
  const esperaTandaMin = numeroAcotado(config.ESPERA_ENTRE_TANDAS_MINUTOS, 20, 5, 240);
  const delayMin = numeroAcotado(config.DELAY_MIN_MS, 15000, 0, 300000);
  const delayMax = Math.max(delayMin, numeroAcotado(config.DELAY_MAX_MS, 45000, 0, 300000));
  const totalTandas = Math.max(1, Math.ceil(calc.objetivo.length / calc.tamanoTanda));
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const resumen = {
    token,
    vence: Date.now() + 10 * 60 * 1000,
    simulacro: !!simulacro,
    segmento: calc.segmento || '',
    forzarFriosRecientes: !!calc.forzarFriosRecientes,
    totalClientes: calc.clientes.length,
    candidatos: calc.candidatos.length,
    pendientes: calc.pendientes.length,
    total: calc.objetivo.length,
    muestra: calc.objetivo.slice(0, 12).map((c) => ({
      numero: c.numero,
      nombre: c.nombre || '',
      segmentosAuto: c.segmentosAuto || [],
      scoreAuto: c.scoreAuto || 0,
      metricas: c.metricas || {},
    })),
    config: {
      delayMinSeg: Math.round(delayMin / 1000),
      delayMaxSeg: Math.round(delayMax / 1000),
      maxPorCorrida: calc.tamanoTanda,
      modoTandas: calc.modoTandas,
      tandas: totalTandas,
      esperaTandaMin,
      maxPorHora: numeroAcotado(config.MAX_POR_HORA, 0, 0, 1000),
      ventanaCupoMin: numeroAcotado(config.VENTANA_CUPO_MINUTOS, 60, 1, 240),
      noRepetir: config.NO_REPETIR_MISMO_DIA !== false,
    },
    calentamiento: calc.infoLimite,
    salud,
    prioridad: calc.segmento ? [calc.segmento] : PRIORIDAD_CAMPANA,
  };
  confirmacionCampana = resumen;
  return resumen;
}

function validarConfirmacion(token, simulacro) {
  if (!confirmacionCampana || confirmacionCampana.token !== token) return false;
  if (confirmacionCampana.simulacro !== !!simulacro) return false;
  if (confirmacionCampana.vence < Date.now()) return false;
  return true;
}

async function correrEnvio(simulacro, opciones = {}) {
  const config = getConfig();
  const DELAY_MIN = numeroAcotado(config.DELAY_MIN_MS, 15000, 0, 300000);
  const DELAY_MAX = Math.max(DELAY_MIN, numeroAcotado(config.DELAY_MAX_MS, 45000, 0, 300000));

  const plantillas = cargarPlantillas();
  const mapaTags = leerEtiquetas();
  const calc = calcularObjetivoCampana(config, opciones);
  const enviadosHoy = config.NO_REPETIR_MISMO_DIA ? cargarEnviadosHoy() : new Set();
  const pendientes = calc.pendientes;
  const infoLimite = calc.infoLimite;
  const modoTandas = calc.modoTandas;
  const tamanoTanda = calc.tamanoTanda;
  const objetivo = calc.objetivo;
  const totalTandas = Math.max(1, Math.ceil(objetivo.length / tamanoTanda));
  const esperaTandaMs = numeroAcotado(config.ESPERA_ENTRE_TANDAS_MINUTOS, 20, 5, 240) * 60 * 1000;

  let medias = [];
  let pdfMedia = null;
  if (!simulacro) {
    for (const imgPath of buscarImagenesPromo()) {
      try {
        medias.push(MessageMedia.fromFilePath(imgPath));
      } catch (e) {
        registrarLog(`⚠️ No se pudo cargar la imagen ${path.basename(imgPath)}: ${e.message}`);
      }
    }
    if (medias.length > 1) registrarLog(`🖼️ Se enviarán ${medias.length} imágenes por contacto.`);
    const pdfPath = path.join(ROOT, 'menu.pdf');
    if (config.ADJUNTAR_PDF !== false && fs.existsSync(pdfPath)) {
      try {
        pdfMedia = MessageMedia.fromFilePath(pdfPath);
        registrarLog('📄 Se adjuntará el menú en PDF (menu.pdf).');
      } catch (e) {
        registrarLog(`⚠️ No se pudo cargar el PDF: ${e.message}`);
      }
    }
  }

  motor.stats = {
    total: objetivo.length,
    hechos: 0,
    ok: 0,
    fallidos: 0,
    simulacro,
    tandas: totalTandas,
  };
  const campana = crearCampanaPersistente(simulacro, { segmento: calc.segmento }, objetivo, config);
  registrarLog(
    `${simulacro ? '[SIMULACRO] ' : ''}Corrida iniciada desde el panel. Campaña: ${campana.id} | Pendientes: ${pendientes.length} | Esta corrida: ${objetivo.length}` +
      (calc.segmento ? ` | Segmento: ${calc.segmento}` : '') +
      (modoTandas && totalTandas > 1
        ? ` | 📦 ${totalTandas} tandas de ~${tamanoTanda} con ${Math.round(esperaTandaMs / 60000)} min de espera entre ellas`
        : '') +
      (infoLimite.calentamiento
        ? ` | 🔥 Calentamiento: techo de hoy ${infoLimite.limite} (día ${infoLimite.diasPrevios + 1})`
        : '')
  );
  emitirMotor();

  const inicio = Date.now();
  const promedioDelay = (DELAY_MIN + DELAY_MAX) / 2;

  for (let i = 0; i < objetivo.length; i++) {
    // Pausa / detener
    while (motor.pausado && !motor.detener) await esperar(500);
    if (motor.detener) break;

    // ⏳ Espera LARGA entre tandas (cada tamanoTanda mensajes)
    if (i > 0 && i % tamanoTanda === 0) {
      const tandaNueva = Math.floor(i / tamanoTanda) + 1;
      if (simulacro) {
        emit('tanda', { tipo: 'inicio', actual: tandaNueva, total: totalTandas });
      } else {
        const minutos = Math.round(esperaTandaMs / 60000);
        registrarLog(
          `📦 Tanda ${tandaNueva - 1}/${totalTandas} completa. Esperando ${minutos} min antes de la tanda ${tandaNueva}...`
        );
        emit('tanda', { tipo: 'espera', actual: tandaNueva, total: totalTandas, minutos });
        // Espera en pasos cortos para respetar pausa/detener
        let restanteSeg = minutos * 60;
        let avisado = false;
        while (restanteSeg > 0 && !motor.detener) {
          while (motor.pausado && !motor.detener) await esperar(1000);
          const paso = Math.min(15, restanteSeg);
          await esperar(paso * 1000);
          restanteSeg -= paso;
          if (!avisado && restanteSeg <= 60) {
            avisado = true;
            emit('tanda', {
              tipo: 'retoma',
              actual: tandaNueva,
              total: totalTandas,
              segundos: restanteSeg,
            });
          }
        }
        if (motor.detener) break;
        registrarLog(`📦 Arranca la tanda ${tandaNueva}/${totalTandas}.`);
        emit('tanda', { tipo: 'inicio', actual: tandaNueva, total: totalTandas });
      }
    }

    const cliente = objetivo[i];
    const tagsCliente = tagsParaPlantilla(cliente, mapaTags);
    const mensaje = armarMensaje(plantillaPara(tagsCliente, plantillas), cliente.nombre, config);
    const etiqueta = `${cliente.numero} (${cliente.nombre || 'sin nombre'})`;

    // 🛡️ Límite por ventana: si no hay cupo, esperar a que lo haya
    const maxHora = numeroAcotado(config.MAX_POR_HORA, 0, 0, 1000);
    const ventanaCupoMin = numeroAcotado(config.VENTANA_CUPO_MINUTOS, 60, 1, 240);
    if (maxHora > 0 && !simulacro) {
      let esperaMin = minutosHastaCupoHora(maxHora, ventanaCupoMin);
      while (esperaMin > 0 && !motor.detener) {
        registrarLog(
          `🛡️ Cupo de ${maxHora} mensajes cada ${ventanaCupoMin} min lleno. Esperando ~${esperaMin} min…`
        );
        emit('espera', {
          tipo: 'cupo',
          segundos: esperaMin * 60,
          max: maxHora,
          ventanaMin: ventanaCupoMin,
        });
        let rest = esperaMin * 60;
        while (rest > 0 && !motor.detener) {
          while (motor.pausado && !motor.detener) await esperar(1000);
          const paso = Math.min(15, rest);
          await esperar(paso * 1000);
          rest -= paso;
        }
        esperaMin = minutosHastaCupoHora(maxHora, ventanaCupoMin);
      }
      if (motor.detener) break;
    }

    if (simulacro) {
      motor.stats.ok++;
      campana.destinatarios[i].estado = 'simulado';
      campana.stats.ok = motor.stats.ok;
      guardarCampana(campana);
      emit('progreso', {
        i: i + 1,
        total: objetivo.length,
        etiqueta,
        sim: true,
        mensaje,
        etaMs: (objetivo.length - 1 - i) * 250,
      });
      motor.stats.hechos++;
      emitirMotor();
      await esperar(250);
      continue;
    }

    let exito = false;
    let ultimoError = null;
    const reintentos = numeroAcotado(config.REINTENTOS, 0, 0, 3);
    for (let intento = 0; intento <= reintentos && !exito; intento++) {
      try {
        if (medias.length)
          await client.sendMessage(cliente.numero, medias[0], { caption: mensaje });
        else await client.sendMessage(cliente.numero, mensaje);
        exito = true;
      } catch (err) {
        ultimoError = err;
        if (esErrorSesionFatal(err)) {
          motor.detener = true;
          registrarLog(
            `⛔ Error fatal de sesión. Corrida detenida para no duplicar ni insistir: ${err.message}`
          );
          break;
        }
        if (intento < reintentos) await esperar(10000);
      }
    }

    // Imágenes 2da en adelante: van como mensajes separados, con pausita para que
    // lleguen en orden. Fuera del bucle de reintentos para no duplicar la 1ra.
    if (exito && medias.length > 1) {
      for (let k = 1; k < medias.length && !motor.detener; k++) {
        try {
          await esperar(1500 + Math.random() * 2000);
          await client.sendMessage(cliente.numero, medias[k]);
        } catch (e) {
          registrarLog(`⚠️ La imagen ${k + 1} no llegó a ${etiqueta}: ${e.message}`);
          if (esErrorSesionFatal(e)) {
            motor.detener = true;
            registrarLog(`⛔ Error fatal enviando imagen. Corrida detenida: ${e.message}`);
            break;
          }
        }
      }
    }

    // Si hay PDF del menú, va como segundo mensaje (con pausita para que llegue ordenado)
    if (exito && pdfMedia) {
      try {
        await esperar(2000 + Math.random() * 2000);
        await client.sendMessage(cliente.numero, pdfMedia);
      } catch (e) {
        registrarLog(`⚠️ El PDF no llegó a ${etiqueta}: ${e.message}`);
        if (esErrorSesionFatal(e)) {
          motor.detener = true;
          registrarLog(`⛔ Error fatal enviando PDF. Corrida detenida: ${e.message}`);
        }
      }
    }

    if (exito) {
      motor.stats.ok++;
      enviadosHoy.add(cliente.numero);
      guardarEnviadosHoy(enviadosHoy);
      registrarEnvioHora();
      campana.destinatarios[i].estado = 'enviado';
      campana.stats.ok = motor.stats.ok;
      registrarLog(`OK  ${i + 1}/${objetivo.length}  ${etiqueta}`);
    } else {
      motor.stats.fallidos++;
      campana.destinatarios[i].estado =
        motor.detener && esErrorSesionFatal(ultimoError) ? 'detenido' : 'fallido';
      campana.destinatarios[i].error = String((ultimoError && ultimoError.message) || '');
      campana.stats.fallidos = motor.stats.fallidos;
      registrarLog(
        `ERROR  ${i + 1}/${objetivo.length}  ${etiqueta}  ->  ${ultimoError && ultimoError.message}`
      );
    }
    guardarCampana(campana);
    motor.stats.hechos++;
    emit('progreso', {
      i: i + 1,
      total: objetivo.length,
      etiqueta,
      ok: exito,
      error: exito ? null : String(ultimoError && ultimoError.message),
      etaMs:
        (objetivo.length - 1 - i) * promedioDelay +
        Math.floor((objetivo.length - 1 - i) / tamanoTanda) * esperaTandaMs,
    });
    emitirMotor();

    if (motor.detener) break;

    // Pausa larga cada N mensajes
    const cada = numeroAcotado(config.PAUSA_LARGA_CADA, 0, 0, 500);
    if (cada > 0 && (i + 1) % cada === 0 && i < objetivo.length - 1) {
      const pausaSeg = numeroAcotado(config.PAUSA_LARGA_SEGUNDOS, 120, 30, 3600);
      emit('espera', { tipo: 'larga', segundos: pausaSeg });
      await esperar(pausaSeg * 1000);
      continue;
    }

    if (i < objetivo.length - 1) {
      const espera = Math.floor(Math.random() * (DELAY_MAX - DELAY_MIN + 1)) + DELAY_MIN;
      if (espera > 0) {
        emit('espera', { tipo: 'normal', segundos: Math.round(espera / 1000) });
        await esperar(espera);
      }
    }
  }

  const detenido = motor.detener;
  const total = Math.round((Date.now() - inicio) / 1000);
  campana.fin = new Date().toISOString();
  campana.estado = detenido ? 'detenida' : 'finalizada';
  campana.stats = { total: motor.stats.total, ok: motor.stats.ok, fallidos: motor.stats.fallidos };
  guardarCampana(campana);
  motor.corriendo = false;
  motor.pausado = false;
  motor.detener = false;
  registrarLog(
    `Corrida finalizada${detenido ? ' (detenida manualmente)' : ''}. Exitosos: ${motor.stats.ok} | Fallidos: ${motor.stats.fallidos} | Duración: ${total}s`
  );
  emit('fin', { ...motor.stats, detenido, duracionSeg: total });
  emitirMotor();
}

// ---------- Análisis de números (LID → teléfono, país, característica, empresa) ----------

const analisis = { corriendo: false, hechos: 0, total: 0, resumen: null };

async function correrAnalisis(limite) {
  let clientes;
  try {
    clientes = JSON.parse(fs.readFileSync(ARCHIVO_CLIENTES, 'utf8'));
  } catch (e) {
    registrarLog('❌ No hay lista de clientes para analizar.');
    return;
  }
  const objetivo = limite > 0 ? clientes.slice(0, limite) : clientes;
  analisis.corriendo = true;
  analisis.hechos = 0;
  analisis.total = objetivo.length;
  registrarLog(`🔍 Analizando ${objetivo.length} números (país, característica, nombre)…`);
  emit('analisis', { tipo: 'inicio', total: analisis.total });

  const TAM = 10;
  for (let i = 0; i < objetivo.length; i += TAM) {
    const lote = objetivo.slice(i, i + TAM);
    try {
      const resultados = await client.pupPage.evaluate(
        async (ids) => {
          const salida = [];
          for (const userId of ids) {
            try {
              const r = await window.WWebJS.enforceLidAndPnRetrieval(userId);
              let nombre = '';
              let negocio = false;
              try {
                const wid = r.lid || r.phone;
                const c = wid && window.require('WAWebCollections').Contact.get(wid);
                if (c) {
                  nombre = c.pushname || c.name || c.verifiedName || '';
                  negocio = !!(c.isBusiness || c.isEnterprise);
                }
              } catch (e) {
                /* sin datos de contacto */
              }
              salida.push({
                id: userId,
                pn: r.phone ? r.phone._serialized : null,
                nombre,
                negocio,
              });
            } catch (e) {
              salida.push({ id: userId, pn: null, nombre: '', negocio: false });
            }
          }
          return salida;
        },
        lote.map((c) => c.numero)
      );

      resultados.forEach((r, idx) => {
        const cli = lote[idx];
        if (!cli || r.id !== cli.numero) return;
        const tel = r.pn ? String(r.pn).replace(/@.*/, '').replace(/\D/g, '') : null;
        cli.telefono = tel || null;
        const cl = clasificarTelefono(tel);
        cli.pais = cl.pais;
        cli.paisNombre = cl.paisNombre;
        cli.area = cl.area;
        cli.areaNombre = cl.areaNombre;
        if (r.negocio) cli.negocio = true;
        else delete cli.negocio;
        const nombreActual = (cli.nombre || '').trim();
        if (r.nombre && nombreActual.length <= 2) cli.nombre = r.nombre;
        cli.analizado = true;
        analisis.hechos++;
      });
      fs.writeFileSync(ARCHIVO_CLIENTES, JSON.stringify(clientes, null, 2));
    } catch (e) {
      registrarLog(`⚠️ Un lote del análisis falló (${e.message}); sigue el próximo.`);
    }
    emit('analisis', { tipo: 'progreso', hechos: analisis.hechos, total: analisis.total });
    if (i + TAM < objetivo.length) await esperar(1200);
  }

  analisis.corriendo = false;
  const resumen = { AR: 0, noAR: 0, sinNumero: 0, negocios: 0, areas: {} };
  for (const c of clientes) {
    if (!c.analizado) continue;
    if (c.negocio) resumen.negocios++;
    if (!c.telefono) {
      resumen.sinNumero++;
      continue;
    }
    if (c.pais === '54') {
      resumen.AR++;
      const a = c.areaNombre || 'Otra';
      resumen.areas[a] = (resumen.areas[a] || 0) + 1;
    } else {
      resumen.noAR++;
    }
  }
  analisis.resumen = resumen;
  registrarLog(
    `🔍 Análisis listo: ${resumen.AR} argentinos · ${resumen.noAR} de otros países · ${resumen.sinNumero} sin número visible · ${resumen.negocios} cuentas de empresa.`
  );
  emit('analisis', { tipo: 'fin', resumen });
}

// ---------- Fotos de perfil ----------

const fotosJob = { corriendo: false, hechos: 0, total: 0 };
const DIR_FOTOS = path.join(ROOT, 'data', 'fotos');

function nombreArchivoFoto(numero) {
  return numero.replace(/[^a-zA-Z0-9]/g, '_') + '.jpg';
}

async function descargarBuffer(url, destino) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length < 200) throw new Error('imagen vacía');
  fs.writeFileSync(destino, buf);
}

async function obtenerFotoPerfil(numero) {
  return client.pupPage.evaluate(async (contactId) => {
    try {
      const wid = window.require('WAWebWidFactory').createWid(contactId);
      const result = await window.require('WAWebFindChatAction').findOrCreateLatestChat(wid);
      const chat = result && (result.chat || result);
      if (!chat) return null;
      const profilePic = await window
        .require('WAWebContactProfilePicThumbBridge')
        .requestProfilePicFromServer(chat);
      return profilePic && profilePic.eurl ? profilePic.eurl : null;
    } catch (error) {
      if (error && error.name === 'ServerStatusCodeError') return null;
      return null;
    }
  }, numero);
}

async function correrFotos() {
  let clientes;
  try {
    clientes = JSON.parse(fs.readFileSync(ARCHIVO_CLIENTES, 'utf8'));
  } catch (e) {
    return;
  }
  fs.mkdirSync(DIR_FOTOS, { recursive: true });
  const pendientes = clientes.filter(
    (c) => !c.foto || !fs.existsSync(path.join(DIR_FOTOS, c.foto))
  );
  fotosJob.corriendo = true;
  fotosJob.hechos = 0;
  fotosJob.total = pendientes.length;
  registrarLog(`📸 Descargando fotos de perfil (${pendientes.length} pendientes)…`);
  emit('fotos', { tipo: 'inicio', total: fotosJob.total });

  let conFoto = 0;
  for (const c of pendientes) {
    try {
      const url = await Promise.race([
        obtenerFotoPerfil(c.numero),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout foto')), 12000)),
      ]);
      if (url) {
        const archivo = nombreArchivoFoto(c.numero);
        await descargarBuffer(url, path.join(DIR_FOTOS, archivo));
        c.foto = archivo;
        conFoto++;
      } else {
        delete c.foto;
      }
    } catch (e) {
      delete c.foto;
    }
    fotosJob.hechos++;
    if (fotosJob.hechos % 10 === 0) {
      fs.writeFileSync(ARCHIVO_CLIENTES, JSON.stringify(clientes, null, 2));
      emit('fotos', { tipo: 'progreso', hechos: fotosJob.hechos, total: fotosJob.total });
    }
    await esperar(400);
  }

  fs.writeFileSync(ARCHIVO_CLIENTES, JSON.stringify(clientes, null, 2));
  fotosJob.corriendo = false;
  registrarLog(
    `📸 Fotos listas: ${conFoto} con foto · ${fotosJob.total - conFoto} sin foto visible (privacidad).`
  );
  emit('fotos', { tipo: 'fin', conFoto, sinFoto: fotosJob.total - conFoto });
}

// ---------- API ----------

const app = express();
app.use(express.json({ limit: '25mb' }));

function esLoopback(ip) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
}

function esOrigenLocal(valor) {
  if (!valor) return true;
  try {
    const u = new URL(valor);
    return (
      ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname) &&
      String(u.port || '80') === String(PORT)
    );
  } catch (e) {
    return false;
  }
}

// ---------- Panel de Modo Sabor ----------
// Local-only por defecto. Los orígenes adicionales son opt-in por entorno.
const ORIGENES_PANEL = new Set(
  [
    'http://localhost:3867',
    'http://127.0.0.1:3867',
    'http://localhost:5173', // Vite en desarrollo
    'http://127.0.0.1:5173',
    ...String(process.env.ORIGENES_PANEL || '')
      .split(',')
      .map((x) => x.trim()),
  ].filter(Boolean)
);

function origenAutorizado(valor) {
  if (esOrigenLocal(valor)) return true;
  try {
    return ORIGENES_PANEL.has(new URL(valor).origin);
  } catch (e) {
    return false;
  }
}

function proxyAutorizado(req) {
  const recibido = String(req.headers['x-masivos-proxy-token'] || '');
  if (!PANEL_PROXY_TOKEN || !recibido) return false;
  const expected = Buffer.from(PANEL_PROXY_TOKEN);
  const actual = Buffer.from(recibido);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache');

  // El navegador exige que el origen se devuelva tal cual, uno solo: con "*"
  // no deja mandar credenciales ni cabeceras propias.
  const origen = req.headers.origin || '';
  if (origen && ORIGENES_PANEL.has(origen)) {
    res.setHeader('Access-Control-Allow-Origin', origen);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  // El preflight se contesta antes de cualquier otra validación: es el
  // navegador preguntando, no el panel pidiendo algo.
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  if (!esLoopback(req.socket.remoteAddress) && !proxyAutorizado(req)) {
    return res.status(403).json({ error: 'Panel disponible solo desde esta PC.' });
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const referencia = req.headers.origin || req.headers.referer || '';
    if (!origenAutorizado(referencia)) {
      return res.status(403).json({ error: 'Origen no autorizado.' });
    }
  }

  next();
});

function renderIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  return html.replaceAll('__MASIVOS_BASE__', PANEL_BASE_PATH);
}

app.get('/', (_req, res) => {
  res.type('html').send(renderIndex());
});

app.use(express.static(path.join(ROOT, 'public')));
app.use('/fotos', express.static(path.join(ROOT, 'data', 'fotos')));

app.get('/api/eventos', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('retry: 3000\n\n');
  sseClientes.add(res);
  // Snapshot inicial
  res.write(`event: estado\ndata: ${JSON.stringify(estadoWA)}\n\n`);
  res.write(
    `event: motor\ndata: ${JSON.stringify({ corriendo: motor.corriendo, pausado: motor.pausado, stats: motor.stats })}\n\n`
  );
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (e) {
      clearInterval(heartbeat);
    }
  }, 25000);
  req.on('close', () => {
    clearInterval(heartbeat);
    sseClientes.delete(res);
  });
});

app.get('/api/status', (req, res) => {
  const img = buscarImagenPromo();
  const config = getConfig();
  // Próxima corrida programada (texto amigable)
  let proxima = null;
  if (config.PROGRAMACION_ACTIVA) {
    const hora = String(config.PROGRAMACION_HORA || '10:30');
    const ahora = new Date();
    const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    proxima = hhmm < hora && ultimaCorridaProgramada !== hoy() ? `hoy ${hora}` : `mañana ${hora}`;
  }
  res.json({
    whatsapp: estadoWA.estado,
    whatsappDetalle: estadoWA.detalle || null,
    qr: estadoWA.qr || null,
    motor: { corriendo: motor.corriendo, pausado: motor.pausado },
    stats: motor.stats,
    imagen: !!img,
    imagenNombre: img ? path.basename(img) : null,
    imagenes: buscarImagenesPromo().length,
    pdf: fs.existsSync(path.join(ROOT, 'menu.pdf')),
    calentamiento: limiteHoy(config),
    programacion: {
      activa: !!config.PROGRAMACION_ACTIVA,
      hora: config.PROGRAMACION_HORA || '10:30',
      proxima,
    },
    analisis: { corriendo: analisis.corriendo, hechos: analisis.hechos, total: analisis.total },
    fotosJob: { corriendo: fotosJob.corriendo, hechos: fotosJob.hechos, total: fotosJob.total },
  });
});

app.get('/api/mensaje', (req, res) => {
  const tag = TAGS_VALIDOS.includes(req.query.tag) ? req.query.tag : null;
  const archivo = tag ? path.join(ROOT, 'data', `mensaje-${tag}.txt`) : ARCHIVO_MENSAJE;
  const texto = fs.existsSync(archivo) ? fs.readFileSync(archivo, 'utf8') : tag ? '' : '';
  res.json({ texto, tag: tag || 'general' });
});

app.post('/api/mensaje', (req, res) => {
  const texto = String((req.body && req.body.texto) || '').trim();
  const tag = TAGS_VALIDOS.includes(req.body && req.body.tag) ? req.body.tag : null;
  if (!texto && !tag) return res.status(400).json({ error: 'El mensaje está vacío.' });
  if (tag) {
    // Plantilla de segmento: vacía = se borra y el grupo recibe la general
    const archivo = path.join(ROOT, 'data', `mensaje-${tag}.txt`);
    if (!texto) {
      if (fs.existsSync(archivo)) fs.unlinkSync(archivo);
    } else {
      fs.mkdirSync(path.dirname(archivo), { recursive: true });
      fs.writeFileSync(archivo, texto + '\n');
    }
  } else {
    fs.writeFileSync(ARCHIVO_MENSAJE, texto + '\n');
  }
  res.json({ ok: true });
});

// ---------- Etiquetas ----------

app.get('/api/etiquetas', (req, res) => {
  res.json({ tags: TAGS_VALIDOS, etiquetas: leerEtiquetas() });
});

app.post('/api/etiquetas', (req, res) => {
  const { numero, tag, activa } = req.body || {};
  if (!numero || !TAGS_VALIDOS.includes(tag) || typeof activa !== 'boolean') {
    return res.status(400).json({ error: 'Datos inválidos (numero, tag, activa).' });
  }
  const mapa = leerEtiquetas();
  const actual = new Set(mapa[numero] || []);
  if (activa) actual.add(tag);
  else actual.delete(tag);
  if (actual.size > 0) mapa[numero] = [...actual];
  else delete mapa[numero];
  guardarEtiquetas(mapa);
  res.json({ ok: true, tags: mapa[numero] || [] });
});

app.get('/api/grupos-envio', (req, res) => {
  res.json({ grupos: leerGruposEnvio() });
});

app.post('/api/grupos-envio', (req, res) => {
  const nombre = String((req.body && req.body.nombre) || '')
    .trim()
    .slice(0, 80);
  const descripcion = String((req.body && req.body.descripcion) || '')
    .trim()
    .slice(0, 180);
  const numeros = [
    ...new Set(
      Array.isArray(req.body && req.body.numeros)
        ? req.body.numeros.map((n) => String(n || '').trim()).filter(Boolean)
        : []
    ),
  ].slice(0, 5000);
  if (!nombre || !numeros.length)
    return res.status(400).json({ error: 'El grupo necesita nombre y al menos un contacto.' });
  const grupos = leerGruposEnvio();
  const id = String((req.body && req.body.id) || `grupo-${Date.now().toString(36)}`);
  const grupo = { id, nombre, descripcion, numeros, actualizado: new Date().toISOString() };
  const index = grupos.findIndex((item) => item.id === id);
  if (index >= 0) grupos[index] = grupo;
  else grupos.push(grupo);
  guardarGruposEnvio(grupos);
  res.json({ ok: true, grupo });
});

app.delete('/api/grupos-envio/:id', (req, res) => {
  const grupos = leerGruposEnvio();
  const restantes = grupos.filter((grupo) => grupo.id !== String(req.params.id || ''));
  if (restantes.length === grupos.length)
    return res.status(404).json({ error: 'Grupo no encontrado.' });
  guardarGruposEnvio(restantes);
  res.json({ ok: true });
});

app.get('/api/config', (req, res) => {
  const c = getConfig();
  res.json({
    NEGOCIO_NOMBRE: c.NEGOCIO_NOMBRE || 'Modo Sabor Palermo',
    NEGOCIO_LOGO: c.NEGOCIO_LOGO || '/assets/logo.png',
    NEGOCIO_ESTADO: c.NEGOCIO_ESTADO || 'Cuenta oficial del delivery',
    DELAY_MIN_MS: c.DELAY_MIN_MS,
    DELAY_MAX_MS: c.DELAY_MAX_MS,
    PAUSA_LARGA_CADA: c.PAUSA_LARGA_CADA,
    PAUSA_LARGA_SEGUNDOS: c.PAUSA_LARGA_SEGUNDOS,
    REINTENTOS: c.REINTENTOS,
    MAX_POR_CORRIDA: c.MAX_POR_CORRIDA,
    NO_REPETIR_MISMO_DIA: c.NO_REPETIR_MISMO_DIA,
    ADJUNTAR_PDF: c.ADJUNTAR_PDF !== false,
    CALENTAMIENTO_ACTIVO: !!c.CALENTAMIENTO_ACTIVO,
    CALENTAMIENTO_INICIO: c.CALENTAMIENTO_INICIO,
    CALENTAMIENTO_INCREMENTO: c.CALENTAMIENTO_INCREMENTO,
    MODO_TANDAS: !!c.MODO_TANDAS,
    ESPERA_ENTRE_TANDAS_MINUTOS: c.ESPERA_ENTRE_TANDAS_MINUTOS,
    BAJA_AUTOMATICA: c.BAJA_AUTOMATICA !== false,
    BAJA_RESPUESTA: c.BAJA_RESPUESTA || '',
    PROGRAMACION_ACTIVA: !!c.PROGRAMACION_ACTIVA,
    PROGRAMACION_HORA: c.PROGRAMACION_HORA || '10:30',
    DIAS_NO_ENVIO: Array.isArray(c.DIAS_NO_ENVIO) ? c.DIAS_NO_ENVIO : [],
    MAX_POR_HORA: Number(c.MAX_POR_HORA) || 0,
    VENTANA_CUPO_MINUTOS: Number(c.VENTANA_CUPO_MINUTOS) || 60,
    MODO_SOLO_RESPUESTAS: !!c.MODO_SOLO_RESPUESTAS,
    FOOTER_BAJA: c.FOOTER_BAJA || '',
    META_PEDIDOS_DIA: Number(c.META_PEDIDOS_DIA) || 20,
    SALUDOS: c.SALUDOS,
    CIERRES: c.CIERRES,
  });
});

app.post('/api/config', (req, res) => {
  const b = req.body || {};
  const override = {};
  const rangos = {
    DELAY_MIN_MS: [0, 300000],
    DELAY_MAX_MS: [0, 300000],
    PAUSA_LARGA_CADA: [0, 500],
    PAUSA_LARGA_SEGUNDOS: [30, 3600],
    REINTENTOS: [0, 3],
    MAX_POR_CORRIDA: [1, 100],
    ESPERA_ENTRE_TANDAS_MINUTOS: [5, 240],
    MAX_POR_HORA: [0, 1000],
    VENTANA_CUPO_MINUTOS: [1, 240],
    META_PEDIDOS_DIA: [1, 10000],
  };
  for (const [k, [min, max]] of Object.entries(rangos)) {
    if (b[k] !== undefined && Number.isFinite(Number(b[k]))) {
      override[k] = numeroAcotado(b[k], configBase[k] || min, min, max);
    }
  }
  if (
    override.DELAY_MIN_MS !== undefined &&
    override.DELAY_MAX_MS !== undefined &&
    override.DELAY_MAX_MS < override.DELAY_MIN_MS
  ) {
    override.DELAY_MAX_MS = override.DELAY_MIN_MS;
  }
  if (typeof b.NO_REPETIR_MISMO_DIA === 'boolean')
    override.NO_REPETIR_MISMO_DIA = b.NO_REPETIR_MISMO_DIA;
  if (typeof b.ADJUNTAR_PDF === 'boolean') override.ADJUNTAR_PDF = b.ADJUNTAR_PDF;
  if (typeof b.MODO_TANDAS === 'boolean') override.MODO_TANDAS = b.MODO_TANDAS;
  if (typeof b.MODO_SOLO_RESPUESTAS === 'boolean')
    override.MODO_SOLO_RESPUESTAS = b.MODO_SOLO_RESPUESTAS;
  if (
    Array.isArray(b.DIAS_NO_ENVIO) &&
    b.DIAS_NO_ENVIO.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  ) {
    override.DIAS_NO_ENVIO = b.DIAS_NO_ENVIO;
  }
  if (typeof b.FOOTER_BAJA === 'string') override.FOOTER_BAJA = b.FOOTER_BAJA;
  if (typeof b.BAJA_AUTOMATICA === 'boolean') override.BAJA_AUTOMATICA = b.BAJA_AUTOMATICA;
  if (typeof b.BAJA_RESPUESTA === 'string' && b.BAJA_RESPUESTA.trim())
    override.BAJA_RESPUESTA = b.BAJA_RESPUESTA.trim();
  if (typeof b.PROGRAMACION_ACTIVA === 'boolean')
    override.PROGRAMACION_ACTIVA = b.PROGRAMACION_ACTIVA;
  if (
    typeof b.PROGRAMACION_HORA === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(b.PROGRAMACION_HORA)
  ) {
    override.PROGRAMACION_HORA = b.PROGRAMACION_HORA;
  }
  if (typeof b.CALENTAMIENTO_ACTIVO === 'boolean')
    override.CALENTAMIENTO_ACTIVO = b.CALENTAMIENTO_ACTIVO;
  for (const k of ['NEGOCIO_NOMBRE', 'NEGOCIO_ESTADO']) {
    if (typeof b[k] === 'string' && b[k].trim()) override[k] = b[k].trim().slice(0, 80);
  }
  if (typeof b.NEGOCIO_LOGO === 'string' && /^(\/|https?:\/\/)/i.test(b.NEGOCIO_LOGO.trim())) {
    override.NEGOCIO_LOGO = b.NEGOCIO_LOGO.trim().slice(0, 300);
  }
  const numsCalent = ['CALENTAMIENTO_INICIO', 'CALENTAMIENTO_INCREMENTO'];
  for (const k of numsCalent) {
    if (b[k] !== undefined && Number.isFinite(Number(b[k]))) override[k] = Number(b[k]);
  }
  for (const k of ['SALUDOS', 'CIERRES']) {
    if (Array.isArray(b[k]) && b[k].every((x) => typeof x === 'string') && b[k].length > 0)
      override[k] = b[k];
  }
  fs.mkdirSync(path.dirname(ARCHIVO_OVERRIDE), { recursive: true });
  fs.writeFileSync(ARCHIVO_OVERRIDE, JSON.stringify(override, null, 2));
  res.json({ ok: true });
});

app.post('/api/contactos', (req, res) => {
  const contacto = normalizarContactoEntrada(req.body || {});
  if (!contacto)
    return res.status(400).json({ error: 'Ingresá un teléfono válido (mínimo 8 dígitos).' });
  res.status(201).json({
    ok: true,
    contacto,
    ...fusionarContactosEntrantes([contacto], 'alta manual de contacto'),
  });
});

app.post('/api/contactos/importar', (req, res) => {
  const filas = Array.isArray(req.body && req.body.contactos)
    ? req.body.contactos.slice(0, 10000)
    : [];
  const contactos = filas.map(normalizarContactoEntrada).filter(Boolean);
  if (!contactos.length)
    return res.status(400).json({ error: 'No se encontraron contactos válidos en el archivo.' });
  const unicos = [...new Map(contactos.map((contacto) => [contacto.numero, contacto])).values()];
  res
    .status(201)
    .json({ ok: true, ...fusionarContactosEntrantes(unicos, 'importación de contactos') });
});

app.get('/api/clientes', (req, res) => {
  const clientes = leerClientesEnriquecidos();
  const excluidos = leerExcluidos();
  const pausados = leerPausados();
  const enviadosHoy = cargarEnviadosHoy();
  const mapaTags = leerEtiquetas();
  const acks = acksDelDia();
  res.json({
    total: clientes.length,
    totalExcluidos: clientes.filter((c) => excluidos.has(c.numero)).length,
    totalPausados: clientes.filter((c) => pausados[c.numero]).length,
    enviadosHoy: enviadosHoy.size,
    tagsDisponibles: TAGS_VALIDOS,
    segmentosDisponibles: resumenSegmentos(clientes),
    clientes: clientes.map((c) => ({
      ...c,
      excluido: excluidos.has(c.numero),
      pausado: !!pausados[c.numero],
      pausa: pausados[c.numero] || null,
      enviadoHoy: enviadosHoy.has(c.numero),
      estadoAck: acks.get(c.numero) || null,
      tags: mapaTags[c.numero] || [],
    })),
  });
});

app.get('/api/segmentos', (req, res) => {
  const clientes = leerClientesEnriquecidos();
  res.json({ segmentos: resumenSegmentos(clientes) });
});

app.get('/api/automatizaciones', (req, res) => {
  res.json(construirPlanOperativo());
});

app.get('/api/operador', (req, res) => {
  res.json(construirOperadorDia());
});

async function obtenerConversacion(numero, limite = 60) {
  const id = String(numero || '').trim();
  if (!id) throw new Error('Falta número de contacto.');
  if (!client || estadoWA.estado !== 'listo')
    return { numero: id, disponible: false, mensajes: [], motivo: 'WhatsApp no está listo.' };
  const limiteSeguro = Math.max(1, Math.min(100, Number(limite) || 60));
  const resultado = await client.pupPage.evaluate(
    async ({ chatId, limit }) => {
      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false });
      if (!chat) return { disponible: false, mensajes: [], motivo: 'Chat no encontrado.' };
      const filtro = (mensaje) =>
        !mensaje.isNotification &&
        !['call_log', 'e2e_notification', 'notification_template'].includes(mensaje.type);
      let mensajes = chat.msgs?.getModelsArray?.().filter(filtro) || [];
      while (mensajes.length < limit && chat.msgs) {
        const anteriores = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });
        if (!anteriores?.length) break;
        mensajes = [...anteriores.filter(filtro), ...mensajes];
      }
      mensajes.sort((a, b) => (a.t || 0) - (b.t || 0));
      return {
        disponible: true,
        mensajes: mensajes.slice(-limit).map((mensaje) => window.WWebJS.getMessageModel(mensaje)),
      };
    },
    { chatId: id, limit: limiteSeguro }
  );
  return {
    numero: id,
    disponible: resultado.disponible,
    mensajes: (resultado.mensajes || []).map((msg) => ({
      id: msg.id?._serialized || msg.id?.id || null,
      fromMe: Boolean(msg.fromMe),
      body: String(msg.body || ''),
      type: msg.type || 'chat',
      hasMedia: Boolean(msg.hasMedia),
      timestamp: Number(msg.t || msg.timestamp) || null,
      ack: msg.ack ?? null,
    })),
    ...(resultado.motivo ? { motivo: resultado.motivo } : {}),
  };
}

async function obtenerConversacionesPanel() {
  if (!client || estadoWA.estado !== 'listo')
    return { disponible: false, conversaciones: [], motivo: 'WhatsApp no está listo.' };
  let chats = [];
  try {
    chats = await client.pupPage.evaluate(() =>
      window
        .require('WAWebCollections')
        .Chat.getModelsArray()
        .map((chat) => {
          try {
            const id = chat.id && chat.id._serialized;
            return id
              ? {
                  numero: id,
                  nombre: chat.formattedTitle || chat.name || '',
                  timestamp: Number(chat.t || 0),
                  grupo: Boolean(chat.groupMetadata),
                }
              : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
    );
  } catch (e) {
    /* se conserva la lista local como respaldo */
  }
  sincronizarConversacionesEnCRM(chats);
  const clientes = leerClientesEnriquecidos();
  const porNumero = new Map(clientes.map((cliente) => [cliente.numero, cliente]));
  const respuestas = respuestasRecientes(5000);
  const estadosChats = leerEstadosChats();
  const ultimaRespuesta = new Map();
  for (const respuesta of respuestas)
    if (!ultimaRespuesta.has(respuesta.numero)) ultimaRespuesta.set(respuesta.numero, respuesta);
  const vistos = new Set();
  const base = [
    ...chats.filter((chat) => !chat.grupo),
    ...clientes.map((cliente) => ({
      numero: cliente.numero,
      nombre: cliente.nombre || '',
      timestamp: 0,
      grupo: false,
    })),
  ];
  const conversaciones = base
    .filter((chat) => {
      if (
        !chat.numero ||
        vistos.has(chat.numero) ||
        !['c.us', 'lid'].includes(chat.numero.split('@')[1])
      )
        return false;
      vistos.add(chat.numero);
      return true;
    })
    .map((chat) => {
      const cliente = porNumero.get(chat.numero) || {};
      const respuesta = ultimaRespuesta.get(chat.numero);
      const estadoChat = estadosChats[chat.numero];
      return {
        ...cliente,
        numero: chat.numero,
        nombre: chat.nombre || cliente.nombre || 'Sin nombre',
        texto:
          respuesta?.texto || (chat.timestamp ? 'Abrir conversación' : 'Sin mensajes registrados'),
        hora:
          respuesta?.hora ||
          (chat.timestamp ? new Date(chat.timestamp * 1000).toLocaleDateString('es-AR') : ''),
        tipo: respuesta?.tipo || null,
        estado: estadoChat?.estado || respuesta?.estado || 'nuevo',
        nota: estadoChat?.nota || '',
        id: respuesta?.id || `chat:${chat.numero}`,
      };
    });
  return { disponible: true, total: conversaciones.length, conversaciones };
}

app.get('/api/conversacion', async (req, res) => {
  try {
    res.json(await obtenerConversacion(req.query.numero, req.query.limite));
  } catch (e) {
    res.json({
      numero: String(req.query.numero || ''),
      disponible: false,
      mensajes: [],
      motivo: e.message,
    });
  }
});

app.get('/api/conversaciones', async (req, res) => {
  try {
    res.json(await obtenerConversacionesPanel());
  } catch (e) {
    res.json({ disponible: false, conversaciones: [], motivo: e.message });
  }
});

app.post('/api/conversacion/mensaje', async (req, res) => {
  const numero = String((req.body || {}).numero || '').trim();
  const texto = String((req.body || {}).texto || '').trim();
  if (!numero || !texto || texto.length > 4096)
    return res
      .status(400)
      .json({ error: 'El contacto y el mensaje son obligatorios (máximo 4096 caracteres).' });
  if (numero.endsWith('@g.us') || numero.includes('broadcast'))
    return res.status(400).json({ error: 'La bandeja sólo permite responder chats individuales.' });
  if (!client || estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo.' });
  try {
    const enviado = await client.sendMessage(numero, texto, { sendSeen: false });
    res.json({
      ok: true,
      numero,
      id: enviado?.id?._serialized || null,
      timestamp: enviado?.timestamp || null,
    });
  } catch (e) {
    res.status(502).json({ error: `No se pudo enviar el mensaje: ${e.message}` });
  }
});

app.post('/api/conversacion/adjunto', async (req, res) => {
  const body = req.body || {};
  const numero = String(body.numero || '').trim();
  const nombre = path.basename(String(body.nombre || 'archivo')).slice(0, 160);
  const texto = String(body.texto || '').trim();
  const data = String(body.data || '');
  const match = data.match(/^data:([^;,]+);base64,(.+)$/s);
  const mimetype = String(body.mimetype || match?.[1] || '').toLowerCase();
  if (
    !numero ||
    !match ||
    !mimetype ||
    (!mimetype.startsWith('image/') &&
      !mimetype.startsWith('audio/') &&
      mimetype !== 'application/pdf')
  )
    return res
      .status(400)
      .json({ error: 'Adjunto inválido. Sólo se permiten imágenes, PDF o audio.' });
  if (texto.length > 4096)
    return res.status(400).json({ error: 'El texto supera el máximo de 4096 caracteres.' });
  if (numero.endsWith('@g.us') || numero.includes('broadcast'))
    return res.status(400).json({ error: 'La bandeja sólo permite responder chats individuales.' });
  if (!client || estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo.' });
  const base64 = match[2].replace(/\s/g, '');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    return res.status(400).json({ error: 'El adjunto debe pesar entre 1 byte y 16 MB.' });
  try {
    const media = new MessageMedia(mimetype, base64, nombre);
    const enviado = await client.sendMessage(numero, media, {
      caption: texto || undefined,
      sendSeen: false,
    });
    res.json({
      ok: true,
      numero,
      nombre,
      mimetype,
      id: enviado?.id?._serialized || null,
      timestamp: enviado?.timestamp || null,
    });
  } catch (e) {
    res.status(502).json({ error: `No se pudo enviar el adjunto: ${e.message}` });
  }
});

app.get('/api/crm', (req, res) => {
  const clientes = leerClientesEnriquecidos();
  const porNumero = new Map(clientes.map((c) => [c.numero, c]));
  const respuestas = respuestasRecientes(120).map((r) => {
    const c = porNumero.get(r.numero);
    return {
      ...r,
      nombre: (c && c.nombre) || '',
      telefono: (c && c.telefono) || '',
      abrirUrl: c && c.telefono ? `https://wa.me/${c.telefono}` : '',
    };
  });
  const resumen = Object.fromEntries(ESTADOS_CRM.map((e) => [e, 0]));
  for (const r of respuestas) resumen[r.estado] = (resumen[r.estado] || 0) + 1;
  res.json({ estados: ESTADOS_CRM, resumen, respuestas });
});

app.get('/api/cliente-detalle', (req, res) => {
  try {
    res.json(detalleCliente(req.query.numero));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

app.post('/api/crm/estado', (req, res) => {
  const { id, numero, estado, nota } = req.body || {};
  const estadoNormalizado = estado === 'pedido' ? 'pedido_probable' : estado;
  if ((!id && !numero) || !ESTADOS_CRM.includes(estadoNormalizado))
    return res.status(400).json({ error: 'Estado CRM inválido.' });
  try {
    const item = numero
      ? guardarEstadoChat(String(numero), estadoNormalizado, nota)
      : guardarEstadoCrm(id, estadoNormalizado, nota);
    res.json({ ok: true, item });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/salud', (req, res) => {
  res.json(calcularSaludNumero());
});

app.get('/api/reporte-dia', (req, res) => {
  res.json(reporteDelDia());
});

app.get('/api/cierre-dia', (req, res) => {
  res.json({ ...cierreJornada(), historial: historialCierres(7) });
});

app.post('/api/cierre-dia', (req, res) => {
  const cierre = cierreJornada();
  const cierres = leerJsonSeguro(ARCHIVO_CIERRES_DIA, {});
  cierres[hoy()] = cierre;
  escribirJsonSeguro(ARCHIVO_CIERRES_DIA, cierres);
  registrarLog(
    `📌 Cierre de jornada guardado: ${cierre.reporte.enviados} enviados, ${cierre.reporte.respuestas} respuestas, ${cierre.reporte.embudo.pedidosProbables} pedidos probables.`
  );
  res.json({ ok: true, cierre, historial: historialCierres(7) });
});

app.post('/api/cliente-nota', (req, res) => {
  try {
    const { numero, nota } = req.body || {};
    res.json({ ok: true, nota: guardarNotaCliente(numero, nota) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/recordatorios', (req, res) => {
  res.json({ recordatorios: recordatoriosPendientes(50) });
});

app.post('/api/recordatorios', (req, res) => {
  try {
    const { numero, texto, minutos } = req.body || {};
    res.json({ ok: true, recordatorio: crearRecordatorio(numero, texto, minutos) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/recordatorios/completar', (req, res) => {
  try {
    res.json({ ok: true, recordatorio: completarRecordatorio(String((req.body || {}).id || '')) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/accion-inteligente', (req, res) => {
  try {
    const accion = String((req.body && req.body.accion) || '');
    const dryRun = !!(req.body && req.body.dryRun);
    const result = ejecutarAccionInteligente(accion, { dryRun });
    if (!dryRun) registrarLog(`⚙️ Acción inteligente: ${accion} (${result.total || 0} contactos).`);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/acciones-masivas', (req, res) => {
  const acciones = leerAccionesMasivas().slice().reverse().slice(0, 10);
  res.json({ acciones });
});

app.post('/api/acciones-masivas/deshacer', (req, res) => {
  try {
    const result = deshacerUltimaAccionMasiva();
    registrarLog(`↩️ Acción masiva deshecha: ${result.accion} (${result.total || 0} contactos).`);
    res.json({ ok: true, result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/excluir', (req, res) => {
  const { numeros, excluir } = req.body || {};
  if (!Array.isArray(numeros) || typeof excluir !== 'boolean') {
    return res.status(400).json({ error: 'Faltan datos (numeros[], excluir).' });
  }
  const set = leerExcluidos();
  for (const n of numeros) {
    if (excluir) set.add(n);
    else set.delete(n);
  }
  guardarExcluidos(set);
  res.json({ ok: true, totalExcluidos: set.size });
});

app.post('/api/pausar-contactos', (req, res) => {
  const numeros = Array.isArray(req.body && req.body.numeros)
    ? req.body.numeros.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  const dias = numeroAcotado(req.body && req.body.dias, 7, 1, 365);
  if (!numeros.length) return res.status(400).json({ error: 'Seleccioná al menos un contacto.' });
  const result = pausarNumeros(
    numeros,
    dias,
    String((req.body && req.body.motivo) || 'pausa manual').slice(0, 120)
  );
  res.json({ ok: true, ...result });
});

app.post('/api/reactivar-contactos', (req, res) => {
  const numeros = Array.isArray(req.body && req.body.numeros)
    ? req.body.numeros.map((n) => String(n || '').trim()).filter(Boolean)
    : [];
  if (!numeros.length) return res.status(400).json({ error: 'Seleccioná al menos un contacto.' });
  const excluidos = leerExcluidos();
  for (const numero of numeros) excluidos.delete(numero);
  guardarExcluidos(excluidos);
  const resultado = reactivarNumeros(numeros);
  res.json({ ok: true, total: numeros.length, reactivados: resultado.total });
});

app.post('/api/listar', async (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo todavía.' });
  res.json({ ok: true });
  try {
    emit('lista', { tipo: 'inicio' });
    const config = getConfig();
    let chats;
    let fuente = 'chats';
    try {
      chats = await client.getChats();
      if (!chats.length) throw new Error('getChats sin resultados');
    } catch (error) {
      try {
        chats = await client.pupPage.evaluate(() => {
          const modelos = window.require('WAWebCollections').Chat.getModelsArray();
          return modelos
            .map((chat) => {
              try {
                const id = chat.id && chat.id._serialized;
                if (!id) return null;
                return {
                  id: { server: chat.id.server, _serialized: id },
                  isGroup: Boolean(chat.groupMetadata),
                  name: chat.formattedTitle || chat.name || '',
                  timestamp: Number(chat.t || 0),
                };
              } catch (error) {
                return null;
              }
            })
            .filter(Boolean);
        });
        if (!chats.length) throw new Error('lectura simple sin chats');
        fuente = 'chats-simples';
        registrarLog(
          `⚠️ getChats falló (${error && error.message ? error.message : error}). Se usará lectura simple por chat.`
        );
      } catch (lecturaError) {
        fuente = 'contactos';
        registrarLog(
          `⚠️ Lectura simple de chats falló (${lecturaError && lecturaError.message ? lecturaError.message : lecturaError}). Se usará getContacts() sin historial de chat.`
        );
        const contactos = await client.getContacts();
        const vistos = new Set();
        chats = contactos
          .filter((contacto) => {
            const server = contacto.id && contacto.id.server;
            const numero = contacto.id && contacto.id._serialized;
            if ((server !== 'c.us' && server !== 'lid') || !numero || vistos.has(numero))
              return false;
            vistos.add(numero);
            return true;
          })
          .map((contacto) => ({
            id: contacto.id,
            isGroup: false,
            name: contacto.name || contacto.pushname || contacto.shortName || '',
            timestamp: null,
            _fromContactFallback: true,
          }));
      }
    }
    const ahora = Date.now() / 1000;
    const limite = (Number(config.DIAS_HISTORIAL_MINIMO) || 3650) * 24 * 60 * 60;
    const encontrados = chats
      .filter((chat) => {
        if (chat.isGroup) return false;
        const server = chat.id && chat.id.server;
        if (server !== 'c.us' && server !== 'lid') return false;
        if (chat._fromContactFallback) return true;
        if (!chat.timestamp) return false;
        return ahora - chat.timestamp <= limite;
      })
      .map((chat) => ({
        numero: chat.id._serialized,
        nombre: chat.name || '',
        ultimoMensaje: chat.timestamp
          ? new Date(chat.timestamp * 1000).toISOString().slice(0, 10)
          : null,
      }))
      .sort((a, b) => (a.nombre || a.numero).localeCompare(b.nombre || b.numero));

    // Preservar enriquecimiento previo (teléfono, país/área, foto, análisis)
    let previos = [];
    try {
      previos = JSON.parse(fs.readFileSync(ARCHIVO_CLIENTES, 'utf8'));
    } catch (e) {
      /* primera vez */
    }
    const mapaPrev = new Map(previos.map((c) => [c.numero, c]));
    for (const c of encontrados) {
      const p = mapaPrev.get(c.numero);
      if (!p) continue;
      for (const k of [
        'telefono',
        'pais',
        'paisNombre',
        'area',
        'areaNombre',
        'negocio',
        'analizado',
        'foto',
      ]) {
        if (p[k] !== undefined) c[k] = p[k];
      }
    }

    const listaSincronizada = combinarClientesSincronizados(encontrados, previos);
    hacerBackup('lista actualizada');
    escribirJsonSeguro(ARCHIVO_CLIENTES, listaSincronizada);
    const csv =
      'numero;nombre;ultimo_mensaje\n' +
      listaSincronizada
        .map((c) => `${c.numero};${(c.nombre || '').replace(/;/g, ',')};${c.ultimoMensaje}`)
        .join('\n');
    fs.writeFileSync(ARCHIVO_CLIENTES.replace('.json', '.csv'), csv, 'utf8');
    registrarLog(
      `📋 Lista actualizada desde el panel: ${listaSincronizada.length} clientes (${fuente}).`
    );
    emit('lista', { tipo: 'fin', total: listaSincronizada.length });
  } catch (e) {
    registrarLog(`❌ Error actualizando la lista: ${e && e.stack ? e.stack : e.message}`);
    emit('lista', { tipo: 'error', error: e.message });
  }
});

// ---------- Análisis y fotos ----------

app.post('/api/analizar', (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo todavía.' });
  if (analisis.corriendo) return res.status(409).json({ error: 'Ya hay un análisis corriendo.' });
  if (motor.corriendo)
    return res.status(409).json({ error: 'Hay un envío en curso, esperá a que termine.' });
  const limite = Number(req.body && req.body.limite) || 0;
  res.json({ ok: true });
  correrAnalisis(limite).catch((e) => {
    analisis.corriendo = false;
    registrarLog(`❌ Error en el análisis: ${e.message}`);
    emit('analisis', { tipo: 'error', error: e.message });
  });
});

app.get('/api/analisis', (req, res) => {
  res.json({
    corriendo: analisis.corriendo,
    hechos: analisis.hechos,
    total: analisis.total,
    resumen: analisis.resumen,
  });
});

app.get('/api/red', (req, res) => {
  res.json({ ip: HOST, url: `http://${HOST}:${PORT}` });
});

app.post('/api/fotos', (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo todavía.' });
  if (fotosJob.corriendo) return res.status(409).json({ error: 'Ya se están descargando fotos.' });
  if (motor.corriendo)
    return res.status(409).json({ error: 'Hay un envío en curso, esperá a que termine.' });
  res.json({ ok: true });
  correrFotos().catch((e) => {
    fotosJob.corriendo = false;
    registrarLog(`❌ Error descargando fotos: ${e.message}`);
    emit('fotos', { tipo: 'error', error: e.message });
  });
});

const RE_NOMBRE_PROMO = /^promo(-\d+)?\.(jpg|jpeg|png|webp)$/i;

app.get('/api/imagen', (req, res) => {
  const rutas = buscarImagenesPromo();
  const imagenes = rutas.map((p) => {
    const ext = path.extname(p).slice(1).replace('jpg', 'jpeg');
    return {
      nombre: path.basename(p),
      dataUrl: `data:image/${ext};base64,${fs.readFileSync(p).toString('base64')}`,
    };
  });
  res.json({
    existe: imagenes.length > 0,
    cantidad: imagenes.length,
    maximo: MAX_IMAGENES_PROMO,
    imagenes,
    // compatibilidad con clientes viejos: primera imagen
    nombre: imagenes[0] ? imagenes[0].nombre : null,
    dataUrl: imagenes[0] ? imagenes[0].dataUrl : null,
  });
});

app.post('/api/imagen', (req, res) => {
  const { nombre, data, reemplazarTodo } = req.body || {};
  if (!data || !data.startsWith('data:image/'))
    return res.status(400).json({ error: 'Imagen inválida.' });
  const ext = (path.extname(nombre || '').slice(1) || 'jpg').toLowerCase();
  if (!IMG_EXTS.includes(ext))
    return res.status(400).json({ error: 'Formato no soportado (jpg, png, webp).' });
  const base64 = data.split(',')[1] || '';
  const buf = Buffer.from(base64, 'base64');
  if (buf.length < 8) return res.status(400).json({ error: 'La imagen llegó vacía.' });
  if (buf.length > 16 * 1024 * 1024)
    return res.status(400).json({ error: 'La imagen es muy pesada (máx 16 MB).' });

  if (reemplazarTodo) {
    for (let slot = 1; slot <= MAX_IMAGENES_PROMO; slot++) borrarSlotImagen(slot);
  }
  const slot = primerSlotLibrePromo();
  if (!slot)
    return res
      .status(409)
      .json({ error: `Ya hay ${MAX_IMAGENES_PROMO} imágenes. Quitá alguna primero.` });
  borrarSlotImagen(slot); // limpia otras extensiones del mismo slot, por las dudas
  fs.writeFileSync(rutaImagenPromo(slot, ext), buf);
  const total = buscarImagenesPromo().length;
  const nombreFinal = path.basename(rutaImagenPromo(slot, ext));
  registrarLog(`🖼️ Imagen de promo cargada: ${nombreFinal} (${total} en total).`);
  res.json({ ok: true, nombre: nombreFinal, cantidad: total });
});

app.delete('/api/imagen', (req, res) => {
  const nombre = String(req.query.nombre || '').trim();
  if (!nombre) {
    // sin nombre: borrar todas
    for (let slot = 1; slot <= MAX_IMAGENES_PROMO; slot++) borrarSlotImagen(slot);
    return res.json({ ok: true, borradas: 'todas' });
  }
  if (!RE_NOMBRE_PROMO.test(nombre)) return res.status(400).json({ error: 'Nombre inválido.' });
  const p = path.join(ROOT, nombre);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true, cantidad: buscarImagenesPromo().length });
});

// ---------- PDF del menú ----------

app.get('/api/pdf', (req, res) => {
  const p = path.join(ROOT, 'menu.pdf');
  res.json({ existe: fs.existsSync(p), nombre: fs.existsSync(p) ? 'menu.pdf' : null });
});

app.post('/api/pdf', (req, res) => {
  const { data } = req.body || {};
  if (!data || !data.startsWith('data:application/pdf')) {
    return res.status(400).json({ error: 'Solo se acepta PDF.' });
  }
  const base64 = data.split(',')[1];
  fs.writeFileSync(path.join(ROOT, 'menu.pdf'), Buffer.from(base64, 'base64'));
  registrarLog('📄 Nuevo menú PDF cargado (menu.pdf).');
  res.json({ ok: true, nombre: 'menu.pdf' });
});

app.delete('/api/pdf', (req, res) => {
  const p = path.join(ROOT, 'menu.pdf');
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

// ---------- Estadísticas ----------

app.get('/api/estadisticas', (req, res) => {
  const dir = path.join(ROOT, 'data');
  const dias = {};
  const dia = (f) =>
    (dias[f] = dias[f] || { fecha: f, enviados: 0, entregados: 0, leidos: 0, respondieron: 0 });
  try {
    for (const f of fs.readdirSync(dir)) {
      let m;
      if ((m = f.match(/^enviados-(\d{4}-\d{2}-\d{2})\.json$/))) {
        try {
          dia(m[1]).enviados = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).length;
        } catch (e) {}
      } else if ((m = f.match(/^acks-(\d{4}-\d{2}-\d{2})\.json$/))) {
        try {
          const estados = Object.values(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
          dia(m[1]).entregados = estados.filter((e) => e === 'entregado' || e === 'leido').length;
          dia(m[1]).leidos = estados.filter((e) => e === 'leido').length;
        } catch (e) {}
      } else if ((m = f.match(/^respuestas-(\d{4}-\d{2}-\d{2})\.json$/))) {
        try {
          const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          dia(m[1]).respondieron = new Set(arr.map((r) => r.numero)).size;
        } catch (e) {}
      }
    }
  } catch (e) {}

  const lista = Object.values(dias)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 30);
  const totales = lista.reduce(
    (acc, d) => ({
      enviados: acc.enviados + d.enviados,
      leidos: acc.leidos + d.leidos,
      respondieron: acc.respondieron + d.respondieron,
    }),
    { enviados: 0, leidos: 0, respondieron: 0 }
  );

  let respuestasHoy = [];
  try {
    respuestasHoy = JSON.parse(fs.readFileSync(path.join(dir, `respuestas-${hoy()}.json`), 'utf8'))
      .slice(-50)
      .reverse();
  } catch (e) {
    /* sin respuestas hoy */
  }

  res.json({ dias: lista, totales, respuestasHoy });
});

// ---------- Backups ----------

app.get('/api/backups', (req, res) => {
  const dir = path.join(ROOT, 'data', 'backups');
  let archivos = [];
  try {
    archivos = fs.readdirSync(dir).sort().reverse();
  } catch (e) {
    /* sin backups todavía */
  }
  res.json({ archivos: archivos.slice(0, 60) });
});

app.get('/api/campanas', (req, res) => {
  let campanas = [];
  try {
    campanas = fs
      .readdirSync(DIR_CAMPANAS)
      .filter((f) => /^campana-.*\.json$/.test(f))
      .sort()
      .reverse()
      .slice(0, 20)
      .map((f) => {
        const c = leerJsonSeguro(path.join(DIR_CAMPANAS, f), null);
        return (
          c && {
            id: c.id,
            fecha: c.fecha,
            inicio: c.inicio,
            fin: c.fin,
            estado: c.estado,
            simulacro: c.simulacro,
            segmento: c.segmento,
            stats: c.stats,
          }
        );
      })
      .filter(Boolean);
  } catch (e) {
    /* sin campañas */
  }
  res.json({ campanas });
});

app.post('/api/preparar-envio', (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo.' });
  if (motor.corriendo) return res.status(409).json({ error: 'Ya hay una corrida en curso.' });
  const simulacro = !!(req.body && req.body.simulacro);
  const cfgEnvio = getConfig();
  if (!simulacro && cfgEnvio.MODO_SOLO_RESPUESTAS) {
    return res.status(409).json({ error: "Modo 'solo respuestas' activo: no se mandan promos." });
  }
  if (!simulacro && esDiaNoEnvio(cfgEnvio)) {
    return res.status(409).json({ error: 'Hoy es un día de NO envío.' });
  }
  if (!fs.existsSync(ARCHIVO_CLIENTES))
    return res.status(400).json({ error: 'No hay lista de clientes. Actualizala primero.' });
  const plantilla = fs.existsSync(ARCHIVO_MENSAJE)
    ? fs.readFileSync(ARCHIVO_MENSAJE, 'utf8').trim()
    : '';
  if (!plantilla) return res.status(400).json({ error: 'El mensaje está vacío.' });

  const segmento = req.body && typeof req.body.segmento === 'string' ? req.body.segmento : '';
  const forzarFriosRecientes = !!(req.body && req.body.forzarFriosRecientes);
  const resumen = crearResumenCampana(simulacro, { segmento, forzarFriosRecientes });
  res.json(resumen);
});

app.post('/api/enviar-prueba', async (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo.' });
  if (motor.corriendo) return res.status(409).json({ error: 'Hay una corrida en curso.' });
  const plantilla = fs.existsSync(ARCHIVO_MENSAJE)
    ? fs.readFileSync(ARCHIVO_MENSAJE, 'utf8').trim()
    : '';
  if (!plantilla) return res.status(400).json({ error: 'El mensaje está vacío.' });

  const destino = client && client.info && client.info.wid && client.info.wid._serialized;
  if (!destino)
    return res.status(409).json({ error: 'No se pudo detectar tu propio número de WhatsApp.' });
  const config = getConfig();
  const mensaje = armarMensaje(plantilla, 'Prueba', config);
  try {
    const imgs = buscarImagenesPromo().map((p) => MessageMedia.fromFilePath(p));
    if (imgs.length) {
      await client.sendMessage(destino, imgs[0], { caption: `[PRUEBA MODO SABOR]\n\n${mensaje}` });
      for (let k = 1; k < imgs.length; k++) {
        await esperar(1500);
        await client.sendMessage(destino, imgs[k]);
      }
    } else {
      await client.sendMessage(destino, `[PRUEBA MODO SABOR]\n\n${mensaje}`);
    }
    const pdfPath = path.join(ROOT, 'menu.pdf');
    if (config.ADJUNTAR_PDF !== false && fs.existsSync(pdfPath)) {
      await esperar(2000);
      await client.sendMessage(destino, MessageMedia.fromFilePath(pdfPath));
    }
    registrarPruebaDelDia(destino);
    registrarLog(`🧪 Prueba enviada a tu propio WhatsApp (${destino}).`);
    res.json({ ok: true, destino });
  } catch (e) {
    registrarLog(`❌ No se pudo enviar la prueba: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/enviar', (req, res) => {
  if (estadoWA.estado !== 'listo')
    return res.status(409).json({ error: 'WhatsApp no está listo.' });
  if (motor.corriendo) return res.status(409).json({ error: 'Ya hay una corrida en curso.' });
  const simulacro = !!(req.body && req.body.simulacro);
  const cfgEnvio = getConfig();
  if (!simulacro && cfgEnvio.MODO_SOLO_RESPUESTAS) {
    return res.status(409).json({
      error: "Modo 'solo respuestas' activo: no se mandan promos (se desactiva en Config → 🛡️).",
    });
  }
  if (!simulacro && esDiaNoEnvio(cfgEnvio)) {
    return res.status(409).json({ error: 'Hoy es un día de NO envío (se cambia en Config → 🛡️).' });
  }
  if (!fs.existsSync(ARCHIVO_CLIENTES))
    return res.status(400).json({ error: 'No hay lista de clientes. Actualizala primero.' });
  const plantilla = fs.existsSync(ARCHIVO_MENSAJE)
    ? fs.readFileSync(ARCHIVO_MENSAJE, 'utf8').trim()
    : '';
  if (!plantilla) return res.status(400).json({ error: 'El mensaje está vacío.' });

  const token = String((req.body && req.body.token) || '');
  const segmento = req.body && typeof req.body.segmento === 'string' ? req.body.segmento : '';
  if (!validarConfirmacion(token, simulacro)) {
    return res.status(409).json({ error: 'Primero prepará y confirmá la campaña desde el panel.' });
  }
  const salud = calcularSaludNumero();
  if (!simulacro && salud.estado === 'rojo' && !['pidio', 'activo'].includes(segmento)) {
    return res.status(409).json({
      error:
        'Salud roja: el panel bloqueó esta campaña masiva. Usá pedidos/activos, bajá volumen o hacé simulacro.',
    });
  }
  const forzarFriosRecientes = !!(confirmacionCampana && confirmacionCampana.forzarFriosRecientes);
  motor.corriendo = true;
  motor.pausado = false;
  motor.detener = false;
  confirmacionCampana = null;
  emitirMotor();
  correrEnvio(simulacro, { segmento, forzarFriosRecientes }).catch((e) => {
    motor.corriendo = false;
    registrarLog(`❌ Error en la corrida: ${e.message}`);
    emit('fin', { ...motor.stats, error: e.message });
    emitirMotor();
  });
  res.json({ ok: true });
});

app.post('/api/pausar', (req, res) => {
  if (motor.corriendo) motor.pausado = true;
  emitirMotor();
  res.json({ ok: true });
});

app.post('/api/reanudar', (req, res) => {
  motor.pausado = false;
  emitirMotor();
  res.json({ ok: true });
});

app.post('/api/detener', (req, res) => {
  motor.detener = true;
  motor.pausado = false;
  res.json({ ok: true });
});

app.get('/api/logs', (req, res) => {
  if (!fs.existsSync(ARCHIVO_LOG)) return res.json({ lineas: [] });
  const lineas = fs.readFileSync(ARCHIVO_LOG, 'utf8').trim().split('\n');
  res.json({ lineas: lineas.slice(-300) });
});

// ---------- Arranque ----------

const servidor = app.listen(PORT, HOST, () => {
  console.log(`\n🍔 Panel Modo Sabor listo en: http://${HOST}:${PORT}\n`);
  hacerBackup('arranque del panel');
  iniciarWhatsApp();
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n⚠️ El panel YA está abierto en http://localhost:${PORT}`);
    console.log(
      'Usá esa ventana. Si querés reiniciarlo, cerrá primero la otra ventana del panel.\n'
    );
  } else {
    console.error('Error del servidor:', e.message);
  }
  process.exit(1);
});

// ---------- Envío programado (sale solo todos los días) ----------

let ultimaCorridaProgramada = null;

setInterval(() => {
  try {
    const config = getConfig();
    if (!config.PROGRAMACION_ACTIVA) return;
    if (config.MODO_SOLO_RESPUESTAS) return;
    if (esDiaNoEnvio(config)) return;
    if (estadoWA.estado !== 'listo' || motor.corriendo) return;
    if (!fs.existsSync(ARCHIVO_CLIENTES) || !fs.existsSync(ARCHIVO_MENSAJE)) return;

    const ahora = new Date();
    const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    if (hhmm !== String(config.PROGRAMACION_HORA || '10:30')) return;
    if (ultimaCorridaProgramada === hoy()) return; // ya salió hoy

    ultimaCorridaProgramada = hoy();
    motor.corriendo = true;
    motor.pausado = false;
    motor.detener = false;
    registrarLog(`⏰ Envío programado (${hhmm}) iniciado automáticamente.`);
    emit('programado', { hora: hhmm });
    emitirMotor();
    correrEnvio(false).catch((e) => {
      motor.corriendo = false;
      registrarLog(`❌ Error en la corrida programada: ${e.message}`);
      emitirMotor();
    });
  } catch (e) {
    /* el programador nunca corta el servidor */
  }
}, 30000);

process.on('SIGINT', async () => {
  console.log('\nCerrando panel...');
  try {
    if (client) await client.destroy();
  } catch (e) {
    /* ignorar */
  }
  soltarLockPanel();
  process.exit(0);
});

process.on('exit', soltarLockPanel);

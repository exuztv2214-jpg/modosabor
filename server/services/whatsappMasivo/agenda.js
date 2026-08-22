const dbPrincipal = require('../../db');
const { deJid, normalizarTelefono } = require('./telefono');

/*
  La agenda masiva se construye desde la sesión única de WhatsApp.

  Baileys no entrega siempre un teléfono como id: los chats recientes pueden
  venir como @lid. El history sync trae el mapeo LID -> teléfono; guardarlo
  como contacto sin resolver sería peor que no guardarlo porque luego el motor
  intentaría escribir a un identificador que no es un número.
*/
const SEGMENTOS = [
  { id: 'todos', nombre: 'Todos los chats habilitados' },
  { id: 'pidio', nombre: 'Pidieron o consultaron por la carta' },
  { id: 'pidio_ayer', nombre: 'Pidieron ayer' },
  { id: 'respondio', nombre: 'Respondieron alguna vez' },
  { id: 'nuevo', nombre: 'Nuevos (últimos 7 días)' },
  { id: 'nuevo_sin_enviar', nombre: 'Nuevos sin campaña previa' },
  { id: 'activo', nombre: 'Activos (últimos 14 días)' },
  { id: 'frio', nombre: 'Fríos (3 campañas sin respuesta)' },
  { id: 'viejo', nombre: 'Sin actividad por más de 45 días' },
  { id: 'sin_enviar', nombre: 'Sin campañas previas' },
];

const PALABRAS_PEDIDO = [
  'pedido',
  'pedir',
  'pido',
  'quiero',
  'mandame',
  'mandarme',
  'me mandas',
  'me mandás',
  'enviame',
  'enviá',
  'delivery',
  'llevar',
  'reserva',
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
  'jugo',
  'pepsi',
  'encargo',
  'encargar',
];
const PALABRAS_NO_PEDIDO = ['baja', 'stop', 'gracias', 'ok', 'dale gracias', 'no gracias'];

function textoDeMensaje(message = {}) {
  let content = message.message || {};
  while (true) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) break;
    content = wrapped;
  }
  return String(
    content.conversation ||
      content.extendedTextMessage?.text ||
      content.imageMessage?.caption ||
      content.videoMessage?.caption ||
      content.documentMessage?.caption ||
      ''
  )
    .trim()
    .slice(0, 2000);
}

function fechaIso(value) {
  if (!value) return null;
  const raw =
    typeof value === 'object' && typeof value.toString === 'function' ? value.toString() : value;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

function telefonoDe({ jid = '', telefono = '', lidAPn = new Map() } = {}) {
  const candidates = [telefono, lidAPn.get(String(jid)), jid];
  for (const candidate of candidates) {
    const digits =
      deJid(candidate) ||
      String(candidate || '')
        .split('@')[0]
        .split(':')[0];
    const normalized = normalizarTelefono(digits);
    if (normalized) return normalized;
  }
  return null;
}

function esChatIndividual(jid = '') {
  const value = String(jid || '');
  return Boolean(value) && value !== 'status@broadcast' && !value.endsWith('@g.us');
}

function guardarContacto(
  {
    jid = '',
    telefono = '',
    nombre = '',
    fecha = null,
    origen = 'gateway',
    lidAPn = new Map(),
  } = {},
  db = dbPrincipal
) {
  if (!esChatIndividual(jid)) return false;
  const phone = telefonoDe({ jid, telefono, lidAPn });
  if (!phone) return false;
  db.prepare(
    `INSERT INTO wa_contactos (jid, telefono, nombre, ultimo_mensaje_en, origen)
     VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)
     ON CONFLICT(jid) DO UPDATE SET
       telefono = excluded.telefono,
       nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE wa_contactos.nombre END,
       ultimo_mensaje_en = CASE
         WHEN wa_contactos.ultimo_mensaje_en IS NULL THEN excluded.ultimo_mensaje_en
         WHEN excluded.ultimo_mensaje_en > wa_contactos.ultimo_mensaje_en THEN excluded.ultimo_mensaje_en
         ELSE wa_contactos.ultimo_mensaje_en END,
       origen = excluded.origen, actualizado_en = CURRENT_TIMESTAMP`
  ).run(
    `${phone}@s.whatsapp.net`,
    phone,
    String(nombre || '')
      .trim()
      .slice(0, 160),
    fecha || null,
    origen
  );
  return true;
}

function parecePedido(texto = '') {
  const normalized = String(texto)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (
    !normalized ||
    PALABRAS_NO_PEDIDO.some((word) => normalized === word || normalized.startsWith(`${word} `))
  ) {
    return false;
  }
  return PALABRAS_PEDIDO.some((word) => normalized.includes(word));
}

/**
 * Persiste sólo metadatos útiles de la historia para campañas: contacto,
 * actividad y mensajes entrantes. No emite los mensajes al gateway, por lo
 * que una sincronización histórica nunca contesta retroactivamente con la IA.
 */
function sincronizarHistorial(
  { chats = [], contacts = [], messages = [], lidPnMappings = [] } = {},
  db = dbPrincipal
) {
  const lidAPn = new Map();
  lidPnMappings.forEach(({ lid, pn } = {}) => {
    if (lid && pn) {
      lidAPn.set(String(lid), String(pn));
    }
  });
  contacts.forEach((contact = {}) => {
    if (contact.lid && contact.phoneNumber) {
      lidAPn.set(String(contact.lid), String(contact.phoneNumber));
    }
  });

  let contactos = 0;
  [...chats, ...contacts].forEach((item = {}) => {
    const jid = item.id || item.jid || item.lid || '';
    const telefono = item.phoneNumber || item.pn || lidAPn.get(String(jid)) || '';
    const nombre =
      item.name || item.displayName || item.notify || item.verifiedName || item.subject || '';
    const fecha = fechaIso(item.conversationTimestamp || item.timestamp);
    if (guardarContacto({ jid, telefono, nombre, fecha, origen: 'historial', lidAPn }, db)) {
      contactos += 1;
    }
  });

  const guardarMensaje = db.prepare(
    `INSERT OR IGNORE INTO wa_respuestas (telefono, texto, es_baja, mensaje_id, recibido_en)
     VALUES (?, ?, 0, ?, COALESCE(?, CURRENT_TIMESTAMP))`
  );
  let respuestas = 0;
  messages.forEach((message = {}) => {
    if (message?.key?.fromMe) return;
    const jid = message?.key?.remoteJid || '';
    if (!esChatIndividual(jid)) return;
    const telefono = telefonoDe({
      jid,
      telefono: message?.key?.remoteJidAlt || message?.key?.participantAlt || '',
      lidAPn,
    });
    if (!telefono) return;
    guardarContacto(
      {
        jid,
        telefono,
        nombre: message?.pushName || '',
        fecha: fechaIso(message?.messageTimestamp),
        origen: 'historial',
        lidAPn,
      },
      db
    );
    const messageId = String(message?.key?.id || '').trim();
    if (!messageId) return;
    const result = guardarMensaje.run(
      telefono,
      textoDeMensaje(message) || '[mensaje multimedia]',
      messageId,
      fechaIso(message?.messageTimestamp)
    );
    respuestas += Number(result.changes || 0);
  });
  return { contactos, respuestas, lidAPn };
}

/**
 * Recupera la agenda cuando la sesión ya estaba vinculada antes de que el
 * módulo masivo empezara a escuchar `messaging-history.set`.
 *
 * Baileys entrega el historial completo al vincular, no en cada reconexión.
 * El gateway de atención, en cambio, ya conserva en estas mismas tablas los
 * chats y mensajes que realmente pasaron por el número. Reutilizarlos evita
 * pedir otro QR y, sobre todo, no mezcla la agenda de WhatsApp con clientes
 * cargados a mano en el TPV.
 *
 * Es idempotente: el JID y el id sintético de cada mensaje son únicos.
 */
function recuperarAgendaDesdeConversaciones(db = dbPrincipal) {
  const existeTabla = (nombre) =>
    Boolean(
      db
        .prepare("SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(nombre)
    );
  if (!existeTabla('whatsapp_conversaciones') || !existeTabla('whatsapp_mensajes')) {
    return { contactos: 0, respuestas: 0, omitidos: 0 };
  }

  const conversaciones = db
    .prepare(
      `SELECT telefono, nombre, ultimo_mensaje_en
         FROM whatsapp_conversaciones
        WHERE COALESCE(telefono, '') <> ''`
    )
    .all();
  const mensajes = db
    .prepare(
      `SELECT id, telefono, contenido, creado_en
         FROM whatsapp_mensajes
        WHERE direccion = 'entrante' AND COALESCE(contenido, '') <> ''
        ORDER BY id ASC`
    )
    .all();
  const guardarRespuesta = db.prepare(
    `INSERT OR IGNORE INTO wa_respuestas (telefono, texto, es_baja, mensaje_id, recibido_en)
     VALUES (?, ?, 0, ?, COALESCE(?, CURRENT_TIMESTAMP))`
  );

  let contactos = 0;
  let respuestas = 0;
  let omitidos = 0;
  db.transaction(() => {
    conversaciones.forEach((conversacion) => {
      const telefono = normalizarTelefono(conversacion.telefono);
      if (!telefono) {
        omitidos += 1;
        return;
      }
      // Un error antiguo guardó el nombre del negocio como nombre de varios
      // clientes. Vacío es más honesto y permite que un evento futuro de
      // WhatsApp complete el nombre correcto sin mostrar un dato falso.
      const nombre = /^modo\s+sabor$/i.test(String(conversacion.nombre || '').trim())
        ? ''
        : conversacion.nombre;
      if (
        guardarContacto(
          {
            jid: `${telefono}@s.whatsapp.net`,
            telefono,
            nombre,
            fecha: conversacion.ultimo_mensaje_en,
            origen: 'conversaciones',
          },
          db
        )
      ) {
        contactos += 1;
      }
    });

    mensajes.forEach((mensaje) => {
      const telefono = normalizarTelefono(mensaje.telefono);
      if (!telefono) return;
      const result = guardarRespuesta.run(
        telefono,
        String(mensaje.contenido || '').slice(0, 2000),
        `conversacion-${mensaje.id}`,
        mensaje.creado_en || null
      );
      respuestas += Number(result.changes || 0);
    });
  })();

  return { contactos, respuestas, omitidos };
}

function contarConversacionesEsperandoPersona(db = dbPrincipal) {
  if (
    !db
      .prepare(
        "SELECT 1 AS existe FROM sqlite_master WHERE type = 'table' AND name = 'whatsapp_conversaciones'"
      )
      .get()
  ) {
    return 0;
  }
  return Number(
    db
      .prepare(
        `SELECT COUNT(*) AS cantidad
           FROM whatsapp_conversaciones
          WHERE escalado_humano = 1
            AND bot_silenciado = 1
            AND (bot_silenciado_hasta IS NULL OR bot_silenciado_hasta > CURRENT_TIMESTAMP)`
      )
      .get().cantidad || 0
  );
}

function diasDesde(value, ahora = Date.now()) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 ? Math.floor((ahora - time) / 86400000) : null;
}

function segmentosDeContacto(
  contacto,
  { respuestas = [], enviados = 0, excluido = false, ahora = Date.now() } = {}
) {
  const segments = [];
  const pidio = respuestas.some((item) => parecePedido(item.texto));
  const ayer = new Date(ahora - 86400000).toISOString().slice(0, 10);
  const ultimaRespuesta = respuestas[respuestas.length - 1]?.recibido_en || null;
  const diasUltimo = diasDesde(contacto.ultimo_mensaje_en, ahora);
  const diasRespuesta = diasDesde(ultimaRespuesta, ahora);
  if (excluido) segments.push('excluido');
  if (pidio) segments.push('pidio');
  if (
    respuestas.some(
      (item) => String(item.recibido_en || '').slice(0, 10) === ayer && parecePedido(item.texto)
    )
  ) {
    segments.push('pidio_ayer');
  }
  if (respuestas.length) segments.push('respondio');
  if (diasUltimo !== null && diasUltimo <= 7 && enviados <= 1) segments.push('nuevo');
  if (diasUltimo !== null && diasUltimo <= 7 && enviados === 0) segments.push('nuevo_sin_enviar');
  if (
    (diasRespuesta !== null && diasRespuesta <= 14) ||
    (diasUltimo !== null && diasUltimo <= 14 && respuestas.length)
  ) {
    segments.push('activo');
  }
  if (enviados >= 3 && !respuestas.length) segments.push('frio');
  if (diasUltimo !== null && diasUltimo >= 45) segments.push('viejo');
  if (enviados === 0) segments.push('sin_enviar');
  return segments;
}

function audiencia(db = dbPrincipal, ahora = Date.now()) {
  const contacts = db
    .prepare(`SELECT * FROM wa_contactos WHERE COALESCE(telefono, '') <> ''`)
    .all();
  const responses = db
    .prepare(
      'SELECT telefono, texto, recibido_en FROM wa_respuestas ORDER BY recibido_en ASC, id ASC'
    )
    .all();
  const sent = db
    .prepare(
      "SELECT telefono, COUNT(*) AS total FROM wa_envios WHERE estado = 'enviado' GROUP BY telefono"
    )
    .all();
  const excluded = new Set(
    db
      .prepare('SELECT telefono FROM wa_excluidos')
      .all()
      .map((row) => row.telefono)
  );
  const responsesByPhone = new Map();
  responses.forEach((row) => {
    if (!responsesByPhone.has(row.telefono)) responsesByPhone.set(row.telefono, []);
    responsesByPhone.get(row.telefono).push(row);
  });
  const sentByPhone = new Map(sent.map((row) => [row.telefono, Number(row.total || 0)]));
  return contacts.map((contact) => {
    const phone = normalizarTelefono(contact.telefono);
    const rows = responsesByPhone.get(phone) || [];
    const excludedContact = Boolean(contact.excluido) || excluded.has(phone);
    return {
      ...contact,
      telefono: phone || contact.telefono,
      segmentos: segmentosDeContacto(contact, {
        respuestas: rows,
        enviados: sentByPhone.get(phone) || 0,
        excluido: excludedContact,
        ahora,
      }),
      total_respuestas: rows.length,
      total_enviados: sentByPhone.get(phone) || 0,
      excluido: excludedContact ? 1 : 0,
    };
  });
}

function resumenSegmentos(db = dbPrincipal) {
  const data = audiencia(db);
  return SEGMENTOS.map((segment) => ({
    ...segment,
    total:
      segment.id === 'todos'
        ? data.filter((item) => !item.excluido).length
        : data.filter((item) => item.segmentos.includes(segment.id)).length,
  }));
}

module.exports = {
  SEGMENTOS,
  audiencia,
  guardarContacto,
  parecePedido,
  recuperarAgendaDesdeConversaciones,
  resumenSegmentos,
  sincronizarHistorial,
  contarConversacionesEsperandoPersona,
};

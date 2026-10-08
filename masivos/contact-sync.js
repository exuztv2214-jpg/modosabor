'use strict';

function serializedId(value) {
  if (typeof value === 'string') return value.trim();
  return String(value?._serialized || '').trim();
}

function phoneDigits(value) {
  const raw = serializedId(value) || String(value || '').trim();
  if (!raw) return '';
  if (/@lid$/i.test(raw)) return '';
  const withoutServer = raw.replace(/@(?:c\.us|lid)$/i, '');
  const digits = withoutServer.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16 ? digits : '';
}

async function conTiempoLimite(promise, ms, etiqueta) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${etiqueta} excedió ${ms / 1000}s`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// "Nombre" que en realidad no lo es: vacío, de relleno, o el número de teléfono
// (WhatsApp titula así los chats de quien no está agendado).
const NOMBRES_DE_RELLENO = new Set(['Sin nombre', 'Contacto WhatsApp', 'Contacto importado']);
function esNombreGenerico(nombre) {
  const n = String(nombre || '').trim();
  return !n || NOMBRES_DE_RELLENO.has(n) || !/\p{L}/u.test(n);
}

function mergeSyncedContacts(chats, contacts, previous, lidMappings = []) {
  const phoneToLid = new Map();
  const phoneByLid = new Map();
  for (const item of [
    ...(previous || []).map((contact) => ({ lid: contact?.numero, pn: contact?.telefono })),
    ...(contacts || []).map((contact) => ({
      lid: contact?.id || contact?.numero,
      pn: contact?.number || contact?.phoneNumber || contact?.userid,
    })),
    ...lidMappings,
  ]) {
    const lid = serializedId(item?.lid);
    const pn = serializedId(item?.pn || item?.phone);
    const digits = phoneDigits(pn);
    const lidDigits = lid.replace(/\D/g, '');
    if (/@lid$/i.test(lid) && digits && digits !== lidDigits) {
      phoneToLid.set(`${digits}@c.us`, lid);
      phoneByLid.set(lid, digits);
    }
  }

  const canonical = (id) => phoneToLid.get(id) || id;
  const previousById = new Map(
    (previous || [])
      .filter((item) => serializedId(item?.numero))
      .map((item) => [canonical(serializedId(item.numero)), item])
  );
  const records = new Map();
  const add = (id, name, phone, lastMessage, old = null) => {
    const originalId = serializedId(id);
    const server = originalId.split('@')[1];
    if (!['c.us', 'lid'].includes(server)) return;
    const numero = canonical(originalId);
    const digits = phoneDigits(phone);
    const lidDigits = server === 'lid' ? originalId.replace(/\D/g, '') : '';
    const telefono = phoneByLid.get(numero) || (digits !== lidDigits ? digits : '');
    const incomingName = String(name || '').trim();
    const record = records.get(numero);
    const ultimoMensaje = [record?.ultimoMensaje, old?.ultimoMensaje, lastMessage]
      .filter(Boolean)
      .sort()
      .at(-1);
    // Un nombre real gana a un número o a "Sin nombre", venga de donde venga.
    const nombres = [old?.nombre, incomingName, record?.nombre];
    const merged = {
      ...(record || old || {}),
      ...(old || {}),
      numero,
      nombre:
        nombres.find((n) => n && !esNombreGenerico(n)) ||
        nombres.find((n) => String(n || '').trim()) ||
        'Sin nombre',
      ...(telefono ? { telefono } : {}),
      ...(ultimoMensaje ? { ultimoMensaje } : {}),
    };
    if (telefono) merged.telefono = telefono;
    else delete merged.telefono;
    records.set(numero, merged);
  };

  for (const item of previous || [])
    add(item?.numero, item?.nombre, item?.telefono, item?.ultimoMensaje, item);
  for (const chat of chats || []) {
    if (chat?.isGroup || chat?.grupo || chat?.isChannel) continue;
    const id = serializedId(chat?.id) || serializedId(chat?.numero);
    const old = previousById.get(canonical(id));
    add(
      id,
      chat?.name || chat?.formattedTitle || chat?.nombre,
      chat?.phoneNumber,
      chat?.timestamp ? new Date(chat.timestamp * 1000).toISOString().slice(0, 10) : '',
      old
    );
  }
  for (const contact of contacts || []) {
    if (
      contact?.isGroup ||
      contact?.isMe ||
      contact?.isUser === false ||
      contact?.isWAContact === false
    )
      continue;
    const id = serializedId(contact?.id) || serializedId(contact?.numero);
    if (!records.has(canonical(id))) continue;
    add(
      id,
      contact?.name || contact?.pushname || contact?.shortName,
      contact?.number || contact?.userid || contact?.phoneNumber,
      '',
      previousById.get(canonical(id))
    );
  }
  return [...records.values()].sort((a, b) =>
    (a.nombre || a.numero).localeCompare(b.nombre || b.numero)
  );
}

function crearResolutorContactos(clientes) {
  const equivalentes = new Map();
  // Un LID con teléfono conocido une ambos IDs sin reescribir el historial.
  for (const cliente of clientes || []) {
    const numero = serializedId(cliente?.numero);
    const telefono = phoneDigits(cliente?.telefono);
    if (numero && telefono && numero.endsWith('@lid')) equivalentes.set(`${telefono}@c.us`, numero);
  }
  return (numero) => equivalentes.get(serializedId(numero)) || serializedId(numero);
}

// En los mensajes con foto o video, WhatsApp Web guarda en "body" la miniatura en
// base64 ("/9j/4AAQ..."), no el texto. Se descarta para no mostrar basura.
const TIPOS_MEDIA = new Set(['image', 'video', 'sticker', 'ptt', 'audio', 'document']);
function cuerpoLimpio(body, type) {
  const texto = String(body || '');
  const compacto = texto.replace(/\s/g, '');
  const pareceBase64 = compacto.length >= 60 && /^[A-Za-z0-9+/=]+$/.test(compacto);
  if (pareceBase64 && (TIPOS_MEDIA.has(type) || /^(\/9j\/|iVBOR|UklGR)/.test(compacto))) return '';
  return texto;
}

function normalizeChats(chats) {
  return (chats || [])
    .map((chat) => {
      const numero = serializedId(chat?.numero) || serializedId(chat?.id);
      if (!numero || !/@(?:c\.us|lid|g\.us)$/i.test(numero)) return null;
      const mensajes = Array.isArray(chat?.mensajes)
        ? chat.mensajes.slice(-100).map((mensaje) => ({
            id: String(mensaje?.id || '') || null,
            fromMe: Boolean(mensaje?.fromMe),
            body: cuerpoLimpio(mensaje?.body, String(mensaje?.type || 'chat')),
            type: String(mensaje?.type || 'chat'),
            hasMedia: Boolean(mensaje?.hasMedia),
            timestamp: Number(mensaje?.timestamp) || null,
            ack: mensaje?.ack ?? null,
          }))
        : [];
      return {
        numero,
        nombre:
          String(chat?.nombre || chat?.formattedTitle || chat?.name || '').trim() || 'Sin nombre',
        timestamp: Number(chat?.timestamp || chat?.t || 0),
        grupo: Boolean(chat?.grupo || chat?.isGroup || chat?.groupMetadata),
        canal: Boolean(chat?.canal || chat?.isChannel || chat?.newsletterMetadata),
        noLeidos: Number(chat?.noLeidos || chat?.unreadCount || 0),
        texto: cuerpoLimpio(
          String(chat?.texto || chat?.lastMessageBody || '').trim(),
          String(chat?.tipo || chat?.lastMessageType || '')
        ),
        tipo: String(chat?.tipo || chat?.lastMessageType || ''),
        fromMe: Boolean(chat?.fromMe || chat?.lastMessageFromMe),
        ...(chat?.foto ? { foto: String(chat.foto) } : {}),
        mensajes,
      };
    })
    .filter(Boolean);
}

// Une la lectura nueva de WhatsApp con lo ya guardado: WhatsApp Web sólo tiene en
// memoria los últimos mensajes de cada chat, así que reemplazar el archivo borraba
// el historial acumulado. Los chats que no vinieron en la lectura se conservan.
function mergeChats(previos, nuevos) {
  const guardados = new Map(normalizeChats(previos).map((chat) => [chat.numero, chat]));
  const resultado = normalizeChats(nuevos).map((chat) => {
    const previo = guardados.get(chat.numero);
    guardados.delete(chat.numero);
    if (!previo) return chat;
    const porId = new Map();
    const sinId = [];
    for (const mensaje of [...previo.mensajes, ...chat.mensajes]) {
      if (mensaje.id) porId.set(mensaje.id, mensaje);
      else sinId.push(mensaje);
    }
    const mensajes = [...porId.values(), ...sinId]
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .slice(-100);
    return {
      ...chat,
      nombre: chat.nombre === 'Sin nombre' ? previo.nombre : chat.nombre,
      foto: chat.foto || previo.foto,
      timestamp: Math.max(chat.timestamp || 0, previo.timestamp || 0),
      mensajes,
    };
  });
  return [...resultado, ...guardados.values()];
}

function appendChatMessage(chats, message, numero) {
  const id = serializedId(numero);
  if (!id || id === 'status@broadcast' || !Array.isArray(chats)) return false;
  let chat = chats.find((item) => (serializedId(item?.numero) || serializedId(item?.id)) === id);
  if (!chat) {
    chat = { id, name: '', timestamp: 0, isGroup: id.endsWith('@g.us'), mensajes: [] };
    chats.unshift(chat);
  }
  const item = {
    id: serializedId(message?.id) || null,
    fromMe: Boolean(message?.fromMe || message?.id?.fromMe),
    body: cuerpoLimpio(message?.body || message?.caption || '', message?.type || 'chat'),
    type: message?.type || 'chat',
    hasMedia: Boolean(message?.hasMedia || message?.mediaData),
    timestamp: Number(message?.timestamp || message?.t || Math.floor(Date.now() / 1000)),
    ack: message?.ack ?? null,
  };
  if (item.id && (chat.mensajes || []).some((saved) => saved?.id === item.id)) return false;
  chat.mensajes = [...(Array.isArray(chat.mensajes) ? chat.mensajes : []), item].slice(-100);
  chat.timestamp = item.timestamp;
  chat.lastMessageBody = item.body;
  chat.lastMessageType = item.type;
  chat.lastMessageFromMe = item.fromMe;
  // Los chats ya guardados usan los campos normalizados: se actualizan también,
  // si no la lista seguía mostrando el mensaje anterior.
  chat.texto = item.body;
  chat.tipo = item.type;
  chat.fromMe = item.fromMe;
  return true;
}

// Suma mensajes anteriores (historial) a un chat guardado: sin duplicar por id,
// ordenados, los últimos 100, y el "último mensaje" sigue siendo el más nuevo.
// Devuelve cuántos mensajes nuevos quedaron.
function agregarHistorial(chats, numero, mensajes) {
  const id = serializedId(numero);
  if (!id || !Array.isArray(chats)) return 0;
  let chat = chats.find((item) => (serializedId(item?.numero) || serializedId(item?.id)) === id);
  if (!chat) {
    chat = { id, name: '', timestamp: 0, isGroup: id.endsWith('@g.us'), mensajes: [] };
    chats.push(chat);
  }
  const previos = Array.isArray(chat.mensajes) ? chat.mensajes : [];
  const ids = new Set(previos.map((m) => m?.id).filter(Boolean));
  const nuevos = (mensajes || [])
    .filter((m) => m && (!m.id || !ids.has(m.id)))
    .map((m) => ({
      id: m.id || null,
      fromMe: Boolean(m.fromMe),
      body: cuerpoLimpio(m.body || '', m.type || 'chat'),
      type: m.type || 'chat',
      hasMedia: Boolean(m.hasMedia),
      timestamp: Number(m.timestamp || 0) || null,
      ack: m.ack ?? null,
    }));
  if (!nuevos.length) return 0;
  chat.mensajes = [...previos, ...nuevos]
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-100);
  const ultimo = chat.mensajes.at(-1);
  if ((ultimo.timestamp || 0) >= (chat.timestamp || 0)) {
    chat.timestamp = ultimo.timestamp;
    chat.lastMessageBody = ultimo.body;
    chat.lastMessageType = ultimo.type;
    chat.lastMessageFromMe = ultimo.fromMe;
    chat.texto = ultimo.body;
    chat.tipo = ultimo.type;
    chat.fromMe = ultimo.fromMe;
  }
  return nuevos.filter((m) => chat.mensajes.includes(m)).length;
}

async function leerChatsConRespaldo(lecturaLigera, lecturaCompleta) {
  try {
    const chats = await lecturaLigera();
    if (Array.isArray(chats)) return { chats, fuente: 'colección' };
  } catch (error) {
    if (/excedió|timeout/i.test(String(error?.message || error))) throw error;
  }
  return { chats: await lecturaCompleta(), fuente: 'getChats' };
}

function normalizarContactosLivianos(contacts) {
  return (contacts || []).map((contact) => ({
    id: serializedId(contact?.id),
    name: contact?.name || contact?.pushname || contact?.shortName || '',
    number: serializedId(contact?.phoneNumber) || serializedId(contact?.userid),
    isGroup: Boolean(contact?.isGroup),
    isMe: Boolean(contact?.isMe),
    isUser: contact?.isUser !== false,
    isWAContact: contact?.isWAContact !== false,
  }));
}

function normalizarMapeosLid(items) {
  return (items || [])
    .map((item) => ({ lid: serializedId(item?.lid), pn: serializedId(item?.pn) }))
    .filter((item) => /@lid$/i.test(item.lid) && phoneDigits(item.pn));
}

module.exports = {
  crearResolutorContactos,
  cuerpoLimpio,
  esNombreGenerico,
  mergeSyncedContacts,
  normalizeChats,
  mergeChats,
  appendChatMessage,
  agregarHistorial,
  leerChatsConRespaldo,
  normalizarContactosLivianos,
  normalizarMapeosLid,
  conTiempoLimite,
};

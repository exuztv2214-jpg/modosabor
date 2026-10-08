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
    const merged = {
      ...(record || old || {}),
      ...(old || {}),
      numero,
      nombre:
        old?.nombre &&
        !['Sin nombre', 'Contacto WhatsApp', 'Contacto importado'].includes(old.nombre)
          ? old.nombre
          : incomingName || record?.nombre || old?.nombre || 'Sin nombre',
      ...(telefono ? { telefono } : {}),
      ...(lastMessage ? { ultimoMensaje: lastMessage } : {}),
    };
    if (telefono) merged.telefono = telefono;
    else delete merged.telefono;
    records.set(numero, merged);
  };

  for (const item of (previous || []).filter((contact) => contact?.origen === 'crm'))
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

function normalizeChats(chats) {
  return (chats || [])
    .map((chat) => {
      const numero = serializedId(chat?.numero) || serializedId(chat?.id);
      if (!numero || !/@(?:c\.us|lid|g\.us)$/i.test(numero)) return null;
      const mensajes = Array.isArray(chat?.mensajes)
        ? chat.mensajes.slice(-100).map((mensaje) => ({
            id: String(mensaje?.id || '') || null,
            fromMe: Boolean(mensaje?.fromMe),
            body: String(mensaje?.body || ''),
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
        texto: String(chat?.texto || chat?.lastMessageBody || '').trim(),
        tipo: String(chat?.tipo || chat?.lastMessageType || ''),
        fromMe: Boolean(chat?.fromMe || chat?.lastMessageFromMe),
        mensajes,
      };
    })
    .filter(Boolean);
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
    body: String(message?.body || message?.caption || ''),
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
  return true;
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
  mergeSyncedContacts,
  normalizeChats,
  appendChatMessage,
  leerChatsConRespaldo,
  normalizarContactosLivianos,
  normalizarMapeosLid,
  conTiempoLimite,
};

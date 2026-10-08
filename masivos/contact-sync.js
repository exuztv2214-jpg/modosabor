'use strict';

function serializedId(value) {
  if (typeof value === 'string') return value.trim();
  return String(value?._serialized || '').trim();
}

function phoneDigits(value) {
  const raw = serializedId(value) || String(value || '').trim();
  if (!raw) return '';
  const withoutServer = raw.replace(/@(?:c\.us|lid)$/i, '');
  const digits = withoutServer.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 16 ? digits : '';
}

function mergeSyncedContacts(chats, contacts, previous, lidMappings = []) {
  const phoneToLid = new Map();
  const phoneByLid = new Map();
  for (const item of lidMappings) {
    const lid = serializedId(item?.lid);
    const pn = serializedId(item?.pn || item?.phone);
    const digits = phoneDigits(pn);
    if (/@lid$/i.test(lid) && digits) {
      phoneToLid.set(`${digits}@c.us`, lid);
      phoneByLid.set(lid, digits);
    }
  }

  const canonical = (id) => phoneToLid.get(id) || id;
  const records = new Map();
  const add = (id, name, phone, lastMessage, old = null) => {
    const originalId = serializedId(id);
    const server = originalId.split('@')[1];
    if (!['c.us', 'lid'].includes(server)) return;
    const numero = canonical(originalId);
    const telefono = phoneDigits(phone) || phoneByLid.get(numero) || '';
    const incomingName = String(name || '').trim();
    const record = records.get(numero);
    records.set(numero, {
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
    });
  };

  for (const item of previous || [])
    add(item?.numero, item?.nombre, item?.telefono, item?.ultimoMensaje, item);
  for (const chat of chats || []) {
    if (chat?.isGroup || chat?.grupo || chat?.isChannel) continue;
    const id = serializedId(chat?.id) || serializedId(chat?.numero);
    add(
      id,
      chat?.name || chat?.formattedTitle || chat?.nombre,
      chat?.phoneNumber,
      chat?.timestamp ? new Date(chat.timestamp * 1000).toISOString().slice(0, 10) : ''
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
    add(
      id,
      contact?.name || contact?.pushname || contact?.shortName,
      contact?.number || contact?.userid || contact?.phoneNumber,
      ''
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
      return {
        numero,
        nombre:
          String(chat?.nombre || chat?.formattedTitle || chat?.name || '').trim() || 'Sin nombre',
        timestamp: Number(chat?.timestamp || chat?.t || 0),
        grupo: Boolean(chat?.grupo || chat?.isGroup || chat?.groupMetadata),
        canal: Boolean(chat?.canal || chat?.isChannel || chat?.newsletterMetadata),
        noLeidos: Number(chat?.noLeidos || chat?.unreadCount || 0),
      };
    })
    .filter(Boolean);
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

module.exports = { mergeSyncedContacts, normalizeChats, leerChatsConRespaldo };

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.join(__dirname, '..', 'contact-sync.js');
const sync = fs.existsSync(modulePath) ? require(modulePath) : {};
assert.equal(typeof sync.mergeSyncedContacts, 'function');
assert.equal(typeof sync.normalizeChats, 'function');
assert.equal(typeof sync.appendChatMessage, 'function');
assert.equal(typeof sync.leerChatsConRespaldo, 'function');
assert.equal(typeof sync.normalizarContactosLivianos, 'function');
assert.equal(typeof sync.normalizarMapeosLid, 'function');
assert.equal(typeof sync.conTiempoLimite, 'function');

const chats = [
  {
    id: { _serialized: 'lid-a@lid' },
    name: 'Chat A',
    timestamp: 10,
    lastMessageBody: 'Mensaje real del chat',
    lastMessageType: 'chat',
    lastMessageFromMe: true,
    mensajes: [
      { id: 'm1', fromMe: false, body: 'Hola', type: 'chat', timestamp: 8 },
      { id: 'm2', fromMe: true, body: 'Respuesta', type: 'chat', timestamp: 10 },
    ],
  },
  { id: { _serialized: 'group@g.us' }, name: 'Grupo', isGroup: true, timestamp: 20 },
];
const contacts = [
  { id: { _serialized: 'lid-a@lid' }, name: 'Agenda A', number: '5493812345678' },
  { id: { _serialized: 'new@lid' }, pushname: 'Sólo agenda' },
];
const mappings = [{ lid: 'lid-a@lid', pn: '5493812345678@c.us' }];
const merged = sync.mergeSyncedContacts(chats, contacts, [], mappings);

assert.equal(merged.length, 1, 'usa los chats como padrón y la agenda sólo para enriquecerlos');
assert.deepEqual(
  merged.map(({ numero, telefono }) => [numero, telefono || null]),
  [['lid-a@lid', '5493812345678']]
);
assert.deepEqual(
  sync.normalizeChats(chats)[0].mensajes.map(({ id, body, fromMe }) => ({ id, body, fromMe })),
  [
    { id: 'm1', body: 'Hola', fromMe: false },
    { id: 'm2', body: 'Respuesta', fromMe: true },
  ],
  'conserva los mensajes recientes del chat'
);
assert.equal(merged.find((item) => item.numero === 'lid-a@lid').nombre, 'Agenda A');
assert.equal(sync.normalizeChats(chats).length, 2, 'la bandeja conserva también los grupos');
assert.equal(sync.normalizeChats(chats).find((item) => item.grupo).numero, 'group@g.us');
assert.deepEqual(
  {
    texto: sync.normalizeChats(chats)[0].texto,
    tipo: sync.normalizeChats(chats)[0].tipo,
    fromMe: sync.normalizeChats(chats)[0].fromMe,
  },
  { texto: 'Mensaje real del chat', tipo: 'chat', fromMe: true },
  'conserva la vista previa real del último mensaje'
);
const manyChats = sync.normalizeChats(
  Array.from({ length: 566 }, (_, index) => ({
    id: { _serialized: `chat-${index}@lid` },
    name: `Chat ${index}`,
  }))
);
assert.equal(manyChats.length, 566, 'no se trunca la bandeja cuando supera 500 chats');

const liveChats = [{ id: 'cliente@lid', foto: 'cliente.jpg', mensajes: [] }];
assert.equal(
  sync.appendChatMessage(
    liveChats,
    { id: { _serialized: 'mensaje-1' }, body: 'Mensaje nuevo', timestamp: 30 },
    'cliente@lid'
  ),
  true,
  'agrega el mensaje entrante al chat existente'
);
assert.equal(liveChats[0].mensajes[0].body, 'Mensaje nuevo');
assert.equal(liveChats[0].foto, 'cliente.jpg', 'no pierde la foto ni los metadatos del chat');
assert.equal(
  sync.appendChatMessage(
    liveChats,
    { id: { _serialized: 'mensaje-1' }, body: 'Duplicado', timestamp: 30 },
    'cliente@lid'
  ),
  false,
  'no duplica un mensaje ya guardado'
);

// Un número de teléfono no cuenta como nombre: gana el nombre del perfil de WhatsApp.
assert.equal(sync.esNombreGenerico('+54 9 3863 50-3847'), true);
assert.equal(sync.esNombreGenerico('Sin nombre'), true);
assert.equal(sync.esNombreGenerico('Ana'), false);
assert.equal(
  sync.mergeSyncedContacts(
    [{ id: { _serialized: 'num@lid' }, name: '+54 9 3863 50-3847' }],
    [{ id: { _serialized: 'num@lid' }, name: 'Ana Gómez' }],
    [{ numero: 'num@lid', nombre: '+54 9 3863 50-3847' }]
  )[0].nombre,
  'Ana Gómez'
);
assert.equal(
  sync.mergeSyncedContacts(
    [{ id: { _serialized: 'num@lid' }, name: '+54 9 3863 50-3847' }],
    [],
    [{ numero: 'num@lid', nombre: 'Ana agendada' }]
  )[0].nombre,
  'Ana agendada',
  'no pisa un nombre real con el número'
);

// Un mensaje en vivo actualiza la vista previa de un chat ya guardado (normalizado).
const guardadoNormalizado = sync.normalizeChats([
  { id: 'vivo@lid', lastMessageBody: 'Mensaje viejo', timestamp: 10, mensajes: [] },
]);
sync.appendChatMessage(
  guardadoNormalizado,
  { id: { _serialized: 'm-nuevo' }, body: 'Mensaje nuevo', timestamp: 20 },
  'vivo@lid'
);
assert.equal(sync.normalizeChats(guardadoNormalizado)[0].texto, 'Mensaje nuevo');

// La miniatura en base64 de una foto no se muestra como texto del mensaje.
const miniatura = '/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(80);
assert.equal(sync.cuerpoLimpio(miniatura, 'image'), '');
assert.equal(sync.cuerpoLimpio(miniatura, 'chat'), '', 'aunque el tipo venga mal');
assert.equal(sync.cuerpoLimpio('Hoy hay pizza', 'image'), 'Hoy hay pizza', 'conserva el texto');
assert.equal(sync.cuerpoLimpio('a'.repeat(80), 'chat'), 'a'.repeat(80), 'no toca texto común');
assert.equal(
  sync.normalizeChats([{ id: 'x@lid', lastMessageBody: miniatura, lastMessageType: 'image' }])[0]
    .texto,
  ''
);

// Sincronizar no borra el historial guardado ni los chats que WhatsApp no devolvió.
const guardados = [
  {
    numero: 'cliente@lid',
    nombre: 'Cliente',
    foto: 'cliente.jpg',
    timestamp: 20,
    mensajes: [
      { id: 'viejo-1', body: 'Pedido de ayer', timestamp: 10 },
      { id: 'viejo-2', body: 'Gracias', timestamp: 20 },
    ],
  },
  { numero: 'archivado@lid', nombre: 'Archivado', mensajes: [{ id: 'a1', body: 'Hola' }] },
];
const lecturaNueva = [
  {
    id: { _serialized: 'cliente@lid' },
    name: '',
    timestamp: 30,
    mensajes: [
      { id: 'viejo-2', body: 'Gracias', timestamp: 20 },
      { id: 'nuevo-1', body: 'Hoy quiero milanesa', timestamp: 30 },
    ],
  },
];
const unidos = sync.mergeChats(guardados, lecturaNueva);
const cliente = unidos.find((chat) => chat.numero === 'cliente@lid');
assert.deepEqual(
  cliente.mensajes.map((m) => m.id),
  ['viejo-1', 'viejo-2', 'nuevo-1'],
  'une historial guardado y lectura nueva sin duplicar, en orden'
);
assert.equal(cliente.nombre, 'Cliente', 'no pisa el nombre con "Sin nombre"');
assert.equal(cliente.foto, 'cliente.jpg', 'conserva la foto');
assert.equal(cliente.timestamp, 30);
assert.ok(
  unidos.some((chat) => chat.numero === 'archivado@lid'),
  'conserva chats que no vinieron en la lectura'
);

void (async () => {
  await assert.rejects(
    sync.conTiempoLimite(new Promise(() => {}), 5, 'foto de perfil'),
    /foto de perfil excedió 0\.005s/
  );

  let lecturaPesada = false;
  const lectura = await sync.leerChatsConRespaldo(
    async () => manyChats,
    async () => {
      lecturaPesada = true;
      return [];
    }
  );
  assert.equal(lectura.chats.length, 566, 'lee el listado liviano completo de 566 chats');
  assert.equal(lectura.fuente, 'colección');
  assert.equal(lecturaPesada, false, 'no hidrata metadatos de grupos en el camino principal');
  const contactosLivianos = sync.normalizarContactosLivianos([
    {
      id: { _serialized: 'cliente-a@lid' },
      phoneNumber: { _serialized: '5493812345678@c.us' },
      pushname: 'Cliente A',
      isUser: true,
      isWAContact: true,
    },
    { id: { _serialized: 'miembro-grupo@lid' }, name: 'Miembro', isGroup: true, isUser: false },
  ]);
  assert.equal(contactosLivianos.length, 2);
  assert.equal(contactosLivianos[0].number, '5493812345678@c.us');
  assert.deepEqual(
    sync.normalizarMapeosLid([
      { lid: 'cliente-a@lid', pn: '5493812345678@c.us' },
      { lid: 'grupo@g.us', pn: '5493811111111@c.us' },
      { lid: 'sin-telefono@lid', pn: null },
    ]),
    [{ lid: 'cliente-a@lid', pn: '5493812345678@c.us' }],
    'conserva sólo relaciones LID a teléfono válidas'
  );
  assert.equal(
    sync.mergeSyncedContacts([], contactosLivianos, []).length,
    0,
    'no agrega agenda ni participantes de grupos si no tienen conversación'
  );
  const lidSinTelefono = sync.mergeSyncedContacts(
    [{ id: { _serialized: '155873238364376@lid' } }],
    sync.normalizarContactosLivianos([
      { id: { _serialized: '155873238364376@lid' }, userid: '155873238364376@lid' },
    ]),
    []
  )[0];
  assert.equal(
    lidSinTelefono.telefono,
    undefined,
    'no presenta el identificador LID como teléfono'
  );
  const lidAntesGuardadoComoTelefono = sync.mergeSyncedContacts(
    [{ id: { _serialized: '155873238364376@lid' } }],
    [],
    [{ numero: '155873238364376@lid', telefono: '155873238364376' }]
  )[0];
  assert.equal(
    lidAntesGuardadoComoTelefono.telefono,
    undefined,
    'limpia teléfonos históricos que eran el mismo identificador LID'
  );
  const duplicadosHistoricos = sync.mergeSyncedContacts(
    [{ id: { _serialized: 'cliente-duplicado@lid' }, name: 'Cliente' }],
    [],
    [
      { numero: 'cliente-duplicado@lid', telefono: '5493812345678', nombre: 'Cliente' },
      { numero: '5493812345678@c.us', telefono: '5493812345678', nombre: 'Cliente' },
    ]
  );
  assert.equal(
    duplicadosHistoricos.length,
    1,
    'deduplica LID y teléfono cuando la relación ya fue resuelta y guardada'
  );
  assert.equal(duplicadosHistoricos[0].numero, 'cliente-duplicado@lid');
  const duplicadoDetectadoEnAgenda = sync.mergeSyncedContacts(
    [{ id: { _serialized: '5493812223344@c.us' }, name: 'Cliente agenda' }],
    [
      {
        id: { _serialized: 'cliente-agenda@lid' },
        phoneNumber: { _serialized: '5493812223344@c.us' },
        name: 'Cliente agenda',
      },
    ],
    [{ numero: '5493812223344@c.us', nombre: 'Cliente agenda' }]
  );
  assert.equal(
    duplicadoDetectadoEnAgenda.length,
    1,
    'deduplica el teléfono cuando la propia agenda informa su LID'
  );
  assert.equal(duplicadoDetectadoEnAgenda[0].numero, 'cliente-agenda@lid');
  const importadoSinChat = sync.mergeSyncedContacts(
    [],
    [],
    [{ origen: 'crm', numero: '5493819998877@c.us', nombre: 'Importado' }]
  );
  assert.equal(importadoSinChat.length, 1, 'conserva contactos importados manualmente');
  // Historial: suma mensajes viejos sin duplicar y el último sigue siendo el más nuevo.
  const conHistorial = [
    {
      numero: 'h@lid',
      timestamp: 300,
      texto: 'nuevo',
      mensajes: [{ id: 'm3', body: 'nuevo', type: 'chat', timestamp: 300 }],
    },
  ];
  assert.equal(
    sync.agregarHistorial(conHistorial, 'h@lid', [
      { id: 'm1', body: 'viejo', type: 'chat', timestamp: 100 },
      { id: 'm2', body: 'medio', type: 'chat', timestamp: 200 },
      { id: 'm3', body: 'nuevo', type: 'chat', timestamp: 300 },
    ]),
    2
  );
  assert.deepEqual(
    conHistorial[0].mensajes.map((m) => m.id),
    ['m1', 'm2', 'm3']
  );
  assert.equal(conHistorial[0].texto, 'nuevo');
  assert.equal(sync.agregarHistorial(conHistorial, 'h@lid', [{ id: 'm1', timestamp: 100 }]), 0);

  console.log('contact and chat sync: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

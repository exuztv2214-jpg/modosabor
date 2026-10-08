const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.join(__dirname, '..', 'contact-sync.js');
const sync = fs.existsSync(modulePath) ? require(modulePath) : {};
assert.equal(typeof sync.mergeSyncedContacts, 'function');
assert.equal(typeof sync.normalizeChats, 'function');
assert.equal(typeof sync.leerChatsConRespaldo, 'function');
assert.equal(typeof sync.normalizarContactosLivianos, 'function');

const chats = [
  { id: { _serialized: 'lid-a@lid' }, name: 'Chat A', timestamp: 10 },
  { id: { _serialized: 'group@g.us' }, name: 'Grupo', isGroup: true, timestamp: 20 },
];
const contacts = [
  { id: { _serialized: 'lid-a@lid' }, name: 'Agenda A', number: '5493812345678' },
  { id: { _serialized: 'new@lid' }, pushname: 'Sólo agenda' },
];
const mappings = [{ lid: 'lid-a@lid', pn: '5493812345678@c.us' }];
const merged = sync.mergeSyncedContacts(chats, contacts, [], mappings);

assert.equal(
  merged.length,
  2,
  'incluye contactos de agenda aunque no tengan chat y no duplica LID/PN'
);
assert.deepEqual(merged.map(({ numero, telefono }) => [numero, telefono || null]).sort(), [
  ['lid-a@lid', '5493812345678'],
  ['new@lid', null],
]);
assert.equal(merged.find((item) => item.numero === 'lid-a@lid').nombre, 'Agenda A');
assert.equal(sync.normalizeChats(chats).length, 2, 'la bandeja conserva también los grupos');
assert.equal(sync.normalizeChats(chats).find((item) => item.grupo).numero, 'group@g.us');
const manyChats = sync.normalizeChats(
  Array.from({ length: 566 }, (_, index) => ({
    id: { _serialized: `chat-${index}@lid` },
    name: `Chat ${index}`,
  }))
);
assert.equal(manyChats.length, 566, 'no se trunca la bandeja cuando supera 500 chats');

void (async () => {
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
    },
  ]);
  assert.deepEqual(contactosLivianos, [
    { id: 'cliente-a@lid', name: 'Cliente A', number: '5493812345678@c.us' },
  ]);
  console.log('contact and chat sync: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

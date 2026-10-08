const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulePath = path.join(__dirname, '..', 'contact-sync.js');
const sync = fs.existsSync(modulePath) ? require(modulePath) : {};
assert.equal(typeof sync.mergeSyncedContacts, 'function');
assert.equal(typeof sync.normalizeChats, 'function');

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
console.log('contact and chat sync: OK');

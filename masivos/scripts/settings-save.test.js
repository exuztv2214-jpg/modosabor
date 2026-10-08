const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const source = app.match(/function settingsPayload\(\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(source, 'settingsPayload debe existir');

const fields = new Map([
  ['#config-delay-min', { value: '15' }],
  ['#config-delay-max', { value: '45' }],
  ['#config-max-hour', { value: '60' }],
  ['#config-greetings', { value: 'Hola\nBuenas' }],
  ['#config-closures', { value: 'Gracias' }],
]);
const document = {
  querySelector: (selector) => fields.get(selector) || null,
  querySelectorAll: () => [],
};
const context = {
  document,
  $: (selector) => document.querySelector(selector),
  Number,
  String,
  Boolean,
};
const settings = vm.runInNewContext(`${source}; settingsPayload()`, context);

assert.equal(settings.DELAY_MIN_MS, 15000);
assert.equal(settings.DELAY_MAX_MS, 45000);
assert.equal(settings.MAX_POR_HORA, 60);
assert.deepEqual(Array.from(settings.SALUDOS), ['Hola', 'Buenas']);
assert.deepEqual(Array.from(settings.CIERRES), ['Gracias']);
console.log('settings save payload: OK');

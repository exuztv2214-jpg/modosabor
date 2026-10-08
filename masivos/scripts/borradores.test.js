const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
function load(name, context) {
  const source = app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`));
  assert.ok(source, name);
  vm.runInContext(source[0], context);
}

test('una respuesta tardía no muestra el historial de otro chat', async () => {
  const pending = {};
  const context = vm.createContext({
    state: { selectedChatNumber: 'B', historyRequested: { A: true, B: true } },
    api: (url) =>
      new Promise((resolve, reject) => {
        pending[url.split('numero=')[1]] = { resolve, reject };
      }),
    AbortSignal,
    render() {},
    scrollConversationToBottom() {},
  });
  load('loadConversation', context);
  const a = context.loadConversation('A'),
    b = context.loadConversation('B');
  pending.B.resolve({ numero: 'B', mensajes: [] });
  await b;
  pending.A.resolve({ numero: 'A', mensajes: [{ body: 'Privado de A' }] });
  await a;
  assert.equal(context.state.conversation.numero, 'B');
  const old = context.loadConversation('A');
  pending.A.reject(new Error('Timeout A'));
  await old;
  assert.equal(context.state.conversation.numero, 'B');
});

test('refrescar no pisa el borrador de la plantilla seleccionada', async () => {
  const urls = [];
  const context = vm.createContext({
    state: {
      campaignTab: 'nuevos',
      message: 'Borrador nuevo',
      messageLoaded: true,
      contacts: [],
      motor: { stats: {} },
    },
    api: async (url) => {
      urls.push(url);
      return url.startsWith('/api/mensaje') ? { texto: 'Guardado' } : {};
    },
    campaignTemplateTag: () => 'nuevo',
    syncShell() {},
    render() {},
    showToast() {},
    AbortSignal,
  });
  load('refresh', context);
  load('refreshOperacion', context);
  await context.refresh();
  assert.equal(context.state.message, 'Borrador nuevo');
  assert.equal(urls.includes('/api/mensaje'), false);
});

test('una carga de mensaje pendiente no pisa texto escrito mientras esperaba', async () => {
  let resolveMessage;
  const context = vm.createContext({
    state: {
      campaignTab: 'general',
      message: '',
      messageLoaded: false,
      contacts: [],
      motor: { stats: {} },
    },
    api: async (url) =>
      url === '/api/mensaje'
        ? new Promise((resolve) => {
            resolveMessage = resolve;
          })
        : {},
    campaignTemplateTag: () => null,
    syncShell() {},
    render() {},
    showToast() {},
    AbortSignal,
  });
  load('refresh', context);
  load('refreshOperacion', context);
  const pending = context.refresh();
  context.state.message = 'Texto recién escrito';
  context.state.messageLoaded = true;
  resolveMessage({ texto: 'Viejo guardado' });
  await pending;
  assert.equal(context.state.message, 'Texto recién escrito');
});

test('cargar una plantilla no pisa texto escrito ni una carga más reciente', async () => {
  const pending = [];
  const context = vm.createContext({
    state: { campaignTab: 'general', message: '', messageLoaded: true, messageRevision: 0 },
    api: () => new Promise((resolve) => pending.push(resolve)),
    campaignTemplateTag: () => null,
    render() {},
    showToast() {},
  });
  load('action', context);
  const first = context.action('campaign-tab', 'general');
  context.state.message = 'Escrito mientras cargaba';
  context.state.messageRevision++;
  pending[0]({ texto: 'Viejo' });
  await first;
  assert.equal(context.state.message, 'Escrito mientras cargaba');
  const old = context.action('campaign-tab', 'general');
  const latest = context.action('campaign-tab', 'general');
  pending[2]({ texto: 'Más reciente' });
  await latest;
  pending[1]({ texto: 'Respuesta tardía' });
  await old;
  assert.equal(context.state.message, 'Más reciente');
});

test('guardar no pisa cambios escritos mientras la petición estaba pendiente', async () => {
  let finish;
  const context = vm.createContext({
    state: {
      campaignTab: 'general',
      message: 'Para guardar',
      messageLoaded: true,
      messageRevision: 0,
    },
    $: () => ({ value: 'Para guardar' }),
    api: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    campaignTemplateTag: () => null,
    showToast() {},
  });
  load('action', context);
  const saving = context.action('save-message');
  context.state.message = 'Nuevo borrador';
  context.state.messageRevision++;
  finish({ ok: true });
  await saving;
  assert.equal(context.state.message, 'Nuevo borrador');
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');

test('las listas se crean sólo al confirmar y conservan la selección revisada', async () => {
  let aceptar;
  const llamadas = [];
  const context = vm.createContext({
    state: {
      selectedContacts: ['ana@lid'],
      contacts: [{ numero: 'ana@lid' }, { numero: 'beto@lid' }],
    },
    solicitarDialogo: () =>
      new Promise((resolve) => {
        aceptar = resolve;
      }),
    api: async (...args) => {
      llamadas.push(args);
      return { total: 1, grupos: [{}] };
    },
    refresh: async () => {},
    showToast() {},
  });
  vm.runInContext(app.match(/async function action\([^]*?\n}/)[0], context);
  let pendiente = context.action('create-batch-groups');
  assert.equal(typeof aceptar, 'function');
  aceptar(null);
  await pendiente;
  assert.equal(llamadas.length, 0);
  pendiente = context.action('create-batch-groups');
  context.state.selectedContacts = ['beto@lid'];
  aceptar({ nombre: 'Clientes' });
  await pendiente;
  assert.equal(llamadas[0][0], '/api/grupos-envio/automaticos');
  assert.deepEqual(JSON.parse(llamadas[0][1].body).numeros, ['ana@lid']);
  assert.equal(
    llamadas.some(([url]) => url.includes('/api/enviar')),
    false
  );
});

test('crear listas conserva un teléfono seleccionado que ahora se representa como LID', async () => {
  const llamadas = [];
  const context = vm.createContext({
    state: {
      selectedContacts: ['5493811111111@c.us'],
      contacts: [{ numero: '123456789012345@lid', telefono: '5493811111111' }],
    },
    solicitarDialogo: async () => ({ nombre: 'Clientes' }),
    api: async (...args) => {
      llamadas.push(args);
      return { total: 1, grupos: [{}] };
    },
    refresh: async () => {},
    showToast() {},
  });
  vm.runInContext(app.match(/async function action\([^]*?\n}/)[0], context);
  await context.action('create-batch-groups');
  assert.equal(llamadas.length, 1);
  assert.deepEqual(JSON.parse(llamadas[0][1].body).numeros, ['123456789012345@lid']);
});
test('cancelar el modal no envía; aceptar conserva el plan revisado', async () => {
  const llamadas = [];
  const context = vm.createContext({
    state: { campaignPlan: { token: 'plan-revisado', segmento: 'grupo:ana' } },
    confirmAction: async () => false,
    api: async (...args) => llamadas.push(args),
    refresh: async () => {},
    showToast() {},
  });
  vm.runInContext(app.match(/async function action\([^]*?\n}/)[0], context);
  await context.action('run-campaign');
  assert.equal(llamadas.length, 0);
  context.confirmAction = async () => true;
  await context.action('run-campaign');
  assert.equal(llamadas[0][0], '/api/enviar');
  assert.deepEqual(JSON.parse(llamadas[0][1].body), {
    token: 'plan-revisado',
    segmento: 'grupo:ana',
    simulacro: false,
  });
});
test('ninguna confirmación o formulario usa los diálogos del navegador', () => {
  assert.equal(/(?:window\.)?\b(?:confirm|prompt|alert)\s*\(/.test(app), false);
});
test('cambiar el plan con el modal abierto obliga a revisarlo de nuevo', async () => {
  let aceptar;
  const llamadas = [];
  const context = vm.createContext({
    state: { campaignPlan: { token: 'anterior', segmento: 'todos' } },
    confirmAction: () =>
      new Promise((resolve) => {
        aceptar = resolve;
      }),
    api: async (...args) => llamadas.push(args),
    refresh: async () => {},
    showToast() {},
  });
  vm.runInContext(app.match(/async function action\([^]*?\n}/)[0], context);
  const pending = context.action('run-campaign');
  context.state.campaignPlan = { token: 'nuevo', segmento: 'nuevos' };
  aceptar(true);
  await pending;
  assert.equal(llamadas.length, 0);
});
test('guardar un perfil no borra nombre ni foto editados durante la petición', async () => {
  let terminar;
  const state = { profileRevision: 0, profileDraft: 'Ana', profileImage: 'foto-anterior' };
  const context = vm.createContext({
    state,
    $: () => ({ value: 'Ana' }),
    api: () =>
      new Promise((resolve) => {
        terminar = resolve;
      }),
    syncShell() {},
    render() {},
    showToast() {},
  });
  vm.runInContext(app.match(/async function action\([^]*?\n}/)[0], context);
  const pending = context.action('save-profile');
  state.profileRevision++;
  state.profileDraft = 'Beto';
  state.profileImage = 'foto-nueva';
  terminar({ nombre: 'Ana', imagen: 'guardada' });
  await pending;
  assert.equal(state.profileDraft, 'Beto');
  assert.equal(state.profileImage, 'foto-nueva');
});

const assert = require('assert');

const social = require('../../services/socialService');

console.log('\nContrato de rutas Social');

const requeridasPorLaApi = [
  'dashboard',
  'getMetrics',
  'listDestinations',
  'createDestination',
  'updateDestination',
  'deleteDestination',
  'listSets',
  'createSet',
  'listTemplates',
  'createTemplate',
  'updateTemplate',
  'deleteTemplate',
  'listCampaigns',
  'getCampaign',
  'createCampaign',
  'queueCampaign',
  'cancelCampaign',
  'retryFailedCampaign',
  'duplicateCampaign',
  'deleteCampaign',
  'createWorkerCommand',
  'getSocialConfig',
  'setSocialConfig',
];

for (const nombre of requeridasPorLaApi) {
  assert.strictEqual(typeof social[nombre], 'function', `Falta social.${nombre}`);
}

assert.deepStrictEqual(social.listTemplates(), []);
assert.deepStrictEqual(social.getSocialConfig(), {
  intervaloSegundos: 30,
  jitter: 0.4,
  cupoDiario: 25,
  cooldownGrupoHoras: 24,
  cupoDiarioInstagram: 50,
  fallosParaPausar: 5,
  ventanaDedupeDias: 7,
  pausaGlobal: false,
  pausaGlobalMotivo: '',
  // Alias conservado para clientes anteriores del panel.
  delaySegundos: 30,
});

console.log('  ✓ todas las rutas Social tienen servicio y respuesta inicial válida');

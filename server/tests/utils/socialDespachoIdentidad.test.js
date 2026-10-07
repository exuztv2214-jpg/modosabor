const assert = require('assert');

const db = require('../../db');
const social = require('../../services/socialService');

async function run() {
  console.log('\nDespacho Social con la identidad real de la base');

  const externa = `test-social-${Date.now()}`;
  const cuentaId = Number(
    db
      .prepare(
        `INSERT INTO social_accounts
          (provider, nombre, identificador_externo, estado, metadata)
         VALUES ('facebook', 'Cuenta Social de prueba', ?, 'desconectada', '{}')`
      )
      .run(externa).lastInsertRowid
  );

  /*
    Esta llamada fue la primera que reveló el problema: el servicio consultaba
    una columna `clave` que nunca existió en social_accounts. Sin token debe
    responder SIN_CONFIGURAR, no romper por la forma de la tabla.
  */
  const salud = await social.probarCredenciales(cuentaId, 'pagina');
  assert.strictEqual(salud.estado, 'SIN_CONFIGURAR');

  const destino = social.createDestination({
    provider: 'facebook',
    cuentaId,
    tipo: 'facebook_page',
    nombre: 'Fan Page de ensayo',
    identificadorExterno: externa,
  });

  const mediaId = Number(
    db
      .prepare(
        `INSERT INTO social_media (nombre, ruta, mime, tamano, tipo)
         VALUES ('promo-ensayo.mp4', '/uploads/social-media/promo-ensayo.mp4',
                 'video/mp4', 7022042, 'video')`
      )
      .run().lastInsertRowid
  );

  const campana = social.createCampaign({
    nombre: 'Ensayo Reel del despachador Social',
    texto: 'Esto es un ensayo de Reel y no se publica.',
    mediaIds: [mediaId],
    destinoIds: [destino.id],
    ensayo: true,
    formato: 'post',
    formatos: { [`${cuentaId}|facebook`]: 'reel' },
  });
  social.queueCampaign(campana.id, { now: true });

  const trabajo = social.claimApiWork();
  assert.ok(trabajo, 'el despachador tiene que reclamar el ensayo');
  assert.strictEqual(trabajo.item.campana_id, campana.id);
  assert.strictEqual(trabajo.item.formato, 'reel');
  assert.strictEqual(trabajo.item.media.length, 1);
  assert.strictEqual(trabajo.item.media[0].mime, 'video/mp4');

  await social.publicarPorApi(trabajo);
  const terminado = social.getCampaign(campana.id);
  assert.strictEqual(terminado.estado, 'published');
  assert.strictEqual(terminado.targets[0].estado, 'published');
  const logDePublicacion = db
    .prepare(
      'SELECT detalle FROM social_publication_logs WHERE target_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(terminado.targets[0].id);
  assert.strictEqual(
    JSON.parse(logDePublicacion.detalle || '{}').referencia,
    `ensayo:${destino.id}`,
    'la publicación conserva la referencia del proveedor para poder pedir métricas después'
  );

  console.log('  ✓ consulta la identidad y completa un ensayo Reel con video sin tocar Meta');
  console.log('✅ Despacho Social verificado\n');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };

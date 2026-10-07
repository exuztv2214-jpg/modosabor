const assert = require('assert');
const fs = require('fs');
const path = require('path');

const db = require('../../db');
const social = require('../../services/socialService');
const { CARPETA } = require('../../services/social/avatares');

const marca = `visual-${Date.now()}`;
const cuenta = db
  .prepare(
    `INSERT INTO social_accounts (provider, identificador_externo, nombre, habilitada, metadata)
     VALUES ('facebook', ?, 'Fan Page visual', 1, ?)`
  )
  .run(marca, JSON.stringify({ tipo: 'page' }));
const cuentaId = Number(cuenta.lastInsertRowid);

const pagina = db
  .prepare(
    `INSERT INTO social_destinations
      (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada)
     VALUES (?, 'facebook', 'facebook_page', 'Página visual', ?, '', '{}', 1)`
  )
  .run(cuentaId, `page-${marca}`);
const paginaId = Number(pagina.lastInsertRowid);

const crearGrupo = (nombre, avatarUrl = '') =>
  Number(
    db
      .prepare(
        `INSERT INTO social_destinations
          (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada)
         VALUES (?, 'facebook', 'facebook_group', ?, ?, '', ?, 0)`
      )
      .run(cuentaId, nombre, `${marca}-${nombre}`, JSON.stringify(avatarUrl ? { avatarUrl } : {}))
      .lastInsertRowid
  );

const grupoUno = crearGrupo('Grupo uno', 'https://scontent.xx.fbcdn.net/grupo.jpg');
const grupoDos = crearGrupo('Grupo dos', 'https://ejemplo.invalid/no-debe-viajar.jpg');
const grupoViejo = Number(
  db
    .prepare(
      `INSERT INTO social_destinations
        (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada)
       VALUES (?, 'facebook', 'facebook_group', 'Grupo viejo', ?, '', ?, 1)`
    )
    .run(cuentaId, `${marca}-viejo`, JSON.stringify({ source: 'worker' })).lastInsertRowid
);
const grupoManual = Number(
  db
    .prepare(
      `INSERT INTO social_destinations
        (cuenta_id, provider, tipo, nombre, identificador_externo, url, metadata, habilitada)
       VALUES (?, 'facebook', 'facebook_group', 'Grupo manual', ?, '', '{}', 1)`
    )
    .run(cuentaId, `${marca}-manual`).lastInsertRowid
);
let comandoId = null;

try {
  fs.mkdirSync(CARPETA, { recursive: true });
  fs.writeFileSync(path.join(CARPETA, `${paginaId}.jpg`), Buffer.from('foto-de-prueba'));

  const identidad = social.listIdentities('facebook').find((item) => item.id === cuentaId);
  assert.strictEqual(
    identidad.avatar,
    `/uploads/social-avatares/${paginaId}.jpg`,
    'la identidad recibe la foto circular de su página'
  );

  const paginaConFoto = social.listDestinations({ cuentaId, type: 'facebook_page' })[0];
  assert.strictEqual(
    paginaConFoto.avatarLocal,
    true,
    'la pantalla distingue una foto guardada de una URL temporal de Facebook'
  );

  const grupos = social.listDestinations({ cuentaId, type: 'facebook_group' });
  assert.strictEqual(
    grupos.find((item) => item.id === grupoUno).avatar.includes('fbcdn.net'),
    true
  );
  assert.strictEqual(
    grupos.find((item) => item.id === grupoDos).avatar,
    null,
    'una URL ajena a Facebook no llega al navegador'
  );

  const resultado = social.updateDestinationsBulk([grupoUno, grupoDos], { habilitada: true });
  assert.strictEqual(resultado.actualizados, 2);
  assert.strictEqual(
    db
      .prepare('SELECT SUM(habilitada) AS total FROM social_destinations WHERE id IN (?, ?)')
      .get(grupoUno, grupoDos).total,
    2,
    'seleccionar todo actualiza todos los grupos juntos'
  );

  const lock = `lock-${marca}`;
  comandoId = Number(
    db
      .prepare(
        `INSERT INTO social_worker_commands (tipo, payload, estado, lock_token)
         VALUES ('sync_facebook_groups', ?, 'processing', ?)`
      )
      .run(JSON.stringify({ identityId: cuentaId }), lock).lastInsertRowid
  );
  social.reportCommand({
    commandId: comandoId,
    lockToken: lock,
    estado: 'done',
    resultado: {
      grupos: [
        {
          id: `${marca}-Grupo uno`,
          nombre: 'Grupo uno',
          avatarUrl: 'https://scontent.xx.fbcdn.net/nueva.jpg?oh=firma&amp;oe=vence',
        },
      ],
    },
  });
  assert.strictEqual(
    JSON.parse(
      db.prepare('SELECT metadata FROM social_destinations WHERE id = ?').get(grupoUno).metadata
    ).avatarUrl,
    'https://scontent.xx.fbcdn.net/nueva.jpg?oh=firma&oe=vence',
    'la URL del grupo se guarda lista para navegador, sin entidades HTML'
  );
  assert.strictEqual(
    db.prepare('SELECT habilitada FROM social_destinations WHERE id = ?').get(grupoViejo)
      .habilitada,
    0,
    'un grupo viejo del worker queda fuera de la selección sin borrarse'
  );
  assert.strictEqual(
    db.prepare('SELECT habilitada FROM social_destinations WHERE id = ?').get(grupoManual)
      .habilitada,
    1,
    'un grupo cargado a mano no se deshabilita durante la sincronización'
  );
  assert.strictEqual(
    db.prepare('SELECT habilitada FROM social_destinations WHERE id = ?').get(grupoUno).habilitada,
    1,
    'un grupo redetectado se reactiva'
  );
} finally {
  try {
    fs.unlinkSync(path.join(CARPETA, `${paginaId}.jpg`));
  } catch {
    /* La aserción puede fallar antes de crear la foto. */
  }
  if (comandoId) db.prepare('DELETE FROM social_worker_commands WHERE id = ?').run(comandoId);
  db.prepare('DELETE FROM social_destinations WHERE cuenta_id = ?').run(cuentaId);
  db.prepare('DELETE FROM social_accounts WHERE id = ?').run(cuentaId);
}

console.log('socialGruposVisuales.test.js OK');

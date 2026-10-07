const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');

function crearCuenta(nombre, externo) {
  return Number(
    db
      .prepare(
        `INSERT INTO social_accounts (provider, nombre, identificador_externo, metadata)
         VALUES ('facebook', ?, ?, ?)`
      )
      .run(nombre, externo, JSON.stringify({ tipo: 'perfil' })).lastInsertRowid
  );
}

function crearGrupo(cuentaId, nombre, externo) {
  return Number(
    db
      .prepare(
        `INSERT INTO social_destinations
          (cuenta_id, provider, tipo, nombre, identificador_externo, habilitada, execution_class)
         VALUES (?, 'facebook', 'facebook_group', ?, ?, 1, 'browser')`
      )
      .run(cuentaId, nombre, externo).lastInsertRowid
  );
}

function run() {
  db.exec('SAVEPOINT social_rutas_por_identidad');
  try {
    const perfil = crearCuenta('Perfil de prueba', 'route-profile-test');
    const pagina = crearCuenta('Fan Page de prueba', 'route-page-test');
    const grupoPerfil = crearGrupo(perfil, 'Grupo compartido', 'group-shared-test');
    const grupoPagina = crearGrupo(pagina, 'Grupo compartido', 'group-shared-test');
    const grupoDistinto = crearGrupo(pagina, 'Grupo distinto', 'group-other-test');

    assert.throws(
      () =>
        social.createCampaign({
          nombre: 'No duplicar grupo',
          texto: 'Contenido de prueba',
          destinoIds: [grupoPerfil, grupoPagina],
        }),
      /dos identidades|elegí una sola ruta/i,
      'Una campaña no puede elegir el mismo grupo desde Perfil y Fan Page'
    );

    const valida = social.createCampaign({
      nombre: 'Rutas diferentes',
      texto: 'Contenido de prueba',
      destinoIds: [grupoPerfil, grupoDistinto],
    });
    assert.strictEqual(
      valida.targets.length,
      2,
      'Dos grupos externos distintos siguen siendo válidos'
    );
  } finally {
    db.exec('ROLLBACK TO social_rutas_por_identidad; RELEASE social_rutas_por_identidad');
  }
  console.log('socialRutasPorIdentidad.test.js OK');
}

module.exports = { run };

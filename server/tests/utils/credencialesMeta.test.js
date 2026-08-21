/**
 * Las credenciales de Meta.
 *
 * ── Qué se está cuidando ───────────────────────────────────────────────────
 *
 * Un token de página con permisos de publicación es, en la práctica, la llave
 * de la Fan Page: con eso se publica, se borra y se responde en su nombre.
 *
 * Estos tests verifican las dos reglas que lo protegen: que se guarde cifrado
 * y que **no vuelva nunca al navegador**. La segunda es la que se rompe sola
 * si alguien agrega un `SELECT *` sin pensarlo, y por eso tiene test propio.
 */
const assert = require('assert');
const db = require('../../db');
const social = require('../../services/socialService');

let n = 0;
const unico = () => `${Date.now()}-${++n}`;

/* Largo suficiente para pasar la validación de forma. */
const TOKEN = 'EAABwzLixnjYBO' + 'x'.repeat(60);

function armarIdentidad() {
  return Number(
    db
      .prepare(
        `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
         VALUES ('facebook', ?, ?, 1, '{"tipo":"page"}')`
      )
      .run(`cred_${unico()}`, `Fan Page ${unico()}`).lastInsertRowid
  );
}

const metadataCruda = (id) =>
  db.prepare('SELECT metadata FROM social_accounts WHERE id = ?').get(id).metadata;

module.exports = {
  'el token se guarda cifrado, no en texto plano': () => {
    const id = armarIdentidad();
    social.guardarCredenciales(id, { token: TOKEN, pageId: '123' });

    const guardado = metadataCruda(id);
    assert.ok(!guardado.includes(TOKEN), 'el token no puede estar legible en la base');
    assert.match(guardado, /enc:/, 'tiene que estar cifrado');
  },

  'el token nunca vuelve al navegador': () => {
    /*
      Ni entero ni recortado. Un token que llega al navegador queda en su
      memoria, y de ahí lo puede leer cualquier extensión que esté mirando.
    */
    const id = armarIdentidad();
    social.guardarCredenciales(id, { token: TOKEN, pageId: '123' });

    const paraLaPantalla = JSON.stringify(social.estadoDeCredenciales(id));
    assert.ok(!paraLaPantalla.includes(TOKEN));
    assert.ok(!paraLaPantalla.includes('enc:'), 'ni siquiera la versión cifrada');

    const enLaLista = JSON.stringify(social.listIdentities('facebook'));
    assert.ok(!enLaLista.includes(TOKEN), 'tampoco en el listado de identidades');
    assert.ok(!enLaLista.includes('enc:'));
  },

  'la pantalla sí sabe que hay token cargado': () => {
    const id = armarIdentidad();
    assert.strictEqual(social.estadoDeCredenciales(id).tieneToken, false);

    social.guardarCredenciales(id, { token: TOKEN });
    assert.strictEqual(social.estadoDeCredenciales(id).tieneToken, true);
  },

  'guardar sin token no borra el que estaba': () => {
    /*
      La pantalla manda el campo vacío cada vez que alguien cambia sólo el ID
      de la página. Si eso borrara el token, la identidad se desconectaría sola
      por editar un campo que no tiene nada que ver.
    */
    const id = armarIdentidad();
    social.guardarCredenciales(id, { token: TOKEN, pageId: '123' });
    social.guardarCredenciales(id, { pageId: '456' });

    const estado = social.estadoDeCredenciales(id);
    assert.strictEqual(estado.tieneToken, true, 'el token sigue');
    assert.strictEqual(estado.pageId, '456', 'y el ID se actualizó');
  },

  'para borrar el token hay que pedirlo explícitamente': () => {
    const id = armarIdentidad();
    social.guardarCredenciales(id, { token: TOKEN });
    social.guardarCredenciales(id, { borrarToken: true });

    assert.strictEqual(social.estadoDeCredenciales(id).tieneToken, false);
  },

  'un token cortado a la mitad se rechaza en el momento': () => {
    /*
      Avisar acá y no media hora después con un error de Meta que no explica
      nada. El caso real es pegar el ID de la página en el campo del token.
    */
    const id = armarIdentidad();
    assert.throws(() => social.guardarCredenciales(id, { token: '1234567890' }), /incompleto/);
  },

  'los IDs se limpian antes de guardarse': () => {
    const id = armarIdentidad();
    social.guardarCredenciales(id, { pageId: '  123456  ', igId: ' 999 ' });

    const estado = social.estadoDeCredenciales(id);
    assert.strictEqual(estado.pageId, '123456');
    assert.strictEqual(estado.igId, '999');
  },

  'no se puede cargar credenciales en una identidad que no existe': () => {
    assert.throws(() => social.guardarCredenciales(999999, { token: TOKEN }), /No existe/);
  },
};

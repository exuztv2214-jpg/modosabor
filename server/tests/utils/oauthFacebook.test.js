/**
 * Conectar Facebook con un botón.
 *
 * ── Qué se está cuidando ───────────────────────────────────────────────────
 *
 * El `state`. Es lo único que impide que un tercero arme un link a nuestra
 * dirección de vuelta con un código suyo y deje el sistema conectado a **su**
 * página de Facebook — desde donde podría publicar creyendo que es la tuya.
 *
 * Los tests no hablan con Facebook: prueban que armemos bien el pedido y que
 * el pase de un solo uso se comporte como tal.
 */
const assert = require('assert');
const db = require('../../db');
const oauth = require('../../services/social/oauthFacebook');

/* Configuración de prueba. No son credenciales: son valores inventados. */
const conConfig = (fn) => {
  const antes = { ...process.env };
  process.env.FACEBOOK_APP_ID = '1234567890';
  process.env.FACEBOOK_APP_SECRET = 'secreto-de-prueba-no-real';
  process.env.PUBLIC_URL = 'https://modosabor.com.ar';
  try {
    return fn();
  } finally {
    process.env.FACEBOOK_APP_ID = antes.FACEBOOK_APP_ID || '';
    process.env.FACEBOOK_APP_SECRET = antes.FACEBOOK_APP_SECRET || '';
    process.env.PUBLIC_URL = antes.PUBLIC_URL || '';
  }
};

const paseDe = (url) => new URL(url).searchParams.get('state');

module.exports = {
  'sin configurar la app, avisa qué falta': () => {
    process.env.FACEBOOK_APP_ID = '';
    process.env.FACEBOOK_APP_SECRET = '';
    assert.strictEqual(oauth.estaConfigurado(), false);
    assert.throws(() => oauth.urlParaConectar(1), /FACEBOOK_APP_ID/);
  },

  'la dirección lleva la app, la vuelta y los permisos': () =>
    conConfig(() => {
      const url = new URL(oauth.urlParaConectar(1));

      assert.match(url.href, /facebook\.com\/v\d+\.\d+\/dialog\/oauth/);
      assert.strictEqual(url.searchParams.get('client_id'), '1234567890');
      assert.strictEqual(
        url.searchParams.get('redirect_uri'),
        'https://modosabor.com.ar/api/social/oauth/facebook/callback'
      );
      assert.match(url.searchParams.get('scope'), /pages_manage_posts/);
      assert.match(url.searchParams.get('scope'), /instagram_content_publish/);
    }),

  'el secreto de la app nunca va en la dirección': () =>
    conConfig(() => {
      /*
        Esa dirección la ve el usuario en la barra del navegador y queda en su
        historial. El secreto sólo viaja de servidor a servidor, después.
      */
      const url = oauth.urlParaConectar(1);
      assert.ok(!url.includes('secreto-de-prueba-no-real'));
      assert.ok(!url.includes('client_secret'));
    }),

  'cada pedido lleva un pase distinto': () =>
    conConfig(() => {
      const uno = paseDe(oauth.urlParaConectar(1));
      const otro = paseDe(oauth.urlParaConectar(1));
      assert.notStrictEqual(uno, otro, 'un pase que se repite es un pase que se adivina');
      assert.ok(uno.length >= 32, 'tiene que ser largo para no poder probarlo a mano');
    }),

  'el pase sirve una sola vez': () =>
    conConfig(() => {
      const pase = paseDe(oauth.urlParaConectar(7));

      const primera = oauth.consumirPase(pase);
      assert.strictEqual(primera.usuarioId, 7, 'la primera vez vale y dice de quién es');

      assert.strictEqual(
        oauth.consumirPase(pase),
        null,
        'la segunda no: un pase reusable es un pase robable'
      );
    }),

  'un pase inventado no sirve': () => {
    assert.strictEqual(oauth.consumirPase('cualquier-cosa'), null);
    assert.strictEqual(oauth.consumirPase(''), null);
    assert.strictEqual(oauth.consumirPase(undefined), null);
  },

  'un pase viejo no sirve': () =>
    conConfig(() => {
      const pase = paseDe(oauth.urlParaConectar(1));

      /* Se lo envejece a mano: once minutos, uno más que el tope. */
      const clave = `social_oauth_pase_${pase}`;
      db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?').run(
        JSON.stringify({ usuarioId: 1, creado: Date.now() - 11 * 60 * 1000 }),
        clave
      );

      assert.strictEqual(oauth.consumirPase(pase), null);
    }),

  // ── Las páginas encontradas ─────────────────────────────────────────────
  'los tokens de las páginas se guardan cifrados': () => {
    oauth.guardarHallazgo(42, [
      { id: '999', nombre: 'Modo Sabor Delivery', token: 'EAABtoken123456', instagram: null },
    ]);

    const crudo = db
      .prepare('SELECT valor FROM configuracion WHERE clave = ?')
      .get('social_oauth_paginas_42').valor;

    assert.ok(!crudo.includes('EAABtoken123456'), 'el token no puede quedar legible');
    assert.match(crudo, /enc:/);
  },

  'la lista que ve la pantalla no lleva tokens': () => {
    oauth.guardarHallazgo(43, [
      { id: '999', nombre: 'Modo Sabor', token: 'EAABtoken123456', instagram: null },
    ]);

    const paraLaPantalla = JSON.stringify(oauth.paginasEncontradas(43));
    assert.ok(!paraLaPantalla.includes('EAABtoken123456'));
    assert.ok(!paraLaPantalla.includes('enc:'), 'ni siquiera la versión cifrada');
    assert.match(paraLaPantalla, /Modo Sabor/, 'pero sí el nombre, que es para lo que sirve');
  },

  'conectar una página guarda también su Instagram': () => {
    /*
      Instagram no se conecta por separado: Meta sólo lo expone a través de la
      página de Facebook a la que está vinculado. Así que conectar la página
      conecta las dos cosas, y eso hay que guardarlo junto.
    */
    const cuentaId = Number(
      db
        .prepare(
          `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
           VALUES ('facebook', ?, 'Fan Page', 1, '{"tipo":"page"}')`
        )
        .run(`oauth_${Date.now()}`).lastInsertRowid
    );

    oauth.guardarHallazgo(44, [
      {
        id: '959297637272218',
        nombre: 'Modo Sabor Delivery',
        token: 'EAABtoken123456',
        instagram: { id: '17841400000000000', usuario: 'modosaborok' },
      },
    ]);

    const r = oauth.conectarPagina({
      usuarioId: 44,
      pageId: '959297637272218',
      cuentaId,
    });

    assert.strictEqual(r.pagina, 'Modo Sabor Delivery');
    assert.strictEqual(r.instagram, 'modosaborok');

    const metadata = JSON.parse(
      db.prepare('SELECT metadata FROM social_accounts WHERE id = ?').get(cuentaId).metadata
    );
    assert.strictEqual(metadata.pageId, '959297637272218');
    assert.strictEqual(metadata.igId, '17841400000000000');
    assert.match(metadata.token, /^enc:/, 'el token queda cifrado en la identidad');
  },

  'lo encontrado se borra apenas se usa': () => {
    const cuentaId = Number(
      db
        .prepare(
          `INSERT INTO social_accounts (provider, clave, nombre, habilitada, metadata)
           VALUES ('facebook', ?, 'Fan Page', 1, '{}')`
        )
        .run(`oauth2_${Date.now()}`).lastInsertRowid
    );

    oauth.guardarHallazgo(45, [
      { id: '1', nombre: 'Una página', token: 'EAABtoken', instagram: null },
    ]);
    oauth.conectarPagina({ usuarioId: 45, pageId: '1', cuentaId });

    assert.deepStrictEqual(
      oauth.paginasEncontradas(45),
      [],
      'ya se usó: no tiene por qué seguir dando vueltas'
    );
  },

  'no se puede conectar una página que no estaba en la lista': () => {
    /*
      El caso feo: alguien manda un `pageId` cualquiera esperando que el
      servidor lo acepte. Sólo valen las que Facebook devolvió para ese
      usuario, en esta conexión.
    */
    oauth.guardarHallazgo(46, [{ id: '1', nombre: 'La mía', token: 'EAABtoken', instagram: null }]);

    assert.throws(
      () => oauth.conectarPagina({ usuarioId: 46, pageId: '666', cuentaId: 1 }),
      /no estaba entre las que encontramos/
    );
  },

  'sin conexión previa no se puede conectar nada': () => {
    assert.throws(
      () => oauth.conectarPagina({ usuarioId: 47, pageId: '1', cuentaId: 1 }),
      /venció/
    );
  },
};

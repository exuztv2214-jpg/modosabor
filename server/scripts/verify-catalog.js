const assert = require('assert');
assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1', 'Usar verify-isolated.js');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');
const { recalcularPreciosPublicos } = require('../services/preciosServidor');
const { validarCatalogoPedido } = require('../utils/catalogVisibility');

async function main() {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol='admin' LIMIT 1").get();
  const token = jwt.sign({ id: admin.id, tv: 0 }, getJwtSecret());
  async function request(url, method = 'GET', body, authenticated = true) {
    const form = body instanceof FormData;
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api${url}`, {
      method,
      headers: {
        ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        ...(!form && body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: form ? body : JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  const setConfig = (clave, valor) =>
    db
      .prepare(
        'INSERT INTO configuracion(clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor'
      )
      .run(clave, valor);
  setConfig(
    'turnos_negocio',
    JSON.stringify([
      { id: 'audit', nombre: 'Prueba', desde: '00:00', hasta: '23:59', activo: true },
    ])
  );
  const cat = await request('/categorias', 'POST', {
    nombre: 'Catálogo prueba',
    orden: 0,
    subcategorias: [{ nombre: 'Clásicos' }],
  });
  assert.equal(cat.status, 200, JSON.stringify(cat));
  const cid = cat.data.id;
  assert.equal((await request('/categorias', 'POST', { nombre: ' CATÁLOGO PRUEBA ' })).status, 409);
  assert.equal((await request(`/categorias/${cid}`, 'PUT', { nombre: '  ' })).status, 400);
  assert.equal((await request(`/categorias/${cid}`, 'PUT', { orden: -1 })).status, 400);
  const product = await request('/productos', 'POST', {
    nombre: 'Producto catálogo prueba',
    precio: 1000,
    costo: 200,
    stock: 10,
    categoria_id: cid,
    subcategoria: 'Clásicos',
  });
  assert.equal(product.status, 200, JSON.stringify(product));
  const pid = product.data.id;
  assert.equal(product.data.subcategoria, 'Clásicos');
  assert.equal(
    (await request(`/productos/${pid}`, 'PUT', { subcategoria: 'No existe' })).status,
    400
  );
  assert.equal((await request(`/categorias/${cid}`, 'PUT', { subcategorias: [] })).status, 409);

  db.prepare('UPDATE productos SET imagen=? WHERE id=?').run('/uploads/catalog-test.png', pid);
  const form = new FormData();
  form.append('precio_anterior', '1500');
  form.append('remove_imagen', '1');
  const edit = await request(`/productos/${pid}`, 'PUT', form);
  assert.equal(edit.status, 200, JSON.stringify(edit));
  assert.equal(edit.data.precio_anterior, 1500);
  assert.equal(edit.data.imagen, '');
  const clear = new FormData();
  clear.append('precio_anterior', '');
  assert.equal((await request(`/productos/${pid}`, 'PUT', clear)).data.precio_anterior, null);

  const listId = db
    .prepare("INSERT INTO listas_precios(nombre) VALUES ('Lista prueba catálogo')")
    .run().lastInsertRowid;
  db.prepare('INSERT INTO producto_precios(lista_id,producto_id,precio) VALUES (?,?,?)').run(
    listId,
    pid,
    175000
  );
  setConfig('lista_precios_mostrador', String(listId));
  const sale = (await request('/productos')).data.find((p) => p.id === pid);
  const master = (await request('/productos/administracion')).data.find((p) => p.id === pid);
  assert.equal(sale.precio, 1750);
  assert.equal(master.precio, 1000);
  assert.equal((await request(`/productos/${pid}`)).data.precio, 1750);
  assert.equal((await request('/productos/administracion', 'GET', null, false)).status, 401);

  const optionId = db
    .prepare(
      "INSERT INTO opcion_listas(nombre,tipo,obligatorio) VALUES ('Opciones prueba','variante',0)"
    )
    .run().lastInsertRowid;
  db.prepare('INSERT INTO opcion_items(lista_id,nombre,precio) VALUES (?,?,?)').run(
    optionId,
    'Opción prueba',
    2000
  );
  db.prepare('INSERT INTO producto_opcion_listas(producto_id,lista_id) VALUES (?,?)').run(
    pid,
    optionId
  );
  const mixed = (await request('/productos/administracion')).data.find((p) => p.id === pid);
  assert.ok(JSON.parse(mixed.variantes).some((g) => g.lista_id === optionId));
  for (const activo of [0, 1]) {
    assert.equal((await request(`/productos/${pid}`, 'PUT', { activo })).status, 200);
  }
  let stored = db.prepare('SELECT precio,variantes FROM productos WHERE id=?').get(pid);
  assert.equal(stored.precio, 100000);
  assert.equal(stored.variantes, '[]');
  assert.equal(
    (await request(`/productos/${pid}`, 'PUT', { variantes: mixed.variantes })).status,
    200
  );
  assert.equal(db.prepare('SELECT variantes FROM productos WHERE id=?').get(pid).variantes, '[]');
  assert.equal(
    db.prepare('SELECT COUNT(*) n FROM producto_opcion_listas WHERE producto_id=?').get(pid).n,
    1
  );

  /*
    Apagar una categoría y atarla a otro turno no son lo mismo.

    Apagada es "esto no se vende más": se oculta en todos lados, también en la
    caja. Atada a un turno es "el cliente no lo pide a esta hora": se oculta en
    la web y en WhatsApp, pero el TPV la sigue mostrando, porque quien cobra en
    el mostrador sabe qué hay en cocina. Sin esa distinción, con las categorías
    marcadas "noche" al mediodía no se podía vender ni una bebida.
  */
  for (const change of [{ activo: 0 }, { activo: 1, turno_id: 'otro' }]) {
    const apagada = change.activo === 0;
    assert.equal((await request(`/categorias/${cid}`, 'PUT', change)).status, 200);
    assert.equal(
      (await request('/productos', 'GET', null, false)).data.some((p) => p.id === pid),
      false
    );
    assert.equal(
      (await request('/productos/catalogo-tpv')).data.some((p) => p.id === pid),
      !apagada,
      apagada
        ? 'una categoría apagada no se vende ni en la caja'
        : 'el turno no puede esconderle la carta a la caja'
    );
    assert.equal((await request(`/productos/${pid}`, 'GET', null, false)).status, 404);
    assert.throws(() => validarCatalogoPedido(db, [{ producto_id: pid }]), /no está disponible/);
    assert.throws(
      () => recalcularPreciosPublicos([{ producto_id: pid, cantidad: 1 }], 'mostrador', {}, db),
      /no está disponible/
    );
  }
  await request(`/categorias/${cid}`, 'PUT', { activo: 1, turno_id: 'audit' });
  assert.ok((await request('/productos', 'GET', null, false)).data.some((p) => p.id === pid));
  const before = (await request('/categorias')).data.map((c) => c.id);
  const direction = before.indexOf(cid) === 0 ? 1 : -1;
  assert.equal(
    (await request(`/categorias/${cid}/mover`, 'PUT', { direccion: direction })).status,
    200
  );
  const after = (await request('/categorias')).data;
  assert.equal(
    after.findIndex((c) => c.id === cid),
    before.indexOf(cid) + direction
  );
  assert.equal(new Set(after.map((c) => c.orden)).size, after.length);
  assert.equal((await request(`/categorias/${cid}`, 'DELETE')).status, 200);
  stored = db.prepare('SELECT categoria_id,subcategoria FROM productos WHERE id=?').get(pid);
  assert.equal(stored.categoria_id, null);
  assert.equal(stored.subcategoria, '');
  console.log(
    'OK catálogo: precio base protegido, promociones/fotos, listas, categorías/turnos, subcategorías y orden atómico'
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());

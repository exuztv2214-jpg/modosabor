const assert = require('node:assert/strict');
assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');
const { guardarNombresDeLista, aplicarListasCompartidas } = require('../utils/opcionesCompartidas');

async function main() {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol='admin' LIMIT 1").get();
  const token = jwt.sign({ id: admin.id, tv: 0 }, getJwtSecret());
  async function request(url, method = 'GET', body) {
    const multipart = body instanceof FormData;
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/api${url}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(!multipart && body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  }
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64'
  );
  const form = new FormData();
  form.append('imagen', new Blob([png], { type: 'image/png' }), 'rice.png');
  const upload = await request('/productos/upload', 'POST', form);
  assert.equal(upload.status, 200, JSON.stringify(upload));
  const imagen = upload.data.url;
  const result = await request('/opcion-listas', 'POST', {
    nombre: 'Fotos de guarniciones prueba',
    tipo: 'variante',
    opciones: [{ nombre: 'Arroz', precio: 250, imagen }],
  });
  assert.equal(result.status, 200, JSON.stringify(result));
  const id = result.data.id;
  assert.equal(result.data.opciones[0].imagen, imagen);
  assert.equal(result.data.opciones[0].precio, 250);
  const invalid = await request(`/opcion-listas/${id}`, 'PUT', {
    opciones: [{ nombre: 'Arroz', imagen: 'javascript:alert(1)' }],
  });
  assert.equal(invalid.status, 400);
  const legacy = await request(`/opcion-listas/${id}`, 'PUT', {
    opciones: [{ nombre: 'Arroz', precio: 250 }],
  });
  assert.equal(legacy.data.opciones[0].imagen, imagen, 'Old clients must not erase images');
  guardarNombresDeLista(db, 'Fotos de guarniciones prueba', ['Arroz', 'Puré']);
  const item = db
    .prepare('SELECT * FROM opcion_items WHERE lista_id=? AND nombre=?')
    .get(id, 'Arroz');
  assert.equal(item.imagen, imagen, 'Operation settings must retain images');
  assert.equal(item.precio, 25000, 'Operation settings must retain centavos');
  const pid = Number(
    db
      .prepare(
        "INSERT INTO productos(nombre,precio,variantes,extras) VALUES ('Foto test',500000,'[]','[]')"
      )
      .run().lastInsertRowid
  );
  assert.equal(
    (await request(`/opcion-listas/producto/${pid}`, 'PUT', { listas: [id] })).status,
    200
  );
  const merged = aplicarListasCompartidas(db, [
    db.prepare('SELECT * FROM productos WHERE id=?').get(pid),
  ])[0];
  assert.equal(JSON.parse(merged.variantes)[0].opciones[0].imagen, imagen);
  const apiProduct = await request('/productos/administracion');
  const fromApi = apiProduct.data.find((p) => p.id === pid);
  assert.equal(JSON.parse(fromApi.variantes)[0].opciones[0].imagen, imagen);
  const removed = await request(`/opcion-listas/${id}`, 'PUT', {
    opciones: [{ nombre: 'Arroz', precio: 250, imagen: '' }],
  });
  assert.equal(removed.data.opciones[0].imagen, '');
  console.log(
    'OK: image upload, validation, JSON prices, persistence, shared product images, removal'
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());

const assert = require('node:assert/strict');
assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');
async function main() {
  const admin = db.prepare("SELECT id FROM usuarios WHERE rol='admin' LIMIT 1").get();
  const token = jwt.sign({ id: admin.id, tv: 0 }, getJwtSecret());
  async function request(url, method, body) {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api${url}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }
  const create = (body) => request('/clientes', 'POST', body);
  const first = await create({
    nombre: 'Test cliente',
    telefono: '0381 15 555-4433',
    email: 'test.dupe@example.invalid',
    direccion: 'Calle ficticia 123',
  });
  assert.equal(first.status, 200, JSON.stringify(first));
  assert.equal(first.data.direcciones.length, 1);
  const count = db.prepare('SELECT COUNT(*) n FROM clientes').get().n;
  for (const telefono of ['3815554433', '+54 9 381 555 4433', '543815554433', '005493815554433']) {
    const duplicate = await create({ nombre: 'Otro nombre', telefono });
    assert.equal(duplicate.status, 409, JSON.stringify(duplicate));
    assert.equal(duplicate.data.cliente_existente_id, first.data.id);
  }
  assert.equal(
    (await create({ nombre: 'Otro', email: ' TEST.DUPE@EXAMPLE.INVALID ' })).status,
    409
  );
  assert.equal(db.prepare('SELECT COUNT(*) n FROM clientes').get().n, count);
  const homonym = await create({ nombre: 'Test cliente', telefono: '3815554400' });
  assert.equal(homonym.status, 200);
  const conflict = await request(`/clientes/${homonym.data.id}`, 'PUT', { telefono: '3815554433' });
  assert.equal(conflict.status, 409);
  assert.equal(
    db.prepare('SELECT telefono FROM clientes WHERE id=?').get(homonym.data.id).telefono,
    '3815554400'
  );
  const edit = await request(`/clientes/${first.data.id}`, 'PUT', {
    direccion: 'Otra calle ficticia 456',
  });
  assert.equal(edit.status, 200, JSON.stringify(edit));
  assert.equal(edit.data.direccion, 'Otra calle ficticia 456');
  const parallel = await Promise.all([
    create({ nombre: 'Concurrente', telefono: '3815554499' }),
    create({ nombre: 'Concurrente', telefono: '+5493815554499' }),
  ]);
  assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409]);
  console.log(
    'OK: TPV client creation blocks duplicate phone formats/email, edit collisions and simultaneous requests; homonyms and addresses preserved'
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.close());

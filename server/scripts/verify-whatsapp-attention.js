const assert = require('assert');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getJwtSecret } = require('../utils/authConfig');

async function main() {
  assert.equal(process.env.ISOLATED_OPERATIONAL_TEST, '1');
  const user = db
    .prepare(
      "INSERT INTO usuarios (nombre,email,password_hash,rol,activo) VALUES ('Caja prueba','caja-attention@example.invalid','unused','caja',1)"
    )
    .run().lastInsertRowid;
  const chat = db
    .prepare("INSERT INTO whatsapp_conversaciones (telefono) VALUES ('5491100000099')")
    .run().lastInsertRowid;
  const token = jwt.sign({ id: Number(user), tv: 0 }, getJwtSecret());
  async function request(path, method = 'GET', body) {
    return fetch(`http://127.0.0.1:${process.env.PORT}/api/whatsapp${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  assert.equal((await request('/conversaciones')).status, 200);
  assert.equal((await request(`/conversaciones/${chat}/mensajes`)).status, 200);
  for (const accion of ['tomar', 'devolver']) {
    assert.equal((await request(`/conversaciones/${chat}/control`, 'PUT', { accion })).status, 200);
    assert.equal(
      db.prepare('SELECT bot_silenciado FROM whatsapp_conversaciones WHERE id = ?').get(chat)
        .bot_silenciado,
      accion === 'tomar' ? 1 : 0
    );
  }
  assert.equal(
    (await request('/responder', 'POST', { telefono: '5491100000098', texto: 'Prueba' })).status,
    404
  );
  assert.equal(
    (await request('/responder', 'POST', { telefono: '5491100000099', texto: 'Prueba' })).status,
    409
  );
  for (const [path, method] of [
    ['/conectar', 'POST'],
    ['/desconectar', 'POST'],
    ['/estado', 'GET'],
    ['/campanas', 'POST'],
  ]) {
    assert.equal((await request(path, method, method === 'POST' ? {} : undefined)).status, 403);
  }
  console.log(
    'OK: Caja lee/toma/devuelve chats; sin conexión no envía; configuración y campañas bloqueadas'
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());

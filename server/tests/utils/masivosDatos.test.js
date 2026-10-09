const assert = require('assert');
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');

// La ruta usa la base del sistema: la reemplazamos por una en memoria.
async function run() {
  const memoria = new Database(':memory:');
  memoria.exec(`
    CREATE TABLE clientes (id INTEGER PRIMARY KEY, nombre TEXT, telefono TEXT);
    CREATE TABLE configuracion (clave TEXT PRIMARY KEY, valor TEXT);
    INSERT INTO configuracion VALUES ('turnos_negocio', '[{"id":"noche","desde":"20:00","hasta":"02:00"}]');
    CREATE TABLE pedidos (id INTEGER PRIMARY KEY, cliente_id INTEGER, cliente_nombre TEXT,
      cliente_telefono TEXT, estado TEXT, creado_en TEXT);
    INSERT INTO clientes VALUES (1, 'Ana', '3863412345');
    INSERT INTO pedidos VALUES (1, 1, '', '', 'entregado', '2026-10-01 12:00:00');
    INSERT INTO pedidos VALUES (2, NULL, 'Ana', '3863412345', 'entregado', '2026-10-08 01:30:00');
    INSERT INTO pedidos VALUES (3, NULL, 'Beto', '0381-15-5551234', 'cancelado', '2026-10-07 20:00:00');
    INSERT INTO pedidos VALUES (4, NULL, 'Sin tel', '', 'entregado', '2026-10-07 20:00:00');
    ALTER TABLE pedidos ADD COLUMN total INTEGER DEFAULT 0;
    CREATE TABLE cupones (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL,
      descripcion TEXT, tipo_descuento TEXT, valor_descuento INTEGER, minimo_compra INTEGER,
      descuento_maximo INTEGER, fecha_inicio TEXT, fecha_fin TEXT, limite_usos INTEGER,
      usos_actuales INTEGER DEFAULT 0, limite_por_cliente INTEGER, activo INTEGER);
    CREATE TABLE cupones_usados (id INTEGER PRIMARY KEY AUTOINCREMENT, cupon_id INTEGER,
      pedido_id INTEGER, cliente_id INTEGER, cliente_telefono TEXT, monto_descuento INTEGER);
  `);
  const dbPath = require.resolve(path.join(__dirname, '..', '..', 'db.js'));
  const previo = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: memoria };
  const rutaPath = require.resolve('../../routes/masivosDatos');
  delete require.cache[rutaPath];
  const tokenPrevio = process.env.MASIVOS_PROXY_TOKEN;
  process.env.MASIVOS_PROXY_TOKEN = 'token-de-prueba';

  const app = express();
  app.use(express.json());
  app.use('/api/masivos-datos', require('../../routes/masivosDatos'));
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}/api/masivos-datos/pedidos-por-telefono`;
  try {
    const sinToken = await fetch(url);
    assert.equal(sinToken.status, 403, 'sin token no entrega datos de clientes');
    const malToken = await fetch(url, { headers: { 'x-masivos-proxy-token': 'otro' } });
    assert.equal(malToken.status, 403);
    const turnosUrl = url.replace('pedidos-por-telefono', 'turnos');
    assert.equal((await fetch(turnosUrl)).status, 403);
    const turnosResp = await fetch(turnosUrl, {
      headers: { 'x-masivos-proxy-token': 'token-de-prueba' },
    });
    assert.deepEqual((await turnosResp.json()).turnos, [
      { id: 'noche', desde: '20:00', hasta: '02:00' },
    ]);

    const ok = await fetch(url, { headers: { 'x-masivos-proxy-token': 'token-de-prueba' } });
    assert.equal(ok.status, 200);
    const { clientes } = await ok.json();
    // 01:30 UTC del 8 es la noche del 7 en Argentina.
    assert.deepEqual(clientes, [
      {
        telefono: '3863412345',
        nombre: 'Ana',
        pedidos: 2,
        ultimoPedido: '2026-10-07',
        fechas: ['2026-10-01', '2026-10-07'],
      },
    ]);

    // Cupón por campaña: se crea con código propio y se leen sus resultados.
    const cuponesUrl = url.replace('pedidos-por-telefono', 'cupones');
    const sinPermiso = await fetch(cuponesUrl, { method: 'POST' });
    assert.equal(sinPermiso.status, 403);
    const creado = await fetch(cuponesUrl, {
      method: 'POST',
      headers: { 'x-masivos-proxy-token': 'token-de-prueba', 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'porcentaje', valor: 10, dias: 3 }),
    });
    assert.equal(creado.status, 201);
    const cupon = await creado.json();
    assert.match(cupon.codigo, /^MS[A-Z2-9]{5}$/);
    const fila = memoria.prepare('SELECT * FROM cupones WHERE codigo = ?').get(cupon.codigo);
    assert.equal(fila.limite_por_cliente, 1);
    assert.equal(fila.valor_descuento, 10);
    // Un pedido de $12.000 que usó el cupón con $1.200 de descuento (en centavos).
    memoria.exec(`INSERT INTO pedidos (id, cliente_telefono, estado, creado_en, total)
                  VALUES (9, '', 'entregado', '2026-10-09 22:00:00', 1200000)`);
    memoria
      .prepare(
        'INSERT INTO cupones_usados (cupon_id, pedido_id, monto_descuento) VALUES (?, 9, 120000)'
      )
      .run(fila.id);
    const leido = await fetch(`${cuponesUrl}/${cupon.codigo}`, {
      headers: { 'x-masivos-proxy-token': 'token-de-prueba' },
    });
    assert.deepEqual(await leido.json(), {
      codigo: cupon.codigo,
      activo: true,
      vence: cupon.vence,
      usos: 1,
      plataVendida: 12000,
      plataDescontada: 1200,
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previo) require.cache[dbPath] = previo;
    else delete require.cache[dbPath];
    delete require.cache[rutaPath];
    if (tokenPrevio === undefined) delete process.env.MASIVOS_PROXY_TOKEN;
    else process.env.MASIVOS_PROXY_TOKEN = tokenPrevio;
    memoria.close();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

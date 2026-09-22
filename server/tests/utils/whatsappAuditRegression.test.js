const assert = require('assert');
const db = require('../../db');
const {
  getProducts,
  getProductById,
  getCategories,
  quoteProduct,
  findClienteByPhone,
} = require('../../utils/systemClient');
const { conexion } = require('../../services/whatsappMasivo/conexion');
const { enqueueIncoming } = require('../../services/whatsappGateway');

async function run() {
  // Estas pruebas corren exclusivamente sobre la base temporal del runner.
  db.exec('SAVEPOINT audit_catalogo');
  try {
    const categoria = db
      .prepare("INSERT INTO categorias (nombre,activo) VALUES ('Oculta audit',0)")
      .run().lastInsertRowid;
    const producto = Number(
      db
        .prepare(
          "INSERT INTO productos (nombre,precio,categoria_id,activo,stock_mode,stock_directo) VALUES ('Oculto audit',10000,?,1,'direct',10)"
        )
        .run(categoria).lastInsertRowid
    );
    assert(!getProducts(db).some((p) => p.id === producto));
    assert.strictEqual(getProductById(db, producto), null);
    db.prepare('UPDATE categorias SET activo=1 WHERE id=?').run(categoria);
    assert(getProductById(db, producto));
    db.prepare("UPDATE configuracion SET valor=? WHERE clave='turnos_negocio'").run(
      JSON.stringify([
        { id: 'audit-dia', nombre: 'Prueba', desde: '00:00', hasta: '23:59', activo: true },
      ])
    );
    db.prepare("UPDATE categorias SET turno_id='audit-noche' WHERE id=?").run(categoria);
    assert(!getCategories(db).some((c) => c.id === categoria));
    assert(!getProducts(db).some((p) => p.id === producto));
    assert.strictEqual(getProductById(db, producto), null);
    assert.strictEqual(quoteProduct(db, 'Oculto audit').status, 'not_found');
    db.prepare("UPDATE categorias SET turno_id='audit-dia' WHERE id=?").run(categoria);
    assert(getProductById(db, producto));
    assert(getCategories(db).some((c) => c.id === categoria));
    const cliente = Number(
      db
        .prepare(
          "INSERT INTO clientes (nombre,telefono) VALUES ('Audit teléfono', '+54 9 (381) 555.0789')"
        )
        .run().lastInsertRowid
    );
    assert.strictEqual(findClienteByPhone(db, '5493815550789').id, cliente);
    assert.strictEqual(findClienteByPhone(db, '3815550789').id, cliente);
    assert.strictEqual(findClienteByPhone(db, '3815550788'), null);

    db.prepare(
      "INSERT INTO agente_metricas (herramientas,creado_en) VALUES (?,datetime('now','-8 days'))"
    ).run('["audit_antigua"]');
    const insertar = db.prepare('INSERT INTO agente_metricas (herramientas) VALUES (?)');
    for (let i = 0; i < 25; i++) insertar.run('["audit_reciente"]');
    const router = require('../../routes/whatsappMasivo');
    const handler = router.stack.find((layer) => layer.route?.path === '/metricas-atencion').route
      .stack[0].handle;
    let respuesta;
    handler(
      {},
      {
        json: (data) => {
          respuesta = data;
        },
      }
    );
    assert(!respuesta.agente.trazas.some((t) => t.herramientas.includes('audit_antigua')));
    assert(!respuesta.agente.herramientas_mas_usadas.some((t) => t.nombre === 'audit_antigua'));
    assert.strictEqual(
      respuesta.agente.herramientas_mas_usadas.find((t) => t.nombre === 'audit_reciente').cantidad,
      25
    );
  } finally {
    db.exec('ROLLBACK TO audit_catalogo; RELEASE audit_catalogo');
  }

  const telefono = '5493815550789';
  const claves = ['whatsapp_atencion_ia_activa', 'whatsapp_gateway_pausa_total'];
  const anteriores = claves.map((clave) => [
    clave,
    db.prepare('SELECT valor FROM configuracion WHERE clave=?').get(clave),
  ]);
  const guardar = db.prepare(
    'INSERT INTO configuracion (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor'
  );
  const descargar = conexion.descargarAudio;
  let descargas = 0;
  conexion.descargarAudio = async () => {
    descargas++;
    throw new Error('No debe descargar');
  };
  try {
    for (const [indice, caso] of [
      { activo: '0', pausa: '0' },
      { activo: '1', pausa: '1' },
      { activo: '1', pausa: '0', humano: true },
      { activo: '1', pausa: '0', propio: true },
    ].entries()) {
      guardar.run(claves[0], caso.activo);
      guardar.run(claves[1], caso.pausa);
      db.prepare('INSERT OR IGNORE INTO whatsapp_conversaciones (telefono) VALUES (?)').run(
        telefono
      );
      db.prepare(
        'UPDATE whatsapp_conversaciones SET bot_silenciado=?,bot_silenciado_hasta=NULL WHERE telefono=?'
      ).run(caso.humano ? 1 : 0, telefono);
      const id = `audit-audio-${indice}`;
      await enqueueIncoming({
        key: { id, remoteJid: `${telefono}@s.whatsapp.net`, fromMe: !!caso.propio },
        message: { audioMessage: { seconds: 2 } },
      });
      const registrado = db
        .prepare('SELECT payload FROM whatsapp_mensajes WHERE whatsapp_message_id=?')
        .get(id);
      assert(registrado, 'Debe conservar el audio en el historial');
      assert.strictEqual(JSON.parse(registrado.payload).transcripto, false);
    }
    assert.strictEqual(descargas, 0);
  } finally {
    conexion.descargarAudio = descargar;
    for (const [clave, fila] of anteriores) {
      if (fila) guardar.run(clave, fila.valor);
      else db.prepare('DELETE FROM configuracion WHERE clave=?').run(clave);
    }
    for (const tabla of [
      'whatsapp_mensajes',
      'wa_respuestas',
      'whatsapp_conversaciones',
      'clientes',
    ]) {
      db.prepare(`DELETE FROM ${tabla} WHERE telefono=?`).run(telefono);
    }
  }
  console.log('OK auditoría WhatsApp: audios pausados, categorías, teléfonos y métricas');
}

module.exports = { run };

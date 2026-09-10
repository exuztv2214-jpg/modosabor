const assert = require('assert');
const db = require('../../db');
const { crearCarritoWhatsapp } = require('../../services/carritoWhatsapp');
const { preparar, marcarEnviada, validar } = require('../../services/confirmacionWhatsapp');
const { crearControl } = require('../../services/controlWhatsapp');
const { conPlazo } = require('../../services/whatsappAudioTranscription');

async function run() {
  const tel = '5493815550666';
  const producto = db
    .prepare(
      "INSERT INTO productos (nombre,precio,activo,stock_directo,variantes,extras) VALUES ('Producto seguro prueba',100000,1,20,'[]','[]')"
    )
    .run().lastInsertRowid;
  db.prepare('INSERT INTO whatsapp_conversaciones (telefono) VALUES (?)').run(tel);
  const carrito = crearCarritoWhatsapp(db);
  try {
    const item = carrito.agregarItem(tel, { producto_id: producto });
    carrito.actualizarDatos(tel, { cliente_nombre: 'Cliente Prueba', tipo_entrega: 'retiro' });
    const resumen = preparar(db, tel);
    assert.match(resumen.texto, /1 × Producto seguro prueba/);
    assert.throws(() => validar(db, tel), /resumen/);
    marcarEnviada(db, tel, resumen.texto);
    assert.doesNotThrow(() => validar(db, tel));
    carrito.modificarItem(tel, item.itemId, { cantidad: 2 });
    assert.throws(() => validar(db, tel), /cambió/);
    const nuevo = preparar(db, tel);
    marcarEnviada(db, tel, nuevo.texto);
    assert.doesNotThrow(() => validar(db, tel));
    db.prepare('UPDATE productos SET precio = 200000 WHERE id = ?').run(producto);
    assert.throws(() => validar(db, tel), /cambió/);
    const control = crearControl(db, tel);
    db.prepare('UPDATE whatsapp_conversaciones SET bot_silenciado = 1 WHERE telefono = ?').run(tel);
    db.prepare('UPDATE whatsapp_conversaciones SET bot_silenciado = 0 WHERE telefono = ?').run(tel);
    assert.throws(control.assertControl, (e) => e.code === 'WHATSAPP_CONTROL_CHANGED');
    await assert.rejects(() => conPlazo(new Promise(() => {}), 10), /tiempo/);
  } finally {
    db.prepare('DELETE FROM whatsapp_pedidos_borrador WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM whatsapp_conversaciones WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM productos WHERE id = ?').run(producto);
  }
}
module.exports = { run };

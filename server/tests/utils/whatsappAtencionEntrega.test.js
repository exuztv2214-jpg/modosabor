const assert = require('assert');
const db = require('../../db');
const { conexion } = require('../../services/whatsappMasivo/conexion');
const { enqueueIncoming, combinarMensajes } = require('../../services/whatsappGateway');
const { atenderConMotorPropio } = require('../../services/agenteWhatsapp');

async function run() {
  const tel = '5493815550789';
  const mensaje = (id, texto) => ({
    key: { id, remoteJid: `${tel}@s.whatsapp.net` },
    message: { conversation: texto },
  });
  const anterior = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'whatsapp_atencion_ia_activa'")
    .get();
  const guardar = db.prepare(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  );
  const enviar = conexion.enviarTexto;
  const enviados = [];
  conexion.enviarTexto = async (_jid, texto) => enviados.push(texto);
  try {
    guardar.run('whatsapp_atencion_ia_activa', '0');
    const a = mensaje('audit-wa-a', 'hola');
    assert.strictEqual(combinarMensajes([a, a]).mensajesOriginales.length, 1);
    await enqueueIncoming(a);
    assert.ok(
      db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(tel),
      'Crea al cliente aunque no tenga nombre visible'
    );
    // A replay with a different grouping must still ignore the persisted ID.
    await Promise.all([enqueueIncoming(a), enqueueIncoming(mensaje('audit-wa-b', 'hola'))]);
    assert.strictEqual(
      db.prepare('SELECT COUNT(*) n FROM whatsapp_mensajes WHERE telefono = ?').get(tel).n,
      2
    );
    assert.strictEqual(
      db
        .prepare('SELECT COUNT(*) n FROM whatsapp_mensajes WHERE whatsapp_message_id = ?')
        .get('audit-wa-a').n,
      1
    );

    guardar.run('whatsapp_atencion_ia_activa', '1');
    await enqueueIncoming({
      key: { id: 'audit-wa-image', remoteJid: `${tel}@s.whatsapp.net` },
      message: { imageMessage: {} },
    });
    assert.match(enviados[0], /pendiente de verificación/);
    assert.strictEqual(
      db.prepare('SELECT bot_silenciado FROM whatsapp_conversaciones WHERE telefono = ?').get(tel)
        .bot_silenciado,
      1
    );
    assert.strictEqual(
      db
        .prepare('SELECT tipo FROM whatsapp_mensajes WHERE whatsapp_message_id = ?')
        .get('audit-wa-image').tipo,
      'imagen'
    );

    let avisos = 0;
    let turnos = 0;
    const respuesta = await atenderConMotorPropio(
      { telefono: tel, texto: 'quiero una persona' },
      {
        db,
        memoria: { obtenerContexto: async () => ({ mensajes: [], resumen: '' }) },
        obtenerRespaldo: () => null,
        conversarPrincipal: async () => {
          turnos += 1;
          return {
            texto: '',
            llamadas: [
              { id: 'h1', nombre: 'derivar_a_persona', argumentos: { motivo: 'Solicitada' } },
            ],
          };
        },
        onHandoff: () => {
          avisos += 1;
        },
      }
    );
    assert.strictEqual(avisos, 1);
    assert.strictEqual(turnos, 1, 'No debe volver a llamar al modelo después de derivar');
    assert.match(respuesta, /aviso a una persona/);

    const borrador = db
      .prepare(
        "INSERT INTO whatsapp_pedidos_borrador (telefono, cliente_nombre, tipo_entrega) VALUES (?, 'Prueba', 'retiro')"
      )
      .run(tel).lastInsertRowid;
    db.prepare(
      "INSERT INTO whatsapp_pedidos_borrador_items (borrador_id, nombre, cantidad, precio_unitario) VALUES (?, 'Prueba', 1, 10000)"
    ).run(borrador);
    // El fixture verifica la idempotencia del cierre, con un resumen ya entregado.
    const confirmaciones = require('../../services/confirmacionWhatsapp');
    const huella = confirmaciones.estado(db, tel).huella;
    db.prepare(
      'INSERT INTO whatsapp_confirmaciones (telefono,borrador_id,huella,texto,enviada) VALUES (?,?,?,?,1)'
    ).run(tel, borrador, huella, 'Resumen del pedido: total $100. ¿Confirmás?');
    let eventosPedido = 0;
    const deps = {
      db,
      memoria: {
        obtenerContexto: async () => ({
          mensajes: [{ rol: 'asistente', texto: 'Resumen del pedido: total $100. ¿Confirmás?' }],
        }),
      },
      ejecutarAgente: async ({ ejecutar }) => {
        await ejecutar('crear_pedido', {});
        return { respuesta: { texto: 'Pedido confirmado' } };
      },
      dependenciasPedido: {
        createRealOrder: async () => {
          const id = db
            .prepare(
              "INSERT INTO pedidos (numero, cliente_telefono, origen) VALUES (987654, ?, 'whatsapp')"
            )
            .run(tel).lastInsertRowid;
          return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
        },
      },
      onPedidoCreado: () => {
        eventosPedido += 1;
      },
    };
    await atenderConMotorPropio({ telefono: tel, mensaje_id: 'confirm-test', texto: 'sí' }, deps);
    await atenderConMotorPropio({ telefono: tel, mensaje_id: 'confirm-test', texto: 'sí' }, deps);
    assert.strictEqual(eventosPedido, 1, 'El pedido del motor propio debe avisar una sola vez');
  } finally {
    conexion.enviarTexto = enviar;
    if (anterior) guardar.run('whatsapp_atencion_ia_activa', anterior.valor);
    else db.prepare("DELETE FROM configuracion WHERE clave = 'whatsapp_atencion_ia_activa'").run();
    db.prepare('DELETE FROM whatsapp_mensajes WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM agente_metricas WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM wa_respuestas WHERE telefono = ?').run(tel);
    db.prepare(
      'DELETE FROM whatsapp_pedidos_borrador_items WHERE borrador_id IN (SELECT id FROM whatsapp_pedidos_borrador WHERE telefono = ?)'
    ).run(tel);
    db.prepare('DELETE FROM whatsapp_pedidos_borrador WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM pedidos WHERE cliente_telefono = ?').run(tel);
    db.prepare('DELETE FROM whatsapp_conversaciones WHERE telefono = ?').run(tel);
    db.prepare('DELETE FROM clientes WHERE telefono = ?').run(tel);
  }
}

module.exports = { run };

const assert = require('assert');
const db = require('../../db');
const { conexion } = require('../../services/whatsappMasivo/conexion');
const { enqueueIncoming } = require('../../services/whatsappGateway');

async function run() {
  const telefono = '5493815550991';
  const cambios = {
    turnos_negocio: JSON.stringify([
      { id: 'prueba', nombre: 'Prueba', desde: '00:00', hasta: '23:59', activo: true },
    ]),
    whatsapp_atencion_ia_activa: '1',
    whatsapp_gateway_pausa_total: '0',
    whatsapp_emergencia_activa: '0',
    ia_fallback_activo: '0',
    ia_proveedor: 'gemini',
    ia_api_key: 'clave-ficticia',
    ia_modelo: 'modelo-prueba',
  };
  const anteriores = Object.keys(cambios).map((clave) => ({
    clave,
    fila: db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave),
  }));
  const guardar = db.prepare(
    'INSERT INTO configuracion (clave,valor) VALUES (?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor'
  );
  const originalFetch = global.fetch;
  const originalEnviar = conexion.enviarTexto;
  const originalPresencia = conexion.enviarPresencia;
  const respuestas = [];
  let llamadasApi = 0;
  try {
    Object.entries(cambios).forEach(([k, v]) => guardar.run(k, v));
    global.fetch = async () => {
      llamadasApi += 1;
      throw new Error('503: proveedor ficticio no disponible');
    };
    conexion.enviarTexto = async (_jid, texto) => respuestas.push(texto);
    conexion.enviarPresencia = async () => {};
    const mensaje = (id) => ({
      key: { id, remoteJid: `${telefono}@s.whatsapp.net` },
      message: { conversation: 'Quiero pedir algo especial para retirar' },
    });
    await enqueueIncoming(mensaje('fallo-proveedor-1'));
    assert.strictEqual(respuestas.length, 1);
    assert.match(respuestas[0], /aviso a una persona/);
    assert.doesNotMatch(respuestas[0], /Mandame.*otra vez|no se perdió/);
    const conversacion = db
      .prepare('SELECT * FROM whatsapp_conversaciones WHERE telefono = ?')
      .get(telefono);
    assert.strictEqual(conversacion.bot_silenciado, 1);
    assert.strictEqual(conversacion.escalado_humano, 1);
    assert.strictEqual(conversacion.ultimo_estado, 'esperando_humano');
    const intentos = llamadasApi;
    await enqueueIncoming(mensaje('fallo-proveedor-2'));
    assert.strictEqual(respuestas.length, 1, 'No repetir el mismo fallo al cliente');
    assert.strictEqual(llamadasApi, intentos, 'La persona conserva el control');
  } finally {
    global.fetch = originalFetch;
    conexion.enviarTexto = originalEnviar;
    conexion.enviarPresencia = originalPresencia;
    anteriores.forEach(({ clave, fila }) => {
      if (fila) guardar.run(clave, fila.valor);
      else db.prepare('DELETE FROM configuracion WHERE clave = ?').run(clave);
    });
    for (const tabla of [
      'agente_metricas',
      'whatsapp_mensajes',
      'wa_respuestas',
      'whatsapp_conversaciones',
      'clientes',
    ]) {
      db.prepare(`DELETE FROM ${tabla} WHERE telefono = ?`).run(telefono);
    }
  }
}

module.exports = { run };

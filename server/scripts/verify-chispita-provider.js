// Evaluación con el proveedor configurado y datos ficticios. No conecta WhatsApp.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

async function run() {
  const sourcePath = process.env.DB_FILE || path.join(__dirname, '../data/modosabor.db');
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  const keys = [
    'ia_proveedor',
    'ia_api_key',
    'ia_modelo',
    'ia_base_url',
    'gemini_api_key',
    'transcripcion_modelo',
  ];
  const config = keys.map((clave) => ({
    clave,
    valor:
      source.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(clave)?.valor || '',
  }));
  source.close();
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'chispita-provider-'));
  process.env.DATA_DIR = temp;
  process.env.DB_FILE = path.join(temp, 'prueba.sqlite');
  process.env.NODE_ENV = 'test';
  process.env.INITIAL_ADMIN_EMAIL = 'prueba@example.invalid';
  process.env.INITIAL_ADMIN_PASSWORD = 'prueba-temporal-no-produccion';
  const db = require('../db');
  const { atenderConMotorPropio } = require('../services/agenteWhatsapp');
  const originalFetch = global.fetch;
  global.fetch = (url, opts = {}) =>
    originalFetch(url, {
      ...opts,
      signal: AbortSignal.any([AbortSignal.timeout(20000), ...(opts.signal ? [opts.signal] : [])]),
    });
  try {
    const guardar = db.prepare(
      'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
    );
    config.forEach(({ clave, valor }) => guardar.run(clave, valor));
    if (process.argv.includes('--gemini')) {
      guardar.run('ia_proveedor', 'gemini');
      guardar.run('ia_api_key', config.find((c) => c.clave === 'gemini_api_key').valor);
      guardar.run('ia_base_url', 'https://generativelanguage.googleapis.com/v1beta');
      const elegido = process.argv
        .find((arg) => arg.startsWith('--model='))
        ?.slice('--model='.length);
      guardar.run(
        'ia_modelo',
        elegido ||
          config.find((c) => c.clave === 'transcripcion_modelo').valor ||
          'gemini-3.6-flash'
      );
    }
    guardar.run('ia_fallback_activo', '0');
    guardar.run('whatsapp_emergencia_activa', '0');
    const telefono = '5493815550987';
    db.prepare('INSERT INTO whatsapp_conversaciones (telefono, nombre) VALUES (?, ?)').run(
      telefono,
      'Cliente ficticio'
    );
    let derivado = false;
    const inicio = Date.now();
    const respuesta = await atenderConMotorPropio(
      {
        telefono,
        texto: 'Quiero hablar con una persona del local',
        mensaje_id: 'evaluacion-persona',
      },
      {
        db,
        memoria: { obtenerContexto: async () => ({ mensajes: [], resumen: '' }) },
        onHandoff: () => {
          derivado = true;
        },
      }
    );
    console.log(
      JSON.stringify({
        caso: 'Derivación solicitada',
        respuesta,
        derivado,
        duracionMs: Date.now() - inicio,
      })
    );
    if (!derivado) process.exitCode = 1;
    if (process.argv.includes('--venta')) {
      guardar.run(
        'turnos_negocio',
        JSON.stringify([
          { id: 'prueba', nombre: 'Prueba', desde: '00:00', hasta: '23:59', activo: true },
        ])
      );
      guardar.run('whatsapp_atencion_ia_activa', '1');
      guardar.run('whatsapp_gateway_pausa_total', '0');
      require('../utils/operationalCaja').ensureOperationalCaja(db);
      db.prepare(
        "INSERT INTO productos (nombre, precio, variantes, extras, activo, stock_directo, disponible_para_venta) VALUES ('Hamburguesa de prueba', 500000, '[]', '[]', 1, 20, 1)"
      ).run();
      const { conexion } = require('../services/whatsappMasivo/conexion');
      const { enqueueIncoming } = require('../services/whatsappGateway');
      conexion.enviarTexto = async (_jid, texto) =>
        console.log(JSON.stringify({ respuestaVenta: texto }));
      conexion.enviarPresencia = async () => {};
      const telefonoVenta = '5493815550988';
      for (const [i, texto] of [
        'Me llamo Ana. Quiero solamente una hamburguesa de prueba para retirar lo antes posible. Nada más, pasame el resumen para confirmar.',
        'sí dale',
        '¿Cómo va mi pedido?',
      ].entries()) {
        await enqueueIncoming({
          key: { id: `venta-prueba-${i}`, remoteJid: `${telefonoVenta}@s.whatsapp.net` },
          message: { conversation: texto },
        });
      }
      const cliente = db.prepare('SELECT id FROM clientes WHERE telefono = ?').get(telefonoVenta);
      const pedidos = db
        .prepare('SELECT id, cliente_id, total FROM pedidos WHERE cliente_telefono = ?')
        .all(telefonoVenta);
      const ok = Boolean(
        cliente &&
        pedidos.length === 1 &&
        pedidos[0].cliente_id === cliente.id &&
        pedidos[0].total === 500000 &&
        !db
          .prepare('SELECT bot_silenciado FROM whatsapp_conversaciones WHERE telefono = ?')
          .get(telefonoVenta)?.bot_silenciado
      );
      console.log(
        JSON.stringify({
          caso: 'Venta y alta de cliente con IA real',
          ok,
          clienteCreado: !!cliente,
          pedidos: pedidos.length,
          totalCentavos: pedidos[0]?.total,
        })
      );
      if (!ok) process.exitCode = 1;
    }
  } catch (error) {
    // No imprimir cuerpos remotos ni credenciales.
    console.log(
      JSON.stringify({
        ok: false,
        motivo: 'El proveedor no completó la prueba',
        tipo: error.name,
        timeout: /timeout|abort|tiempo/i.test(error.message),
      })
    );
    process.exitCode = 1;
  } finally {
    global.fetch = originalFetch;
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch(() => {
  console.error('No se pudo preparar la prueba aislada');
  process.exitCode = 1;
});

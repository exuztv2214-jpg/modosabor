const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const {
  atenderConMotorPropio,
  instruccionesCliente,
  proveedorRespaldoWhatsapp,
} = require('../../services/agenteWhatsapp');
const { nombreClienteCanonico } = require('../../utils/systemClient');
const { nombreDeclaradoPorCliente } = require('../../services/whatsappGateway');

function crearBase() {
  const db = new Database(':memory:');
  const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8');
  const indexes = [];
  const tables = schema.replace(
    /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\b[\s\S]*?;\s*$/gim,
    (statement) => {
      indexes.push(statement);
      return '';
    }
  );
  db.exec(tables);
  runMigrations(db);
  db.exec(indexes.join('\n'));
  db.prepare(
    "INSERT INTO clientes (nombre, telefono) VALUES ('Cliente correcto', '5493811111111')"
  ).run();
  db.prepare(
    "INSERT INTO clientes (nombre, telefono) VALUES ('Cliente ajeno', '5493812222222')"
  ).run();
  return db;
}

async function run() {
  const db = crearBase();
  try {
    assert.strictEqual(
      nombreClienteCanonico({ nombre: 'Cliente registrado' }, 'Nombre inventado'),
      'Cliente registrado',
      'el pedido de WhatsApp no puede reemplazar el nombre que ya tiene la ficha'
    );
    assert.strictEqual(
      nombreClienteCanonico({ nombre: '' }, 'Nombre declarado'),
      'Nombre declarado'
    );
    assert.strictEqual(nombreDeclaradoPorCliente('Me llamo Marina López'), 'Marina López');
    assert.strictEqual(nombreDeclaradoPorCliente('Soy de la esquina'), '');
    const instrucciones = instruccionesCliente({
      nombre: 'Chispita',
      datos_transferencia: 'Alias: prueba.transfer',
    });
    assert.match(
      instrucciones,
      /prueba\.transfer/i,
      'el agente recibe los datos de transferencia configurados'
    );
    assert.match(instrucciones, /“sí”, “si”, “confirmo”, “dale”, “ok”/i);

    let fichaConsultada = null;
    const respuesta = await atenderConMotorPropio(
      {
        telefono: '5493811111111',
        texto: 'hola',
        historial: '',
        cliente: undefined,
      },
      {
        db,
        ejecutarAgente: async ({ ejecutar }) => {
          fichaConsultada = await ejecutar('consultar_cliente', {});
          await assert.rejects(
            () => ejecutar('consultar_cliente', { telefono: '5493812222222' }),
            /otro cliente/
          );
          return { respuesta: { texto: 'Hola' } };
        },
      }
    );
    assert.strictEqual(respuesta, 'Hola');
    assert.strictEqual(fichaConsultada.cliente.nombre, 'Cliente correcto');

    let principal = 0;
    let respaldo = 0;
    const respuestaRespaldo = await atenderConMotorPropio(
      { telefono: '5493811111111', texto: 'hola' },
      {
        db,
        conversarPrincipal: async () => {
          principal += 1;
          throw new Error('principal sin cuota');
        },
        obtenerRespaldo: () => ({
          id: 'respaldo-prueba',
          nombre: 'Respaldo de prueba',
          familia: 'openai',
          baseUrl: 'https://api.example.test/v1',
          modelo: 'modelo-prueba',
          clave: 'no-se-registra',
        }),
        conversarRespaldo: async () => {
          respaldo += 1;
          return {
            texto: 'Hola desde el respaldo',
            llamadas: [],
            uso: {},
            _meta: { proveedor: 'respaldo-prueba', modelo: 'modelo-prueba' },
          };
        },
      }
    );
    assert.strictEqual(respuestaRespaldo, 'Hola desde el respaldo');
    assert.strictEqual(principal, 1);
    assert.strictEqual(respaldo, 1);
    db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?)').run(
      'whatsapp_ia_priorizar_respaldo',
      '1'
    );
    for (const falla of [false, true]) {
      let principalUsado = 0;
      let preferidoUsado = 0;
      await atenderConMotorPropio(
        { telefono: '5493811111111', texto: 'hola' },
        {
          db,
          memoria: { obtenerContexto: async () => ({ mensajes: [] }) },
          obtenerRespaldo: () => ({ id: 'preferido' }),
          conversarRespaldo: async () => {
            preferidoUsado += 1;
            if (falla) throw new Error('proveedor temporalmente caído');
            return { texto: 'Preferido', llamadas: [] };
          },
          conversarPrincipal: async () => {
            principalUsado += 1;
            return { texto: 'Principal', llamadas: [] };
          },
          ejecutarAgente: async ({ _conversar }) => {
            await _conversar({ mensajes: [] });
            return { respuesta: await _conversar({ mensajes: [] }) };
          },
        }
      );
      assert.strictEqual(principalUsado, falla ? 2 : 0);
      assert.strictEqual(preferidoUsado, falla ? 1 : 2);
    }
    db.prepare('DELETE FROM configuracion WHERE clave = ?').run('whatsapp_ia_priorizar_respaldo');
    assert.strictEqual(proveedorRespaldoWhatsapp({ whatsapp_emergencia_activa: '1' }), null);
    const gemini = proveedorRespaldoWhatsapp({
      whatsapp_emergencia_activa: '1',
      whatsapp_emergencia_proveedor: 'Gemini',
      gemini_api_key: 'clave-que-no-se-muestra',
    });
    assert.deepStrictEqual(
      { familia: gemini.familia, modelo: gemini.modelo, baseUrl: gemini.baseUrl },
      {
        familia: 'gemini',
        modelo: 'gemini-3.5-flash-lite',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      }
    );

    const respuestaSinResumen = await atenderConMotorPropio(
      { telefono: '5493811111111', texto: 'seguimos' },
      {
        db,
        memoria: {
          obtenerContexto: async () => {
            throw new Error('el resumen no respondió');
          },
        },
        ejecutarAgente: async () => ({ respuesta: { texto: 'Sigo atendiendo' } }),
      }
    );
    assert.strictEqual(respuestaSinResumen, 'Sigo atendiendo');

    /*
      Mensajes agrupados: el cliente escribió dos veces seguidas y el gateway
      los manda juntos, pero en la base están separados. El modelo tiene que
      leer ese contenido una sola vez.

      Si esto se rompe no falla nada a la vista: el modelo simplemente lee dos
      veces lo que el cliente dijo una, y un "sí" duplicado al lado de un
      resumen de pedido es exactamente la clase de ambigüedad que no queremos
      cerca de la confirmación.
    */
    const agrupados = '5493811111111';
    const conversacion = db
      .prepare('SELECT id FROM whatsapp_conversaciones WHERE telefono = ?')
      .get(agrupados);
    const conversacionId =
      conversacion?.id ||
      Number(
        db
          .prepare("INSERT INTO whatsapp_conversaciones (telefono, nombre) VALUES (?, 'Cliente')")
          .run(agrupados).lastInsertRowid
      );
    db.prepare('DELETE FROM whatsapp_mensajes WHERE conversacion_id = ?').run(conversacionId);
    ['si', 'gracias'].forEach((texto, indice) => {
      db.prepare(
        `INSERT INTO whatsapp_mensajes
           (conversacion_id, telefono, direccion, tipo, contenido, whatsapp_message_id)
         VALUES (?, ?, 'entrante', 'texto', ?, ?)`
      ).run(conversacionId, agrupados, texto, `agrupado-${indice}`);
    });

    let mensajesVistos = [];
    await atenderConMotorPropio(
      { telefono: agrupados, texto: 'si\ngracias', mensaje_id: 'agrupado-0+agrupado-1' },
      {
        db,
        ejecutarAgente: async ({ mensajes }) => {
          mensajesVistos = mensajes;
          return { respuesta: { texto: 'Listo' } };
        },
      }
    );
    const delCliente = mensajesVistos
      .filter((mensaje) => mensaje.rol === 'usuario')
      .map((mensaje) => mensaje.texto);
    assert.deepStrictEqual(
      delCliente,
      ['si', 'gracias'],
      'el texto combinado no puede sumarse encima de los mensajes que ya están en el historial'
    );
  } finally {
    db.close();
  }

  console.log('agenteWhatsapp.test.js OK');
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const {
  atenderConMotorPropio,
  elegirMotorWhatsapp,
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
  const llamadas = [];
  const llamarN8n = async (payload) => {
    llamadas.push(['n8n', payload.telefono]);
    return 'n8n';
  };
  const llamarMotor = async (payload) => {
    llamadas.push(['propio', payload.telefono]);
    return 'propio';
  };

  assert.strictEqual(
    await elegirMotorWhatsapp({
      usarMotorPropio: false,
      payload: { telefono: '1' },
      llamarN8n,
      llamarMotor,
    }),
    'n8n'
  );
  assert.deepStrictEqual(llamadas, [['n8n', '1']]);

  llamadas.length = 0;
  assert.strictEqual(
    await elegirMotorWhatsapp({
      usarMotorPropio: true,
      payload: { telefono: '2' },
      llamarN8n,
      llamarMotor,
    }),
    'propio'
  );
  assert.deepStrictEqual(llamadas, [['propio', '2']]);

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
        modelo: 'gemini-3.6-flash',
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

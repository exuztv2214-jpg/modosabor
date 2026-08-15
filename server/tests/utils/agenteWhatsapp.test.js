const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { runMigrations } = require('../../db/migrations');
const { atenderConMotorPropio, elegirMotorWhatsapp } = require('../../services/agenteWhatsapp');

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

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const mainDb = require('../../db');
const { atenderConMotorPropio } = require('../../services/agenteWhatsapp');

const REALES = [
  ['real-01', ['Holis, están tomando pedidos?', 'Qué precio tiene la docena?'], []],
  ['real-02', ['Hola buenas noches tenés milanesa?'], []],
  ['real-03', ['Voy a querer 2 hamburguesas simple', 'La bacon chesse'], ['hamburguesa', 'bacon']],
  ['real-04', ['Me podría pasar precios de la pizzas'], []],
  ['real-05', ['Hola, me podes enviar 1 pizza comun'], ['comun']],
  ['real-06', ['Mandame media pizza'], ['pizza']],
  ['real-07', ['Me podes mandar una hamburguesa'], ['hamburguesa']],
  ['real-08', ['Hola que tiene de menu'], []],
  ['real-09', ['Para pedir un menu con el agregado de postre y el jugo fresh'], ['jugo']],
  ['real-10', ['Me mandarian un menu de suprema napolitana'], ['suprema napolitana']],
  ['real-11', ['Me podría mandar dos hamburguesas'], ['hamburguesa']],
  ['real-12', ['Promo de hamburguesas tienen?'], []],
  ['real-13', ['Que tenes de menu', 'Ese de 7 mil, milanesa al caballo con pure'], ['caballo']],
  ['real-14', ['Hamburguesas les queda?'], []],
  ['real-15', ['Todas vienen con papas verdad?'], []],
  ['real-16', ['Empanadas les quedan?'], []],
  ['real-17', ['Me podrías preparar una docena? media y media?'], ['empanada']],
  ['real-18', ['Suprema napo con papas'], ['suprema napolitana']],
  ['real-19', ['Cuanto va ser la demora ?'], []],
  ['real-20', ['Los precios son actualizados ?', 'Venden papas ?'], []],
];

const BORDES = [
  ['borde-01', ['2 napos una sin jamon', 'la otra con extra queso'], ['napolitana']],
  ['borde-02', ['2 napos', 'no no sacame una'], ['napolitana']],
  ['borde-03', ['quiero 3 hamburguesas', 'dejame solo una'], ['hamburguesa']],
  ['borde-04', ['sumale coca', 'grande'], ['coca']],
  ['borde-05', ['cuanto es?'], []],
  ['borde-06', ['poneme una pepsi', 'mejor sacame la pepsi y poneme dos jugos'], ['jugo']],
  ['borde-07', ['quiero algo para tres por menos de 30 lucas'], []],
  ['borde-08', ['lo mismo que pedi la vez pasada'], []],
  ['borde-09', ['mandalo a la direccion de siempre'], []],
  ['borde-10', ['quiero una pizza de ananá espacial'], []],
  ['borde-11', ['quiero un producto que esté sin stock'], []],
  ['borde-12', ['mandalo a una dirección fuera de la zona'], []],
  ['borde-13', ['una smash simple', 'una smash simple'], ['smash simple']],
  ['borde-14', ['una smash simple', 'confirmalo', 'confirmalo'], ['smash simple'], true],
  ['borde-15', ['quiero hablar con alguien'], []],
  ['borde-16', ['mila napo con fritas'], ['napolitana']],
  ['borde-17', ['una coca gde y 2 napos'], ['napolitana']],
  ['borde-18', ['dos iguales', 'una bien cocida'], []],
  ['borde-19', ['eso no era, cambialo por una hamburguesa'], ['hamburguesa']],
  ['borde-20', ['hola', 'quiero pedir', 'dos napos', 'una sin jamon'], ['napolitana']],
];

const CASOS = [
  ...REALES.map(([id, mensajes, items, confirmar = false]) => ({
    id,
    origen: 'backup-anonimo',
    mensajes,
    esperado: { items, confirmar },
  })),
  ...BORDES.map(([id, mensajes, items, confirmar = false]) => ({
    id,
    origen: 'borde-inventado',
    mensajes,
    esperado: { items, confirmar },
  })),
];

function normalizar(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function insertarMensaje(db, conversacionId, telefono, direccion, contenido, messageId) {
  db.prepare(
    `INSERT INTO whatsapp_mensajes
      (conversacion_id, telefono, direccion, tipo, contenido, whatsapp_message_id)
     VALUES (?, ?, ?, 'texto', ?, ?)`
  ).run(conversacionId, telefono, direccion, contenido, messageId);
}

function dependenciasPedidoAislado(db) {
  return {
    createRealOrder: async (_db, body) => {
      const existente = db
        .prepare('SELECT * FROM pedidos WHERE idempotency_key = ?')
        .get(body.idempotencyKey);
      if (existente) return existente;
      const total = (body.items || []).reduce(
        (suma, item) => suma + Number(item.precio_unitario || 0) * Number(item.cantidad || 1),
        0
      );
      const numero = db
        .prepare('SELECT COALESCE(MAX(numero), 0) + 1 numero FROM pedidos')
        .get().numero;
      const result = db
        .prepare(
          `INSERT INTO pedidos
            (numero, cliente_telefono, items, subtotal, total, origen, idempotency_key)
           VALUES (?, ?, ?, ?, ?, 'whatsapp', ?)`
        )
        .run(
          numero,
          body.cliente_telefono,
          JSON.stringify(body.items),
          total,
          total,
          body.idempotencyKey
        );
      return db.prepare('SELECT * FROM pedidos WHERE id = ?').get(result.lastInsertRowid);
    },
  };
}

function evaluar(db, telefono, caso, respuestas, herramientas) {
  const borrador = db
    .prepare('SELECT * FROM whatsapp_pedidos_borrador WHERE telefono = ? ORDER BY id DESC LIMIT 1')
    .get(telefono);
  const items = borrador
    ? db
        .prepare('SELECT * FROM whatsapp_pedidos_borrador_items WHERE borrador_id = ?')
        .all(borrador.id)
    : [];
  /*
    Lo que se espera se compara contra el nombre del producto **y el de su
    categoría**.

    En la carta de Modo Sabor ningún producto se llama "hamburguesa": se llaman
    Smash Simple, Bacon Cheese, Golpe Bajo. La palabra vive en la categoría. Con
    la comparación vieja, un caso que esperaba `['hamburguesa']` no podía pasar
    aunque el agente cargara la hamburguesa correcta, y esos fallos se leían
    como errores del agente cuando eran de la prueba.

    La intención de esperar "hamburguesa" es "que haya cargado alguna
    hamburguesa", y eso es exactamente lo que dice la categoría.
  */
  const categoriaPorProducto = db.prepare(
    'SELECT c.nombre FROM productos p LEFT JOIN categorias c ON c.id = p.categoria_id WHERE p.id = ?'
  );
  const nombres = normalizar(
    items
      .map((item) => {
        const categoria = categoriaPorProducto.get(item.producto_id)?.nombre || '';
        return `${item.nombre} ${categoria}`;
      })
      .join(' ')
  );
  const faltantes = caso.esperado.items.filter((nombre) => !nombres.includes(normalizar(nombre)));
  const pedidos = db
    .prepare("SELECT * FROM pedidos WHERE cliente_telefono = ? AND origen = 'whatsapp'")
    .all(telefono);
  const importesPermitidos = new Set(
    db
      .prepare('SELECT precio FROM productos WHERE activo = 1 AND precio > 0')
      .all()
      .map((r) => Number(r.precio))
  );
  items.forEach((item) =>
    importesPermitidos.add(Number(item.precio_unitario || 0) * Number(item.cantidad || 1))
  );
  if (borrador) importesPermitidos.add(Number(borrador.total || 0));
  const importesDichos =
    respuestas
      .join(' ')
      .match(/\$\s*[\d.]+/g)
      ?.map((valor) => Number(valor.replace(/\D/g, '')) * 100) || [];
  const preciosInventados = importesDichos.filter((valor) => !importesPermitidos.has(valor));
  const errores = [];
  if (faltantes.length) {
    errores.push(`Faltan items: ${faltantes.join(', ')}`);
  }
  if (!caso.esperado.confirmar && pedidos.length) {
    errores.push('Creó un pedido antes de confirmarlo');
  }
  if (caso.esperado.confirmar && pedidos.length !== 1) {
    errores.push(`Creó ${pedidos.length} pedidos`);
  }
  if (preciosInventados.length) {
    errores.push(`Precios sin respaldo: ${preciosInventados.join(', ')}`);
  }
  if (herramientas.length > 12) {
    errores.push(`Usó ${herramientas.length} herramientas`);
  }
  return { ok: errores.length === 0, errores, items, pedidos: pedidos.length, herramientas };
}

async function ejecutarCaso(db, caso, indice) {
  const telefono = `54938177${String(indice).padStart(4, '0')}`;
  const result = db
    .prepare(
      "INSERT INTO whatsapp_conversaciones (telefono, nombre) VALUES (?, 'Cliente de prueba')"
    )
    .run(telefono);
  const conversacionId = Number(result.lastInsertRowid);
  const respuestas = [];
  const herramientas = [];
  for (let i = 0; i < caso.mensajes.length; i += 1) {
    const messageId = `${caso.id}-${i + 1}`;
    insertarMensaje(db, conversacionId, telefono, 'entrante', caso.mensajes[i], messageId);
    const respuesta = await atenderConMotorPropio(
      { telefono, texto: caso.mensajes[i], mensaje_id: messageId },
      {
        db,
        dependenciasPedido: dependenciasPedidoAislado(db),
        onPaso: ({ llamada }) => herramientas.push(llamada.nombre),
      }
    );
    respuestas.push(respuesta);
    insertarMensaje(db, conversacionId, telefono, 'saliente', respuesta, `respuesta-${messageId}`);
  }
  return {
    id: caso.id,
    origen: caso.origen,
    ...evaluar(db, telefono, caso, respuestas, herramientas),
  };
}

function dormir(ms) {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

async function run() {
  const temporal = path.join(os.tmpdir(), `modosabor-agente-${process.pid}-${Date.now()}.sqlite`);
  await mainDb.backup(temporal);
  const db = new Database(temporal);
  const resultados = [];
  /*
    Una pausa entre conversaciones.

    Sin esto la tanda entera sale de corrido y el proveedor la corta por límite
    de pedidos por minuto: a partir del caso diez empezaban a llegar 429 y lo
    que se terminaba midiendo era la cuota, no al agente. Se puede ajustar con
    PAUSA_ENTRE_CASOS_MS según el plan que tenga el negocio.
  */
  const pausaMs = Math.max(0, Number(process.env.PAUSA_ENTRE_CASOS_MS || 4000));
  try {
    for (let i = 0; i < CASOS.length; i += 1) {
      if (i > 0 && pausaMs) await dormir(pausaMs);
      /*
        Un caso que revienta no puede llevarse la tanda.

        Antes el error salía de `run` y se perdían los resultados de todo lo que
        ya había corrido: veinte conversaciones medidas tiradas porque la
        veintiuna se quedó sin cuota. El fallo se anota como fallo y se sigue.
      */
      try {
        resultados.push(await ejecutarCaso(db, CASOS[i], i + 1));
      } catch (error) {
        resultados.push({
          id: CASOS[i].id,
          origen: CASOS[i].origen,
          ok: false,
          errores: [`No se pudo completar: ${String(error?.message || error).slice(0, 200)}`],
          items: [],
          pedidos: 0,
          herramientas: [],
        });
      }
      console.log(`${resultados.at(-1).ok ? 'OK' : 'FALLÓ'} ${CASOS[i].id}`);
    }
  } finally {
    db.close();
    fs.rmSync(temporal, { force: true });
  }
  const salida = {
    fecha: new Date().toISOString(),
    casos: resultados.length,
    aprobados: resultados.filter((item) => item.ok).length,
    resultados,
  };
  fs.writeFileSync(path.join(__dirname, 'resultados.json'), `${JSON.stringify(salida, null, 2)}\n`);
  if (salida.aprobados !== salida.casos) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { CASOS, run };

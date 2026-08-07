const assert = require('assert');

const {
  conDefectos,
  pideLaBaja,
  esDiaDeEnvio,
  limiteDeHoy,
  esperaAntesDelProximo,
  cupoDisponible,
  puedeArrancar,
  armarMensaje,
} = require('../../services/whatsappMasivo/reglas');

/**
 * Tests de las reglas que cuidan el número de WhatsApp.
 *
 * ── Por qué estos y no otros ───────────────────────────────────────────────
 *
 * Si alguna de estas reglas falla no salta ninguna excepción ni se rompe una
 * pantalla: los mensajes salen igual, un poco más rápido o un poco más
 * seguido, y un día WhatsApp bloquea el número por el que entran los pedidos.
 * Es la clase de error que sólo se descubre cuando ya es tarde.
 *
 * Las reglas vienen de la app que el local usa desde julio, que sostuvo entre
 * 85 y 190 mensajes por día sin bloqueo. Estos tests son lo que evita que se
 * degraden sin que nadie se entere.
 */

function testLaEsperaNuncaEsCero() {
  /*
    Mandar sin pausa es la forma más rápida de que te marquen. Se prueban los
    dos extremos del azar en vez de confiar en el promedio.
  */
  const config = { demoraMinMs: 15000, demoraMaxMs: 45000, pausaLargaCada: 0 };
  assert.strictEqual(
    esperaAntesDelProximo(config, 1, () => 0),
    15000,
    'el mínimo del rango'
  );
  assert.strictEqual(
    esperaAntesDelProximo(config, 1, () => 1),
    45000,
    'el máximo del rango'
  );
  assert.strictEqual(
    esperaAntesDelProximo(config, 1, () => 0.5),
    30000,
    'el medio'
  );

  /*
    Si alguien deja el máximo por debajo del mínimo, el rango se da vuelta y
    la espera podría salir negativa: sin pausa ninguna.
  */
  const invertido = conDefectos({ demoraMinMs: 40000, demoraMaxMs: 5000 });
  assert.ok(
    invertido.demoraMaxMs >= invertido.demoraMinMs,
    'con los límites invertidos la espera se iría a cero'
  );
  assert.ok(esperaAntesDelProximo({ demoraMinMs: 40000, demoraMaxMs: 5000 }, 1, () => 0) >= 40000);

  console.log('  OK la espera entre mensajes nunca queda en cero');
}

function testLaPausaLarga() {
  const config = {
    pausaLargaCada: 15,
    pausaLargaSegundos: 120,
    demoraMinMs: 1000,
    demoraMaxMs: 1000,
  };
  assert.strictEqual(
    esperaAntesDelProximo(config, 15, () => 0),
    120000,
    'al llegar a 15 va la pausa larga'
  );
  assert.strictEqual(
    esperaAntesDelProximo(config, 30, () => 0),
    120000,
    'y otra vez a los 30'
  );
  assert.strictEqual(
    esperaAntesDelProximo(config, 14, () => 0),
    1000,
    'en el medio, la espera normal'
  );
  // Sin esta guarda, el mensaje 0 dispararía la pausa larga apenas arranca.
  assert.strictEqual(
    esperaAntesDelProximo(config, 0, () => 0),
    1000,
    'el primero no espera dos minutos'
  );

  console.log('  OK la pausa larga cae cada 15 mensajes y no al arrancar');
}

function testDiasSinEnvio() {
  const domingo = new Date('2026-08-09T15:00:00');
  const lunes = new Date('2026-08-10T15:00:00');
  assert.strictEqual(domingo.getDay(), 0, 'la fecha de prueba tiene que ser domingo');

  assert.strictEqual(esDiaDeEnvio({}, domingo), false, 'por defecto los domingos no se manda');
  assert.strictEqual(esDiaDeEnvio({}, lunes), true);
  assert.strictEqual(esDiaDeEnvio({ diasSinEnvio: [] }, domingo), true, 'se puede desactivar');
  assert.strictEqual(esDiaDeEnvio({ diasSinEnvio: [1] }, lunes), false);

  console.log('  OK los días sin envío se respetan');
}

function testCalentamiento() {
  const config = {
    calentamientoActivo: true,
    calentamientoInicio: 20,
    calentamientoIncremento: 10,
    maxPorCorrida: 50,
  };
  assert.strictEqual(limiteDeHoy(config, 0), 20, 'el primer día arranca bajo');
  assert.strictEqual(limiteDeHoy(config, 1), 30);
  assert.strictEqual(limiteDeHoy(config, 2), 40);
  assert.strictEqual(limiteDeHoy(config, 3), 50);
  assert.strictEqual(limiteDeHoy(config, 99), 50, 'nunca pasa el techo por corrida');
  assert.strictEqual(limiteDeHoy({ maxPorCorrida: 50 }, 99), 50, 'apagado, es el techo directo');

  console.log('  OK la rampa de calentamiento sube y no pasa el techo');
}

function testCupoPorVentana() {
  const config = { maxPorVentana: 60, ventanaMinutos: 60 };
  assert.strictEqual(cupoDisponible(config, 0), 60);
  assert.strictEqual(cupoDisponible(config, 59), 1);
  assert.strictEqual(cupoDisponible(config, 60), 0, 'llegando al tope no queda cupo');
  assert.strictEqual(cupoDisponible(config, 75), 0, 'pasado el tope tampoco, y nunca negativo');
  assert.strictEqual(cupoDisponible({ maxPorVentana: 0 }, 999), Infinity, 'en 0 es sin límite');

  console.log('  OK el cupo por ventana frena el pico');
}

function testLaBaja() {
  /*
    La baja es lo que protege el número: alguien que no puede salir termina
    reportando, y los reportes son lo que dispara el bloqueo.
  */
  [
    'BAJA',
    'baja',
    ' Baja ',
    'stop',
    'no quiero',
    'sacame de la lista',
    'BASTA',
    'no.',
    'No',
    'darme de baja por favor',
  ].forEach((t) => {
    assert.ok(pideLaBaja(t), `"${t}" tenía que darse de baja`);
  });

  /*
    Y al revés: dar de baja a quien no lo pidió es perder un cliente en
    silencio. Por eso la palabra tiene que abrir el mensaje.
  */
  [
    'no me llegó el pedido',
    'no puedo creer lo rico que estaba',
    'no tenían más napolitana?',
    '¿tienen delivery a Concepción?',
    'quiero una milanesa',
    'gracias, no hace falta que me mandes hoy',
    '',
  ].forEach((t) => {
    assert.ok(!pideLaBaja(t), `"${t}" NO era una baja: se perdía un cliente`);
  });

  console.log('  OK la baja se detecta sin dar de baja a quien reclama');
}

function testCuandoNoSePuedeArrancar() {
  const base = { config: {}, conectado: true, mensaje: 'Hola', pendientes: 10 };
  const lunes = new Date('2026-08-10T15:00:00');

  assert.strictEqual(puedeArrancar({ ...base, fecha: lunes }).puede, true);

  // Cada negativa tiene que explicar qué falta: un botón que no responde y no
  // dice por qué es peor que uno deshabilitado.
  const casos = [
    [{ ...base, conectado: false }, /no está conectado/i],
    [{ ...base, mensaje: '   ' }, /mensaje/i],
    [{ ...base, pendientes: 0 }, /contactos/i],
    [{ ...base, fecha: new Date('2026-08-09T15:00:00') }, /domingo/i],
  ];
  casos.forEach(([entrada, esperado]) => {
    const r = puedeArrancar({ fecha: lunes, ...entrada });
    assert.strictEqual(r.puede, false);
    assert.ok(esperado.test(r.motivo), `el motivo "${r.motivo}" no explica qué falta`);
  });

  console.log('  OK cuando no se puede arrancar, dice por qué');
}

function testElMensajeVaria() {
  const saludos = ['¡Hola{NOMBRE}!', '¡Buenas{NOMBRE}!'];
  const cierres = ['¡Te esperamos!', '¡Pedí ya!'];

  const conNombre = armarMensaje({
    plantilla: '{SALUDO}\n\nHoy: milanesa a la napolitana.',
    nombre: 'Hernán Gómez',
    saludos,
    cierres,
    footer: 'Respondé BAJA y no te mando más.',
    azar: () => 0,
  });
  assert.ok(conNombre.includes('¡Hola Hernán!'), 'tiene que usar el primer nombre');
  assert.ok(!conNombre.includes('{NOMBRE}'), 'no puede quedar el marcador crudo');
  assert.ok(conNombre.includes('¡Te esperamos!'), 'tiene que cerrar');
  assert.ok(conNombre.includes('BAJA'), 'el footer de baja va siempre');

  /*
    Sin nombre, "¡Hola{NOMBRE}!" tiene que quedar "¡Hola!" y no "¡Hola !".
    Un espacio de más antes del signo delata que el mensaje es automático.
  */
  const sinNombre = armarMensaje({
    plantilla: '{SALUDO}\n\nHoy hay milanesa.',
    saludos,
    cierres,
    azar: () => 0,
  });
  assert.ok(
    sinNombre.includes('¡Hola!'),
    `quedó "${sinNombre.split('\\n')[0]}" en vez de "¡Hola!"`
  );
  assert.ok(!sinNombre.includes(' !'), 'quedó un espacio antes del signo');

  // Dos mensajes iguales cien veces es la firma de un envío masivo.
  const a = armarMensaje({ plantilla: 'Hoy hay milanesa.', saludos, cierres, azar: () => 0 });
  const b = armarMensaje({ plantilla: 'Hoy hay milanesa.', saludos, cierres, azar: () => 0.99 });
  assert.notStrictEqual(a, b, 'con distinto azar tienen que salir distintos');

  // Si la plantilla no trae {SALUDO}, el saludo se agrega igual.
  assert.ok(a.startsWith('¡Hola!'), 'sin marcador, el saludo va adelante igual');

  console.log('  OK el mensaje varía y el nombre no deja espacios raros');
}

function run() {
  console.log('\nTests de las reglas de WhatsApp');
  testLaEsperaNuncaEsCero();
  testLaPausaLarga();
  testDiasSinEnvio();
  testCalentamiento();
  testCupoPorVentana();
  testLaBaja();
  testCuandoNoSePuedeArrancar();
  testElMensajeVaria();
  console.log('Todos los tests de las reglas de WhatsApp pasaron\n');
}

run();

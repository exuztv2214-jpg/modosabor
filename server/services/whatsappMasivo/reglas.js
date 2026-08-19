/**
 * Las reglas que cuidan el número.
 *
 * ── Por qué están separadas del envío ──────────────────────────────────────
 *
 * Todo lo de acá es puro: entra un estado, sale una decisión. Ninguna función
 * toca la base, la red ni el reloj del sistema —la hora entra como argumento.
 *
 * Eso no es prolijidad: es la única forma de probarlas. Un bucle que manda
 * ciento cincuenta mensajes con esperas de cuarenta segundos no se puede
 * testear, y estas reglas son justamente las que no pueden estar mal. Si el
 * tope por hora falla, no salta ninguna excepción: simplemente un día WhatsApp
 * bloquea el número por el que entran los pedidos.
 *
 * ── De dónde salen ─────────────────────────────────────────────────────────
 *
 * De la app de envíos que el local viene usando desde julio, que sostuvo
 * entre 85 y 190 mensajes por día sin que bloquearan el número. No son
 * teoría: son las que ya funcionaron.
 */

const DEFECTOS = {
  /* Espera entre mensajes: un valor al azar entre estos dos. Una cadencia
     exacta es la firma más obvia de un robot. */
  demoraMinMs: 15_000,
  demoraMaxMs: 45_000,

  /* Pausa larga cada tantos mensajes. Simula que la persona deja el teléfono. */
  pausaLargaCada: 15,
  pausaLargaSegundos: 120,

  /* Techo por corrida. Con tandas activas se manda esta cantidad, se espera y
     se sigue, en vez de cortar. */
  maxPorCorrida: 50,
  modoTandas: false,
  esperaEntreTandasMinutos: 20,

  /* Techo por ventana de tiempo. Es el que evita el pico repentino, que es
     lo que más rápido dispara la alarma del otro lado. */
  maxPorVentana: 60,
  ventanaMinutos: 60,

  /* Días sin envío. 0 es domingo. */
  diasSinEnvio: [0],

  /* Rampa: el primer día se manda poco y sube. Sirve para un número nuevo o
     uno que estuvo callado mucho tiempo. */
  calentamientoActivo: false,
  calentamientoInicio: 20,
  calentamientoIncremento: 10,

  /* Un contacto no recibe dos veces durante el mismo turno operativo. */
  noRepetirMismoTurno: true,

  reintentos: 1,
};

/**
 * Palabras de baja, en dos grupos.
 *
 * ── Por qué dos y no una lista ─────────────────────────────────────────────
 *
 * La primera versión tenía una sola lista que se comparaba por prefijo, y con
 * `no` adentro cualquier mensaje que empezara con esa palabra daba de baja:
 * "no me llegó el pedido" sacaba de la lista al cliente que estaba
 * reclamando. Un cliente perdido en silencio y sin que nadie se entere.
 *
 * Así que las palabras cortas y ambiguas —`no`, `basta`, `salir`— sólo valen
 * si son el mensaje completo. Las inequívocas sí pueden abrirlo, porque nadie
 * escribe "sacame" o "desuscribir" para otra cosa.
 */
const BAJA_EXACTA = ['baja', 'no', 'basta', 'stop', 'salir', 'unsubscribe', 'cancelar'];

const BAJA_PREFIJO = [
  'baja',
  'stop',
  'no quiero',
  'no gracias',
  'no me mandes',
  'no mandes',
  'no me manden',
  'dar de baja',
  'darme de baja',
  'sacame',
  'saquenme',
  'desuscribir',
  'unsubscribe',
];

/** Se deja el nombre viejo por si algo afuera lo usa. */
const PALABRAS_BAJA = BAJA_PREFIJO;

function normalizar(texto) {
  return String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * ¿Este mensaje pide la baja?
 *
 * Las palabras cortas valen sólo si son el mensaje entero; las inequívocas
 * pueden abrirlo. Y en ningún caso alcanza con que aparezcan en el medio:
 * "no gracias por ahora, la semana que viene pido" arranca con una baja, pero
 * "gracias, no hace falta que me mandes hoy" no la pide.
 */
function pideLaBaja(texto) {
  const t = normalizar(texto).replace(/[.!¡?¿,]+$/g, '');
  if (!t) return false;
  if (BAJA_EXACTA.includes(t)) return true;
  // Las inequívocas valen tanto solas ("no quiero") como abriendo el mensaje
  // ("no quiero más promos"). Lo que nunca alcanza es que aparezcan en el medio.
  return BAJA_PREFIJO.some((p) => t === p || t.startsWith(`${p} `));
}

/** Mezcla la config guardada con los valores por defecto. */
function conDefectos(config = {}) {
  const c = { ...DEFECTOS };
  Object.entries(config).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(DEFECTOS[k])) {
      c[k] = Array.isArray(v) ? v : DEFECTOS[k];
    } else if (typeof DEFECTOS[k] === 'boolean') {
      c[k] = v === true || v === 1 || v === '1' || v === 'true';
    } else if (typeof DEFECTOS[k] === 'number') {
      const n = Number(v);
      c[k] = Number.isFinite(n) && n >= 0 ? n : DEFECTOS[k];
    } else {
      c[k] = v;
    }
  });
  /* Si alguien invierte los límites, la espera al azar daría un rango vacío y
     el envío saldría sin pausa ninguna. */
  if (c.demoraMaxMs < c.demoraMinMs) c.demoraMaxMs = c.demoraMinMs;
  return c;
}

/** ¿Hoy se manda? El día entra como argumento para poder probarlo. */
function esDiaDeEnvio(config, fecha = new Date()) {
  const c = conDefectos(config);
  return !c.diasSinEnvio.includes(fecha.getDay());
}

/**
 * Techo de mensajes para hoy.
 *
 * Con el calentamiento activo, crece según cuántos días ya se mandó, hasta
 * llegar al máximo por corrida. `diasConEnvios` es la cantidad de jornadas
 * anteriores en las que salió algo.
 */
function limiteDeHoy(config, diasConEnvios = 0) {
  const c = conDefectos(config);
  if (!c.calentamientoActivo) return c.maxPorCorrida;
  const limite = c.calentamientoInicio + c.calentamientoIncremento * Math.max(0, diasConEnvios);
  return Math.min(limite, c.maxPorCorrida);
}

/**
 * Cuánto esperar antes del próximo mensaje.
 *
 * `azar` entra como argumento —por defecto `Math.random`— para que el test
 * pueda fijarlo y comprobar los extremos del rango en vez de confiar.
 */
function esperaAntesDelProximo(config, yaEnviados, azar = Math.random) {
  const c = conDefectos(config);
  if (c.pausaLargaCada > 0 && yaEnviados > 0 && yaEnviados % c.pausaLargaCada === 0) {
    return c.pausaLargaSegundos * 1000;
  }
  return Math.round(c.demoraMinMs + azar() * (c.demoraMaxMs - c.demoraMinMs));
}

/**
 * ¿Queda cupo en la ventana?
 *
 * `enviadosEnVentana` es cuántos salieron en los últimos `ventanaMinutos`.
 * Devuelve cuántos faltan; 0 significa que hay que esperar.
 */
function cupoDisponible(config, enviadosEnVentana = 0) {
  const c = conDefectos(config);
  if (!c.maxPorVentana) return Infinity;
  return Math.max(0, c.maxPorVentana - enviadosEnVentana);
}

/**
 * Decide si se puede arrancar una corrida y, si no, por qué.
 *
 * Devuelve el motivo en texto para que la pantalla lo muestre tal cual. Un
 * botón que no hace nada sin explicar por qué es peor que uno deshabilitado.
 */
function puedeArrancar({ config, conectado, mensaje, pendientes, fecha = new Date() }) {
  if (!conectado) return { puede: false, motivo: 'WhatsApp no está conectado' };
  if (!String(mensaje || '').trim()) return { puede: false, motivo: 'No hay mensaje cargado' };
  if (!pendientes) return { puede: false, motivo: 'No hay contactos pendientes' };
  if (!esDiaDeEnvio(config, fecha)) {
    const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return { puede: false, motivo: `Los ${dias[fecha.getDay()]} no se manda` };
  }
  return { puede: true, motivo: null };
}

/**
 * Arma el texto final de un contacto.
 *
 * Dos mensajes idénticos mandados cien veces son la huella más clara de un
 * envío masivo, así que el saludo y el cierre se eligen al azar y el nombre
 * se inserta cuando se lo conoce.
 */
function armarMensaje({
  plantilla,
  nombre,
  saludos = [],
  cierres = [],
  footer = '',
  azar = Math.random,
}) {
  const elegir = (lista) => (lista.length ? lista[Math.floor(azar() * lista.length)] : '');

  // El nombre va con espacio adelante para que "¡Hola{NOMBRE}!" quede bien
  // tanto con nombre como sin él.
  const primerNombre =
    String(nombre || '')
      .trim()
      .split(/\s+/)[0] || '';
  const conNombre = (t) =>
    String(t || '').replace(/\{NOMBRE\}/g, primerNombre ? ` ${primerNombre}` : '');

  let texto = conNombre(plantilla).replace(/\{SALUDO\}/g, conNombre(elegir(saludos)));

  // Si la plantilla no tiene {SALUDO}, el saludo se antepone igual.
  if (!/\{SALUDO\}/.test(String(plantilla)) && saludos.length) {
    texto = `${conNombre(elegir(saludos))}\n\n${texto}`;
  }

  const cierre = elegir(cierres);
  if (cierre) texto = `${texto}\n\n${cierre}`;
  if (footer) texto = `${texto}\n\n${footer}`;

  return texto.trim();
}

module.exports = {
  DEFECTOS,
  PALABRAS_BAJA,
  BAJA_EXACTA,
  BAJA_PREFIJO,
  conDefectos,
  pideLaBaja,
  esDiaDeEnvio,
  limiteDeHoy,
  esperaAntesDelProximo,
  cupoDisponible,
  puedeArrancar,
  armarMensaje,
  normalizar,
};

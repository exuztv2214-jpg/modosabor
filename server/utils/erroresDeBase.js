/**
 * Traduce los errores de la base a algo que sirva en pantalla.
 *
 * ── El problema ────────────────────────────────────────────────────────────
 *
 * Cuando algo choca contra una regla de la base, el sistema mostraba:
 *
 *     "Ya existe un registro con ese valor. Probá con otro."
 *
 * Y en producción se guardaba el detalle para sí mismo:
 *
 *     ...(isDev ? { detail: error.message } : {})
 *
 * La intención está bien —no mostrarle las tripas de la base a cualquiera—
 * pero el resultado es que quien está atendiendo lee un cartel que no dice
 * nada, y el dueño termina revisando registros del servidor para averiguar qué
 * campo estaba repetido.
 *
 * Pasó: apareció ese cartel, y para saber de qué se trataba había que entrar a
 * los logs de Railway.
 *
 * ── La distinción que importa ──────────────────────────────────────────────
 *
 * Un mensaje de SQLite trae dos cosas y sólo una es sensible:
 *
 *     UNIQUE constraint failed: personal.clock_pin
 *                               ^^^^^^^^^^^^^^^^^
 *                               qué campo — se puede mostrar
 *
 * El **valor** que se intentó guardar sí es privado, y ese nunca viaja en el
 * mensaje de SQLite. El nombre de la tabla y la columna no revelan nada que no
 * se vea en la pantalla que uno acaba de usar.
 *
 * Así que se muestra el campo, en castellano, y se deja afuera todo lo demás.
 */

/**
 * Nombres para las personas, no para la base.
 *
 * Sólo están los campos que alguien puede llegar a chocar desde una pantalla.
 * Si falta alguno se muestra el nombre técnico, que es feo pero informativo —
 * bastante mejor que "ese valor".
 */
const NOMBRES = {
  'personal.clock_pin': 'PIN del reloj',
  'personal.clock_token': 'enlace del reloj',
  'personal.usuario_id': 'usuario vinculado',
  'personal_categorias.nombre': 'nombre de la categoría',
  'clientes.telefono': 'teléfono',
  'usuarios.usuario': 'nombre de usuario',
  'usuarios.email': 'correo',
  'productos.nombre': 'nombre del producto',
  'categorias.nombre': 'nombre de la categoría',
  'cupones.codigo': 'código del cupón',
  'pedidos.numero': 'número de pedido',
  'repartidores.codigo': 'código del repartidor',
  'wa_excluidos.telefono': 'teléfono',
  'configuracion.clave': 'clave de configuración',
  'mesa_reservas.mesa': 'mesa',
  'inventario_insumos.nombre': 'nombre del insumo',
};

/**
 * Saca los campos de un mensaje de SQLite.
 *
 * Puede venir uno solo (`personal.clock_pin`) o varios cuando la regla abarca
 * una combinación (`wa_envios.campana_id, wa_envios.telefono`).
 */
function camposDelError(mensaje) {
  const partes = String(mensaje || '').split(':');
  if (partes.length < 2) return [];
  return partes
    .slice(1)
    .join(':')
    .split(',')
    .map((c) => c.trim())
    .filter((c) => /^[a-z_]+\.[a-z_]+$/i.test(c));
}

/** Cómo se llama ese campo para alguien que no ve la base. */
function nombreLegible(campo) {
  if (NOMBRES[campo]) return NOMBRES[campo];
  const columna = campo.split('.')[1] || campo;
  return columna.replace(/_/g, ' ');
}

/**
 * El mensaje final. Devuelve `null` si el error no es de los que traduce, para
 * que el que llama siga con su manejo de siempre.
 */
function traducirErrorDeBase(error) {
  const mensaje = String(error?.message || '');
  const enMinuscula = mensaje.toLowerCase();
  const campos = camposDelError(mensaje).map(nombreLegible);
  const lista = campos.join(' y ');

  if (enMinuscula.includes('unique constraint failed')) {
    return {
      status: 409,
      error: lista
        ? `Ya hay otro registro con ese ${lista}. Probá con otro valor.`
        : 'Ya existe un registro con ese valor. Probá con otro.',
    };
  }

  if (enMinuscula.includes('foreign key constraint failed')) {
    return {
      status: 400,
      error: 'No se puede guardar porque el dato relacionado ya no existe.',
    };
  }

  if (enMinuscula.includes('not null constraint failed')) {
    return {
      status: 400,
      error: lista ? `Falta completar: ${lista}.` : 'Faltan datos obligatorios.',
    };
  }

  if (enMinuscula.includes('check constraint failed')) {
    return {
      status: 400,
      error: lista
        ? `El valor de ${lista} no es válido.`
        : 'El valor ingresado no cumple con las reglas del sistema.',
    };
  }

  return null;
}

module.exports = { traducirErrorDeBase, camposDelError, nombreLegible, NOMBRES };

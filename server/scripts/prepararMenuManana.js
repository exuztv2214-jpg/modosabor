/**
 * Deja preparados los platos del menú del día SIN activarlos.
 *
 * Uso:
 *   node server/scripts/prepararMenuManana.js
 *   (en producción: railway run node server/scripts/prepararMenuManana.js)
 *
 * ── Por qué existe, si ya hay dos scripts parecidos ────────────────────────
 *
 * `upsertMenuDelDia.js` y `seedMenuManana.js` cargan el menú de HOY: apagan
 * todo lo de ayer y prenden lo nuevo. Sirven a la mañana, antes de abrir.
 *
 * Pero el sistema no tiene noción de "mañana": `menu_dia_disponible_hoy` es un
 * sí/no, no una fecha. Correr cualquiera de esos dos scripts a media tarde le
 * cambia el menú a la cocina en pleno servicio.
 *
 * Este prepara los platos y no los prende:
 *
 *   - `menu_dia_disponible_hoy` no se toca en ninguna fila. El menú de hoy
 *     sigue exactamente como está.
 *   - Los platos quedan con `activo = 0`, así no aparecen ni en el TPV ni en
 *     la carta online antes de tiempo.
 *   - Sí quedan con `menu_dia_base = 1`, que es lo que los hace aparecer en
 *     Operación → Menú del día, que no filtra por activo.
 *
 * Mañana a la mañana: Operación → Menú del día, tildar los platos, guardar.
 * Ese guardado pone `activo = 1` y `menu_dia_disponible_hoy = 1` de una.
 *
 * Idempotente: se puede correr las veces que haga falta.
 *
 * ── Unidades ───────────────────────────────────────────────────────────────
 *
 * `precio` y los recargos de `extras` / `variantes` van todos en centavos, que
 * es lo que ya guardaba la base. Lo que estaba roto no era el dato sino la
 * pantalla: `moneyConversion.js` no entraba a esas dos columnas porque son
 * texto, así que el TPV mostraba "+$100.000" donde había $1.000.
 */
/*
  `../db` se pide adentro del bloque de abajo y no acá arriba a propósito:
  requerirlo abre la base de producción apenas se importa el archivo, y eso
  hace imposible probar `preparar()` contra un SQLite de mentira.
*/

const CATEGORY_NAME = 'Menu del Dia';

const PRECIO_ECONOMICO = 5000;
const PRECIO_EJECUTIVO = 7000;
const PRECIO_EXTRA = 1000;
const STOCK_MENU_DIA = 20;

/** Pesos → centavos, que es lo que guarda la base. */
const aCentavos = (pesos) => Math.round(Number(pesos || 0) * 100);

/** El juego de guarniciones de siempre. */
const GUARNICIONES = [
  'Arroz blanco',
  'Arroz a la provenzal',
  'Fideo a la provenzal',
  'Papas',
  'Puré',
  'Arroz primavera',
];

/** El canelón es la excepción: va con salsa, no con guarnición. */
const SALSAS = ['Salsa roja', 'Salsa blanca', 'Salsa mixta'];

const PLATOS = [
  // ── Económico · $5.000 ──
  {
    nombre: 'Wok de verduras y pollo',
    tipo: 'economico',
    descripcion: 'Wok casero de verduras y pollo. Elegí acompañamiento.',
    guarniciones: ['Arroz', 'Fideo'],
    aliases: ['Wok de pollo y verduras', 'Wok de verduras con pollo', 'Wok'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Canelón',
    tipo: 'economico',
    descripcion: 'Canelón casero. Elegí la salsa.',
    guarniciones: SALSAS,
    aliases: ['Canelones'],
    tiempo_preparacion: 18,
  },
  {
    nombre: 'Pollo teriyaki',
    tipo: 'economico',
    descripcion: 'Pollo teriyaki. Elegí guarnición.',
    guarniciones: GUARNICIONES,
    aliases: ['Pollo teriyaqui', 'Teriyaki'],
    tiempo_preparacion: 20,
  },
  {
    nombre: 'Suprema a la napolitana',
    tipo: 'economico',
    descripcion: 'Suprema a la napolitana. Elegí guarnición.',
    guarniciones: GUARNICIONES,
    // La fila de la suprema se reutiliza y se renombra según la del día.
    // `pedido_items` guarda el nombre como copia propia, así que los pedidos
    // viejos siguen mostrando el plato con el que se vendieron.
    aliases: ['Suprema napolitana', 'Suprema a la suiza', 'Suprema suiza'],
    tiempo_preparacion: 20,
  },

  // ── Ejecutivo · $7.000 ──
  {
    nombre: 'Costeleta a la riojana',
    tipo: 'ejecutivo',
    descripcion: 'Costeleta a la riojana. Elegí guarnición.',
    guarniciones: GUARNICIONES,
    aliases: ['Costeleta de res a caballo'],
    tiempo_preparacion: 22,
  },
  {
    nombre: 'Milanesa de merluza',
    tipo: 'ejecutivo',
    descripcion: 'Milanesa de merluza. Elegí guarnición.',
    guarniciones: GUARNICIONES,
    aliases: ['Milanesa de pescado', 'Merluza'],
    tiempo_preparacion: 22,
  },
  {
    nombre: 'Matambre de cerdo a la pizza',
    tipo: 'ejecutivo',
    descripcion: 'Matambre de cerdo a la pizza. Elegí guarnición.',
    guarniciones: GUARNICIONES,
    aliases: ['Matambre a la pizza', 'Matambre de cerdo'],
    tiempo_preparacion: 22,
  },
];

/**
 * Los económicos suman postre por $1.000; los ejecutivos, postre más una lata.
 * Los nombres tienen que ser exactos: así los reconoce `extractExtrasFlags`
 * en routes/operacion.js y los tildes salen marcados en el panel.
 */
function extrasDe(tipo) {
  const nombre = tipo === 'ejecutivo' ? 'Bebida + Postre' : 'Postre';
  return JSON.stringify([{ nombre, precio: aCentavos(PRECIO_EXTRA) }]);
}

function variantesDe(guarniciones) {
  const opciones = (guarniciones || [])
    .map((g) => String(g || '').trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, precio_extra: 0 }));
  if (opciones.length === 0) return '[]';
  return JSON.stringify([{ nombre: 'Guarnición', opciones }]);
}

function preparar(base) {
  const upsertConfig = base.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  upsertConfig.run('menu_dia_precio_economico', String(aCentavos(PRECIO_ECONOMICO)));
  upsertConfig.run('menu_dia_precio_ejecutivo', String(aCentavos(PRECIO_EJECUTIVO)));
  upsertConfig.run('menu_dia_extra_postre_precio', String(aCentavos(PRECIO_EXTRA)));
  upsertConfig.run('menu_dia_extra_bebida_postre_precio', String(aCentavos(PRECIO_EXTRA)));

  let categoria = base
    .prepare('SELECT * FROM categorias WHERE lower(nombre) = lower(?) LIMIT 1')
    .get(CATEGORY_NAME);
  if (!categoria) {
    const res = base
      .prepare(
        `INSERT INTO categorias (nombre, icono, color, orden, activo, imagen, subcategorias)
         VALUES (?, '🍽️', '#16a34a', 0, 1, '', '[]')`
      )
      .run(CATEGORY_NAME);
    categoria = base.prepare('SELECT * FROM categorias WHERE id = ?').get(res.lastInsertRowid);
  }

  const buscar = base.prepare(
    'SELECT id, activo, menu_dia_disponible_hoy FROM productos WHERE lower(nombre) = lower(?) LIMIT 1'
  );
  /*
    Al actualizar NO se tocan `activo` ni `menu_dia_disponible_hoy`: si el plato
    ya se está vendiendo hoy (la suprema, por ejemplo), tiene que seguir
    vendiéndose. Sólo se le corrige el precio, la guarnición y el extra.
  */
  const actualizar = base.prepare(
    `UPDATE productos
        SET nombre = ?, descripcion = ?, precio = ?, variantes = ?, extras = ?,
            tiempo_preparacion = ?, stock_directo = ?, stock_mode = 'direct',
            categoria_id = ?, menu_dia_base = 1, menu_dia_tipo = ?
      WHERE id = ?`
  );
  const crear = base.prepare(
    `INSERT INTO productos (
       nombre, descripcion, precio, costo, categoria_id, imagen, variantes, extras,
       activo, destacado, tiempo_preparacion, stock_directo, stock_mode,
       menu_dia_base, menu_dia_disponible_hoy, menu_dia_tipo
     ) VALUES (?, ?, ?, 0, ?, '', ?, ?, 0, 0, ?, ?, 'direct', 1, 0, ?)`
  );

  const resultado = { creados: [], actualizados: [], yaEnVenta: [] };

  const correr = base.transaction(() => {
    PLATOS.forEach((plato) => {
      const precio = aCentavos(plato.tipo === 'ejecutivo' ? PRECIO_EJECUTIVO : PRECIO_ECONOMICO);
      const variantes = variantesDe(plato.guarniciones);
      const extras = extrasDe(plato.tipo);

      let fila = buscar.get(plato.nombre);
      if (!fila) {
        for (const alias of plato.aliases || []) {
          fila = buscar.get(alias);
          if (fila) break;
        }
      }

      if (fila) {
        actualizar.run(
          plato.nombre,
          plato.descripcion,
          precio,
          variantes,
          extras,
          plato.tiempo_preparacion,
          STOCK_MENU_DIA,
          categoria.id,
          plato.tipo,
          fila.id
        );
        resultado.actualizados.push(plato.nombre);
        if (Number(fila.menu_dia_disponible_hoy) === 1) resultado.yaEnVenta.push(plato.nombre);
      } else {
        crear.run(
          plato.nombre,
          plato.descripcion,
          precio,
          categoria.id,
          variantes,
          extras,
          plato.tiempo_preparacion,
          STOCK_MENU_DIA,
          plato.tipo
        );
        resultado.creados.push(plato.nombre);
      }
    });
  });
  correr();

  return resultado;
}

module.exports = { preparar, PLATOS, GUARNICIONES, SALSAS };

if (require.main === module) {
  const r = preparar(require('../db'));
  const linea = (t) => console.log(t);

  linea('\nMenú preparado. El menú de hoy no se tocó.\n');
  if (r.creados.length) {
    linea(`  Platos nuevos (${r.creados.length}), quedan inactivos hasta que los prendas:`);
    r.creados.forEach((n) => linea(`    + ${n}`));
  }
  if (r.actualizados.length) {
    linea(
      `\n  Platos que ya existían (${r.actualizados.length}), se les corrigió precio y guarnición:`
    );
    r.actualizados.forEach((n) => linea(`    · ${n}`));
  }
  if (r.yaEnVenta.length) {
    linea(`\n  Ojo: estos ya se están vendiendo hoy y siguen a la venta:`);
    r.yaEnVenta.forEach((n) => linea(`    ! ${n}`));
  }

  const eco = PLATOS.filter((p) => p.tipo === 'economico').length;
  const eje = PLATOS.filter((p) => p.tipo === 'ejecutivo').length;
  linea(
    `\n  ${eco} económicos a $${PRECIO_ECONOMICO.toLocaleString('es-AR')} (+ postre $${PRECIO_EXTRA.toLocaleString('es-AR')})`
  );
  linea(
    `  ${eje} ejecutivos a $${PRECIO_EJECUTIVO.toLocaleString('es-AR')} (+ postre y lata $${PRECIO_EXTRA.toLocaleString('es-AR')})`
  );
  linea(`  Stock cargado: ${STOCK_MENU_DIA} por plato\n`);
  linea('  Mañana: Operación → Menú del día, tildá los platos y guardá.\n');
}

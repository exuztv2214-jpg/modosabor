/**
 * Autolistas: contenido que se publica solo.
 *
 * ── Qué resuelven ──────────────────────────────────────────────────────────
 *
 * Un local no tiene community manager. Lo que pasa siempre es tres días
 * seguidos de entusiasmo y después dos meses de nada.
 *
 * Hay contenido que no caduca: que hacemos delivery hasta las 23, la pizza a
 * la piedra, cómo llegar, las fotos del salón. Se carga una vez y queda
 * girando.
 *
 * ── Por qué reusa la cola de campañas y no publica por su cuenta ───────────
 *
 * Una autolista **no publica**: arma una campaña y la encola, igual que si la
 * hubieras armado a mano.
 *
 * Es la decisión más importante de este módulo. Si publicara por su cuenta se
 * saltearía el cupo diario, el descanso por grupo, el dedupe, el freno de mano
 * y el registro. Tendríamos un segundo camino sin ninguna de las protecciones
 * que costaron construir — y encima automático, o sea el peor lugar donde no
 * tenerlas.
 */

const db = require('../../db');
const { FORMATOS } = require('./providers');

const parseArray = (valor, porOmision) => {
  try {
    const v = JSON.parse(valor);
    return Array.isArray(v) ? v : porOmision;
  } catch {
    return porOmision;
  }
};

const parseObject = (valor, porOmision = {}) => {
  try {
    const v = JSON.parse(valor);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : porOmision;
  } catch {
    return porOmision;
  }
};

const limpiarMediaIds = (ids) =>
  [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => id > 0))].slice(0, 10);

function limpiarFormatos(formatos = {}) {
  const limpios = {};
  for (const [cuenta, formato] of Object.entries(formatos || {})) {
    if (!/^(?:facebook|instagram|\d+\|(facebook|instagram))$/.test(cuenta)) continue;
    const limpio = String(formato || '').toLowerCase();
    if (!FORMATOS.includes(limpio)) throw new Error(`El formato «${formato}» no existe`);
    limpios[cuenta] = limpio;
  }
  return limpios;
}

const mapearPieza = (fila) => {
  if (!fila) return fila;
  const guardadas = limpiarMediaIds(parseArray(fila.media_ids, []));
  return {
    ...fila,
    mediaIds: guardadas.length ? guardadas : limpiarMediaIds([fila.media_id]),
    formato: FORMATOS.includes(String(fila.formato || '').toLowerCase())
      ? String(fila.formato).toLowerCase()
      : 'post',
    formatos: limpiarFormatos(parseObject(fila.formatos)),
  };
};

const mapear = (fila) =>
  fila && {
    ...fila,
    activa: Number(fila.activa) === 1,
    circular: Number(fila.circular) === 1,
    destinos: parseArray(fila.destinos, []),
    dias: parseArray(fila.dias, [1, 3, 5]),
    horas: parseArray(fila.horas, [11, 20]),
  };

function listar() {
  return db
    .prepare('SELECT * FROM social_autolistas ORDER BY id')
    .all()
    .map((fila) => ({
      ...mapear(fila),
      piezas: Number(
        db
          .prepare('SELECT COUNT(*) AS n FROM social_autolista_piezas WHERE autolista_id = ?')
          .get(fila.id).n
      ),
    }));
}

function obtener(id) {
  const lista = mapear(db.prepare('SELECT * FROM social_autolistas WHERE id = ?').get(Number(id)));
  if (!lista) return null;

  return {
    ...lista,
    piezas: db
      .prepare(
        `SELECT p.*, m.ruta AS media_ruta, m.nombre AS media_nombre
           FROM social_autolista_piezas p
           LEFT JOIN social_media m ON m.id = p.media_id
          WHERE p.autolista_id = ?
          ORDER BY p.orden, p.id`
      )
      .all(lista.id)
      .map(mapearPieza),
  };
}

/**
 * Los días y horas se acotan al crear, no al publicar.
 *
 * Un día 9 o una hora 47 guardados en la base son una bomba que explota
 * semanas después, cuando el reloj intente calcular la próxima salida y nadie
 * se acuerde de dónde salió ese número.
 */
const limpiarDias = (dias) =>
  [...new Set((Array.isArray(dias) ? dias : []).map(Number).filter((d) => d >= 0 && d <= 6))].sort(
    (a, b) => a - b
  );

const limpiarHoras = (horas) =>
  [
    ...new Set((Array.isArray(horas) ? horas : []).map(Number).filter((h) => h >= 0 && h <= 23)),
  ].sort((a, b) => a - b);

function crear({ nombre, cuentaId, destinos = [], dias, horas, circular = true }) {
  const titulo = String(nombre || '')
    .trim()
    .slice(0, 120);
  if (!titulo) throw new Error('La autolista necesita un nombre');

  const diasLimpios = limpiarDias(dias);
  const horasLimpias = limpiarHoras(horas);
  if (!diasLimpios.length) throw new Error('Elegí al menos un día de la semana');
  if (!horasLimpias.length) throw new Error('Elegí al menos una hora');

  const resultado = db
    .prepare(
      `INSERT INTO social_autolistas (nombre, cuenta_id, destinos, dias, horas, circular)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      titulo,
      Number(cuentaId) || null,
      JSON.stringify((destinos || []).map(Number).filter(Boolean)),
      JSON.stringify(diasLimpios),
      JSON.stringify(horasLimpias),
      circular ? 1 : 0
    );

  return obtener(Number(resultado.lastInsertRowid));
}

function actualizar(id, cambios = {}) {
  const actual = mapear(db.prepare('SELECT * FROM social_autolistas WHERE id = ?').get(Number(id)));
  if (!actual) throw new Error('No existe esa autolista');

  const dias = cambios.dias === undefined ? actual.dias : limpiarDias(cambios.dias);
  const horas = cambios.horas === undefined ? actual.horas : limpiarHoras(cambios.horas);
  if (!dias.length) throw new Error('Elegí al menos un día de la semana');
  if (!horas.length) throw new Error('Elegí al menos una hora');

  db.prepare(
    `UPDATE social_autolistas
        SET nombre = ?, activa = ?, cuenta_id = ?, destinos = ?, dias = ?, horas = ?,
            circular = ?, actualizado_en = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(
    cambios.nombre === undefined ? actual.nombre : String(cambios.nombre).trim().slice(0, 120),
    cambios.activa === undefined ? (actual.activa ? 1 : 0) : cambios.activa ? 1 : 0,
    cambios.cuentaId === undefined ? actual.cuenta_id : Number(cambios.cuentaId) || null,
    JSON.stringify(
      cambios.destinos === undefined
        ? actual.destinos
        : (cambios.destinos || []).map(Number).filter(Boolean)
    ),
    JSON.stringify(dias),
    JSON.stringify(horas),
    cambios.circular === undefined ? (actual.circular ? 1 : 0) : cambios.circular ? 1 : 0,
    actual.id
  );

  return obtener(actual.id);
}

function eliminar(id) {
  const existe = db.prepare('SELECT id FROM social_autolistas WHERE id = ?').get(Number(id));
  if (!existe) throw new Error('No existe esa autolista');
  db.prepare('DELETE FROM social_autolistas WHERE id = ?').run(Number(id));
  return { id: Number(id), eliminada: true };
}

/** Agrega una pieza al final de la fila. */
function agregarPieza(
  autolistaId,
  { texto, mediaId = null, mediaIds = [], formato = 'post', formatos = {} }
) {
  const lista = db
    .prepare('SELECT id FROM social_autolistas WHERE id = ?')
    .get(Number(autolistaId));
  if (!lista) throw new Error('No existe esa autolista');

  const contenido = String(texto || '')
    .trim()
    .slice(0, 8000);
  const adjuntos = limpiarMediaIds([...mediaIds, mediaId]);
  if (!contenido && !adjuntos.length) throw new Error('La pieza necesita texto o una imagen');
  const formatoLimpio = String(formato || 'post').toLowerCase();
  if (!FORMATOS.includes(formatoLimpio)) throw new Error(`El formato «${formato}» no existe`);
  const formatosLimpios = limpiarFormatos(formatos);

  const ultimo = Number(
    db
      .prepare(
        'SELECT COALESCE(MAX(orden), 0) AS ultimo FROM social_autolista_piezas WHERE autolista_id = ?'
      )
      .get(lista.id).ultimo
  );

  db.prepare(
    `INSERT INTO social_autolista_piezas
       (autolista_id, texto, media_id, media_ids, formato, formatos, orden)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    lista.id,
    contenido,
    adjuntos[0] || null,
    JSON.stringify(adjuntos),
    formatoLimpio,
    JSON.stringify(formatosLimpios),
    ultimo + 1
  );

  return obtener(lista.id);
}

function borrarPieza(piezaId) {
  const pieza = db
    .prepare('SELECT autolista_id FROM social_autolista_piezas WHERE id = ?')
    .get(Number(piezaId));
  if (!pieza) throw new Error('No existe esa pieza');
  db.prepare('DELETE FROM social_autolista_piezas WHERE id = ?').run(Number(piezaId));
  return obtener(pieza.autolista_id);
}

/* ────────────────────────────────────────────────────────────────────────────
   El reloj
   ──────────────────────────────────────────────────────────────────────────── */

/** La hora y el día de la semana **en Argentina**, no en el servidor. */
function momentoLocal(ahora = new Date()) {
  const local = new Date(ahora.getTime() - 3 * 3600 * 1000);
  return { dia: local.getUTCDay(), hora: local.getUTCHours() };
}

/**
 * ¿A esta autolista le toca publicar ahora?
 *
 * ── Por qué mira si ya salió en esta hora ──────────────────────────────────
 *
 * El reloj corre cada treinta segundos. Sin este control, una autolista
 * configurada para las 20:00 publicaría **ciento veinte veces** entre las
 * 20:00 y las 21:00. Es el bug más obvio de un sistema de horarios y el más
 * fácil de no ver hasta que pasa.
 */
function leToca(lista, ahora = new Date()) {
  if (!lista.activa) return false;

  const { dia, hora } = momentoLocal(ahora);
  if (!lista.dias.includes(dia)) return false;
  if (!lista.horas.includes(hora)) return false;

  if (lista.ultima_salida) {
    const ultima = new Date(String(lista.ultima_salida).replace(' ', 'T') + 'Z');
    const anterior = momentoLocal(ultima);
    const mismoDia = ultima.toDateString() === ahora.toDateString();
    if (mismoDia && anterior.hora === hora) return false;
  }

  return true;
}

/**
 * La pieza que sale ahora: la primera de la fila.
 *
 * En modo circular vuelve al final; si no, se marca igual y no vuelve a salir
 * porque `veces_publicada` la deja atrás en el orden.
 */
function proximaPieza(autolistaId) {
  return mapearPieza(
    db
      .prepare(
        `SELECT p.*, m.ruta AS media_ruta
         FROM social_autolista_piezas p
         LEFT JOIN social_media m ON m.id = p.media_id
        WHERE p.autolista_id = ?
          AND (
            (SELECT circular FROM social_autolistas WHERE id = p.autolista_id) = 1
            OR p.veces_publicada = 0
          )
        ORDER BY p.orden, p.id
        LIMIT 1`
      )
      .get(Number(autolistaId))
  );
}

/**
 * Marca la pieza como publicada y la manda al final de la fila.
 *
 * El orden nuevo es el máximo de la lista + 1. Así no hay que renumerar nada:
 * la fila se mantiene sola.
 */
function mandarAlFinal(pieza) {
  const ultimo = Number(
    db
      .prepare(
        'SELECT COALESCE(MAX(orden), 0) AS ultimo FROM social_autolista_piezas WHERE autolista_id = ?'
      )
      .get(pieza.autolista_id).ultimo
  );

  db.prepare(
    `UPDATE social_autolista_piezas
        SET orden = ?, veces_publicada = veces_publicada + 1, ultima_vez = CURRENT_TIMESTAMP
      WHERE id = ?`
  ).run(ultimo + 1, pieza.id);
}

module.exports = {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  agregarPieza,
  borrarPieza,
  leToca,
  proximaPieza,
  mandarAlFinal,
  momentoLocal,
};

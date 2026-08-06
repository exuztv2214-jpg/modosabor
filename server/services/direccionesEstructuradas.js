const db = require('../db');
const { isInsideMonteros, MONTEROS_BOUNDS } = require('../utils/deliveryZones');

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Valida que un punto confirmado caiga dentro de Monteros.
 *
 * Todo este módulo existe para que el rider no termine en otra ciudad: la
 * pantalla lo dice explícitamente. Pero las tres funciones de guardado sólo
 * chequeaban que las coordenadas *existieran*, no que fueran plausibles.
 *
 * Con eso alcanzaba para guardar como "confirmado":
 *  - un punto pegado de Maps de otra localidad,
 *  - o —el error más fácil de cometer— la latitud y la longitud invertidas,
 *    que en Tucumán da un punto en el medio del Atlántico.
 *
 * Una vez guardado, ese punto pisa la dirección humana y el rider lo sigue.
 * `isInsideMonteros` ya existía en utils/deliveryZones y no se usaba acá.
 */
function assertPuntoEnMonteros(latitud, longitud) {
  if (isInsideMonteros(latitud, longitud)) return;

  const invertido = isInsideMonteros(longitud, latitud);
  if (invertido) {
    throw new Error(
      'Las coordenadas parecen invertidas: pusiste la longitud en latitud. ' +
        `En Monteros la latitud va entre ${MONTEROS_BOUNDS.minLat} y ${MONTEROS_BOUNDS.maxLat}.`
    );
  }

  throw new Error(
    `El punto (${latitud}, ${longitud}) queda fuera de Monteros. ` +
      'Revisá las coordenadas antes de confirmarlo, porque el rider las va a seguir.'
  );
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseRow(row) {
  if (!row) return null;
  return {
    ...row,
    aliases: safeJsonArray(row.aliases),
    casas_validas: safeJsonArray(row.casas_validas),
    poligono: safeJsonArray(row.poligono),
  };
}

function getBarrioByInput(input = {}) {
  const barrioId = optionalNumber(input.barrio_id || input.direccion_barrio_id);
  if (barrioId) {
    return parseRow(
      db.prepare('SELECT * FROM direccion_barrios WHERE id = ? AND activo = 1').get(barrioId)
    );
  }

  const nombre = normalizeText(
    input.barrio_nombre || input.direccion_barrio_nombre || input.barrio
  );
  if (!nombre) return null;

  const barrios = db
    .prepare('SELECT * FROM direccion_barrios WHERE activo = 1 ORDER BY nombre ASC')
    .all();

  return (
    barrios.map(parseRow).find((barrio) => {
      if (normalizeText(barrio.nombre) === nombre) return true;
      return barrio.aliases.some((alias) => normalizeText(alias) === nombre);
    }) || null
  );
}

function getManzanaByInput(barrioId, input = {}) {
  if (!barrioId) return null;
  const manzanaId = optionalNumber(input.manzana_id || input.direccion_manzana_id);
  if (manzanaId) {
    return parseRow(
      db
        .prepare('SELECT * FROM direccion_manzanas WHERE id = ? AND barrio_id = ? AND activo = 1')
        .get(manzanaId, barrioId)
    );
  }

  const letra = String(input.manzana || input.direccion_manzana || '')
    .trim()
    .toUpperCase();
  if (!letra) return null;
  return parseRow(
    db
      .prepare(
        'SELECT * FROM direccion_manzanas WHERE barrio_id = ? AND upper(letra) = upper(?) AND activo = 1'
      )
      .get(barrioId, letra)
  );
}

function listBarrios({ includeInactive = false } = {}) {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM direccion_barrios
      ${includeInactive ? '' : 'WHERE activo = 1'}
      ORDER BY nombre ASC
    `
    )
    .all()
    .map(parseRow);

  const manzanas = db
    .prepare(
      `
      SELECT *
      FROM direccion_manzanas
      ${includeInactive ? '' : 'WHERE activo = 1'}
      ORDER BY barrio_id ASC, letra ASC
    `
    )
    .all()
    .map(parseRow);

  return rows.map((barrio) => ({
    ...barrio,
    manzanas: manzanas.filter((manzana) => Number(manzana.barrio_id) === Number(barrio.id)),
  }));
}

function listCasas({ barrio_id, manzana_id, manzana } = {}) {
  const barrio = getBarrioByInput({ barrio_id });
  if (!barrio) return [];
  const manzanaRow = getManzanaByInput(barrio.id, { manzana_id, manzana });
  if (!manzanaRow) return [];

  const confirmadas = db
    .prepare(
      `
      SELECT *
      FROM direccion_casas
      WHERE barrio_id = ? AND manzana_id = ? AND activo = 1
      ORDER BY CAST(casa AS INTEGER), casa
    `
    )
    .all(barrio.id, manzanaRow.id)
    .map(parseRow);

  const confirmadasByCasa = new Map(confirmadas.map((casa) => [String(casa.casa), casa]));
  return (manzanaRow.casas_validas || []).map((casa) => ({
    casa: String(casa),
    confirmado: confirmadasByCasa.has(String(casa)),
    ...(confirmadasByCasa.get(String(casa)) || {}),
  }));
}

function resolverDireccionEstructurada(input = {}) {
  const barrio = getBarrioByInput(input);
  if (!barrio) return null;

  const manzana = getManzanaByInput(barrio.id, input);
  const casaNumero = String(input.casa || input.direccion_casa || '').trim();

  let casa = null;
  if (manzana?.id && casaNumero) {
    casa = parseRow(
      db
        .prepare(
          `
          SELECT *
          FROM direccion_casas
          WHERE barrio_id = ? AND manzana_id = ? AND casa = ? AND activo = 1
          LIMIT 1
        `
        )
        .get(barrio.id, manzana.id, casaNumero)
    );
  }

  const casaLat = optionalNumber(casa?.latitud);
  const casaLng = optionalNumber(casa?.longitud);
  if (casaLat !== null && casaLng !== null) {
    return {
      barrio,
      manzana,
      casa: casaNumero,
      latitud: casaLat,
      longitud: casaLng,
      precision: 'casa_confirmada',
      origen: casa.origen || 'manual_confirmado',
      confianza: Math.max(0, Math.min(1, Number(casa.confianza || 1))),
    };
  }

  const manzanaLat = optionalNumber(manzana?.latitud);
  const manzanaLng = optionalNumber(manzana?.longitud);
  if (manzanaLat !== null && manzanaLng !== null) {
    return {
      barrio,
      manzana,
      casa: casaNumero,
      latitud: manzanaLat,
      longitud: manzanaLng,
      precision: 'manzana_centro',
      origen: 'manzana_confirmada',
      confianza: 0.55,
    };
  }

  const barrioLat = optionalNumber(barrio.centro_lat);
  const barrioLng = optionalNumber(barrio.centro_lng);
  if (barrioLat !== null && barrioLng !== null) {
    return {
      barrio,
      manzana,
      casa: casaNumero,
      latitud: barrioLat,
      longitud: barrioLng,
      precision: 'barrio_centro',
      origen: 'barrio_confirmado',
      confianza: 0.35,
    };
  }

  return {
    barrio,
    manzana,
    casa: casaNumero,
    latitud: null,
    longitud: null,
    precision: 'sin_coordenada_confirmada',
    origen: 'estructura_sin_gps',
    confianza: 0,
  };
}

function guardarCasaManual(input = {}) {
  const barrio = getBarrioByInput(input);
  if (!barrio) throw new Error('Barrio no encontrado');
  const manzana = getManzanaByInput(barrio.id, input);
  if (!manzana) throw new Error('Manzana no encontrada');

  const casa = String(input.casa || input.direccion_casa || '').trim();
  const latitud = optionalNumber(input.latitud);
  const longitud = optionalNumber(input.longitud);
  if (!casa) throw new Error('Casa requerida');
  if (latitud === null || longitud === null) throw new Error('Coordenadas requeridas');
  assertPuntoEnMonteros(latitud, longitud);

  db.prepare(
    `
    INSERT INTO direccion_casas
      (barrio_id, manzana_id, casa, latitud, longitud, origen, confianza, precision_m, notas, actualizado_en)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(barrio_id, manzana_id, casa) DO UPDATE SET
      latitud = excluded.latitud,
      longitud = excluded.longitud,
      origen = excluded.origen,
      confianza = excluded.confianza,
      precision_m = excluded.precision_m,
      notas = excluded.notas,
      activo = 1,
      actualizado_en = CURRENT_TIMESTAMP
  `
  ).run(
    barrio.id,
    manzana.id,
    casa,
    latitud,
    longitud,
    String(input.origen || 'manual_confirmado'),
    Math.max(0, Math.min(1, Number(input.confianza || 1))),
    optionalNumber(input.precision_m),
    String(input.notas || '')
  );

  return resolverDireccionEstructurada({ barrio_id: barrio.id, manzana_id: manzana.id, casa });
}

function guardarCentroBarrio(input = {}) {
  const barrio = getBarrioByInput(input);
  if (!barrio) throw new Error('Barrio no encontrado');

  const latitud = optionalNumber(input.latitud);
  const longitud = optionalNumber(input.longitud);
  if (latitud === null || longitud === null) throw new Error('Coordenadas requeridas');
  assertPuntoEnMonteros(latitud, longitud);

  db.prepare(
    `
    UPDATE direccion_barrios
    SET centro_lat = ?, centro_lng = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  ).run(latitud, longitud, String(input.notas || barrio.notas || ''), barrio.id);

  return getBarrioByInput({ barrio_id: barrio.id });
}

function guardarCentroManzana(input = {}) {
  const barrio = getBarrioByInput(input);
  if (!barrio) throw new Error('Barrio no encontrado');
  const manzana = getManzanaByInput(barrio.id, input);
  if (!manzana) throw new Error('Manzana no encontrada');

  const latitud = optionalNumber(input.latitud);
  const longitud = optionalNumber(input.longitud);
  if (latitud === null || longitud === null) throw new Error('Coordenadas requeridas');
  assertPuntoEnMonteros(latitud, longitud);

  db.prepare(
    `
    UPDATE direccion_manzanas
    SET latitud = ?, longitud = ?, notas = ?, actualizado_en = CURRENT_TIMESTAMP
    WHERE id = ? AND barrio_id = ?
  `
  ).run(latitud, longitud, String(input.notas || manzana.notas || ''), manzana.id, barrio.id);

  return resolverDireccionEstructurada({ barrio_id: barrio.id, manzana_id: manzana.id });
}
module.exports = {
  listBarrios,
  listCasas,
  resolverDireccionEstructurada,
  guardarCasaManual,
  guardarCentroBarrio,
  guardarCentroManzana,
};

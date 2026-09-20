function toDireccionRow(row) {
  if (!row) return null;
  return {
    ...row,
    principal: Number(row.principal || 0) === 1,
    activa: Number(row.activa || 0) === 1,
    latitud: row.latitud === null || row.latitud === undefined ? null : Number(row.latitud),
    longitud: row.longitud === null || row.longitud === undefined ? null : Number(row.longitud),
  };
}

function cleanText(value) {
  return String(value || '').trim();
}

function cleanNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAddressInput(payload = {}, fallback = {}) {
  return {
    id:
      payload.id !== null && payload.id !== undefined ? Number(payload.id) : (fallback.id ?? null),
    etiqueta: cleanText(payload.etiqueta ?? fallback.etiqueta),
    direccion: cleanText(payload.direccion ?? fallback.direccion),
    referencia: cleanText(payload.referencia ?? fallback.referencia),
    departamento: cleanText(payload.departamento ?? fallback.departamento),
    latitud: cleanNumber(payload.latitud ?? fallback.latitud),
    longitud: cleanNumber(payload.longitud ?? fallback.longitud),
    principal:
      payload.principal === null || payload.principal === undefined
        ? Boolean(fallback.principal)
        : Boolean(payload.principal),
    activa:
      payload.activa === null || payload.activa === undefined
        ? fallback.activa === null || fallback.activa === undefined
          ? true
          : Boolean(fallback.activa)
        : Boolean(payload.activa),
  };
}

function getClienteDirecciones(db, clienteId) {
  return db
    .prepare(
      `
        SELECT *
        FROM cliente_direcciones
        WHERE cliente_id = ? AND activa = 1
        ORDER BY principal DESC, updated_at DESC, id DESC
      `
    )
    .all(clienteId)
    .map(toDireccionRow);
}

function syncClienteDireccionPrincipal(db, clienteId) {
  if (!clienteId) return null;

  let principal = db
    .prepare(
      `
        SELECT *
        FROM cliente_direcciones
        WHERE cliente_id = ? AND activa = 1 AND principal = 1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    )
    .get(clienteId);

  if (!principal) {
    const fallback = db
      .prepare(
        `
          SELECT *
          FROM cliente_direcciones
          WHERE cliente_id = ? AND activa = 1
          ORDER BY updated_at DESC, id DESC
          LIMIT 1
        `
      )
      .get(clienteId);

    if (fallback) {
      db.prepare('UPDATE cliente_direcciones SET principal = 0 WHERE cliente_id = ?').run(
        clienteId
      );
      db.prepare(
        'UPDATE cliente_direcciones SET principal = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cliente_id = ?'
      ).run(fallback.id, clienteId);
      principal = db.prepare('SELECT * FROM cliente_direcciones WHERE id = ?').get(fallback.id);
    }
  }

  db.prepare('UPDATE clientes SET direccion = ? WHERE id = ?').run(
    cleanText(principal?.direccion),
    clienteId
  );
  return toDireccionRow(principal);
}

function replaceClienteDirecciones(db, clienteId, direcciones = []) {
  const existing = db
    .prepare('SELECT id FROM cliente_direcciones WHERE cliente_id = ?')
    .all(clienteId);
  const existingIds = new Set(existing.map((item) => Number(item.id)));
  const normalized = (Array.isArray(direcciones) ? direcciones : [])
    .map((direccion, index) =>
      normalizeAddressInput(direccion, {
        etiqueta: index === 0 ? 'Principal' : `Direccion ${index + 1}`,
        principal: index === 0,
      })
    )
    .filter((direccion) => direccion.direccion);

  return db.transaction(() => {
    if (normalized.length === 0) {
      db.prepare('DELETE FROM cliente_direcciones WHERE cliente_id = ?').run(clienteId);
      db.prepare('UPDATE clientes SET direccion = ? WHERE id = ?').run('', clienteId);
      return [];
    }

    const keptIds = [];

    normalized.forEach((direccion, index) => {
      const etiqueta = direccion.etiqueta || (index === 0 ? 'Principal' : `Direccion ${index + 1}`);
      const values = [
        etiqueta,
        direccion.direccion,
        direccion.referencia,
        direccion.departamento,
        direccion.latitud,
        direccion.longitud,
        direccion.activa ? 1 : 0,
      ];

      if (direccion.id && existingIds.has(Number(direccion.id))) {
        db.prepare(
          `
            UPDATE cliente_direcciones
            SET etiqueta = ?, direccion = ?, referencia = ?, departamento = ?,
                latitud = ?, longitud = ?, activa = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND cliente_id = ?
          `
        ).run(...values, Number(direccion.id), clienteId);
        keptIds.push(Number(direccion.id));
        return;
      }

      const created = db
        .prepare(
          `
          INSERT INTO cliente_direcciones (
            cliente_id, etiqueta, direccion, referencia, departamento,
            latitud, longitud, principal, activa
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
        `
        )
        .run(clienteId, ...values);
      keptIds.push(Number(created.lastInsertRowid));
    });

    const removedIds = existing
      .map((item) => Number(item.id))
      .filter((id) => !keptIds.includes(id));

    if (removedIds.length) {
      const placeholders = removedIds.map(() => '?').join(', ');
      db.prepare(
        `DELETE FROM cliente_direcciones WHERE cliente_id = ? AND id IN (${placeholders})`
      ).run(clienteId, ...removedIds);
    }

    const requestedPrincipal = normalized.find((direccion) => direccion.principal);
    const principalId =
      requestedPrincipal?.id && keptIds.includes(Number(requestedPrincipal.id))
        ? Number(requestedPrincipal.id)
        : keptIds[0];

    db.prepare('UPDATE cliente_direcciones SET principal = 0 WHERE cliente_id = ?').run(clienteId);
    db.prepare(
      'UPDATE cliente_direcciones SET principal = 1, updated_at = CURRENT_TIMESTAMP WHERE cliente_id = ? AND id = ?'
    ).run(clienteId, principalId);

    const principal = syncClienteDireccionPrincipal(db, clienteId);

    const direccionesActualizadas = getClienteDirecciones(db, clienteId);
    if (!principal && direccionesActualizadas.length) {
      syncClienteDireccionPrincipal(db, clienteId);
    }
    return direccionesActualizadas;
  })();
}

function createClienteDireccion(db, clienteId, payload = {}) {
  const current = getClienteDirecciones(db, clienteId);
  const normalized = normalizeAddressInput(payload, {
    etiqueta: current.length === 0 ? 'Principal' : `Direccion ${current.length + 1}`,
    principal: current.length === 0,
  });

  if (!normalized.direccion) {
    throw new Error('La direccion es obligatoria');
  }

  const created = db
    .prepare(
      `
      INSERT INTO cliente_direcciones (
        cliente_id, etiqueta, direccion, referencia, departamento,
        latitud, longitud, principal, activa
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      clienteId,
      normalized.etiqueta ||
        (current.length === 0 ? 'Principal' : `Direccion ${current.length + 1}`),
      normalized.direccion,
      normalized.referencia,
      normalized.departamento,
      normalized.latitud,
      normalized.longitud,
      current.length === 0 || normalized.principal ? 1 : 0,
      normalized.activa ? 1 : 0
    );

  if (current.length === 0 || normalized.principal) {
    db.prepare('UPDATE cliente_direcciones SET principal = 0 WHERE cliente_id = ? AND id != ?').run(
      clienteId,
      created.lastInsertRowid
    );
  }

  syncClienteDireccionPrincipal(db, clienteId);
  return db.prepare('SELECT * FROM cliente_direcciones WHERE id = ?').get(created.lastInsertRowid);
}

function updateClienteDireccion(db, clienteId, direccionId, payload = {}) {
  const existing = db
    .prepare('SELECT * FROM cliente_direcciones WHERE id = ? AND cliente_id = ?')
    .get(direccionId, clienteId);
  if (!existing) return null;

  const normalized = normalizeAddressInput(payload, existing);
  if (!normalized.direccion) {
    throw new Error('La direccion es obligatoria');
  }

  db.prepare(
    `
      UPDATE cliente_direcciones
      SET etiqueta = ?, direccion = ?, referencia = ?, departamento = ?,
          latitud = ?, longitud = ?, activa = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND cliente_id = ?
    `
  ).run(
    normalized.etiqueta || existing.etiqueta || 'Direccion',
    normalized.direccion,
    normalized.referencia,
    normalized.departamento,
    normalized.latitud,
    normalized.longitud,
    normalized.activa ? 1 : 0,
    direccionId,
    clienteId
  );

  if (normalized.principal) {
    db.prepare('UPDATE cliente_direcciones SET principal = 0 WHERE cliente_id = ?').run(clienteId);
    db.prepare(
      'UPDATE cliente_direcciones SET principal = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cliente_id = ?'
    ).run(direccionId, clienteId);
  }

  syncClienteDireccionPrincipal(db, clienteId);
  return toDireccionRow(
    db
      .prepare('SELECT * FROM cliente_direcciones WHERE id = ? AND cliente_id = ?')
      .get(direccionId, clienteId)
  );
}

function deleteClienteDireccion(db, clienteId, direccionId) {
  const existing = db
    .prepare('SELECT * FROM cliente_direcciones WHERE id = ? AND cliente_id = ?')
    .get(direccionId, clienteId);
  if (!existing) return false;

  db.prepare('DELETE FROM cliente_direcciones WHERE id = ? AND cliente_id = ?').run(
    direccionId,
    clienteId
  );
  syncClienteDireccionPrincipal(db, clienteId);
  return true;
}

function ensureClienteDireccion(db, clienteId, payload = {}, options = {}) {
  if (!clienteId) return null;

  const normalized = normalizeAddressInput(payload, {
    etiqueta: 'Principal',
    principal: Boolean(options.makePrimaryIfEmpty),
  });
  if (!normalized.direccion) return null;

  const current = getClienteDirecciones(db, clienteId);
  const match = current.find(
    (direccion) =>
      cleanText(direccion.direccion).toLowerCase() === normalized.direccion.toLowerCase()
  );

  if (match) {
    if (options.makePrimaryIfEmpty && !current.some((direccion) => direccion.principal)) {
      db.prepare('UPDATE cliente_direcciones SET principal = 0 WHERE cliente_id = ?').run(
        clienteId
      );
      db.prepare(
        'UPDATE cliente_direcciones SET principal = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cliente_id = ?'
      ).run(match.id, clienteId);
      syncClienteDireccionPrincipal(db, clienteId);
      return toDireccionRow(
        db.prepare('SELECT * FROM cliente_direcciones WHERE id = ?').get(match.id)
      );
    }

    if (!cleanText(match.referencia) && normalized.referencia) {
      db.prepare(
        'UPDATE cliente_direcciones SET referencia = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cliente_id = ?'
      ).run(normalized.referencia, match.id, clienteId);
    }
    if (!cleanText(match.departamento) && normalized.departamento) {
      db.prepare(
        'UPDATE cliente_direcciones SET departamento = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND cliente_id = ?'
      ).run(normalized.departamento, match.id, clienteId);
    }

    syncClienteDireccionPrincipal(db, clienteId);
    return toDireccionRow(
      db.prepare('SELECT * FROM cliente_direcciones WHERE id = ?').get(match.id)
    );
  }

  return toDireccionRow(
    createClienteDireccion(db, clienteId, {
      ...normalized,
      principal:
        current.length === 0 ||
        normalized.principal ||
        Boolean(options.makePrimaryIfEmpty && !current.length),
      etiqueta:
        normalized.etiqueta ||
        (current.length === 0 ? 'Principal' : `Direccion ${current.length + 1}`),
    })
  );
}

module.exports = {
  createClienteDireccion,
  deleteClienteDireccion,
  ensureClienteDireccion,
  getClienteDirecciones,
  replaceClienteDirecciones,
  syncClienteDireccionPrincipal,
  updateClienteDireccion,
};

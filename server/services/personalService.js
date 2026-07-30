const db = require('../db');

// ============================================
// NORMALIZACIÓN
// ============================================

function normalizePersonal(row) {
  if (!row) return row;

  let tags = [];
  try {
    const parsed = JSON.parse(row.tags || '[]');
    tags = Array.isArray(parsed) ? parsed : [];
  } catch {
    tags = [];
  }

  // Calcular antigüedad
  let antiguedad_anios = 0;
  let antiguedad_texto = '';
  if (row.fecha_ingreso) {
    const ingreso = new Date(row.fecha_ingreso);
    const hoy = new Date();
    const diffTime = Math.abs(hoy - ingreso);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    antiguedad_anios = Math.floor(diffDays / 365);
    const meses = Math.floor((diffDays % 365) / 30);

    if (antiguedad_anios > 0) {
      antiguedad_texto = `${antiguedad_anios}a ${meses}m`;
    } else if (meses > 0) {
      antiguedad_texto = `${meses}m`;
    } else {
      antiguedad_texto = `${diffDays}d`;
    }
  }

  // Calcular próximo cumpleaños
  let proximo_cumpleanos = null;
  let dias_para_cumpleanos = null;
  if (row.fecha_nacimiento) {
    const hoy = new Date();
    const nacimiento = new Date(row.fecha_nacimiento);
    const esteAnio = hoy.getFullYear();
    let proximo = new Date(esteAnio, nacimiento.getMonth(), nacimiento.getDate());

    if (proximo < hoy) {
      proximo = new Date(esteAnio + 1, nacimiento.getMonth(), nacimiento.getDate());
    }

    const diffTime = proximo - hoy;
    dias_para_cumpleanos = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    proximo_cumpleanos = proximo.toISOString().split('T')[0];
  }

  return {
    ...row,
    tags,
    monto_base: Number(row.monto_base || 0),
    puntos_reconocimiento: Number(row.puntos_reconocimiento || 0),
    total_liquidaciones: Number(row.total_liquidaciones || 0),
    total_adelantos: Number(row.total_adelantos || 0),
    antiguedad_anios,
    antiguedad_texto,
    dias_para_cumpleanos,
    proximo_cumpleanos,
    es_cumpleanos_hoy: dias_para_cumpleanos === 0,
  };
}

// ============================================
// CRUD BÁSICO
// ============================================

function getPersonalList(search = '', filtros = {}) {
  let q = `
    SELECT 
      p.*,
      pc.nombre as categoria_nombre,
      pc.color as categoria_color,
      pc.icono as categoria_icono
    FROM personal p
    LEFT JOIN personal_categorias pc ON p.categoria_id = pc.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    q += ` AND (p.nombre LIKE ? OR p.telefono LIKE ? OR p.email LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (filtros.rol_operativo) {
    q += ` AND p.rol_operativo = ?`;
    params.push(filtros.rol_operativo);
  }

  if (filtros.categoria_id) {
    q += ` AND p.categoria_id = ?`;
    params.push(filtros.categoria_id);
  }

  if (filtros.turno_preferido) {
    q += ` AND p.turno_preferido = ?`;
    params.push(filtros.turno_preferido);
  }

  if (filtros.activo !== undefined) {
    q += ` AND p.activo = ?`;
    params.push(filtros.activo ? 1 : 0);
  }

  // Filtro por cumpleaños del mes
  if (filtros.cumpleanos_mes) {
    const mes = String(new Date().getMonth() + 1).padStart(2, '0');
    q += ` AND p.fecha_nacimiento LIKE ?`;
    params.push(`%-${mes}-%`);
  }

  q += ` ORDER BY p.activo DESC, p.nombre ASC`;

  const rows = db.prepare(q).all(...params);
  return rows.map(normalizePersonal);
}

function getPersonalById(id) {
  const row = db
    .prepare(
      `
    SELECT 
      p.*,
      pc.nombre as categoria_nombre,
      pc.color as categoria_color,
      pc.icono as categoria_icono
    FROM personal p
    LEFT JOIN personal_categorias pc ON p.categoria_id = pc.id
    WHERE p.id = ?
  `
    )
    .get(id);

  if (!row) return null;
  return normalizePersonal(row);
}

function createPersonal(data) {
  const stmt = db.prepare(`
    INSERT INTO personal (
      nombre, rol_operativo, telefono, email, turno_preferido,
      frecuencia_pago, monto_base, medio_pago_preferido,
      fecha_nacimiento, fecha_ingreso, direccion, notas,
      categoria_id, usuario_id, avatar_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.nombre,
    data.rol_operativo || 'cocina',
    data.telefono || '',
    data.email || '',
    data.turno_preferido || '',
    data.frecuencia_pago || 'mensual',
    data.monto_base || 0,
    data.medio_pago_preferido || 'efectivo',
    data.fecha_nacimiento || '',
    data.fecha_ingreso || new Date().toISOString().split('T')[0],
    data.direccion || '',
    data.notas || '',
    data.categoria_id || 1,
    data.usuario_id || null,
    data.avatar_url || ''
  );

  return getPersonalById(result.lastInsertRowid);
}

function updatePersonal(id, data) {
  const existing = getPersonalById(id);
  if (!existing) return null;

  const stmt = db.prepare(`
    UPDATE personal SET
      nombre = ?,
      rol_operativo = ?,
      telefono = ?,
      email = ?,
      turno_preferido = ?,
      frecuencia_pago = ?,
      monto_base = ?,
      medio_pago_preferido = ?,
      fecha_nacimiento = ?,
      fecha_ingreso = ?,
      direccion = ?,
      notas = ?,
      tags = ?,
      categoria_id = ?,
      usuario_id = ?,
      avatar_url = ?,
      activo = ?
    WHERE id = ?
  `);

  stmt.run(
    data.nombre ?? existing.nombre,
    data.rol_operativo ?? existing.rol_operativo,
    data.telefono ?? existing.telefono,
    data.email ?? existing.email,
    data.turno_preferido ?? existing.turno_preferido,
    data.frecuencia_pago ?? existing.frecuencia_pago,
    data.monto_base ?? existing.monto_base,
    data.medio_pago_preferido ?? existing.medio_pago_preferido,
    data.fecha_nacimiento ?? existing.fecha_nacimiento,
    data.fecha_ingreso ?? existing.fecha_ingreso,
    data.direccion ?? existing.direccion,
    data.notas ?? existing.notas,
    JSON.stringify(data.tags || existing.tags),
    data.categoria_id ?? existing.categoria_id,
    data.usuario_id ?? existing.usuario_id,
    data.avatar_url ?? existing.avatar_url,
    data.activo !== undefined ? data.activo : existing.activo,
    id
  );

  return getPersonalById(id);
}

// ============================================
// DIRECCIONES
// ============================================

function getDirecciones(personalId) {
  return db
    .prepare(
      `
    SELECT * FROM personal_direcciones 
    WHERE personal_id = ? 
    ORDER BY principal DESC, creado_en DESC
  `
    )
    .all(personalId);
}

function createDireccion(personalId, data) {
  // Si es principal, desmarcar las otras
  if (data.principal) {
    db.prepare('UPDATE personal_direcciones SET principal = 0 WHERE personal_id = ?').run(
      personalId
    );
  }

  const stmt = db.prepare(`
    INSERT INTO personal_direcciones 
    (personal_id, etiqueta, direccion, referencia, latitud, longitud, principal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    personalId,
    data.etiqueta || 'Principal',
    data.direccion,
    data.referencia || '',
    data.latitud || null,
    data.longitud || null,
    data.principal ? 1 : 0
  );

  return db.prepare('SELECT * FROM personal_direcciones WHERE id = ?').get(result.lastInsertRowid);
}

function updateDireccion(personalId, direccionId, data) {
  const existing = db
    .prepare('SELECT * FROM personal_direcciones WHERE id = ? AND personal_id = ?')
    .get(direccionId, personalId);
  if (!existing) return null;

  // Si se marca como principal, desmarcar las otras
  if (data.principal && !existing.principal) {
    db.prepare('UPDATE personal_direcciones SET principal = 0 WHERE personal_id = ?').run(
      personalId
    );
  }

  const stmt = db.prepare(`
    UPDATE personal_direcciones SET
      etiqueta = ?,
      direccion = ?,
      referencia = ?,
      latitud = ?,
      longitud = ?,
      principal = ?
    WHERE id = ?
  `);

  stmt.run(
    data.etiqueta ?? existing.etiqueta,
    data.direccion ?? existing.direccion,
    data.referencia ?? existing.referencia,
    data.latitud ?? existing.latitud,
    data.longitud ?? existing.longitud,
    data.principal !== undefined ? (data.principal ? 1 : 0) : existing.principal,
    direccionId
  );

  return db.prepare('SELECT * FROM personal_direcciones WHERE id = ?').get(direccionId);
}

function deleteDireccion(personalId, direccionId) {
  const result = db
    .prepare('DELETE FROM personal_direcciones WHERE id = ? AND personal_id = ?')
    .run(direccionId, personalId);
  return result.changes > 0;
}

// ============================================
// CATEGORÍAS
// ============================================

function getCategorias() {
  return db.prepare('SELECT * FROM personal_categorias ORDER BY orden ASC').all();
}

function getCategoriaById(id) {
  return db.prepare('SELECT * FROM personal_categorias WHERE id = ?').get(id);
}

function createCategoria(data) {
  const stmt = db.prepare(`
    INSERT INTO personal_categorias 
    (nombre, orden, color, icono, sueldo_base_minimo, beneficio_vacaciones_dias, beneficio_dias_libres_mes, descripcion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    data.nombre,
    data.orden,
    data.color || '#6B7280',
    data.icono || '👤',
    data.sueldo_base_minimo || 0,
    data.beneficio_vacaciones_dias || 14,
    data.beneficio_dias_libres_mes || 4,
    data.descripcion || ''
  );

  return getCategoriaById(result.lastInsertRowid);
}

function updateCategoria(id, data) {
  const existing = getCategoriaById(id);
  if (!existing) return null;

  const stmt = db.prepare(`
    UPDATE personal_categorias SET
      nombre = ?,
      orden = ?,
      color = ?,
      icono = ?,
      sueldo_base_minimo = ?,
      beneficio_vacaciones_dias = ?,
      beneficio_dias_libres_mes = ?,
      descripcion = ?
    WHERE id = ?
  `);

  stmt.run(
    data.nombre ?? existing.nombre,
    data.orden ?? existing.orden,
    data.color ?? existing.color,
    data.icono ?? existing.icono,
    data.sueldo_base_minimo ?? existing.sueldo_base_minimo,
    data.beneficio_vacaciones_dias ?? existing.beneficio_vacaciones_dias,
    data.beneficio_dias_libres_mes ?? existing.beneficio_dias_libres_mes,
    data.descripcion ?? existing.descripcion,
    id
  );

  return getCategoriaById(id);
}

// ============================================
// CARRERA / ASCENSOS
// ============================================

function getCarreraHistorial(personalId) {
  return db
    .prepare(
      `
    SELECT 
      h.*,
      ca.nombre as categoria_anterior_nombre,
      cn.nombre as categoria_nueva_nombre,
      u.nombre as registrado_por_nombre
    FROM personal_carrera_historial h
    LEFT JOIN personal_categorias ca ON h.categoria_anterior_id = ca.id
    LEFT JOIN personal_categorias cn ON h.categoria_nueva_id = cn.id
    LEFT JOIN usuarios u ON h.registrado_por = u.id
    WHERE h.personal_id = ?
    ORDER BY h.fecha_cambio DESC
  `
    )
    .all(personalId);
}

function registrarAscenso(personalId, data, registradoPor) {
  const personal = getPersonalById(personalId);
  if (!personal) throw new Error('Personal no encontrado');

  db.exec('BEGIN');
  try {
    // Registrar en historial
    const stmt = db.prepare(`
      INSERT INTO personal_carrera_historial 
      (personal_id, categoria_anterior_id, categoria_nueva_id, sueldo_anterior, sueldo_nuevo, motivo, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      personalId,
      personal.categoria_id,
      data.categoria_id,
      personal.monto_base,
      data.sueldo_nuevo,
      data.motivo || '',
      registradoPor
    );

    // Actualizar personal
    db.prepare('UPDATE personal SET categoria_id = ?, monto_base = ? WHERE id = ?').run(
      data.categoria_id,
      data.sueldo_nuevo,
      personalId
    );

    db.exec('COMMIT');

    return {
      success: true,
      categoria_anterior: personal.categoria_nombre,
      categoria_nueva: getCategoriaById(data.categoria_id)?.nombre,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ============================================
// RECONOCIMIENTOS / PUNTOS
// ============================================

function getReconocimientosConfig() {
  return (
    db.prepare('SELECT * FROM personal_reconocimientos_config WHERE id = 1').get() || {
      puntos_por_puntualidad: 5,
      puntos_por_venta_destacada: 10,
      puntos_por_feedback_positivo: 15,
      umbral_canje_puntos: 50,
      recompensa_canje_pesos: 5000,
      activo: 1,
    }
  );
}

function updateReconocimientosConfig(data) {
  const stmt = db.prepare(`
    UPDATE personal_reconocimientos_config SET
      puntos_por_puntualidad = ?,
      puntos_por_venta_destacada = ?,
      puntos_por_feedback_positivo = ?,
      umbral_canje_puntos = ?,
      recompensa_canje_pesos = ?,
      activo = ?
    WHERE id = 1
  `);

  stmt.run(
    data.puntos_por_puntualidad ?? 5,
    data.puntos_por_venta_destacada ?? 10,
    data.puntos_por_feedback_positivo ?? 15,
    data.umbral_canje_puntos ?? 50,
    data.recompensa_canje_pesos ?? 5000,
    data.activo !== undefined ? data.activo : 1
  );

  return getReconocimientosConfig();
}

function getReconocimientos(personalId, limit = 50) {
  return db
    .prepare(
      `
    SELECT 
      r.*,
      u.nombre as registrado_por_nombre
    FROM personal_reconocimientos r
    LEFT JOIN usuarios u ON r.registrado_por = u.id
    WHERE r.personal_id = ?
    ORDER BY r.fecha DESC
    LIMIT ?
  `
    )
    .all(personalId, limit);
}

function agregarReconocimiento(personalId, data, registradoPor) {
  const config = getReconocimientosConfig();
  if (!config.activo) throw new Error('Sistema de reconocimientos inactivo');

  db.exec('BEGIN');
  try {
    // Insertar reconocimiento
    const stmt = db.prepare(`
      INSERT INTO personal_reconocimientos 
      (personal_id, tipo, puntos, descripcion, relacionado_pedido_id, registrado_por)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      personalId,
      data.tipo,
      data.puntos,
      data.descripcion || '',
      data.relacionado_pedido_id || null,
      registradoPor
    );

    // Actualizar puntos del personal
    db.prepare(
      'UPDATE personal SET puntos_reconocimiento = puntos_reconocimiento + ? WHERE id = ?'
    ).run(data.puntos, personalId);

    db.exec('COMMIT');

    return {
      reconocimiento_id: result.lastInsertRowid,
      puntos_agregados: data.puntos,
      total_puntos: db
        .prepare('SELECT puntos_reconocimiento FROM personal WHERE id = ?')
        .get(personalId).puntos_reconocimiento,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function canjearReconocimientos(personalId, registradoPor) {
  const config = getReconocimientosConfig();
  if (!config.activo) throw new Error('Sistema de reconocimientos inactivo');

  const personal = getPersonalById(personalId);
  if (!personal) throw new Error('Personal no encontrado');

  if (personal.puntos_reconocimiento < config.umbral_canje_puntos) {
    throw new Error(
      `Se necesitan ${config.umbral_canje_puntos} puntos para canjear. Tienes ${personal.puntos_reconocimiento}`
    );
  }

  db.exec('BEGIN');
  try {
    // Registrar canje como movimiento de correccion para mantener compatibilidad con la tabla existente
    const stmt = db.prepare(`
      INSERT INTO personal_reconocimientos 
      (personal_id, tipo, puntos, descripcion, registrado_por)
      VALUES (?, 'correccion', ?, ?, ?)
    `);

    stmt.run(
      personalId,
      config.umbral_canje_puntos,
      `Canje de puntos por $${config.recompensa_canje_pesos}`,
      registradoPor
    );

    // Restar puntos
    db.prepare(
      'UPDATE personal SET puntos_reconocimiento = puntos_reconocimiento - ? WHERE id = ?'
    ).run(config.umbral_canje_puntos, personalId);

    db.exec('COMMIT');

    return {
      puntos_canjeados: config.umbral_canje_puntos,
      recompensa: config.recompensa_canje_pesos,
      puntos_restantes: personal.puntos_reconocimiento - config.umbral_canje_puntos,
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// ============================================
// ESTADÍSTICAS Y DASHBOARD
// ============================================

function getEstadisticas() {
  const total = db.prepare('SELECT COUNT(*) as count FROM personal').get();
  const activos = db.prepare('SELECT COUNT(*) as count FROM personal WHERE activo = 1').get();
  const porRol = db
    .prepare(
      `
    SELECT rol_operativo, COUNT(*) as count 
    FROM personal 
    WHERE activo = 1 
    GROUP BY rol_operativo
  `
    )
    .all();

  const porCategoria = db
    .prepare(
      `
    SELECT pc.nombre, pc.color, pc.icono, COUNT(*) as count
    FROM personal p
    JOIN personal_categorias pc ON p.categoria_id = pc.id
    WHERE p.activo = 1
    GROUP BY p.categoria_id
    ORDER BY pc.orden
  `
    )
    .all();

  // Cumpleaños del mes
  const mesActual = String(new Date().getMonth() + 1).padStart(2, '0');
  const cumpleanerosMes = db
    .prepare(
      `
    SELECT id, nombre, fecha_nacimiento, telefono
    FROM personal
    WHERE activo = 1 AND fecha_nacimiento LIKE ?
    ORDER BY substr(fecha_nacimiento, 6)
  `
    )
    .all(`%-${mesActual}-%`);

  // Aniversarios del mes (fecha_ingreso)
  const aniversariosMes = db
    .prepare(
      `
    SELECT id, nombre, fecha_ingreso,
      CAST((julianday('now') - julianday(fecha_ingreso)) / 365 AS INTEGER) as anios
    FROM personal
    WHERE activo = 1 AND fecha_ingreso LIKE ?
    ORDER BY substr(fecha_ingreso, 6)
  `
    )
    .all(`%-${mesActual}-%`);

  // Top reconocimientos
  const topReconocimientos = db
    .prepare(
      `
    SELECT p.id, p.nombre, p.puntos_reconocimiento
    FROM personal p
    WHERE p.activo = 1 AND p.puntos_reconocimiento > 0
    ORDER BY p.puntos_reconocimiento DESC
    LIMIT 5
  `
    )
    .all();

  return {
    total: total?.count || 0,
    activos: activos?.count || 0,
    por_rol: porRol,
    por_categoria: porCategoria,
    cumpleaneros_mes: cumpleanerosMes,
    aniversarios_mes: aniversariosMes,
    top_reconocimientos: topReconocimientos,
  };
}

function getDetalleCompleto(personalId) {
  const personal = getPersonalById(personalId);
  if (!personal) return null;

  return {
    ...personal,
    direcciones: getDirecciones(personalId),
    carrera: getCarreraHistorial(personalId),
    reconocimientos: getReconocimientos(personalId, 20),
    liquidaciones: db
      .prepare(
        'SELECT * FROM personal_liquidaciones WHERE personal_id = ? ORDER BY fecha DESC LIMIT 20'
      )
      .all(personalId),
    movimientos: db
      .prepare(
        'SELECT * FROM personal_movimientos WHERE personal_id = ? ORDER BY fecha DESC LIMIT 20'
      )
      .all(personalId),
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Normalización
  normalizePersonal,

  // CRUD
  getPersonalList,
  getPersonalById,
  createPersonal,
  updatePersonal,

  // Direcciones
  getDirecciones,
  createDireccion,
  updateDireccion,
  deleteDireccion,

  // Categorías
  getCategorias,
  getCategoriaById,
  createCategoria,
  updateCategoria,

  // Carrera
  getCarreraHistorial,
  registrarAscenso,

  // Reconocimientos
  getReconocimientosConfig,
  updateReconocimientosConfig,
  getReconocimientos,
  agregarReconocimiento,
  canjearReconocimientos,

  // Estadísticas
  getEstadisticas,
  getDetalleCompleto,
};

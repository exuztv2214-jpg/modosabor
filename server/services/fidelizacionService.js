const db = require('../db');

// ============================================
// CONFIGURACIÓN
// ============================================

function getConfig() {
  return (
    db.prepare('SELECT * FROM fidelizacion_config WHERE id = 1').get() || {
      pesos_por_punto: 100,
      valor_punto_real: 10,
      dias_expiracion: 180,
      minimo_canje: 50,
      monto_minimo_sello: 10000,
      sellos_para_premio: 6,
      premio_descripcion: '1 Pizza Muzzarella',
      premio_producto_id: null,
      activo: 1,
    }
  );
}

function updateConfig(config) {
  const stmt = db.prepare(`
    UPDATE fidelizacion_config 
    SET pesos_por_punto = ?, 
        valor_punto_real = ?, 
        dias_expiracion = ?, 
        minimo_canje = ?,
        monto_minimo_sello = ?,
        sellos_para_premio = ?,
        premio_descripcion = ?,
        premio_producto_id = ?,
        activo = ?,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = 1
  `);
  stmt.run(
    config.pesos_por_punto || 100,
    config.valor_punto_real || 10,
    config.dias_expiracion || 180,
    config.minimo_canje || 50,
    config.monto_minimo_sello || 10000,
    config.sellos_para_premio || 6,
    config.premio_descripcion || '1 Pizza Muzzarella',
    config.premio_producto_id ? Number(config.premio_producto_id) : null,
    config.activo !== undefined ? config.activo : 1
  );
  return getConfig();
}

// ============================================
// CÁLCULO DE PUNTOS Y SELLOS
// ============================================

function calcularPuntos(total, nivelMultiplicador = 1) {
  const config = getConfig();
  if (!config.activo) return 0;

  const puntosBase = Math.floor(total / config.pesos_por_punto);
  return Math.floor(puntosBase * nivelMultiplicador);
}

function calcularValorPuntos(puntos) {
  const config = getConfig();
  return puntos * config.valor_punto_real;
}

/**
 * Procesa la fidelidad completa de un pedido (Puntos + Sellos)
 */
function procesarFidelidadPedido(clienteId, pedidoId, total) {
  const config = getConfig();
  if (!config.activo) return null;

  const cliente = db
    .prepare(
      'SELECT id, fidelizacion_activa, sellos_actuales, recompensas_pendientes FROM clientes WHERE id = ?'
    )
    .get(clienteId);
  if (!cliente || !cliente.fidelizacion_activa) return null;

  const resultPuntos = acumularPuntos(clienteId, pedidoId, total);
  const resultSellos = acumularSellos(clienteId, pedidoId, total, cliente);

  return {
    puntos: resultPuntos,
    sellos: resultSellos,
  };
}

function acumularSellos(clienteId, pedidoId, total, clienteData = null) {
  const config = getConfig();
  if (!config.activo) return null;

  const cliente =
    clienteData ||
    db
      .prepare(
        'SELECT id, fidelizacion_activa, sellos_actuales, recompensas_pendientes FROM clientes WHERE id = ?'
      )
      .get(clienteId);
  if (!cliente || !cliente.fidelizacion_activa) return null;

  // Condición de monto mínimo para sello
  if (total < config.monto_minimo_sello) return { sumado: false, motivo: 'monto_insuficiente' };

  let nuevosSellos = (cliente.sellos_actuales || 0) + 1;
  let nuevasRecompensas = cliente.recompensas_pendientes || 0;
  let premioGanado = false;

  if (nuevosSellos >= config.sellos_para_premio) {
    nuevosSellos = 0;
    nuevasRecompensas += 1;
    premioGanado = true;
  }

  db.prepare(
    'UPDATE clientes SET sellos_actuales = ?, recompensas_pendientes = ? WHERE id = ?'
  ).run(nuevosSellos, nuevasRecompensas, clienteId);

  return {
    sumado: true,
    sellos_actuales: nuevosSellos,
    recompensas_pendientes: nuevasRecompensas,
    premio_ganado: premioGanado,
    config_sellos: config.sellos_para_premio,
  };
}

function canjearRecompensa(clienteId) {
  const cliente = db
    .prepare('SELECT id, recompensas_pendientes, canjes_premio FROM clientes WHERE id = ?')
    .get(clienteId);
  if (!cliente || cliente.recompensas_pendientes <= 0) {
    throw new Error('No tienes recompensas pendientes para canjear');
  }

  db.prepare(
    'UPDATE clientes SET recompensas_pendientes = recompensas_pendientes - 1, canjes_premio = canjes_premio + 1 WHERE id = ?'
  ).run(clienteId);

  return {
    success: true,
    recompensas_restantes: cliente.recompensas_pendientes - 1,
  };
}

// ============================================
// GESTIÓN DE TARJETAS
// ============================================

function generarCodigoTarjeta() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let codigo = '';
  for (let i = 0; i < 4; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MS-${codigo}`;
}

function asegurarCodigoTarjeta(clienteId) {
  const cliente = db.prepare('SELECT codigo_tarjeta FROM clientes WHERE id = ?').get(clienteId);
  if (cliente && cliente.codigo_tarjeta) return cliente.codigo_tarjeta;

  let nuevoCodigo = generarCodigoTarjeta();
  // Verificar unicidad (simplificado)
  try {
    db.prepare('UPDATE clientes SET codigo_tarjeta = ? WHERE id = ?').run(nuevoCodigo, clienteId);
    return nuevoCodigo;
  } catch (e) {
    // Si falla por unicidad, reintentar una vez
    nuevoCodigo = generarCodigoTarjeta();
    db.prepare('UPDATE clientes SET codigo_tarjeta = ? WHERE id = ?').run(nuevoCodigo, clienteId);
    return nuevoCodigo;
  }
}

// ============================================
// TRANSACCIONES DE PUNTOS
// ============================================

function acumularPuntos(clienteId, pedidoId, total, descripcion = '') {
  const config = getConfig();
  if (!config.activo) return null;

  // Obtener nivel del cliente para multiplicador
  const cliente = db.prepare('SELECT nivel FROM clientes WHERE id = ?').get(clienteId);
  const nivel = db
    .prepare('SELECT multiplicador_puntos FROM fidelizacion_niveles WHERE nombre = ?')
    .get(cliente?.nivel || 'Bronce');
  const multiplicador = nivel?.multiplicador_puntos || 1;

  const puntos = calcularPuntos(total, multiplicador);
  if (puntos <= 0) return null;

  const fechaExpiracion = new Date();
  fechaExpiracion.setDate(fechaExpiracion.getDate() + config.dias_expiracion);

  const stmt = db.prepare(`
    INSERT INTO puntos_transacciones 
    (cliente_id, pedido_id, tipo, puntos, puntos_disponibles, descripcion, fecha_expiracion)
    VALUES (?, ?, 'ganancia', ?, ?, ?, ?)
  `);

  const result = stmt.run(
    clienteId,
    pedidoId,
    puntos,
    puntos,
    descripcion,
    fechaExpiracion.toISOString()
  );

  // Actualizar saldo en clientes
  actualizarSaldoCliente(clienteId);

  return {
    transaccion_id: result.lastInsertRowid,
    puntos_acumulados: puntos,
    multiplicador_aplicado: multiplicador,
  };
}

function canjearPuntos(clienteId, puntosACanjear, descripcion = '') {
  const config = getConfig();
  if (!config.activo) throw new Error('Programa de puntos inactivo');
  if (puntosACanjear < config.minimo_canje) {
    throw new Error(`Mínimo de canje: ${config.minimo_canje} puntos`);
  }

  const saldo = getSaldoPuntos(clienteId);
  if (saldo < puntosACanjear) {
    throw new Error(`Saldo insuficiente. Tienes ${saldo} puntos`);
  }

  const consumo = consumirPuntosDisponibles(clienteId, puntosACanjear);
  if (consumo.faltantes > 0) {
    throw new Error(`Saldo insuficiente. Faltan ${consumo.faltantes} puntos por descontar`);
  }

  // Registrar transacción de canje
  const stmt = db.prepare(`
    INSERT INTO puntos_transacciones 
    (cliente_id, tipo, puntos, puntos_disponibles, descripcion)
    VALUES (?, 'canje', ?, 0, ?)
  `);
  const result = stmt.run(clienteId, puntosACanjear, descripcion);

  actualizarSaldoCliente(clienteId);

  return {
    transaccion_id: result.lastInsertRowid,
    puntos_canjeados: puntosACanjear,
    valor_real: calcularValorPuntos(puntosACanjear),
  };
}

function registrarAjusteManualPuntos(clienteId, deltaPuntos, descripcion = '') {
  const delta = Math.trunc(Number(deltaPuntos || 0));
  if (!delta) {
    return {
      delta: 0,
      saldo_actual: getSaldoPuntos(clienteId),
      transaccion_id: null,
    };
  }

  let transaccionId = null;
  if (delta > 0) {
    const stmt = db.prepare(`
      INSERT INTO puntos_transacciones
      (cliente_id, tipo, puntos, puntos_disponibles, descripcion)
      VALUES (?, 'bonus', ?, ?, ?)
    `);
    transaccionId = stmt.run(
      clienteId,
      delta,
      delta,
      descripcion || 'Ajuste manual positivo'
    ).lastInsertRowid;
  } else {
    const puntosARestar = Math.abs(delta);
    const saldo = getSaldoPuntos(clienteId);
    if (saldo < puntosARestar) {
      throw new Error(`No se pueden descontar ${puntosARestar} puntos. Saldo actual: ${saldo}`);
    }

    const consumo = consumirPuntosDisponibles(clienteId, puntosARestar);
    if (consumo.faltantes > 0) {
      throw new Error(`No se pudieron descontar ${puntosARestar} puntos completos`);
    }

    const stmt = db.prepare(`
      INSERT INTO puntos_transacciones
      (cliente_id, tipo, puntos, puntos_disponibles, descripcion)
      VALUES (?, 'ajuste', ?, 0, ?)
    `);
    transaccionId = stmt.run(
      clienteId,
      puntosARestar,
      descripcion || 'Ajuste manual negativo'
    ).lastInsertRowid;
  }

  const saldoActual = actualizarSaldoCliente(clienteId);
  return {
    delta,
    saldo_actual: saldoActual,
    transaccion_id: transaccionId,
  };
}

function getSaldoPuntos(clienteId) {
  const result = db
    .prepare(
      `
    SELECT COALESCE(SUM(CASE 
      WHEN tipo IN ('ganancia', 'bonus') THEN puntos_disponibles 
      ELSE -puntos 
    END), 0) as saldo
    FROM puntos_transacciones 
    WHERE cliente_id = ?
  `
    )
    .get(clienteId);

  return result?.saldo || 0;
}

function actualizarSaldoCliente(clienteId) {
  const saldo = getSaldoPuntos(clienteId);
  db.prepare('UPDATE clientes SET puntos = ? WHERE id = ?').run(saldo, clienteId);
  return saldo;
}

function consumirPuntosDisponibles(clienteId, puntosObjetivo) {
  let puntosRestantes = Math.max(0, Number(puntosObjetivo || 0));
  const transacciones = db
    .prepare(
      `
    SELECT id, puntos_disponibles
    FROM puntos_transacciones
    WHERE cliente_id = ? AND tipo IN ('ganancia', 'bonus') AND puntos_disponibles > 0
    ORDER BY fecha ASC, id ASC
  `
    )
    .all(clienteId);

  for (const trans of transacciones) {
    if (puntosRestantes <= 0) break;
    const aDescontar = Math.min(Number(trans.puntos_disponibles || 0), puntosRestantes);
    if (aDescontar <= 0) continue;
    db.prepare(
      'UPDATE puntos_transacciones SET puntos_disponibles = puntos_disponibles - ? WHERE id = ?'
    ).run(aDescontar, trans.id);
    puntosRestantes -= aDescontar;
  }

  return {
    consumidos: Math.max(0, Number(puntosObjetivo || 0) - puntosRestantes),
    faltantes: puntosRestantes,
  };
}

function getHistorialPuntos(clienteId, limit = 50) {
  return db
    .prepare(
      `
    SELECT 
      pt.*,
      p.numero as pedido_numero
    FROM puntos_transacciones pt
    LEFT JOIN pedidos p ON pt.pedido_id = p.id
    WHERE pt.cliente_id = ?
    ORDER BY pt.fecha DESC
    LIMIT ?
  `
    )
    .all(clienteId, limit);
}

// ============================================
// NIVELES DE CLIENTE
// ============================================

function getNiveles() {
  return db.prepare('SELECT * FROM fidelizacion_niveles ORDER BY orden ASC').all();
}

function getNivelCliente(clienteId) {
  const cliente = db.prepare('SELECT nivel FROM clientes WHERE id = ?').get(clienteId);
  if (!cliente) return null;

  return db.prepare('SELECT * FROM fidelizacion_niveles WHERE nombre = ?').get(cliente.nivel);
}

function recalcularNivelCliente(clienteId) {
  // Calcular gasto de últimos 12 meses
  const gasto = db
    .prepare(
      `
    SELECT COALESCE(SUM(total), 0) as total_gastado
    FROM pedidos 
    WHERE cliente_id = ? 
      AND estado = 'entregado'
      AND creado_en >= datetime('now', '-12 months')
  `
    )
    .get(clienteId);

  const nuevoNivel = db
    .prepare(
      `
    SELECT nombre FROM fidelizacion_niveles 
    WHERE gasto_minimo_anual <= ? 
    ORDER BY orden DESC 
    LIMIT 1
  `
    )
    .get(gasto.total_gastado || 0);

  const cliente = db.prepare('SELECT nivel FROM clientes WHERE id = ?').get(clienteId);

  if (nuevoNivel && nuevoNivel.nombre !== cliente?.nivel) {
    // Guardar historial
    db.prepare(
      `
      INSERT INTO cliente_niveles_historial 
      (cliente_id, nivel_anterior, nivel_nuevo, gasto_calculado)
      VALUES (?, ?, ?, ?)
    `
    ).run(clienteId, cliente?.nivel, nuevoNivel.nombre, gasto.total_gastado);

    // Actualizar cliente
    db.prepare('UPDATE clientes SET nivel = ? WHERE id = ?').run(nuevoNivel.nombre, clienteId);

    return {
      cambio: true,
      nivel_anterior: cliente?.nivel,
      nivel_nuevo: nuevoNivel.nombre,
      gasto_anual: gasto.total_gastado,
    };
  }

  return {
    cambio: false,
    nivel_actual: cliente?.nivel,
    gasto_anual: gasto.total_gastado,
  };
}

function recalcularTodosLosNiveles() {
  const clientes = db.prepare('SELECT id FROM clientes').all();
  const resultados = [];

  for (const cliente of clientes) {
    const resultado = recalcularNivelCliente(cliente.id);
    if (resultado.cambio) {
      resultados.push({ cliente_id: cliente.id, ...resultado });
    }
  }

  return resultados;
}

// ============================================
// EXPIRACIÓN DE PUNTOS
// ============================================

function procesarPuntosExpirados() {
  const expirados = db
    .prepare(
      `
    SELECT id, cliente_id, puntos_disponibles
    FROM puntos_transacciones
    WHERE tipo = 'ganancia'
      AND puntos_disponibles > 0
      AND fecha_expiracion < datetime('now')
      AND procesado = 0
  `
    )
    .all();

  const stmt = db.prepare(`
    UPDATE puntos_transacciones 
    SET procesado = 1 
    WHERE id = ?
  `);

  const stmtExpiracion = db.prepare(`
    INSERT INTO puntos_transacciones 
    (cliente_id, tipo, puntos, puntos_disponibles, descripcion)
    VALUES (?, 'expiracion', ?, 0, ?)
  `);

  for (const exp of expirados) {
    // Marcar como procesado
    stmt.run(exp.id);

    // Crear transacción de expiración
    stmtExpiracion.run(
      exp.cliente_id,
      exp.puntos_disponibles,
      `Puntos expirados (transacción #${exp.id})`
    );

    // Actualizar saldo
    actualizarSaldoCliente(exp.cliente_id);
  }

  return expirados.length;
}

// ============================================
// ESTADÍSTICAS
// ============================================

function getEstadisticas() {
  const config = getConfig();
  if (!config.activo) return null;

  const totalClientes = db.prepare('SELECT COUNT(*) as count FROM clientes WHERE puntos > 0').get();
  const puntosEnCirculacion = db
    .prepare(
      'SELECT COALESCE(SUM(puntos_disponibles), 0) as total FROM puntos_transacciones WHERE tipo = ? AND puntos_disponibles > 0'
    )
    .get('ganancia');
  const canjesMes = db
    .prepare(
      `
    SELECT COALESCE(SUM(puntos), 0) as total 
    FROM puntos_transacciones 
    WHERE tipo = 'canje' AND fecha >= datetime('now', '-30 days')
  `
    )
    .get();

  const topClientes = db
    .prepare(
      `
    SELECT c.id, c.nombre, c.telefono, c.puntos, c.nivel
    FROM clientes c
    WHERE c.puntos > 0
    ORDER BY c.puntos DESC
    LIMIT 10
  `
    )
    .all();

  return {
    config,
    total_clientes_con_puntos: totalClientes?.count || 0,
    puntos_en_circulacion: puntosEnCirculacion?.total || 0,
    canjes_ultimo_mes: canjesMes?.total || 0,
    top_clientes: topClientes,
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Config
  getConfig,
  updateConfig,

  // Puntos y Sellos
  calcularPuntos,
  calcularValorPuntos,
  acumularPuntos,
  canjearPuntos,
  procesarFidelidadPedido,
  canjearRecompensa,
  getSaldoPuntos,
  getHistorialPuntos,
  registrarAjusteManualPuntos,

  // Tarjetas
  asegurarCodigoTarjeta,

  // Niveles
  getNiveles,
  getNivelCliente,
  recalcularNivelCliente,
  recalcularTodosLosNiveles,

  // Mantenimiento
  procesarPuntosExpirados,
  getEstadisticas,
};

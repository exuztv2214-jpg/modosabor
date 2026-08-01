const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requirePermission, hasPermission } = require('../utils/permissions');
const db = require('../db');
const {
  getConfig,
  updateConfig,
  acumularPuntos,
  canjearPuntos,
  procesarFidelidadPedido,
  canjearRecompensa,
  getSaldoPuntos,
  getHistorialPuntos,
  getNiveles,
  getNivelCliente,
  recalcularNivelCliente,
  recalcularTodosLosNiveles,
  procesarPuntosExpirados,
  getEstadisticas,
  calcularPuntos,
  calcularValorPuntos,
  registrarAjusteManualPuntos,
  asegurarCodigoTarjeta,
} = require('../services/fidelizacionService');
const { ensureClienteDireccion, getClienteDirecciones } = require('../utils/clienteAddresses');
const { getConfigMap } = require('../utils/mercadoPago');

function canAccessCliente(req) {
  return hasPermission(req.user, 'clientes.view') || hasPermission(req.user, 'clientes.edit');
}

function cleanText(value) {
  return String(value || '').trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('54')) return digits;
  if (digits.startsWith('0')) return `54${digits.slice(1)}`;
  return `54${digits}`;
}

function findClienteByPhone(telefono) {
  const normalized = normalizePhone(telefono);
  if (!normalized) return null;
  const rows = db
    .prepare(
      `
    SELECT *
    FROM clientes
    WHERE TRIM(COALESCE(telefono, '')) != ''
    ORDER BY total_pedidos DESC, total_gastado DESC, id ASC
  `
    )
    .all();
  return rows.find((row) => normalizePhone(row.telefono) === normalized) || null;
}

function getClubMissingFields(cliente) {
  const missing = [];
  if (!cleanText(cliente?.nombre)) missing.push('nombre');
  if (!normalizePhone(cliente?.telefono)) missing.push('telefono');
  if (!cleanText(cliente?.direccion)) missing.push('direccion');
  if (!cleanText(cliente?.fecha_nacimiento)) missing.push('fecha_nacimiento');
  if (!cleanText(cliente?.email)) missing.push('email');
  return missing;
}

function serializeClubCliente(cliente) {
  if (!cliente) return null;
  const direcciones = getClienteDirecciones(db, cliente.id);
  const principal = direcciones.find((item) => item.principal) || direcciones[0] || null;
  const direccionPrincipal = cleanText(principal?.direccion) || cleanText(cliente.direccion);
  const referenciaPrincipal = cleanText(principal?.referencia);
  const missingFields = getClubMissingFields({
    ...cliente,
    direccion: direccionPrincipal,
  });
  return {
    id: cliente.id,
    nombre: cliente.nombre || '',
    telefono: cliente.telefono || '',
    email: cliente.email || '',
    direccion: direccionPrincipal,
    referencia_principal: referenciaPrincipal,
    fecha_nacimiento: cliente.fecha_nacimiento || '',
    puntos: Number(cliente.puntos || 0),
    nivel: cliente.nivel || 'Bronce',
    sellos_actuales: Number(cliente.sellos_actuales || 0),
    recompensas_pendientes: Number(cliente.recompensas_pendientes || 0),
    codigo_tarjeta: cliente.codigo_tarjeta || '',
    total_pedidos: Number(cliente.total_pedidos || 0),
    total_gastado: Number(cliente.total_gastado || 0),
    fidelizacion_activa: Number(cliente.fidelizacion_activa || 0) !== 0,
    missing_fields: missingFields,
    perfil_completo: missingFields.length === 0,
  };
}

function getClubPayload(cliente) {
  const config = getConfig();
  // negocio_nombre/negocio_logo/color_primario/etc. NO viven en fidelizacion_config
  // (esa tabla solo tiene ajustes de puntos/sellos). El branding real del negocio
  // vive en la tabla general `configuracion` (clave/valor). Antes esto siempre
  // devolvía branding vacío y la tarjeta pública caía al logo/color por defecto
  // sin importar lo configurado en Configuración > Identidad visual.
  const generalConfig = getConfigMap(db);
  return {
    cliente: serializeClubCliente(cliente),
    config: {
      activo: Number(config.activo || 0) === 1,
      sellos_para_premio: Number(config.sellos_para_premio || 0),
      premio_descripcion: config.premio_descripcion || '',
      monto_minimo_sello: Number(config.monto_minimo_sello || 0),
      minimo_canje: Number(config.minimo_canje || 0),
      valor_punto_real: Number(config.valor_punto_real || 0),
      color_primario: generalConfig.color_primario || generalConfig.negocio_color_primario || '',
    },
    branding: {
      negocio_nombre: generalConfig.negocio_nombre || 'Modo Sabor',
      negocio_logo: generalConfig.negocio_logo || '',
      negocio_favicon: generalConfig.negocio_favicon || '',
      public_app_url: generalConfig.public_app_url || '',
      tarjeta_fidelidad_fondo: generalConfig.tarjeta_fidelidad_fondo || '',
    },
  };
}

// ============================================
// CONFIGURACIÓN (Admin)
// ============================================

// ... (rest of endpoints)

// POST /api/fidelizacion/recompensa/canjear
router.post('/recompensa/canjear', auth, requirePermission('pedidos.edit'), (req, res) => {
  try {
    const { cliente_id } = req.body;
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id es requerido' });

    const resultado = canjearRecompensa(cliente_id);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/fidelizacion/tarjeta/:codigo
router.get('/tarjeta/:codigo', (req, res) => {
  try {
    const { codigo } = req.params;
    const cliente = db
      .prepare(
        `
      SELECT nombre, puntos, nivel, sellos_actuales, recompensas_pendientes, codigo_tarjeta 
      FROM clientes 
      WHERE codigo_tarjeta = ?
    `
      )
      .get(codigo);

    if (!cliente) return res.status(404).json({ error: 'Tarjeta no encontrada' });

    const config = getConfig();
    res.json({
      cliente,
      config: {
        sellos_para_premio: config.sellos_para_premio,
        premio_descripcion: config.premio_descripcion,
        monto_minimo_sello: config.monto_minimo_sello,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CLUB / FICHA PUBLICA
// ============================================

// GET /api/fidelizacion/club-branding
// Branding/config general para la landing pública del club (/club, SIN código
// de cliente todavía). El QR genérico de mostrador apunta acá antes de que el
// cliente tenga una tarjeta vinculada, así que esta ruta no puede depender de
// codigo_tarjeta como las de abajo.
router.get('/club-branding', (req, res) => {
  try {
    res.json(getClubPayload(null));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/club/:codigo', (req, res) => {
  try {
    const codigo = cleanText(req.params.codigo).toUpperCase();
    const cliente = db
      .prepare(
        `
      SELECT *
      FROM clientes
      WHERE codigo_tarjeta = ?
    `
      )
      .get(codigo);

    if (!cliente) {
      return res.status(404).json({ error: 'Tarjeta no encontrada' });
    }

    res.json({
      found: true,
      linked: true,
      ...getClubPayload(cliente),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/club/lookup', (req, res) => {
  try {
    const codigo = cleanText(req.body?.codigo).toUpperCase();
    const telefono = normalizePhone(req.body?.telefono);
    const byCode = codigo
      ? db.prepare('SELECT * FROM clientes WHERE codigo_tarjeta = ?').get(codigo)
      : null;
    const byPhone = telefono ? findClienteByPhone(telefono) : null;

    if (byCode && byPhone && Number(byCode.id) !== Number(byPhone.id)) {
      return res.status(409).json({
        error: 'Ese teléfono ya pertenece a otro cliente distinto a la tarjeta escaneada',
        conflict: true,
        codigo_tarjeta: byCode.codigo_tarjeta,
      });
    }

    const cliente = byCode || byPhone || null;
    if (!cliente) {
      return res.json({
        found: false,
        linked: Boolean(codigo),
        codigo_tarjeta: codigo || '',
      });
    }

    res.json({
      found: true,
      linked: Boolean(byCode),
      ...getClubPayload(cliente),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/club/registro', (req, res) => {
  try {
    const codigoInput = cleanText(req.body?.codigo).toUpperCase();
    const telefono = normalizePhone(req.body?.telefono);
    const nombre = cleanText(req.body?.nombre);
    const email = cleanText(req.body?.email);
    const fechaNacimiento = cleanText(req.body?.fecha_nacimiento);
    const direccion = cleanText(req.body?.direccion);
    const barrio = cleanText(req.body?.barrio);
    const referencia = cleanText(req.body?.referencia);
    const aceptoTerminos = req.body?.acepto_terminos === true || req.body?.acepto_terminos === 1;

    if (!telefono) return res.status(400).json({ error: 'El teléfono es obligatorio' });
    if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
    if (!aceptoTerminos) {
      return res.status(400).json({
        error: 'Tenés que aceptar las bases y condiciones del club para registrarte',
      });
    }

    const byCode = codigoInput
      ? db.prepare('SELECT * FROM clientes WHERE codigo_tarjeta = ?').get(codigoInput)
      : null;
    const byPhone = findClienteByPhone(telefono);

    if (byCode && byPhone && Number(byCode.id) !== Number(byPhone.id)) {
      return res.status(409).json({
        error: 'La tarjeta escaneada ya está vinculada a otro cliente. Revisar en administración.',
        conflict: true,
      });
    }

    let cliente = byCode || byPhone || null;
    let yaExistia = Boolean(cliente);

    db.exec('BEGIN');
    try {
      if (cliente) {
        const nextCodigo = cliente.codigo_tarjeta || codigoInput || null;
        db.prepare(
          `
          UPDATE clientes
          SET nombre = ?,
              telefono = ?,
              email = CASE WHEN TRIM(COALESCE(?, '')) != '' THEN ? ELSE email END,
              fecha_nacimiento = CASE WHEN TRIM(COALESCE(?, '')) != '' THEN ? ELSE fecha_nacimiento END,
              direccion = CASE WHEN TRIM(COALESCE(?, '')) != '' THEN ? ELSE direccion END,
              barrio = CASE WHEN TRIM(COALESCE(?, '')) != '' THEN ? ELSE barrio END,
              fidelizacion_activa = 1,
              acepto_terminos = 1,
              acepto_terminos_en = COALESCE(acepto_terminos_en, CURRENT_TIMESTAMP),
              codigo_tarjeta = COALESCE(codigo_tarjeta, ?)
          WHERE id = ?
        `
        ).run(
          nombre,
          telefono,
          email,
          email,
          fechaNacimiento,
          fechaNacimiento,
          direccion,
          direccion,
          barrio,
          barrio,
          nextCodigo,
          cliente.id
        );
      } else {
        const result = db
          .prepare(
            `
          INSERT INTO clientes (
            nombre, telefono, email, direccion, barrio, fecha_nacimiento,
            fidelizacion_activa, acepto_terminos, acepto_terminos_en, codigo_tarjeta
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, ?)
        `
          )
          .run(nombre, telefono, email, direccion, barrio, fechaNacimiento, codigoInput || null);
        cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
      }

      const clienteId = cliente.id;
      if (!cleanText(cliente.codigo_tarjeta) && !codigoInput) {
        asegurarCodigoTarjeta(clienteId);
      } else if (!cleanText(cliente.codigo_tarjeta) && codigoInput) {
        db.prepare('UPDATE clientes SET codigo_tarjeta = ? WHERE id = ?').run(
          codigoInput,
          clienteId
        );
      }

      if (direccion) {
        ensureClienteDireccion(
          db,
          clienteId,
          {
            direccion,
            referencia,
            etiqueta: 'Principal',
            principal: true,
          },
          { makePrimaryIfEmpty: true }
        );
      }

      db.exec('COMMIT');
      cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(clienteId);
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    res.json({
      success: true,
      ya_existia: yaExistia,
      ...getClubPayload(cliente),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/fidelizacion/config
router.get('/config', auth, requirePermission('configuracion.view'), (req, res) => {
  try {
    const config = getConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/fidelizacion/config
router.put('/config', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const config = updateConfig(req.body);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NIVELES (Admin)
// ============================================

// GET /api/fidelizacion/niveles
router.get('/niveles', auth, (req, res) => {
  try {
    const niveles = getNiveles();
    res.json(niveles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/fidelizacion/niveles/:clienteId
router.get('/niveles/cliente/:clienteId', auth, (req, res) => {
  try {
    const nivel = getNivelCliente(req.params.clienteId);
    if (!nivel) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(nivel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/fidelizacion/niveles/recalcular
router.post('/niveles/recalcular', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const resultado = recalcularTodosLosNiveles();
    res.json({
      mensaje: 'Niveles recalculados',
      cambios: resultado.length,
      detalles: resultado,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/fidelizacion/niveles/recalcular/:clienteId
router.post(
  '/niveles/recalcular/:clienteId',
  auth,
  requirePermission('clientes.edit'),
  (req, res) => {
    try {
      const resultado = recalcularNivelCliente(req.params.clienteId);
      res.json(resultado);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ============================================
// PUNTOS - Cliente (propios o con permiso)
// ============================================

// GET /api/fidelizacion/puntos/saldo/:clienteId
router.get('/puntos/saldo/:clienteId', auth, (req, res) => {
  try {
    if (!canAccessCliente(req)) {
      return res.status(403).json({ error: 'Sin permisos para ver fidelizacion de clientes' });
    }
    const saldo = getSaldoPuntos(req.params.clienteId);
    const config = getConfig();
    res.json({
      puntos: saldo,
      valor_aproximado: saldo * config.valor_punto_real,
      minimo_canje: config.minimo_canje,
      puede_canjear: saldo >= config.minimo_canje && config.activo,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/fidelizacion/puntos/historial/:clienteId
router.get('/puntos/historial/:clienteId', auth, (req, res) => {
  try {
    if (!canAccessCliente(req)) {
      return res.status(403).json({ error: 'Sin permisos para ver fidelizacion de clientes' });
    }
    const limit = parseInt(req.query.limit) || 50;
    const historial = getHistorialPuntos(req.params.clienteId, limit);
    res.json(historial);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/fidelizacion/puntos/canjear
router.post('/puntos/canjear', auth, requirePermission('pedidos.edit'), (req, res) => {
  try {
    const { cliente_id, puntos, descripcion } = req.body;

    if (!cliente_id || !puntos) {
      return res.status(400).json({ error: 'cliente_id y puntos son requeridos' });
    }

    const resultado = canjearPuntos(cliente_id, puntos, descripcion || 'Canje manual');
    res.json({
      success: true,
      ...resultado,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/fidelizacion/puntos/acumular
router.post('/puntos/acumular', auth, requirePermission('pedidos.edit'), (req, res) => {
  try {
    const { cliente_id, pedido_id, total, descripcion } = req.body;

    if (!cliente_id || !total) {
      return res.status(400).json({ error: 'cliente_id y total son requeridos' });
    }

    const resultado = acumularPuntos(cliente_id, pedido_id, total, descripcion);
    res.json({
      success: true,
      ...resultado,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/fidelizacion/puntos/ajuste-manual
// Suma o resta puntos y/o sellos manualmente (admin)
router.post('/puntos/ajuste-manual', auth, requirePermission('clientes.edit'), (req, res) => {
  try {
    const { cliente_id, delta_puntos, delta_sellos, motivo } = req.body;
    if (!cliente_id) return res.status(400).json({ error: 'cliente_id requerido' });

    const cliente = db
      .prepare(
        'SELECT id, puntos, sellos_actuales, recompensas_pendientes FROM clientes WHERE id = ?'
      )
      .get(cliente_id);
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado' });

    const config = getConfig();
    const nuevosPuntos = Math.max(0, (cliente.puntos || 0) + (Number(delta_puntos) || 0));
    const sellosBase = (cliente.sellos_actuales || 0) + (Number(delta_sellos) || 0);
    const sellosMax = config.sellos_para_premio || 10;
    const premiosExtra = sellosBase >= sellosMax ? Math.floor(sellosBase / sellosMax) : 0;
    const nuevosSellos = sellosBase >= sellosMax ? sellosBase % sellosMax : Math.max(0, sellosBase);
    const nuevosRecompensas = Math.max(0, (cliente.recompensas_pendientes || 0) + premiosExtra);

    db.prepare(
      'UPDATE clientes SET puntos = ?, sellos_actuales = ?, recompensas_pendientes = ? WHERE id = ?'
    ).run(nuevosPuntos, nuevosSellos, nuevosRecompensas, cliente_id);

    const ajustePuntos = Number(delta_puntos)
      ? registrarAjusteManualPuntos(cliente_id, Number(delta_puntos), motivo || 'Ajuste manual')
      : null;

    res.json({
      success: true,
      puntos: ajustePuntos?.saldo_actual ?? nuevosPuntos,
      sellos_actuales: nuevosSellos,
      recompensas_pendientes: nuevosRecompensas,
      ajuste_puntos: ajustePuntos,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CALCULADORA (Pública)
// ============================================

// GET /api/fidelizacion/calcular/:total
router.get('/calcular/:total', (req, res) => {
  try {
    const total = parseFloat(req.params.total);
    const config = getConfig();

    if (!config.activo) {
      return res.json({ activo: false });
    }

    const puntosBase = calcularPuntos(total, 1);

    // Calcular para cada nivel
    const niveles = getNiveles();
    const porNivel = niveles.map((n) => ({
      nivel: n.nombre,
      multiplicador: n.multiplicador_puntos,
      puntos: calcularPuntos(total, n.multiplicador_puntos),
    }));

    res.json({
      activo: true,
      total_compra: total,
      puntos_base: puntosBase,
      por_nivel: porNivel,
      config: {
        pesos_por_punto: config.pesos_por_punto,
        valor_punto_real: config.valor_punto_real,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ESTADÍSTICAS (Admin)
// ============================================

// GET /api/fidelizacion/estadisticas
router.get('/estadisticas', auth, requirePermission('reportes.view'), (req, res) => {
  try {
    const stats = getEstadisticas();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// MANTENIMIENTO (Admin/Sistema)
// ============================================

// POST /api/fidelizacion/mantenimiento/expirar
router.post('/mantenimiento/expirar', auth, requirePermission('config.manage'), (req, res) => {
  try {
    const expirados = procesarPuntosExpirados();
    res.json({
      mensaje: 'Proceso de expiración completado',
      puntos_expirados: expirados,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

const logger = require('../utils/logger');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  shouldAutoSettleOnEntrega,
} = require('../utils/paymentStatus');
const { backfillPedidoItems } = require('../utils/pedidoItems');

function hasColumn(db, table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((item) => item.name === column);
}

function ensureColumn(db, table, column, definition) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function runMigrations(db) {
  // ============================================
  // ENSURE COLUMNS
  // ============================================

  ensureColumn(db, 'usuarios', 'avatar', "TEXT DEFAULT ''");
  ensureColumn(db, 'categorias', 'imagen', "TEXT DEFAULT ''");
  ensureColumn(db, 'categorias', 'subcategorias', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'personal', 'frecuencia_pago', "TEXT DEFAULT 'mensual'");
  ensureColumn(db, 'personal', 'monto_base', 'REAL DEFAULT 0');
  ensureColumn(db, 'personal', 'medio_pago_preferido', "TEXT DEFAULT 'efectivo'");
  ensureColumn(db, 'personal', 'avatar_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'productos', 'stock_directo', 'REAL DEFAULT 0');
  ensureColumn(db, 'productos', 'stock_mode', "TEXT DEFAULT 'direct'");
  ensureColumn(db, 'productos', 'disponible_para_venta', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'productos', 'precio_anterior', 'REAL DEFAULT NULL');
  ensureColumn(db, 'productos', 'menu_dia_base', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'productos', 'menu_dia_disponible_hoy', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'productos', 'menu_dia_tipo', "TEXT DEFAULT 'economico'");
  ensureColumn(db, 'categorias', 'turno_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'marketing_publicador_destinos', 'preview_path', "TEXT DEFAULT ''");
  ensureColumn(db, 'marketing_publicador_destinos', 'preview_actualizado_en', 'DATETIME');
  ensureColumn(db, 'inventario_insumos', 'rubro', "TEXT DEFAULT 'General'");
  ensureColumn(db, 'inventario_insumos', 'nota_compra', "TEXT DEFAULT ''");
  ensureColumn(db, 'clientes', 'fecha_nacimiento', "TEXT DEFAULT ''");
  ensureColumn(db, 'clientes', 'nivel', "TEXT DEFAULT 'Bronce'");
  ensureColumn(db, 'clientes', 'puntos', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clientes', 'sellos_actuales', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clientes', 'frecuencia_dias', 'INTEGER DEFAULT 7');
  ensureColumn(db, 'clientes', 'canjes_premio', 'INTEGER DEFAULT 0');
  // FCM push token para app rider nativa. Un rider = 1 device;
  // si cambia de celu, el token nuevo pisa el viejo.
  ensureColumn(db, 'repartidores', 'fcm_token', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'fcm_platform', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'fcm_actualizado_en', 'DATETIME');
  ensureColumn(db, 'clientes', 'recompensas_pendientes', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clientes', 'fidelizacion_activa', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'clientes', 'codigo_tarjeta', 'TEXT');
  ensureColumn(db, 'clientes', 'avatar_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'clientes', 'premio_notificado', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'clientes', 'barrio', "TEXT DEFAULT ''");
  ensureColumn(db, 'clientes', 'acepto_terminos', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'clientes', 'acepto_terminos_en', 'DATETIME');
  ensureColumn(db, 'repartidores', 'latitud', 'REAL');
  ensureColumn(db, 'repartidores', 'longitud', 'REAL');
  ensureColumn(db, 'repartidores', 'ultima_ubicacion_en', 'TEXT');
  ensureColumn(db, 'repartidores', 'codigo_acceso', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'zona_preferida', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'direccion', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'latitud_casa', 'REAL');
  ensureColumn(db, 'repartidores', 'longitud_casa', 'REAL');
  ensureColumn(db, 'repartidores', 'avatar_url', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'notas', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'fecha_ingreso', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'personal_id', 'INTEGER');
  ensureColumn(db, 'personal', 'fecha_nacimiento', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'fecha_ingreso', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'email', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'direccion', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'tags', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'personal', 'categoria_id', 'INTEGER');
  ensureColumn(db, 'personal', 'puntos_reconocimiento', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'personal', 'total_liquidaciones', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'personal', 'total_adelantos', 'REAL DEFAULT 0');
  ensureColumn(db, 'personal', 'descuento_empleado_pct', 'REAL DEFAULT 20');
  ensureColumn(db, 'personal', 'clock_pin', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'clock_token', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal', 'clock_last_used_at', 'TEXT');
  ensureColumn(db, 'personal_movimientos', 'producto_id', 'INTEGER');
  ensureColumn(db, 'personal_movimientos', 'producto_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'personal_movimientos', 'cantidad_producto', 'REAL DEFAULT 0');
  ensureColumn(db, 'personal_movimientos', 'precio_lista', 'REAL DEFAULT 0');
  ensureColumn(db, 'personal_movimientos', 'descuento_empleado_pct', 'REAL DEFAULT 0');
  ensureColumn(db, 'cierres_caja', 'turno_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'cierres_caja', 'turno_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'cierres_caja', 'fecha_operativa', "TEXT DEFAULT ''");
  ensureColumn(db, 'cierres_caja', 'auto_abierta', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'cierres_caja', 'auto_cierre_motivo', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'pago_estado', "TEXT DEFAULT 'pendiente'");
  ensureColumn(db, 'pedidos', 'pago_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'mp_preference_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'pago_detalle', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'delivery_zona', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'hora_entrega', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'turno_operativo', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'entrega_pin', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'cliente_latitud', 'REAL');
  ensureColumn(db, 'pedidos', 'cliente_longitud', 'REAL');
  ensureColumn(db, 'pedidos', 'cliente_ubicacion_exacta', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'entrega_foto', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'entrega_foto_en', 'TEXT');
  ensureColumn(db, 'pedidos', 'inventario_aplicado', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'inventario_revertido', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'repartidor_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'repartidor_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'tracking_token', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'repartidor_latitud', 'REAL');
  ensureColumn(db, 'pedidos', 'repartidor_longitud', 'REAL');
  ensureColumn(db, 'pedidos', 'repartidor_ubicacion_en', 'TEXT');
  ensureColumn(db, 'pedidos', 'marketing_campana_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'marketing_promo_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'marketing_origen', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'marketing_codigo', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'marketing_source', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'marketing_medium', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'marketing_campaign', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'marketing_content', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedido_items', 'descripcion', "TEXT DEFAULT ''");
  ensureColumn(db, 'fidelizacion_config', 'monto_minimo_sello', 'REAL DEFAULT 10000');
  ensureColumn(db, 'fidelizacion_config', 'sellos_para_premio', 'INTEGER DEFAULT 6');
  ensureColumn(
    db,
    'fidelizacion_config',
    'premio_descripcion',
    "TEXT DEFAULT '1 Pizza Muzzarella'"
  );
  ensureColumn(db, 'fidelizacion_config', 'premio_producto_id', 'INTEGER');
  ensureColumn(db, 'crm_campanas_historial', 'enviados_ok', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'crm_campanas_historial', 'enviados_error', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'crm_campanas_historial', 'ultimo_resultado', "TEXT DEFAULT '[]'");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'delivery_zona', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'pedido_id', 'INTEGER');
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_campana_id', 'INTEGER');
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_promo_id', 'INTEGER');
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_origen', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_codigo', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_source', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_medium', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_campaign', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_pedidos_borrador', 'marketing_content', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'bot_silenciado', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_campana_id', 'INTEGER');
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_promo_id', 'INTEGER');
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_origen', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_codigo', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_source', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_medium', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_campaign', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'marketing_content', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_mensajes', 'whatsapp_message_id', "TEXT DEFAULT ''");

  // ============================================
  // ENSURE TABLES (nuevas tablas)
  // ============================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS notificaciones_envios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      repartidor_id INTEGER,
      cliente_telefono TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'llegando',
      canal TEXT NOT NULL DEFAULT 'whatsapp',
      mensaje TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'enviado',
      error TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notificaciones_envios_pedido
    ON notificaciones_envios(pedido_id, tipo)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notificaciones_envios_telefono
    ON notificaciones_envios(cliente_telefono, creado_en DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tpv_pedidos_espera (
      id TEXT PRIMARY KEY,
      label TEXT DEFAULT '',
      total REAL DEFAULT 0,
      total_items INTEGER DEFAULT 0,
      snapshot TEXT DEFAULT '{}',
      creado_en TEXT DEFAULT ''
    )
  `);

  // ============================================
  // BACKFILLS
  // ============================================

  // Backfill códigos de tarjeta fidelización
  try {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const generarCodigoTarjeta = () => {
      let codigo = 'MS-';
      for (let index = 0; index < 4; index += 1) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return codigo;
    };

    const clientesSinCodigo = db
      .prepare(
        `
        SELECT id
        FROM clientes
        WHERE codigo_tarjeta IS NULL OR TRIM(codigo_tarjeta) = ''
        ORDER BY id ASC
      `
      )
      .all();

    const updateCodigoTarjeta = db.prepare('UPDATE clientes SET codigo_tarjeta = ? WHERE id = ?');
    const existeCodigoTarjeta = db.prepare(
      'SELECT id FROM clientes WHERE codigo_tarjeta = ? LIMIT 1'
    );

    clientesSinCodigo.forEach((cliente) => {
      let codigo = generarCodigoTarjeta();
      while (existeCodigoTarjeta.get(codigo)) {
        codigo = generarCodigoTarjeta();
      }
      updateCodigoTarjeta.run(codigo, cliente.id);
    });
  } catch (e) {
    logger.error('Error al backfillear codigos de tarjeta', { message: e.message });
  }

  // Backfill menú del día
  try {
    const menuCategory = db
      .prepare(
        `
        SELECT id
        FROM categorias
        WHERE lower(nombre) = lower('Menu del Dia')
        LIMIT 1
      `
      )
      .get();

    if (menuCategory?.id) {
      db.prepare(
        `
        UPDATE productos
        SET menu_dia_base = 1
        WHERE categoria_id = ?
          AND COALESCE(menu_dia_base, 0) = 0
      `
      ).run(menuCategory.id);

      db.prepare(
        `
        UPDATE productos
        SET menu_dia_disponible_hoy = CASE WHEN activo = 1 THEN 1 ELSE 0 END
        WHERE categoria_id = ?
          AND COALESCE(menu_dia_disponible_hoy, 0) = 0
      `
      ).run(menuCategory.id);
    }
  } catch (e) {
    logger.error('Error al backfillear menu del dia', { message: e.message });
  }

  // Normalizar disponible_para_venta
  try {
    db.prepare(
      `
      UPDATE productos
      SET disponible_para_venta = CASE
        WHEN COALESCE(activo, 0) = 1 AND (
          COALESCE(stock_mode, 'direct') = 'recipe'
          OR COALESCE(stock_directo, 0) > 0
        ) THEN 1
        ELSE 0
      END
    `
    ).run();
  } catch (e) {
    logger.error('Error al normalizar disponible_para_venta', { message: e.message });
  }

  // Inicializar configuración de fidelización si no existe
  try {
    const fidConfig = db.prepare('SELECT id FROM fidelizacion_config WHERE id = 1').get();
    if (!fidConfig) {
      db.prepare(
        `
        INSERT INTO fidelizacion_config 
        (id, pesos_por_punto, valor_punto_real, dias_expiracion, minimo_canje, monto_minimo_sello, sellos_para_premio, premio_descripcion, activo)
        VALUES (1, 100, 10, 180, 50, 10000, 6, '1 Pizza Muzzarella', 1)
      `
      ).run();
    }
  } catch (e) {
    logger.error('Error al inicializar fidelizacion_config', { message: e.message });
  }

  // Normalizar turnos del personal
  try {
    db.prepare(
      "UPDATE personal SET turno_preferido = 'manana' WHERE lower(trim(nombre)) = lower('Mathias Gonzalez')"
    ).run();
    db.prepare(
      "UPDATE personal SET turno_preferido = 'noche' WHERE lower(trim(nombre)) IN (lower('Cristian Galvan'), lower('Ivan Lopez')) AND COALESCE(turno_preferido, '') != 'doble'"
    ).run();
  } catch (e) {
    logger.error('Error al normalizar turnos del personal', { message: e.message });
  }

  // Normalizar estado de pagos en pedidos
  const normalizePedidoPaymentStmt = db.prepare(`
    UPDATE pedidos
    SET metodo_pago = ?,
        pago_estado = ?,
        pago_detalle = CASE
          WHEN TRIM(COALESCE(pago_detalle, '')) = '' AND ? != '' THEN ?
          ELSE pago_detalle
        END
    WHERE id = ?
  `);

  db.exec('BEGIN');
  try {
    const pedidosCobro = db
      .prepare(
        `
        SELECT id, estado, metodo_pago, origen, pago_estado, pago_detalle
        FROM pedidos
      `
      )
      .all();

    pedidosCobro.forEach((pedido) => {
      const metodoPago = normalizeMetodoPago(pedido.metodo_pago);
      let pagoEstado = normalizePagoEstado(pedido.pago_estado, {
        metodoPago,
        origen: pedido.origen,
      });
      let pagoDetalle = String(pedido.pago_detalle || '').trim();

      if (!String(pedido.pago_estado || '').trim()) {
        pagoEstado = resolveInitialPagoEstado({
          metodoPago,
          origen: pedido.origen,
        });
      }

      if (
        pedido.estado === 'entregado' &&
        shouldAutoSettleOnEntrega({ ...pedido, metodo_pago: metodoPago, pago_estado: pagoEstado })
      ) {
        pagoEstado = 'pagado';
        if (!pagoDetalle) {
          pagoDetalle = 'Cobrado al entregar';
        }
      }

      normalizePedidoPaymentStmt.run(metodoPago, pagoEstado, pagoDetalle, pagoDetalle, pedido.id);
    });

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Backfill pedido_items
  db.exec('BEGIN');
  try {
    backfillPedidoItems(db, { limit: 20000 });
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  // Migrar direcciones legacy a cliente_direcciones
  db.exec(`
    INSERT INTO cliente_direcciones (cliente_id, etiqueta, direccion, principal, activa)
    SELECT c.id, 'Principal', TRIM(c.direccion), 1, 1
    FROM clientes c
    WHERE TRIM(COALESCE(c.direccion, '')) != ''
      AND NOT EXISTS (
        SELECT 1
        FROM cliente_direcciones cd
        WHERE cd.cliente_id = c.id
          AND LOWER(TRIM(cd.direccion)) = LOWER(TRIM(c.direccion))
      );

    UPDATE cliente_direcciones
    SET principal = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (
      SELECT cd.id
      FROM cliente_direcciones cd
      WHERE cd.id = (
        SELECT cd2.id
        FROM cliente_direcciones cd2
        WHERE cd2.cliente_id = cd.cliente_id AND cd2.activa = 1
        ORDER BY cd2.principal DESC, cd2.updated_at DESC, cd2.id DESC
        LIMIT 1
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM cliente_direcciones check_cd
      WHERE check_cd.cliente_id = cliente_direcciones.cliente_id
        AND check_cd.activa = 1
        AND check_cd.principal = 1
    );
  `);

  // Normalizar turnos operativos por defecto legacy
  try {
    const legacyTurnos = JSON.stringify([
      { id: 'manana', nombre: 'Turno manana', desde: '11:00', hasta: '14:00', activo: true },
      { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '02:00', activo: true },
    ]);
    const currentTurnos = db
      .prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'")
      .get()?.valor;
    if (String(currentTurnos || '').trim() === legacyTurnos) {
      const defaultTurnos = JSON.stringify([
        { id: 'manana', nombre: 'Turno manana', desde: '10:00', hasta: '14:30', activo: true },
        { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '01:30', activo: true },
      ]);
      db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'turnos_negocio'").run(
        defaultTurnos
      );
    }
  } catch (e) {
    logger.error('Error al normalizar turnos operativos por defecto', { message: e.message });
  }

  // Eliminar claves de configuración obsoletas
  const obsoleteConfigKeys = [
    'ai_provider',
    'ollama_model',
    'ollama_url',
    'openai_api_key',
    'whatsapp_ai_activa',
    'whatsapp_ai_modelo',
    'whatsapp_ai_manual',
    'whatsapp_ai_examples',
    'whatsapp_ai_saludo',
    'whatsapp_ai_respuesta_transferencia',
    'whatsapp_ai_respuesta_fuera_carta',
    'whatsapp_ai_pregunta_nombre',
    'whatsapp_ai_pregunta_direccion',
    'whatsapp_ai_pregunta_cantidad_empanadas',
    'whatsapp_ai_cierre_pedido',
    'whatsapp_ollama_url',
    'whatsapp_bot_activo',
    'whatsapp_bot_bienvenida',
    'whatsapp_bot_fallback',
    'whatsapp_bot_humano',
    'whatsapp_bot_link_pedidos',
    'modulo_whatsapp_activo',
  ];

  const deleteObsoleteConfigKey = db.prepare('DELETE FROM configuracion WHERE clave = ?');
  obsoleteConfigKeys.forEach((key) => deleteObsoleteConfigKey.run(key));

  // Fix negocio_direccion si está vacía o tiene placeholder
  const negocioDireccionRow = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'negocio_direccion'")
    .get();
  if (!negocioDireccionRow?.valor || negocioDireccionRow.valor === 'Tu dirección aquí') {
    db.prepare(
      "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('negocio_direccion', ?)"
    ).run('Monteros, Tucuman');
  }

  // Fix zonas de delivery legacy
  const zonasRow = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_zonas'")
    .get();
  try {
    const zonas = JSON.parse(zonasRow?.valor || '[]');
    const oldIds = ['centro', 'cercana', 'extendida'];
    if (
      Array.isArray(zonas) &&
      zonas.length > 0 &&
      zonas.every((item) => oldIds.includes(String(item.id || '')))
    ) {
      const defaultZonas = JSON.stringify([
        {
          id: 'monteros',
          nombre: 'Monteros',
          keywords: ['monteros', 'centro', 'casco centrico', 'las piedras'],
          costo_envio: 0,
          tiempo_estimado_min: 25,
          activa: true,
        },
        {
          id: 'cerca',
          nombre: 'Fuera de Monteros - cerca',
          keywords: ['santa lucia', 'santalucia', 'villa quinteros'],
          costo_envio: 1500,
          tiempo_estimado_min: 40,
          activa: true,
        },
        {
          id: 'extendida',
          nombre: 'Fuera de Monteros - extendida',
          keywords: ['ruta', 'km', 'afuera', 'rio seco', 'famailla', 'concepcion'],
          costo_envio: 2500,
          tiempo_estimado_min: 55,
          activa: true,
        },
      ]);
      db.prepare(
        "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('delivery_zonas', ?)"
      ).run(defaultZonas);
      db.prepare(
        "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('costo_envio_base', ?)"
      ).run('0');
      db.prepare(
        "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('tiempo_delivery', ?)"
      ).run('25');
    }
  } catch {}

  migrateMoneyColumns(db);
}

function migrateMoneyColumns(db) {
  const moneyColumns = [
    { table: 'personal', column: 'monto_base' },
    { table: 'personal_liquidaciones', column: 'unidades' },
    { table: 'personal_liquidaciones', column: 'monto_base' },
    { table: 'personal_liquidaciones', column: 'monto_bruto' },
    { table: 'personal_liquidaciones', column: 'total_adelantos' },
    { table: 'personal_liquidaciones', column: 'total_descuentos' },
    { table: 'personal_liquidaciones', column: 'total_consumos' },
    { table: 'personal_liquidaciones', column: 'monto_neto' },
    { table: 'personal_movimientos', column: 'monto' },
    { table: 'personal_movimientos', column: 'saldo_pendiente' },
    { table: 'personal_liquidacion_items', column: 'monto_original' },
    { table: 'personal_liquidacion_items', column: 'monto_aplicado' },
    { table: 'personal_liquidacion_items', column: 'saldo_restante' },
    { table: 'personal_objetivos', column: 'objetivo' },
    { table: 'personal_objetivos', column: 'progreso' },
    { table: 'personal_objetivos', column: 'premio_monto' },
    { table: 'productos', column: 'precio' },
    { table: 'productos', column: 'costo' },
    { table: 'clientes', column: 'total_gastado' },
    { table: 'pedidos', column: 'subtotal' },
    { table: 'pedidos', column: 'costo_envio' },
    { table: 'pedidos', column: 'descuento' },
    { table: 'pedidos', column: 'total' },
    { table: 'cierres_caja', column: 'monto_inicial' },
    { table: 'cierres_caja', column: 'monto_final_declarado' },
    { table: 'cierres_caja', column: 'efectivo_esperado' },
    { table: 'cierres_caja', column: 'diferencia' },
    { table: 'caja_movimientos', column: 'monto' },
    { table: 'cupones', column: 'valor_descuento' },
    { table: 'cupones', column: 'minimo_compra' },
    { table: 'cupones', column: 'descuento_maximo' },
    { table: 'cupones_usados', column: 'monto_descuento' },
    { table: 'pedido_items', column: 'cantidad' },
    { table: 'pedido_items', column: 'precio_unitario' },
    { table: 'pedido_items', column: 'subtotal' },
    { table: 'inventario_compras', column: 'total' },
    { table: 'inventario_compra_items', column: 'cantidad' },
    { table: 'inventario_compra_items', column: 'costo_unitario' },
    { table: 'inventario_compra_items', column: 'subtotal' },
    { table: 'marketing_promos', column: 'valor' },
    { table: 'marketing_campanas', column: 'presupuesto_estimado' },
    { table: 'marketing_atribuciones', column: 'amount' },
    { table: 'fidelizacion_config', column: 'pesos_por_punto' },
    { table: 'fidelizacion_config', column: 'valor_punto_real' },
    { table: 'fidelizacion_config', column: 'monto_minimo_sello' },
    { table: 'puntos_transacciones', column: 'puntos' },
    { table: 'puntos_transacciones', column: 'puntos_disponibles' },
    { table: 'fidelizacion_niveles', column: 'gasto_minimo_anual' },
    { table: 'fidelizacion_niveles', column: 'envio_gratis_minimo' },
    { table: 'cliente_niveles_historial', column: 'gasto_calculado' },
    { table: 'carritos_abandonados', column: 'total' },
    { table: 'whatsapp_pedidos_borrador', column: 'subtotal' },
    { table: 'whatsapp_pedidos_borrador', column: 'costo_envio' },
    { table: 'whatsapp_pedidos_borrador', column: 'total' },
    { table: 'whatsapp_pedidos_borrador_items', column: 'precio_unitario' },
    { table: 'personal_categorias', column: 'sueldo_base_minimo' },
    { table: 'personal_carrera_historial', column: 'sueldo_anterior' },
    { table: 'personal_carrera_historial', column: 'sueldo_nuevo' },
    { table: 'personal_reconocimientos_config', column: 'recompensa_canje_pesos' },
    { table: 'menu_dia_historial', column: 'precio' },
    { table: 'menu_dia_historial', column: 'stock_directo' },
    { table: 'inventario_insumos', column: 'costo_unitario' },
  ];

  for (const { table, column } of moneyColumns) {
    try {
      const columns = db.prepare(`PRAGMA table_info(${table})`).all();
      const colInfo = columns.find((c) => c.name === column);
      if (!colInfo) continue;
      const type = String(colInfo.type || '').toLowerCase();
      if (!type.includes('real') && !type.includes('float') && !type.includes('double')) {
        continue; // Ya es integer o no es real
      }

      const oldName = `${column}_oldreal`;
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN ${column} TO ${oldName}`).run();
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER DEFAULT 0`).run();
      db.prepare(`UPDATE ${table} SET ${column} = ROUND(COALESCE(${oldName}, 0) * 100)`).run();
      db.prepare(`ALTER TABLE ${table} DROP COLUMN ${oldName}`).run();
      logger.info(`Migrado ${table}.${column} de REAL a INTEGER (cents)`);
    } catch (e) {
      logger.error(`Error migrando ${table}.${column}`, { message: e.message });
    }
  }
}

module.exports = { runMigrations };

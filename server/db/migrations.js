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
  ensureColumn(db, 'repartidores', 'fcm_device_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'fcm_device_label', "TEXT DEFAULT ''");
  ensureColumn(db, 'repartidores', 'fcm_permission', "TEXT DEFAULT ''");
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
  ensureColumn(db, 'pedidos', 'direccion_barrio_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'direccion_barrio_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'direccion_manzana_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'direccion_manzana', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'direccion_casa', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'direccion_origen', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'direccion_confianza', 'REAL DEFAULT 0');
  ensureColumn(db, 'pedidos', 'entrega_foto', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'entrega_foto_en', 'TEXT');
  ensureColumn(db, 'pedidos', 'inventario_aplicado', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'inventario_revertido', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'repartidor_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'repartidor_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'mozo_usuario_id', 'INTEGER');
  ensureColumn(db, 'pedidos', 'mozo_nombre', "TEXT DEFAULT ''");
  ensureColumn(db, 'pedidos', 'idempotency_key', "TEXT DEFAULT ''");
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotency
      ON pedidos(idempotency_key)
      WHERE TRIM(COALESCE(idempotency_key, '')) != ''
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_mozo_idempotency
      ON pedidos(mozo_usuario_id, idempotency_key)
      WHERE mozo_usuario_id IS NOT NULL AND idempotency_key <> ''
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_whatsapp_idempotency
    ON pedidos(idempotency_key)
    WHERE origen = 'whatsapp' AND idempotency_key <> ''
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS mesas_asignaciones (
      mesa TEXT PRIMARY KEY,
      mozo_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      mozo_nombre TEXT NOT NULL DEFAULT '',
      asignada_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizada_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
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
  ensureColumn(db, 'whatsapp_conversaciones', 'bot_silenciado_hasta', 'DATETIME');
  ensureColumn(db, 'whatsapp_conversaciones', 'resumen_texto', "TEXT DEFAULT ''");
  ensureColumn(db, 'whatsapp_conversaciones', 'resumen_hasta_mensaje_id', 'INTEGER DEFAULT 0');
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

  // ── Tokens de propuesta del asistente (anti-replay) ──────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens_propuesta (
      token_hash TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      accion TEXT NOT NULL,
      consumido_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tokens_propuesta_usuario
    ON tokens_propuesta(usuario_id, consumido_en DESC)
  `);

  // Limpieza automática de tokens viejos (más de 1 hora)
  db.exec(`
    DELETE FROM tokens_propuesta
    WHERE consumido_en < datetime('now', '-1 hour')
  `);

  // ── Auditoría del asistente de IA ────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS auditoria_ia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL,
      usuario_nombre TEXT DEFAULT '',
      tipo TEXT NOT NULL DEFAULT 'consulta',
      pregunta TEXT DEFAULT '',
      respuesta TEXT DEFAULT '',
      herramientas_usadas TEXT DEFAULT '[]',
      accion TEXT DEFAULT '',
      proveedor TEXT DEFAULT '',
      modelo TEXT DEFAULT '',
      duracion_ms INTEGER DEFAULT 0,
      fallback INTEGER DEFAULT 0,
      proveedor_original TEXT DEFAULT '',
      error TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auditoria_ia_usuario
    ON auditoria_ia(usuario_id, creado_en DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_auditoria_ia_tipo
    ON auditoria_ia(tipo, creado_en DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS agente_metricas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE SET NULL,
      telefono TEXT DEFAULT '',
      mensaje_id TEXT DEFAULT '',
      latencia_ms INTEGER DEFAULT 0,
      tokens_entrada INTEGER DEFAULT 0,
      tokens_salida INTEGER DEFAULT 0,
      proveedor TEXT DEFAULT '',
      modelo TEXT DEFAULT '',
      herramientas TEXT DEFAULT '[]',
      error TEXT DEFAULT '',
      handoff INTEGER DEFAULT 0,
      pedido_creado INTEGER DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_agente_metricas_conversacion
      ON agente_metricas(conversacion_id, creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_agente_metricas_fecha
      ON agente_metricas(creado_en DESC);
  `);

  // Limpieza automática de auditoría vieja (más de 90 días)
  db.exec(`
    DELETE FROM auditoria_ia
    WHERE creado_en < datetime('now', '-90 days')
  `);

  // Un renglon por cada transicion de estado.
  db.exec(`
    DELETE FROM tokens_propuesta
    WHERE consumido_en < datetime('now', '-1 hour')
  `);
  // Un renglon por cada transicion de estado. Permite responder
  // "por que este pedido tardo 50 minutos" y alimentar los reportes
  // de delivery (tiempo promedio por rider, por zona, por franja).
  //
  // Se guarda como tabla aparte en vez de columnas en `pedidos` porque:
  //  - un pedido puede volver a un estado anterior (deshacer entrega)
  //  - queremos saber QUIEN hizo cada cambio, no solo cuando
  //  - no ensucia la tabla principal con 6+ columnas de timestamp
  db.exec(`
    CREATE TABLE IF NOT EXISTS pedido_eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER NOT NULL,
      estado TEXT NOT NULL,
      estado_anterior TEXT DEFAULT '',
      actor_tipo TEXT DEFAULT 'sistema',
      actor_id INTEGER,
      actor_nombre TEXT DEFAULT '',
      motivo TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pedido_eventos_pedido
    ON pedido_eventos(pedido_id, creado_en)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_pedido_eventos_estado_fecha
    ON pedido_eventos(estado, creado_en DESC)
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rider_solicitudes_soporte (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repartidor_id INTEGER NOT NULL,
      pedido_id INTEGER,
      tipo TEXT NOT NULL DEFAULT 'ayuda',
      mensaje TEXT NOT NULL DEFAULT '',
      latitud REAL,
      longitud REAL,
      estado TEXT NOT NULL DEFAULT 'abierta',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      resuelto_en DATETIME
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_rider_soporte_estado ON rider_solicitudes_soporte(estado, creado_en DESC)`
  );

  // ── Cache de geocoding ──────────────────────────────────────────
  // Convertir "Urquiza 58" en lat/lng cuesta una llamada de red con
  // rate limit de 1/seg. Como las direcciones se repiten muchísimo
  // (mismos clientes, mismas calles), cachearlas hace que a partir de
  // la segunda vez sea instantáneo y sin red.
  db.exec(`
    CREATE TABLE IF NOT EXISTS geocoding_cache (
      clave TEXT PRIMARY KEY,
      direccion_original TEXT NOT NULL,
      latitud REAL NOT NULL,
      longitud REAL NOT NULL,
      precision_geocoding TEXT DEFAULT '',
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Marcamos qué pedidos tienen coordenadas puestas por geocoding (a
  // diferencia de las que compartió el cliente). Sirve para distinguir
  // en el admin cuáles conviene revisar a mano.
  ensureColumn(db, 'pedidos', 'cliente_geocodificado', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedidos', 'cliente_geocoding_precision', "TEXT DEFAULT ''");

  // ── Direcciones estructuradas ──────────────────────────────────
  // Barrios/manzanas/casas conocidas por el local. Cuando una casa
  // tiene punto confirmado, el sistema usa ese GPS antes que geocoding
  // externo. Si todavía no lo tiene, conserva la dirección escrita y
  // permite completar coordenadas exactas más adelante.
  db.exec(`
    CREATE TABLE IF NOT EXISTS direccion_barrios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      aliases TEXT DEFAULT '[]',
      localidad TEXT DEFAULT 'Monteros',
      provincia TEXT DEFAULT 'Tucuman',
      centro_lat REAL,
      centro_lng REAL,
      poligono TEXT DEFAULT '[]',
      activo INTEGER DEFAULT 1,
      notas TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS direccion_manzanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id INTEGER NOT NULL,
      letra TEXT NOT NULL,
      latitud REAL,
      longitud REAL,
      cantidad_casas INTEGER DEFAULT 0,
      casas_validas TEXT DEFAULT '[]',
      poligono TEXT DEFAULT '[]',
      notas TEXT DEFAULT '',
      activo INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(barrio_id, letra),
      FOREIGN KEY (barrio_id) REFERENCES direccion_barrios(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS direccion_casas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barrio_id INTEGER NOT NULL,
      manzana_id INTEGER NOT NULL,
      casa TEXT NOT NULL,
      latitud REAL,
      longitud REAL,
      origen TEXT DEFAULT 'manual_confirmado',
      confianza REAL DEFAULT 1,
      precision_m REAL,
      observaciones INTEGER DEFAULT 0,
      notas TEXT DEFAULT '',
      activo INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(barrio_id, manzana_id, casa),
      FOREIGN KEY (barrio_id) REFERENCES direccion_barrios(id) ON DELETE CASCADE,
      FOREIGN KEY (manzana_id) REFERENCES direccion_manzanas(id) ON DELETE CASCADE
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS direccion_observaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      barrio_id INTEGER,
      manzana_id INTEGER,
      casa TEXT DEFAULT '',
      latitud REAL NOT NULL,
      longitud REAL NOT NULL,
      accuracy_m REAL,
      origen TEXT DEFAULT 'rider_entregado',
      estado TEXT DEFAULT 'pendiente',
      notas TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL,
      FOREIGN KEY (barrio_id) REFERENCES direccion_barrios(id) ON DELETE SET NULL,
      FOREIGN KEY (manzana_id) REFERENCES direccion_manzanas(id) ON DELETE SET NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_direccion_manzanas_barrio
    ON direccion_manzanas(barrio_id, activo, letra)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_direccion_casas_lookup
    ON direccion_casas(barrio_id, manzana_id, casa, activo)
  `);

  try {
    const upsertBarrio = db.prepare(
      `
      INSERT INTO direccion_barrios
        (nombre, aliases, localidad, provincia, notas)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(nombre) DO UPDATE SET
        aliases = excluded.aliases,
        localidad = excluded.localidad,
        provincia = excluded.provincia,
        notas = excluded.notas,
        activo = 1,
        actualizado_en = CURRENT_TIMESTAMP
    `
    );

    const getBarrio = db.prepare('SELECT id FROM direccion_barrios WHERE nombre = ?');
    const upsertManzana = db.prepare(
      `
      INSERT INTO direccion_manzanas
        (barrio_id, letra, cantidad_casas, casas_validas, notas)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(barrio_id, letra) DO UPDATE SET
        cantidad_casas = excluded.cantidad_casas,
        casas_validas = excluded.casas_validas,
        notas = excluded.notas,
        activo = 1,
        actualizado_en = CURRENT_TIMESTAMP
    `
    );

    const seedBarrio = ({ nombre, aliases = [], notas = '', manzanas = [] }) => {
      upsertBarrio.run(nombre, JSON.stringify(aliases), 'Monteros', 'Tucuman', notas);
      const barrio = getBarrio.get(nombre);
      if (!barrio?.id) return;
      manzanas.forEach(({ letra, casas = 0, notas: notasManzana = '' }) => {
        const cantidad = Math.max(0, Number(casas || 0));
        const casasValidas =
          cantidad > 0 ? Array.from({ length: cantidad }, (_, index) => String(index + 1)) : [];
        upsertManzana.run(
          barrio.id,
          String(letra || '')
            .trim()
            .toUpperCase(),
          cantidad,
          JSON.stringify(casasValidas),
          notasManzana ||
            'Plano preliminar: pendiente marcar centro/manzana y puntos exactos de casas.'
        );
      });
    };

    seedBarrio({
      nombre: 'Barrio 150 Viviendas',
      aliases: ['150 viviendas', 'b 150 viviendas', 'barrio 150', '150 viv'],
      notas:
        'Piloto cargado desde plano local: entre Rivadavia, 24 de Septiembre, Urquiza y Las Heras/Salta. Coordenadas exactas pendientes de confirmacion.',
      manzanas: [
        { letra: 'A', casas: 34 },
        { letra: 'B', casas: 8 },
        { letra: 'C', casas: 40 },
        { letra: 'D', casas: 20 },
        { letra: 'E', casas: 23 },
        { letra: 'F', casas: 28 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 40 Viviendas Omodedo',
      aliases: ['40 viviendas', 'b 40 viviendas', 'barrio 40', 'omodedo', 'omodeo'],
      notas:
        'Plano preliminar compartido: Omodedo / Cristo / Santa Fe / 25 de Mayo. Algunas letras aparecen repetidas en sectores; se cargan como sectores para no pisar datos.',
      manzanas: [
        { letra: 'A', casas: 18 },
        { letra: 'B', casas: 18 },
        { letra: 'C', casas: 18 },
        { letra: 'D', casas: 18 },
        { letra: 'E', casas: 18 },
        { letra: 'F1', casas: 18 },
        { letra: 'F2', casas: 18 },
        { letra: 'G1', casas: 18 },
        { letra: 'G2', casas: 18 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 69 Viviendas',
      aliases: ['69 viviendas', 'b 69 viviendas', 'barrio 69'],
      notas:
        'Plano preliminar Remis La Union. Pendiente limpiar duplicados con mapa final y confirmar conteo por manzana.',
      manzanas: [
        { letra: 'A', casas: 24 },
        { letra: 'B', casas: 16 },
        { letra: 'C', casas: 14 },
        { letra: 'D', casas: 24 },
        { letra: 'E', casas: 18 },
        { letra: 'F', casas: 18 },
        { letra: 'G', casas: 25 },
        { letra: 'H', casas: 28 },
        { letra: 'I', casas: 12 },
        { letra: 'J', casas: 20 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 100 Viviendas',
      aliases: ['100 viviendas', 'b 100 viviendas', 'barrio 100'],
      notas:
        'Plano preliminar junto a 69 Viviendas y Alberdi/Maipu. Coordenadas exactas pendientes.',
      manzanas: [
        { letra: 'D', casas: 13 },
        { letra: 'E', casas: 15 },
        { letra: 'F', casas: 18 },
        { letra: 'G', casas: 25 },
        { letra: 'H', casas: 28 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 50 Viviendas',
      aliases: ['50 viviendas', 'b 50 viviendas', 'barrio 50'],
      notas:
        'Plano preliminar sector Santa Fe / Alberdi. Pendiente confirmar si comparte hojas con 69 Viviendas.',
      manzanas: [
        { letra: 'A', casas: 24 },
        { letra: 'B', casas: 20 },
        { letra: 'C', casas: 8 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 34 Viviendas',
      aliases: ['34 viviendas', 'b 34 viviendas', 'barrio 34'],
      notas: 'Plano preliminar sector Santa Fe. Pendiente confirmar manzanas finales.',
      manzanas: [
        { letra: 'I', casas: 12 },
        { letra: 'J', casas: 20 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio Mutual',
      aliases: ['mutual', 'b mutual', 'barrio mutual'],
      notas:
        'Plano preliminar: avenida central, Ruta 325, plaza y manzanas A-E. Sin numeracion completa en imagen.',
      manzanas: [
        { letra: 'A', casas: 0 },
        { letra: 'B', casas: 0 },
        { letra: 'C', casas: 0 },
        { letra: 'D', casas: 0 },
        { letra: 'E', casas: 0 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 48 Viviendas',
      aliases: ['48 viviendas', 'b 48 viviendas', 'barrio 48'],
      notas:
        'Plano general compartido, sector calles 4/6/8/10/12. Pendiente cargar manzanas exactas.',
      manzanas: [
        { letra: 'MZA 1', casas: 0 },
        { letra: 'MZA 2A', casas: 0 },
        { letra: 'MZA 2B', casas: 0 },
      ],
    });

    seedBarrio({
      nombre: 'Barrio 105 Viviendas',
      aliases: ['105 viviendas', 'b 105 viviendas', 'barrio 105'],
      notas: 'Plano general compartido. Pendiente cargar manzanas exactas.',
      manzanas: [],
    });
  } catch (e) {
    logger.error('Error al sembrar direcciones estructuradas', { message: e.message });
  }
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

  // Los turnos pertenecen a cada ficha de Personal. No se deben reescribir por
  // nombre al iniciar el servidor: eso impedía que el encargado corrigiera un
  // cambio de horario desde la interfaz.

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

  // Agosto 2026: el local extendió el turno noche hasta las 02:00. Solo se
  // migra el horario anterior exacto; cualquier horario personalizado del
  // dueño se conserva intacto.
  try {
    const row = db.prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'").get();
    const turnos = JSON.parse(row?.valor || '[]');
    let changed = false;
    if (Array.isArray(turnos)) {
      turnos.forEach((turno) => {
        if (turno?.id === 'noche' && turno?.desde === '20:30' && turno?.hasta === '01:30') {
          turno.hasta = '02:00';
          changed = true;
        }
      });
    }
    if (changed) {
      db.prepare("UPDATE configuracion SET valor = ? WHERE clave = 'turnos_negocio'").run(
        JSON.stringify(turnos)
      );
    }
  } catch (e) {
    logger.error('Error al extender el turno nocturno', { message: e.message });
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
      // Modo Sabor reparte gratis en todo Monteros: las tres zonas van en 0.
      // Antes 'cerca' y 'extendida' se escribian con 1500 y 2500.
      const defaultZonas = JSON.stringify([
        {
          id: 'monteros',
          nombre: 'Monteros',
          keywords: ['monteros', 'centro', 'casco centrico', 'las piedras'],
          catchAll: true,
          costo_envio: 0,
          tiempo_estimado_min: 25,
          activa: true,
        },
        {
          id: 'cerca',
          nombre: 'Fuera de Monteros - cerca',
          keywords: ['santa lucia', 'santalucia', 'villa quinteros'],
          costo_envio: 0,
          tiempo_estimado_min: 40,
          activa: true,
        },
        {
          id: 'extendida',
          nombre: 'Fuera de Monteros - extendida',
          keywords: ['ruta', 'km', 'afuera', 'rio seco', 'famailla', 'concepcion'],
          costo_envio: 0,
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

  crearTablasWhatsapp(db);
  migrateMoneyColumns(db);
  migrarUmbralesDeNivel(db);
  migrarPuntosInflados(db);
  // Va después de `db.exec(tableStatements)` en db/index.js, así que
  // `opcion_listas` ya existe cuando esto corre.
  migrarGuarnicionesAListaCompartida(db);
  migrarTamanosDelMenuDia(db);
}

/**
 * Divide por 100 los puntos acumulados con la regla vieja.
 *
 * ── Qué había pasado ───────────────────────────────────────────────────────
 *
 * `calcularPuntos` dividía el total del pedido —en centavos— por
 * `pesos_por_punto`, que se configura en pesos. Con $100 por punto, una compra
 * de $10.000 daba 10.000 puntos en vez de 100.
 *
 * Como cada punto vale plata al canjearlo, esos saldos representan cien veces
 * lo que corresponde. Corregir la cuenta sin tocar los saldos dejaría a los
 * clientes viejos con una fortuna en puntos.
 *
 * ── Por qué una marca en configuración y no una comprobación de los datos ──
 *
 * No hay forma de mirar un saldo y saber si se generó con la regla vieja o la
 * nueva: 5.000 puntos puede ser un cliente viejo con $50 de compras o uno nuevo
 * con $500.000. Por eso se deja una marca de que esto ya corrió. Sin ella, cada
 * reinicio del servidor volvería a dividir y en una semana no quedarían puntos.
 */
function migrarPuntosInflados(db) {
  const MARCA = 'migracion_puntos_100x';
  try {
    const yaCorrio = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(MARCA);
    if (yaCorrio) return;

    const totales = db.prepare('SELECT COALESCE(SUM(puntos), 0) AS total FROM clientes').get();

    db.prepare('UPDATE clientes SET puntos = CAST(puntos / 100 AS INTEGER) WHERE puntos > 0').run();

    /*
      El libro de transacciones también se reescala. Si sólo se ajustara el
      saldo del cliente, la próxima vez que se recalcule desde el historial
      volvería el número inflado.
    */
    try {
      db.prepare(
        'UPDATE puntos_transacciones SET puntos = CAST(puntos / 100 AS INTEGER) WHERE ABS(puntos) >= 100'
      ).run();
    } catch {
      // La tabla puede no existir en instalaciones viejas.
    }

    db.prepare('INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)').run(
      MARCA,
      new Date().toISOString()
    );
    logger.info(
      `Puntos de fidelidad reescalados: habia ${totales.total} puntos con la regla vieja`
    );
  } catch (error) {
    logger.error('Error reescalando los puntos de fidelidad', { message: error.message });
  }
}

/**
 * Corrige los umbrales de los niveles de fidelidad, que estaban en pesos
 * cuando el sistema los compara contra centavos.
 *
 * ── Qué pasaba ─────────────────────────────────────────────────────────────
 *
 * `recalcularNivelCliente` compara `gasto_minimo_anual` contra la suma de
 * `pedidos.total`, que está en centavos. Los valores originales eran 50000,
 * 150000 y 300000, escritos pensando en pesos. El sistema los leía como $500,
 * $1.500 y $3.000 de gasto anual.
 *
 * Resultado: un cliente con tres pedidos llegaba a Platino y se llevaba el
 * multiplicador x3 de puntos, envío gratis siempre y el beneficio de
 * cumpleaños. Plata se alcanzaba con un solo pedido.
 *
 * ── Por qué así y no con un factor ─────────────────────────────────────────
 *
 * Se corrigen sólo los valores exactos que dejó el seed viejo. Multiplicar por
 * 100 todo lo que haya sería peligroso: si alguien ya los corrigió a mano desde
 * el panel, quedarían cien veces más altos y nadie alcanzaría ningún nivel.
 *
 * Al tocar los umbrales cambian los niveles de los clientes existentes. El
 * recálculo no se hace acá: se dispara solo la próxima vez que cada cliente
 * recibe un pedido, o desde el botón de recalcular en el panel.
 */
function migrarUmbralesDeNivel(db) {
  const correcciones = [
    { nombre: 'Plata', viejo: 50000, nuevo: 5000000, envioViejo: 8000, envioNuevo: 800000 },
    { nombre: 'Oro', viejo: 150000, nuevo: 15000000 },
    { nombre: 'Platino', viejo: 300000, nuevo: 30000000 },
  ];

  try {
    correcciones.forEach(({ nombre, viejo, nuevo, envioViejo, envioNuevo }) => {
      const cambio = db
        .prepare(
          'UPDATE fidelizacion_niveles SET gasto_minimo_anual = ? WHERE nombre = ? AND gasto_minimo_anual = ?'
        )
        .run(nuevo, nombre, viejo);
      if (cambio.changes > 0) {
        logger.info(`Umbral de ${nombre} corregido a centavos`);
      }
      if (envioViejo !== undefined) {
        db.prepare(
          'UPDATE fidelizacion_niveles SET envio_gratis_minimo = ? WHERE nombre = ? AND envio_gratis_minimo = ?'
        ).run(envioNuevo, nombre, envioViejo);
      }
    });
  } catch (error) {
    logger.error('Error corrigiendo los umbrales de nivel', { message: error.message });
  }
}

/**
 * Pasa las guarniciones del menú del día a la lista compartida.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 *
 * El menú del día tenía su propia lista maestra de guarniciones guardada en
 * `configuracion.menu_dia_guarniciones_lista`, como un array de nombres. Al
 * agregarse las listas compartidas —que sirven para toda la carta— quedaron
 * dos lugares donde cargar la misma guarnición, y ninguna forma de saber cuál
 * mandaba.
 *
 * Esto copia esos nombres a la lista compartida "Guarniciones" una sola vez.
 * A partir de ahí, agregar una guarnición desde Operación la deja disponible
 * también para las milanesas y las supremas.
 *
 * ── Qué NO hace ────────────────────────────────────────────────────────────
 *
 * No borra la clave vieja de `configuracion`. Queda como red: si algo sale
 * mal, el menú del día vuelve a leer de ahí y sigue funcionando. Borrarla es
 * una decisión para cuando esto lleve un tiempo andando, no para el mismo día
 * en que se migra.
 *
 * Tampoco toca las guarniciones ya elegidas en cada plato: eso es una decisión
 * por plato —la Costillita ofrece siete y las Albóndigas seis— y no una copia.
 */
/**
 * Un plato del menú del día puede venderse en los dos tamaños el mismo día.
 *
 * ── Por qué ────────────────────────────────────────────────────────────────
 *
 * `productos.menu_dia_tipo` guarda **un solo valor**: o económico o ejecutivo.
 * Pero la misma suprema puede salir a $5.000 en porción chica y a $7.000 en
 * grande, el mismo día. Con un solo campo eso no se puede decir, y la única
 * salida era cargar el plato dos veces —que es de donde salen los duplicados
 * que hay en la carta: "Canelón" y "Canelones", "Suprema a la napolitana" y
 * "Suprema napolitana".
 *
 * Estas dos columnas van en el historial y no en el producto porque el precio
 * del menú del día es del día, no del plato: mañana el ejecutivo puede valer
 * otra cosa.
 *
 * ── Compatible con lo que ya está ──────────────────────────────────────────
 *
 * Si las dos quedan en NULL, se usa `precio` y `menu_dia_tipo` como siempre.
 * Los 46 renglones que ya existen siguen leyéndose igual.
 */
function migrarTamanosDelMenuDia(db) {
  ensureColumn(db, 'menu_dia_historial', 'precio_economico', 'INTEGER DEFAULT NULL');
  ensureColumn(db, 'menu_dia_historial', 'precio_ejecutivo', 'INTEGER DEFAULT NULL');
}

function migrarGuarnicionesAListaCompartida(db) {
  try {
    const yaExiste = db
      .prepare("SELECT id FROM opcion_listas WHERE LOWER(nombre) = 'guarniciones'")
      .get();
    if (yaExiste) return;

    const fila = db
      .prepare("SELECT valor FROM configuracion WHERE clave = 'menu_dia_guarniciones_lista'")
      .get();
    if (!fila?.valor) return;

    let nombres;
    try {
      nombres = JSON.parse(fila.valor);
    } catch {
      return;
    }
    const limpios = (Array.isArray(nombres) ? nombres : [])
      .map((valor) => String(valor || '').trim())
      .filter(Boolean);
    if (limpios.length === 0) return;

    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO opcion_listas (nombre, tipo, obligatorio, orden, activo) VALUES ('Guarniciones', 'variante', 1, 0, 1)"
      )
      .run();
    const insertar = db.prepare(
      'INSERT INTO opcion_items (lista_id, nombre, precio, orden, activo) VALUES (?, ?, 0, ?, 1)'
    );
    limpios.forEach((nombre, indice) => insertar.run(lastInsertRowid, nombre, indice));

    logger.info(`Guarniciones del menú del día migradas a la lista compartida (${limpios.length})`);
  } catch (error) {
    // Que esto falle no puede impedir que arranque el sistema: sin la lista,
    // el menú del día sigue leyendo la clave vieja de `configuracion`.
    logger.error('No se pudieron migrar las guarniciones a la lista compartida', {
      message: error.message,
    });
  }
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

/**
 * Tablas del envío masivo de WhatsApp.
 *
 * Van acá y no en schema.sql porque schema.sql tiene los saltos de línea de
 * Windows y tocarlo ensucia el diff con 850 líneas que no cambiaron.
 *
 * ── Por qué los contactos NO tienen tabla propia ───────────────────────────
 *
 * La lista sale de `clientes`, que son los que compraron de verdad. La app
 * anterior armaba la lista escrapeando los chats de WhatsApp, y por eso
 * terminaba mandándole la promo del menú del día a Personal, a +Pagos y a un
 * catering: cualquiera que alguna vez hubiera escrito al número.
 *
 * Acá sólo se guarda lo que `clientes` no sabe: quién pidió la baja y qué se
 * le mandó a cada uno.
 */
function crearTablasWhatsapp(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_excluidos (
      telefono TEXT PRIMARY KEY,
      motivo TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wa_campanas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT DEFAULT '',
      mensaje TEXT NOT NULL,
      imagen TEXT DEFAULT '',
      -- borrador | enviando | pausada | terminada | cancelada
      estado TEXT DEFAULT 'borrador',
      simulacro INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      enviados INTEGER DEFAULT 0,
      fallidos INTEGER DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      iniciado_en DATETIME,
      terminado_en DATETIME
    );

    CREATE TABLE IF NOT EXISTS wa_envios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campana_id INTEGER REFERENCES wa_campanas(id) ON DELETE CASCADE,
      cliente_id INTEGER,
      telefono TEXT NOT NULL,
      nombre TEXT DEFAULT '',
      -- pendiente | enviado | fallido | salteado
      estado TEXT DEFAULT 'pendiente',
      error TEXT DEFAULT '',
      enviado_en DATETIME,
      UNIQUE(campana_id, telefono)
    );

    CREATE TABLE IF NOT EXISTS wa_respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT NOT NULL,
      texto TEXT DEFAULT '',
      es_baja INTEGER DEFAULT 0,
      recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- El cupo por ventana pregunta "cuántos salieron en los últimos 60
    -- minutos" antes de cada mensaje. Sin índice eso recorre la tabla entera
    -- ciento cincuenta veces por corrida.
    CREATE INDEX IF NOT EXISTS idx_wa_envios_fecha ON wa_envios(enviado_en);
    CREATE INDEX IF NOT EXISTS idx_wa_envios_campana ON wa_envios(campana_id);
    CREATE INDEX IF NOT EXISTS idx_wa_respuestas_fecha ON wa_respuestas(recibido_en);
  `);
}

module.exports = { runMigrations };

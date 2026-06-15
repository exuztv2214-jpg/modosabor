const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { dbFile, ensureStoragePaths } = require('./utils/storagePaths');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  shouldAutoSettleOnEntrega,
} = require('./utils/paymentStatus');
const { backfillPedidoItems } = require('./utils/pedidoItems');

ensureStoragePaths();
const db = new Database(dbFile);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function hasColumn(table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((item) => item.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT DEFAULT 'admin',
    activo INTEGER DEFAULT 1,
    avatar TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS configuracion (
    clave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS crm_campanas_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    segmento TEXT NOT NULL,
    titulo TEXT DEFAULT '',
    mensaje TEXT DEFAULT '',
    total_clientes INTEGER DEFAULT 0,
    cliente_ids TEXT DEFAULT '[]',
    enviados_ok INTEGER DEFAULT 0,
    enviados_error INTEGER DEFAULT 0,
    ultimo_resultado TEXT DEFAULT '[]',
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repartidores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    vehiculo TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    disponible INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS personal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rol_operativo TEXT NOT NULL DEFAULT 'cocina',
    telefono TEXT DEFAULT '',
    turno_preferido TEXT DEFAULT '',
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    frecuencia_pago TEXT DEFAULT 'mensual',
    monto_base REAL DEFAULT 0,
    medio_pago_preferido TEXT DEFAULT 'efectivo',
    activo INTEGER DEFAULT 1,
    notas TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS personal_liquidaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    periodo_desde TEXT DEFAULT '',
    periodo_hasta TEXT DEFAULT '',
    frecuencia_pago TEXT DEFAULT 'mensual',
    unidades REAL DEFAULT 1,
    monto_base REAL DEFAULT 0,
    monto_bruto REAL DEFAULT 0,
    total_adelantos REAL DEFAULT 0,
    total_descuentos REAL DEFAULT 0,
    total_consumos REAL DEFAULT 0,
    monto_neto REAL DEFAULT 0,
    metodo_pago TEXT DEFAULT 'efectivo',
    caja_movimiento_id INTEGER REFERENCES caja_movimientos(id) ON DELETE SET NULL,
    notas TEXT DEFAULT '',
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS personal_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL DEFAULT 'descuento',
    descripcion TEXT DEFAULT '',
    monto REAL NOT NULL DEFAULT 0,
    saldo_pendiente REAL NOT NULL DEFAULT 0,
    estado TEXT DEFAULT 'pendiente',
    insumo_id INTEGER REFERENCES inventario_insumos(id) ON DELETE SET NULL,
    cantidad_insumo REAL DEFAULT 0,
    caja_movimiento_id INTEGER REFERENCES caja_movimientos(id) ON DELETE SET NULL,
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS personal_liquidacion_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    liquidacion_id INTEGER NOT NULL REFERENCES personal_liquidaciones(id) ON DELETE CASCADE,
    movimiento_id INTEGER REFERENCES personal_movimientos(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT '',
    descripcion TEXT DEFAULT '',
    monto_original REAL DEFAULT 0,
    monto_aplicado REAL DEFAULT 0,
    saldo_restante REAL DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    icono TEXT DEFAULT '🍽️',
    color TEXT DEFAULT '#f97316',
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    precio REAL NOT NULL DEFAULT 0,
    costo REAL DEFAULT 0,
    categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
    imagen TEXT DEFAULT '',
    variantes TEXT DEFAULT '[]',
    extras TEXT DEFAULT '[]',
    activo INTEGER DEFAULT 1,
    destacado INTEGER DEFAULT 0,
    tiempo_preparacion INTEGER DEFAULT 15,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    tags TEXT DEFAULT '[]',
    total_gastado REAL DEFAULT 0,
    total_pedidos INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cliente_direcciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    etiqueta TEXT DEFAULT 'Principal',
    direccion TEXT NOT NULL,
    referencia TEXT DEFAULT '',
    departamento TEXT DEFAULT '',
    latitud REAL,
    longitud REAL,
    principal INTEGER DEFAULT 0,
    activa INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero INTEGER UNIQUE,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_nombre TEXT DEFAULT '',
    cliente_telefono TEXT DEFAULT '',
    cliente_direccion TEXT DEFAULT '',
    items TEXT NOT NULL DEFAULT '[]',
    subtotal REAL NOT NULL DEFAULT 0,
    costo_envio REAL DEFAULT 0,
    descuento REAL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    estado TEXT DEFAULT 'nuevo',
    tipo_entrega TEXT DEFAULT 'delivery',
    mesa TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT 'efectivo',
    notas TEXT DEFAULT '',
    origen TEXT DEFAULT 'tpv',
    repartidor_id INTEGER REFERENCES repartidores(id) ON DELETE SET NULL,
    repartidor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventario_insumos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    rubro TEXT DEFAULT 'General',
    unidad TEXT DEFAULT 'u',
    stock_actual REAL DEFAULT 0,
    stock_minimo REAL DEFAULT 0,
    costo_unitario REAL DEFAULT 0,
    nota_compra TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventario_recetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES inventario_insumos(id) ON DELETE RESTRICT,
    cantidad REAL NOT NULL DEFAULT 0,
    condicion_tipo TEXT DEFAULT 'siempre',
    condicion_grupo TEXT DEFAULT '',
    condicion_valor TEXT DEFAULT '',
    orden INTEGER DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    insumo_id INTEGER REFERENCES inventario_insumos(id) ON DELETE SET NULL,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cantidad REAL NOT NULL DEFAULT 0,
    tipo TEXT DEFAULT 'ajuste',
    motivo TEXT DEFAULT '',
    detalle TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS impresiones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    area TEXT DEFAULT '',
    estado TEXT DEFAULT 'pendiente',
    copias INTEGER DEFAULT 1,
    intentos INTEGER DEFAULT 0,
    error TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    impreso_en DATETIME
  );

  CREATE TABLE IF NOT EXISTS whatsapp_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT '',
    telefono TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    proveedor TEXT DEFAULT 'manual',
    estado TEXT DEFAULT 'pendiente',
    externo_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    enviado_en DATETIME
  );

  CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telefono TEXT UNIQUE NOT NULL,
    nombre TEXT DEFAULT '',
    ultimo_estado TEXT DEFAULT 'nuevo',
    ultimo_contexto TEXT DEFAULT '',
    escalado_humano INTEGER DEFAULT 0,
    bot_silenciado INTEGER DEFAULT 0,
    ultimo_mensaje_en DATETIME,
    ultima_respuesta_en DATETIME,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE,
    telefono TEXT NOT NULL,
    direccion TEXT NOT NULL,
    tipo TEXT DEFAULT 'text',
    contenido TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_pedidos_borrador (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE CASCADE,
    telefono TEXT NOT NULL,
    cliente_nombre TEXT DEFAULT '',
    cliente_direccion TEXT DEFAULT '',
    tipo_entrega TEXT DEFAULT 'delivery',
    metodo_pago TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    estado TEXT DEFAULT 'abierto',
    subtotal REAL DEFAULT 0,
    costo_envio REAL DEFAULT 0,
    total REAL DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS whatsapp_pedidos_borrador_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrador_id INTEGER REFERENCES whatsapp_pedidos_borrador(id) ON DELETE CASCADE,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    cantidad INTEGER DEFAULT 1,
    precio_unitario REAL DEFAULT 0,
    descripcion TEXT DEFAULT '',
    variantes TEXT DEFAULT '{}',
    extras TEXT DEFAULT '[]',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cierres_caja (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estado TEXT DEFAULT 'abierta',
    abierta_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    abierta_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    abierta_por_nombre TEXT DEFAULT '',
    monto_inicial REAL DEFAULT 0,
    notas_apertura TEXT DEFAULT '',
    cerrada_en DATETIME,
    cerrada_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    cerrada_por_nombre TEXT DEFAULT '',
    monto_final_declarado REAL DEFAULT 0,
    efectivo_esperado REAL DEFAULT 0,
    diferencia REAL DEFAULT 0,
    resumen_json TEXT DEFAULT '{}',
    notas_cierre TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS caja_movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cierre_id INTEGER REFERENCES cierres_caja(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL, -- 'entrada' o 'salida' (gasto)
    monto REAL NOT NULL DEFAULT 0,
    motivo TEXT DEFAULT '',
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS auditoria_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modulo TEXT NOT NULL,
    accion TEXT NOT NULL,
    entidad TEXT DEFAULT '',
    entidad_id TEXT DEFAULT '',
    actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    actor_nombre TEXT DEFAULT '',
    detalle TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mesa_reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mesa TEXT NOT NULL,
    cliente_nombre TEXT NOT NULL,
    cliente_telefono TEXT DEFAULT '',
    cantidad_personas INTEGER DEFAULT 2,
    horario_reserva TEXT NOT NULL,
    notas TEXT DEFAULT '',
    estado TEXT DEFAULT 'reservada',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS mercadopago_eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    tipo TEXT DEFAULT '',
    payment_id TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    detalle TEXT DEFAULT '',
    payload TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_cliente_direcciones_cliente_id
  ON cliente_direcciones(cliente_id);

  CREATE TABLE IF NOT EXISTS cupones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    descripcion TEXT DEFAULT '',
    tipo_descuento TEXT NOT NULL DEFAULT 'porcentaje',
    valor_descuento REAL NOT NULL DEFAULT 0,
    minimo_compra REAL DEFAULT 0,
    descuento_maximo REAL DEFAULT 0,
    fecha_inicio DATETIME,
    fecha_fin DATETIME,
    limite_usos INTEGER DEFAULT 0,
    usos_actuales INTEGER DEFAULT 0,
    limite_por_cliente INTEGER DEFAULT 1,
    activo INTEGER DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cupones_usados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cupon_id INTEGER NOT NULL REFERENCES cupones(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    cliente_telefono TEXT DEFAULT '',
    monto_descuento REAL DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- TABLA DE DESGLOSE DE ITEMS PARA REPORTES
  CREATE TABLE IF NOT EXISTS pedido_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    cantidad REAL NOT NULL DEFAULT 1,
    precio_unitario REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0,
    variantes_json TEXT DEFAULT '{}',
    extras_json TEXT DEFAULT '[]',
    categoria_id INTEGER,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- MODULO DE COMPRAS (INGRESO DE MERCADERIA)
  CREATE TABLE IF NOT EXISTS inventario_compras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proveedor TEXT DEFAULT '',
    total REAL DEFAULT 0,
    metodo_pago TEXT DEFAULT 'efectivo',
    referencia_pago TEXT DEFAULT '',
    notas TEXT DEFAULT '',
    actor_id INTEGER REFERENCES usuarios(id),
    actor_nombre TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventario_compra_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    compra_id INTEGER NOT NULL REFERENCES inventario_compras(id) ON DELETE CASCADE,
    insumo_id INTEGER NOT NULL REFERENCES inventario_insumos(id),
    cantidad REAL NOT NULL DEFAULT 0,
    costo_unitario REAL NOT NULL DEFAULT 0,
    subtotal REAL NOT NULL DEFAULT 0
  );

  -- INDICES PARA RENDIMIENTO
  CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(creado_en);
  CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
  CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items(pedido_id);
  CREATE INDEX IF NOT EXISTS idx_pedido_items_producto ON pedido_items(producto_id);
  CREATE INDEX IF NOT EXISTS idx_caja_mov_cierre ON caja_movimientos(cierre_id);
  CREATE INDEX IF NOT EXISTS idx_personal_movimientos_personal ON personal_movimientos(personal_id, estado, creado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_personal_liquidaciones_personal ON personal_liquidaciones(personal_id, creado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_personal_liquidacion_items_liquidacion ON personal_liquidacion_items(liquidacion_id);
  CREATE INDEX IF NOT EXISTS idx_cupones_codigo ON cupones(codigo);
  CREATE INDEX IF NOT EXISTS idx_cupones_activo ON cupones(activo);
  CREATE INDEX IF NOT EXISTS idx_cupones_usados_cupon ON cupones_usados(cupon_id);
  CREATE INDEX IF NOT EXISTS idx_cupones_usados_cliente ON cupones_usados(cliente_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS marketing_promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    tipo_promo TEXT NOT NULL DEFAULT 'descuento_fijo',
    valor REAL DEFAULT 0,
    fecha_inicio TEXT DEFAULT '',
    fecha_fin TEXT DEFAULT '',
    activa INTEGER DEFAULT 1,
    canal_sugerido TEXT DEFAULT 'general',
    cupon_id INTEGER REFERENCES cupones(id) ON DELETE SET NULL,
    producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_contenidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    objetivo TEXT DEFAULT '',
    red_sugerida TEXT DEFAULT 'instagram',
    texto_corto TEXT DEFAULT '',
    texto_largo TEXT DEFAULT '',
    cta TEXT DEFAULT '',
    estado TEXT DEFAULT 'borrador',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_campanas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    objetivo TEXT DEFAULT '',
    canal TEXT DEFAULT 'instagram',
    fecha_inicio TEXT DEFAULT '',
    fecha_fin TEXT DEFAULT '',
    presupuesto_estimado REAL DEFAULT 0,
    promo_id INTEGER REFERENCES marketing_promos(id) ON DELETE SET NULL,
    contenido_id INTEGER REFERENCES marketing_contenidos(id) ON DELETE SET NULL,
    activa INTEGER DEFAULT 1,
    observaciones TEXT DEFAULT '',
    tracking_slug TEXT DEFAULT '',
    marketing_source TEXT DEFAULT '',
    marketing_medium TEXT DEFAULT '',
    marketing_campaign TEXT DEFAULT '',
    marketing_content TEXT DEFAULT '',
    whatsapp_mensaje_sugerido TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_calendario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido_id INTEGER REFERENCES marketing_contenidos(id) ON DELETE SET NULL,
    promo_id INTEGER REFERENCES marketing_promos(id) ON DELETE SET NULL,
    campana_id INTEGER REFERENCES marketing_campanas(id) ON DELETE SET NULL,
    fecha_programada TEXT NOT NULL,
    canal TEXT DEFAULT 'instagram',
    estado TEXT DEFAULT 'pendiente',
    observaciones TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_atribuciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT DEFAULT 'evento',
    marketing_campana_id INTEGER REFERENCES marketing_campanas(id) ON DELETE SET NULL,
    marketing_promo_id INTEGER REFERENCES marketing_promos(id) ON DELETE SET NULL,
    marketing_origen TEXT DEFAULT '',
    marketing_codigo TEXT DEFAULT '',
    marketing_source TEXT DEFAULT '',
    marketing_medium TEXT DEFAULT '',
    marketing_campaign TEXT DEFAULT '',
    marketing_content TEXT DEFAULT '',
    conversacion_id INTEGER REFERENCES whatsapp_conversaciones(id) ON DELETE SET NULL,
    borrador_id INTEGER REFERENCES whatsapp_pedidos_borrador(id) ON DELETE SET NULL,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    telefono TEXT DEFAULT '',
    amount REAL DEFAULT 0,
    metadata_json TEXT DEFAULT '{}',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_marketing_promos_activa ON marketing_promos(activa);
  CREATE INDEX IF NOT EXISTS idx_marketing_contenidos_estado ON marketing_contenidos(estado);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_campanas_tracking_slug ON marketing_campanas(tracking_slug);
  CREATE INDEX IF NOT EXISTS idx_marketing_campanas_activa ON marketing_campanas(activa);
  CREATE INDEX IF NOT EXISTS idx_marketing_calendario_fecha ON marketing_calendario(fecha_programada);
  CREATE INDEX IF NOT EXISTS idx_marketing_atribuciones_evento ON marketing_atribuciones(event_type, creado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_marketing_atribuciones_campana ON marketing_atribuciones(marketing_campana_id, creado_en DESC);

  CREATE TABLE IF NOT EXISTS marketing_publicador_destinos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    url TEXT NOT NULL,
    tipo TEXT DEFAULT 'grupo_facebook',
    activo INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 0,
    notas TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_publicador_publicaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    mensaje TEXT DEFAULT '',
    link_url TEXT DEFAULT '',
    media_path TEXT DEFAULT '',
    media_mime TEXT DEFAULT '',
    media_nombre TEXT DEFAULT '',
    estado TEXT DEFAULT 'borrador',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS marketing_publicador_envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publicacion_id INTEGER NOT NULL REFERENCES marketing_publicador_publicaciones(id) ON DELETE CASCADE,
    destino_id INTEGER NOT NULL REFERENCES marketing_publicador_destinos(id) ON DELETE CASCADE,
    estado TEXT DEFAULT 'pendiente',
    orden INTEGER DEFAULT 0,
    abierto_en DATETIME,
    publicado_en DATETIME,
    omitido_en DATETIME,
    notas TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_marketing_publicador_destinos_tipo ON marketing_publicador_destinos(tipo, activo, orden);
  CREATE INDEX IF NOT EXISTS idx_marketing_publicador_publicaciones_estado ON marketing_publicador_publicaciones(estado, actualizado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_marketing_publicador_envios_publicacion ON marketing_publicador_envios(publicacion_id, orden, estado);

  -- ============================================
  -- SISTEMA DE PUNTOS Y FIDELIZACIÓN
  -- ============================================

  -- Configuración del programa de puntos
  CREATE TABLE IF NOT EXISTS fidelizacion_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    pesos_por_punto REAL DEFAULT 100,        -- Cuántos pesos = 1 punto
    valor_punto_real REAL DEFAULT 10,         -- Cuánto vale 1 punto en pesos
    dias_expiracion INTEGER DEFAULT 180,      -- Días antes de que expiren puntos
    minimo_canje INTEGER DEFAULT 50,          -- Mínimo de puntos para canjear
    monto_minimo_sello REAL DEFAULT 10000,    -- Mínimo para sumar sello
    sellos_para_premio INTEGER DEFAULT 6,     -- Sellos para ganar premio
    premio_descripcion TEXT DEFAULT '1 Pizza Muzzarella', -- Bases del premio
    activo BOOLEAN DEFAULT 1,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Transacciones de puntos
  CREATE TABLE IF NOT EXISTS puntos_transacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK(tipo IN ('ganancia', 'canje', 'expiracion', 'bonus', 'ajuste')),
    puntos REAL NOT NULL,
    puntos_disponibles REAL NOT NULL,         -- Para canjes parciales
    descripcion TEXT DEFAULT '',
    fecha TEXT DEFAULT CURRENT_TIMESTAMP,
    fecha_expiracion TEXT,                    -- NULL si no expira
    procesado BOOLEAN DEFAULT 0               -- Para job de expiración
  );
  CREATE INDEX IF NOT EXISTS idx_puntos_cliente ON puntos_transacciones(cliente_id, fecha DESC);
  CREATE INDEX IF NOT EXISTS idx_puntos_pedido ON puntos_transacciones(pedido_id);
  CREATE INDEX IF NOT EXISTS idx_puntos_expiracion ON puntos_transacciones(fecha_expiracion, procesado);

  -- Niveles de cliente
  CREATE TABLE IF NOT EXISTS fidelizacion_niveles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,              -- Bronce, Plata, Oro, Platino
    orden INTEGER NOT NULL,                   -- 1, 2, 3, 4 para ordenar
    gasto_minimo_anual REAL NOT NULL,         -- Cuánto debe gastar
    color TEXT DEFAULT '#CD7F32',             -- Color representativo
    icono TEXT DEFAULT '🥉',
    multiplicador_puntos REAL DEFAULT 1.0,    -- 1x, 1.5x, 2x, 3x
    envio_gratis BOOLEAN DEFAULT 0,
    envio_gratis_minimo REAL DEFAULT 0,       -- Mínimo de compra para envío gratis
    beneficio_cumpleanos TEXT DEFAULT '',     -- Regalo de cumpleaños
    atencion_prioritaria BOOLEAN DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insertar niveles por defecto
  INSERT OR IGNORE INTO fidelizacion_niveles (id, nombre, orden, gasto_minimo_anual, color, icono, multiplicador_puntos, envio_gratis, envio_gratis_minimo, beneficio_cumpleanos, atencion_prioritaria)
  VALUES 
    (1, 'Bronce', 1, 0, '#CD7F32', '🥉', 1.0, 0, 0, '', 0),
    (2, 'Plata', 2, 50000, '#C0C0C0', '🥈', 1.5, 1, 8000, '15% OFF', 0),
    (3, 'Oro', 3, 150000, '#FFD700', '🥇', 2.0, 1, 0, 'Pizza gratis', 1),
    (4, 'Platino', 4, 300000, '#E5E4E2', '💎', 3.0, 1, 0, 'Combo gratis + delivery gratis', 1);

  -- Historial de niveles por cliente
  CREATE TABLE IF NOT EXISTS cliente_niveles_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    nivel_anterior TEXT,
    nivel_nuevo TEXT NOT NULL,
    gasto_calculado REAL NOT NULL,
    fecha_cambio TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- Carritos abandonados para marketing automation
  CREATE TABLE IF NOT EXISTS carritos_abandonados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_telefono TEXT NOT NULL,
    cliente_nombre TEXT DEFAULT '',
    items TEXT NOT NULL,                      -- JSON de items
    total REAL NOT NULL,
    estado TEXT DEFAULT 'pendiente',          -- pendiente, recordatorio_1, recordatorio_2, recuperado, perdido
    token_recuperacion TEXT UNIQUE,           -- Link directo al checkout
    creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
    ultimo_recordatorio TEXT,
    recuperado_en TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_carritos_estado ON carritos_abandonados(estado, creado_en);
  CREATE INDEX IF NOT EXISTS idx_carritos_telefono ON carritos_abandonados(cliente_telefono);

  -- ============================================
  -- MÓDULO DE PERSONAL MEJORADO
  -- ============================================

  -- Direcciones del personal (similar a cliente_direcciones)
  CREATE TABLE IF NOT EXISTS personal_direcciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    etiqueta TEXT DEFAULT 'Principal',
    direccion TEXT NOT NULL,
    referencia TEXT DEFAULT '',
    latitud REAL,
    longitud REAL,
    principal BOOLEAN DEFAULT 0,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_personal_direcciones_personal ON personal_direcciones(personal_id);

  -- Categorías/Niveles laborales (similar a fidelizacion_niveles)
  CREATE TABLE IF NOT EXISTS personal_categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL UNIQUE,
    orden INTEGER NOT NULL,
    color TEXT DEFAULT '#6B7280',
    icono TEXT DEFAULT '👤',
    sueldo_base_minimo REAL DEFAULT 0,
    beneficio_vacaciones_dias INTEGER DEFAULT 14,
    beneficio_dias_libres_mes INTEGER DEFAULT 4,
    descripcion TEXT DEFAULT '',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insertar categorías por defecto
  INSERT OR IGNORE INTO personal_categorias (id, nombre, orden, color, icono, sueldo_base_minimo, beneficio_vacaciones_dias, beneficio_dias_libres_mes, descripcion)
  VALUES 
    (1, 'Trainee', 1, '#9CA3AF', '🌱', 0, 14, 4, 'En capacitación'),
    (2, 'Junior', 2, '#6B7280', '👤', 150000, 14, 4, 'Nivel inicial'),
    (3, 'Semi-Senior', 3, '#3B82F6', '⭐', 200000, 21, 6, 'Experiencia media'),
    (4, 'Senior', 4, '#8B5CF6', '🏆', 280000, 21, 8, 'Alto rendimiento'),
    (5, 'Lead/Supervisor', 5, '#F59E0B', '👑', 350000, 28, 8, 'Liderazgo de equipo');

  -- Historial de carrera/ascensos
  CREATE TABLE IF NOT EXISTS personal_carrera_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    categoria_anterior_id INTEGER REFERENCES personal_categorias(id),
    categoria_nueva_id INTEGER NOT NULL REFERENCES personal_categorias(id),
    sueldo_anterior REAL,
    sueldo_nuevo REAL,
    motivo TEXT DEFAULT '',
    fecha_cambio TEXT DEFAULT CURRENT_TIMESTAMP,
    registrado_por INTEGER REFERENCES usuarios(id)
  );
  CREATE INDEX IF NOT EXISTS idx_carrera_personal ON personal_carrera_historial(personal_id, fecha_cambio DESC);

  -- Sistema de reconocimientos/puntos por desempeño
  CREATE TABLE IF NOT EXISTS personal_reconocimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK(tipo IN ('puntualidad', 'calidad', 'venta', 'equipo', 'extra', 'bonus', 'correccion')),
    puntos INTEGER NOT NULL,
    descripcion TEXT DEFAULT '',
    relacionado_pedido_id INTEGER REFERENCES pedidos(id),
    registrado_por INTEGER REFERENCES usuarios(id),
    fecha TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_reconocimientos_personal ON personal_reconocimientos(personal_id, fecha DESC);
  CREATE INDEX IF NOT EXISTS idx_reconocimientos_tipo ON personal_reconocimientos(tipo);

  -- Configuración de reconocimientos
  CREATE TABLE IF NOT EXISTS personal_reconocimientos_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    puntos_por_puntualidad INTEGER DEFAULT 5,
    puntos_por_venta_destacada INTEGER DEFAULT 10,
    puntos_por_feedback_positivo INTEGER DEFAULT 15,
    umbral_canje_puntos INTEGER DEFAULT 50,
    recompensa_canje_pesos REAL DEFAULT 5000,
    activo BOOLEAN DEFAULT 1
  );
  INSERT OR IGNORE INTO personal_reconocimientos_config (id) VALUES (1);
`);

ensureColumn('usuarios', 'avatar', "TEXT DEFAULT ''");
ensureColumn('categorias', 'imagen', "TEXT DEFAULT ''");
ensureColumn('categorias', 'subcategorias', "TEXT DEFAULT '[]'");
ensureColumn('personal', 'frecuencia_pago', "TEXT DEFAULT 'mensual'");
ensureColumn('personal', 'monto_base', 'REAL DEFAULT 0');
ensureColumn('personal', 'medio_pago_preferido', "TEXT DEFAULT 'efectivo'");
ensureColumn('personal', 'avatar_url', "TEXT DEFAULT ''");
ensureColumn('productos', 'stock_directo', 'REAL DEFAULT 0');
ensureColumn('productos', 'stock_mode', "TEXT DEFAULT 'direct'");
ensureColumn('marketing_publicador_destinos', 'preview_path', "TEXT DEFAULT ''");
ensureColumn('marketing_publicador_destinos', 'preview_actualizado_en', 'DATETIME');
ensureColumn('inventario_insumos', 'rubro', "TEXT DEFAULT 'General'");
ensureColumn('inventario_insumos', 'nota_compra', "TEXT DEFAULT ''");
ensureColumn('clientes', 'fecha_nacimiento', "TEXT DEFAULT ''");
ensureColumn('clientes', 'nivel', "TEXT DEFAULT 'Bronce'");
ensureColumn('clientes', 'puntos', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'sellos_actuales', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'frecuencia_dias', "INTEGER DEFAULT 7");
ensureColumn('clientes', 'canjes_premio', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'recompensas_pendientes', "INTEGER DEFAULT 0");
ensureColumn('clientes', 'fidelizacion_activa', "INTEGER DEFAULT 1");
ensureColumn('clientes', 'codigo_tarjeta', "TEXT");
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_tarjeta ON clientes(codigo_tarjeta)');
ensureColumn('clientes', 'avatar_url', "TEXT DEFAULT ''");
ensureColumn('clientes', 'premio_notificado', "INTEGER DEFAULT 1");
ensureColumn('repartidores', 'latitud', 'REAL');
ensureColumn('repartidores', 'longitud', 'REAL');
ensureColumn('repartidores', 'ultima_ubicacion_en', 'TEXT');
ensureColumn('repartidores', 'codigo_acceso', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'zona_preferida', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'direccion', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'latitud_casa', 'REAL');
ensureColumn('repartidores', 'longitud_casa', 'REAL');
ensureColumn('repartidores', 'avatar_url', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'notas', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'fecha_ingreso', "TEXT DEFAULT ''");
ensureColumn('repartidores', 'personal_id', 'INTEGER');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_repartidores_personal_id ON repartidores(personal_id)');

// Campos adicionales para módulo de personal mejorado
ensureColumn('personal', 'fecha_nacimiento', "TEXT DEFAULT ''");
ensureColumn('personal', 'fecha_ingreso', "TEXT DEFAULT ''");
ensureColumn('personal', 'email', "TEXT DEFAULT ''");
ensureColumn('personal', 'direccion', "TEXT DEFAULT ''");
ensureColumn('personal', 'tags', "TEXT DEFAULT '[]'");
ensureColumn('personal', 'categoria_id', 'INTEGER');
ensureColumn('personal', 'puntos_reconocimiento', 'INTEGER DEFAULT 0');
ensureColumn('personal', 'total_liquidaciones', 'INTEGER DEFAULT 0');
ensureColumn('personal', 'total_adelantos', 'REAL DEFAULT 0');
ensureColumn('pedidos', 'pago_estado', "TEXT DEFAULT 'pendiente'");
ensureColumn('pedidos', 'pago_id', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'mp_preference_id', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'pago_detalle', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'delivery_zona', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');
ensureColumn('pedidos', 'turno_operativo', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'entrega_pin', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'cliente_latitud', 'REAL');
ensureColumn('pedidos', 'cliente_longitud', 'REAL');
ensureColumn('pedidos', 'entrega_foto', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'entrega_foto_en', 'TEXT');
ensureColumn('pedidos', 'inventario_aplicado', 'INTEGER DEFAULT 0');
ensureColumn('pedidos', 'inventario_revertido', 'INTEGER DEFAULT 0');
ensureColumn('pedidos', 'repartidor_id', 'INTEGER');
ensureColumn('pedidos', 'repartidor_nombre', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'tracking_token', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'repartidor_latitud', 'REAL');
ensureColumn('pedidos', 'repartidor_longitud', 'REAL');
ensureColumn('pedidos', 'repartidor_ubicacion_en', 'TEXT');
ensureColumn('pedidos', 'marketing_campana_id', 'INTEGER');
ensureColumn('pedidos', 'marketing_promo_id', 'INTEGER');
ensureColumn('pedidos', 'marketing_origen', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'marketing_codigo', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'marketing_source', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'marketing_medium', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'marketing_campaign', "TEXT DEFAULT ''");
ensureColumn('pedidos', 'marketing_content', "TEXT DEFAULT ''");
ensureColumn('pedido_items', 'descripcion', "TEXT DEFAULT ''");

// Asegurar columnas de configuración de fidelización (Programa de Sellos/Puntos)
ensureColumn('fidelizacion_config', 'monto_minimo_sello', 'REAL DEFAULT 10000');
ensureColumn('fidelizacion_config', 'sellos_para_premio', 'INTEGER DEFAULT 6');
ensureColumn('fidelizacion_config', 'premio_descripcion', "TEXT DEFAULT '1 Pizza Muzzarella'");
ensureColumn('crm_campanas_historial', 'enviados_ok', 'INTEGER DEFAULT 0');
ensureColumn('crm_campanas_historial', 'enviados_error', 'INTEGER DEFAULT 0');
ensureColumn('crm_campanas_historial', 'ultimo_resultado', "TEXT DEFAULT '[]'");

// Insertar configuración de fidelización por defecto si no existe
try {
  const fidConfig = db.prepare('SELECT id FROM fidelizacion_config WHERE id = 1').get();
  if (!fidConfig) {
    db.prepare(`
      INSERT INTO fidelizacion_config 
      (id, pesos_por_punto, valor_punto_real, dias_expiracion, minimo_canje, monto_minimo_sello, sellos_para_premio, premio_descripcion, activo)
      VALUES (1, 100, 10, 180, 50, 10000, 6, '1 Pizza Muzzarella', 1)
    `).run();
  }
} catch (e) {
  console.error('Error al inicializar fidelizacion_config:', e.message);
}

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
  const pedidosCobro = db.prepare(`
    SELECT id, estado, metodo_pago, origen, pago_estado, pago_detalle
    FROM pedidos
  `).all();

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

    if (pedido.estado === 'entregado' && shouldAutoSettleOnEntrega({ ...pedido, metodo_pago: metodoPago, pago_estado: pagoEstado })) {
      pagoEstado = 'pagado';
      if (!pagoDetalle) {
        pagoDetalle = 'Cobrado al entregar';
      }
    }

    normalizePedidoPaymentStmt.run(
      metodoPago,
      pagoEstado,
      pagoDetalle,
      pagoDetalle,
      pedido.id
    );
  });

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

try {
  db.exec('BEGIN');
  backfillPedidoItems(db, { limit: 20000 });
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS repartidor_ubicaciones_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    repartidor_id INTEGER NOT NULL,
    pedido_id INTEGER,
    latitud REAL NOT NULL,
    longitud REAL NOT NULL,
    precision REAL,
    velocidad REAL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_repartidor_ubicaciones_rep ON repartidor_ubicaciones_log(repartidor_id, creado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_repartidor_ubicaciones_pedido ON repartidor_ubicaciones_log(pedido_id, creado_en DESC);
`);
ensureColumn('whatsapp_pedidos_borrador', 'delivery_zona', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'tiempo_estimado_min', 'INTEGER DEFAULT 0');
ensureColumn('whatsapp_pedidos_borrador', 'marketing_campana_id', 'INTEGER');
ensureColumn('whatsapp_pedidos_borrador', 'marketing_promo_id', 'INTEGER');
ensureColumn('whatsapp_pedidos_borrador', 'marketing_origen', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'marketing_codigo', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'marketing_source', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'marketing_medium', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'marketing_campaign', "TEXT DEFAULT ''");
ensureColumn('whatsapp_pedidos_borrador', 'marketing_content', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'bot_silenciado', 'INTEGER DEFAULT 0');
ensureColumn('whatsapp_conversaciones', 'marketing_campana_id', 'INTEGER');
ensureColumn('whatsapp_conversaciones', 'marketing_promo_id', 'INTEGER');
ensureColumn('whatsapp_conversaciones', 'marketing_origen', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'marketing_codigo', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'marketing_source', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'marketing_medium', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'marketing_campaign', "TEXT DEFAULT ''");
ensureColumn('whatsapp_conversaciones', 'marketing_content', "TEXT DEFAULT ''");
ensureColumn('whatsapp_mensajes', 'whatsapp_message_id', "TEXT DEFAULT ''");

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_mensajes_message_id
  ON whatsapp_mensajes(whatsapp_message_id)
  WHERE TRIM(COALESCE(whatsapp_message_id, '')) != '';
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_pedidos_marketing_campana ON pedidos(marketing_campana_id, creado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_pedidos_marketing_codigo ON pedidos(marketing_codigo);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_conversaciones_marketing_campana ON whatsapp_conversaciones(marketing_campana_id, actualizado_en DESC);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_conversaciones_marketing_codigo ON whatsapp_conversaciones(marketing_codigo);
  CREATE INDEX IF NOT EXISTS idx_whatsapp_borrador_marketing_campana ON whatsapp_pedidos_borrador(marketing_campana_id, actualizado_en DESC);
`);

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

// Configurar valores por defecto para nuevas funcionalidades
const defaultSettings = [
  ['rider_app_nombre', 'Modo Sabor Delivery'],
  ['rider_app_color_primario', '#5D87FF'],
  ['rider_app_color_secundario', '#49BEFF'],
  ['rider_app_bienvenida', '¡Hola! Revisa tus pedidos asignados para hoy.'],
  ['rider_app_logo', ''],
  ['impresion_mostrar_logo', '1'],
  ['impresion_mostrar_nombre_negocio', '1'],
  ['impresion_mostrar_direccion', '1'],
  ['impresion_mostrar_telefono', '1'],
  ['impresion_mostrar_fecha', '1'],
  ['impresion_mostrar_detalles_items', '1'],
  ['impresion_mostrar_precios_ticket', '1'],
  ['impresion_mostrar_qr_seguimiento', '1'],
  ['impresion_compacta', '0'],
  ['impresion_comanda_mostrar_cliente', '1'],
];

const checkStmt = db.prepare('SELECT 1 FROM configuracion WHERE clave = ?');
const insertStmt = db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?)');

defaultSettings.forEach(([clave, valor]) => {
  if (!checkStmt.get(clave)) {
    insertStmt.run(clave, valor);
  }
});

const userCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
if (userCount.c === 0) {
  const initialAdminEmail = String(process.env.INITIAL_ADMIN_EMAIL || '').trim();
  const initialAdminPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
  const initialAdminName = String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim() || 'Administrador';

  if (!initialAdminEmail || !initialAdminPassword) {
    throw new Error('No hay usuarios creados y faltan INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD para el bootstrap inicial');
  }

  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(
    initialAdminName,
    initialAdminEmail,
    bcrypt.hashSync(initialAdminPassword, 10),
    'admin'
  );
  console.log(`Usuario admin inicial creado: ${initialAdminEmail}`);
}

if (process.env.NODE_ENV === 'production' && String(process.env.EMERGENCY_ADMIN_ENABLED || '0') === '1') {
  const emergencyAdminEmail = String(process.env.EMERGENCY_ADMIN_EMAIL || '').trim().toLowerCase();
  const emergencyAdminPassword = String(process.env.EMERGENCY_ADMIN_PASSWORD || '').trim();
  const emergencyAdminName = String(process.env.EMERGENCY_ADMIN_NAME || 'Administrador').trim() || 'Administrador';

  if (emergencyAdminEmail && emergencyAdminPassword) {
    const existingEmergencyAdmin = db.prepare('SELECT id FROM usuarios WHERE lower(email) = ?').get(emergencyAdminEmail);
    const passwordHash = bcrypt.hashSync(emergencyAdminPassword, 10);

    if (existingEmergencyAdmin) {
      db.prepare('UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?')
        .run(emergencyAdminName, passwordHash, 'admin', existingEmergencyAdmin.id);
    } else {
      db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)')
        .run(emergencyAdminName, emergencyAdminEmail, passwordHash, 'admin');
    }
  }
}

const defaultConfig = {
  negocio_nombre: 'Modo Sabor',
  negocio_descripcion: 'Pizzas, Empanadas y Milanesas',
  negocio_direccion: 'Monteros, Tucuman',
  negocio_localidad: 'Monteros',
  negocio_provincia: 'Tucuman',
  negocio_codigo_postal: '4142',
  negocio_telefono: '',
  negocio_email: '',
  negocio_logo: '',
  negocio_favicon: '',
  moneda_simbolo: '$',
  moneda_codigo: 'ARS',
  costo_envio_base: '0',
  tiempo_delivery: '25',
  tiempo_retiro: '20',
  delivery_validacion_activa: '0',
  delivery_zonas: JSON.stringify([
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
  ]),
  mesas_cantidad: '12',
  mesas_nombres: '',
  metodos_pago: JSON.stringify(['efectivo', 'mercadopago', 'transferencia', 'modo', 'uala']),
  color_primario: '#f97316',
  postventa_url_resena: '',
  postventa_cupon_recompra: 'VOLVE10',
  public_app_url: 'http://localhost:5173',
  public_api_url: 'http://localhost:3001',
  mercadopago_token: '',
  mercadopago_binary_mode: '0',
  cbu_alias: '',
  mensaje_confirmacion: '¡Gracias por tu pedido! En breve lo estamos preparando.',
  web_hero_imagen: '',
  web_hero_titulo: 'Modo Sabor',
  web_hero_subtitulo: 'Hamburguesas, pizzas, milanesas y empanadas para pedir directo.',
  web_hero_boton_texto: 'Pedir ahora',
  web_hero_accion_tipo: 'categoria',
  web_hero_accion_valor: '',
  web_mostrar_destacados: '1',
  web_promos_json: '[]',
  web_popup_activo: '0',
  web_popup_titulo: '',
  web_popup_descripcion: '',
  web_popup_imagen: '',
  web_popup_desde: '',
  web_popup_hasta: '',
  web_popup_boton_texto: 'Ver promo',
  web_popup_accion_tipo: 'none',
  web_popup_accion_valor: '',
  web_popup_frecuencia_horas: '12',
  impresion_formato: 'a6',
  impresion_auto_tpv: '0',
  impresion_auto_web: '0',
  impresion_margen_mm: '8',
  impresion_escala_fuente: '1',
  impresion_mensaje_ticket: 'Gracias por elegirnos',
  impresion_copias_comanda: '1',
  impresion_copias_ticket: '1',
  delivery_requiere_foto_entrega: '0',
  crm_dias_inactividad: '15',
  crm_cupon_recompra: 'VOLVE10',
  crm_mensaje_recompra: 'Hola {{cliente}}, te extrañamos en {{negocio}}. Volvé con el cupón {{cupon}} y pedí directo acá: {{pedido_url}}',
  backup_automatico_activo: '1',
  backup_intervalo_horas: '24',
  backup_max_archivos: '14',
  modulo_tpv_activo: '1',
  modulo_caja_activo: '1',
  modulo_kds_activo: '1',
  modulo_mesas_activo: '1',
  modulo_delivery_activo: '1',
  modulo_inventario_activo: '1',
  modulo_clientes_activo: '1',
  modulo_reportes_activo: '1',
  modulo_personal_activo: '1',
  modulo_cupones_activo: '1',
  modulo_marketing_activo: '1',
  delivery_autoasignar_activo: '1',
  turnos_negocio: JSON.stringify([
    { id: 'manana', nombre: 'Turno manana', desde: '11:00', hasta: '14:00', activo: true },
    { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '02:00', activo: true },
  ]),
  horarios: JSON.stringify({
    lunes: { abierto: true, desde: '18:00', hasta: '23:30' },
    martes: { abierto: true, desde: '18:00', hasta: '23:30' },
    miercoles: { abierto: true, desde: '18:00', hasta: '23:30' },
    jueves: { abierto: true, desde: '18:00', hasta: '23:30' },
    viernes: { abierto: true, desde: '18:00', hasta: '00:00' },
    sabado: { abierto: true, desde: '18:00', hasta: '00:00' },
    domingo: { abierto: true, desde: '18:00', hasta: '23:30' }
  }),
  numero_pedido_actual: '1'
};

const insertConfig = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
Object.entries(defaultConfig).forEach(([k, v]) => insertConfig.run(k, v));

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

const negocioDireccionRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'negocio_direccion'").get();
if (!negocioDireccionRow?.valor || negocioDireccionRow.valor === 'Tu dirección aquí') {
  db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('negocio_direccion', ?)").run(defaultConfig.negocio_direccion);
}

const zonasRow = db.prepare("SELECT valor FROM configuracion WHERE clave = 'delivery_zonas'").get();
try {
  const zonas = JSON.parse(zonasRow?.valor || '[]');
  const oldIds = ['centro', 'cercana', 'extendida'];
  if (Array.isArray(zonas) && zonas.length > 0 && zonas.every((item) => oldIds.includes(String(item.id || '')))) {
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('delivery_zonas', ?)").run(defaultConfig.delivery_zonas);
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('costo_envio_base', ?)").run(defaultConfig.costo_envio_base);
    db.prepare("INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('tiempo_delivery', ?)").run(defaultConfig.tiempo_delivery);
  }
} catch {}

const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
if (catCount.c === 0) {
  const cats = [['Pizzas','🍕','#ef4444',1],['Empanadas','🥟','#f97316',2],['Milanesas','🥩','#84cc16',3]];
  const ins = db.prepare('INSERT INTO categorias (nombre, icono, color, orden) VALUES (?, ?, ?, ?)');
  cats.forEach(c => ins.run(...c));
}

module.exports = db;

-- ============================================
-- TABLAS BASE
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT DEFAULT 'admin',
  activo INTEGER DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
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
  monto_base INTEGER DEFAULT 0,
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
  unidades INTEGER DEFAULT 1,
  monto_base INTEGER DEFAULT 0,
  monto_bruto INTEGER DEFAULT 0,
  total_adelantos INTEGER DEFAULT 0,
  total_descuentos INTEGER DEFAULT 0,
  total_consumos INTEGER DEFAULT 0,
  monto_neto INTEGER DEFAULT 0,
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
  monto INTEGER NOT NULL DEFAULT 0,
  saldo_pendiente INTEGER NOT NULL DEFAULT 0,
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
  monto_original INTEGER DEFAULT 0,
  monto_aplicado INTEGER DEFAULT 0,
  saldo_restante INTEGER DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personal_asistencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  fecha_operativa TEXT NOT NULL,
  turno_id TEXT DEFAULT '',
  turno_nombre TEXT DEFAULT '',
  estado TEXT DEFAULT 'presente',
  ingreso_en DATETIME,
  salida_en DATETIME,
  minutos_tarde INTEGER DEFAULT 0,
  minutos_trabajados INTEGER DEFAULT 0,
  notas TEXT DEFAULT '',
  origen TEXT DEFAULT 'manual',
  actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actor_nombre TEXT DEFAULT '',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personal_objetivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  fecha_desde TEXT NOT NULL,
  fecha_hasta TEXT NOT NULL,
  turno_id TEXT DEFAULT '',
  tipo TEXT DEFAULT 'general',
  objetivo INTEGER DEFAULT 0,
  progreso INTEGER DEFAULT 0,
  unidad TEXT DEFAULT 'u',
  premio_puntos INTEGER DEFAULT 0,
  premio_monto INTEGER DEFAULT 0,
  cumplido INTEGER DEFAULT 0,
  notas TEXT DEFAULT '',
  actor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actor_nombre TEXT DEFAULT '',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  icono TEXT DEFAULT '🍽️',
  color TEXT DEFAULT '#f97316',
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  turno_id TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  precio INTEGER NOT NULL DEFAULT 0,
  costo INTEGER DEFAULT 0,
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  imagen TEXT DEFAULT '',
  variantes TEXT DEFAULT '[]',
  extras TEXT DEFAULT '[]',
  activo INTEGER DEFAULT 1,
  destacado INTEGER DEFAULT 0,
  tiempo_preparacion INTEGER DEFAULT 15,
  menu_dia_tipo TEXT DEFAULT 'economico',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Listas de opciones compartidas
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Guarniciones, salsas, agregados y postres se cargaban adentro del JSON de
-- cada producto, y eso se despegó solo: los cuatro agregados de hamburguesa
-- están repetidos en dieciséis platos, y de los tres menús ejecutivos que
-- llevan la misma guarnición, uno terminó con siete opciones y los otros dos
-- con seis.
--
-- Estas tres tablas guardan la lista una sola vez y dicen qué plato la lleva.
-- El JSON de cada producto sigue existiendo y sigue mandando: lo que se carga
-- a mano en un plato no lo pisa ninguna lista. Las listas se agregan al lado.

CREATE TABLE IF NOT EXISTS opcion_listas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  -- 'variante': se elige una sola (guarnición, salsa, tamaño).
  -- 'extra':    se marcan las que se quieran (agregados, postre).
  tipo TEXT NOT NULL DEFAULT 'variante',
  -- Sólo aplica a las de tipo variante: si no se elige, no se puede cobrar.
  obligatorio INTEGER DEFAULT 0,
  descripcion TEXT DEFAULT '',
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS opcion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lista_id INTEGER NOT NULL REFERENCES opcion_listas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  imagen TEXT NOT NULL DEFAULT '',
  -- Centavos, igual que productos.precio. Es un recargo sobre el plato: 0 en
  -- una guarnición incluida, 100000 en el postre de $1.000.
  precio INTEGER NOT NULL DEFAULT 0,
  orden INTEGER DEFAULT 0,
  activo INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS producto_opcion_listas (
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  lista_id INTEGER NOT NULL REFERENCES opcion_listas(id) ON DELETE CASCADE,
  orden INTEGER DEFAULT 0,
  PRIMARY KEY (producto_id, lista_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  total_gastado INTEGER DEFAULT 0,
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
  subtotal INTEGER NOT NULL DEFAULT 0,
  costo_envio INTEGER DEFAULT 0,
  descuento INTEGER DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  estado TEXT DEFAULT 'nuevo',
  motivo_cancelacion TEXT DEFAULT '',
  tipo_entrega TEXT DEFAULT 'delivery',
  mesa TEXT DEFAULT '',
  hora_entrega TEXT DEFAULT '',
  metodo_pago TEXT DEFAULT 'efectivo',
  notas TEXT DEFAULT '',
  origen TEXT DEFAULT 'tpv',
  repartidor_id INTEGER REFERENCES repartidores(id) ON DELETE SET NULL,
  repartidor_nombre TEXT DEFAULT '',
  mozo_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  mozo_nombre TEXT DEFAULT '',
  idempotency_key TEXT DEFAULT '',
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
  costo_unitario INTEGER DEFAULT 0,
  nota_compra TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventario_recetas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  insumo_id INTEGER NOT NULL REFERENCES inventario_insumos(id) ON DELETE RESTRICT,
  cantidad INTEGER NOT NULL DEFAULT 0,
  condicion_tipo TEXT DEFAULT 'siempre',
  condicion_grupo TEXT DEFAULT '',
  condicion_valor TEXT DEFAULT '',
  orden INTEGER DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_dia_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  disponible INTEGER DEFAULT 0,
  precio INTEGER DEFAULT 0,
  stock_directo INTEGER DEFAULT 0,
  descripcion TEXT DEFAULT '',
  destacado INTEGER DEFAULT 0,
  orden INTEGER DEFAULT 0,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  insumo_id INTEGER REFERENCES inventario_insumos(id) ON DELETE SET NULL,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
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
  bot_silenciado_hasta DATETIME,
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
  -- Hora pedida por el cliente ("21:30"). Vacío significa cuanto antes, que es
  -- el caso normal; sólo se llena si la pidió explícitamente.
  hora_entrega TEXT DEFAULT '',
  estado TEXT DEFAULT 'abierto',
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  subtotal INTEGER DEFAULT 0,
  costo_envio INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_pedidos_borrador_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  borrador_id INTEGER REFERENCES whatsapp_pedidos_borrador(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  cantidad INTEGER DEFAULT 1,
  precio_unitario INTEGER DEFAULT 0,
  descripcion TEXT DEFAULT '',
  variantes TEXT DEFAULT '{}',
  extras TEXT DEFAULT '[]',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_confirmaciones (
  telefono TEXT PRIMARY KEY,
  borrador_id INTEGER NOT NULL REFERENCES whatsapp_pedidos_borrador(id) ON DELETE CASCADE,
  huella TEXT NOT NULL,
  texto TEXT NOT NULL,
  enviada INTEGER NOT NULL DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cierres_caja (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estado TEXT DEFAULT 'abierta',
  abierta_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  abierta_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  abierta_por_nombre TEXT DEFAULT '',
  monto_inicial INTEGER DEFAULT 0,
  notas_apertura TEXT DEFAULT '',
  cerrada_en DATETIME,
  cerrada_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  cerrada_por_nombre TEXT DEFAULT '',
  monto_final_declarado INTEGER DEFAULT 0,
  efectivo_esperado INTEGER DEFAULT 0,
  diferencia INTEGER DEFAULT 0,
  resumen_json TEXT DEFAULT '{}',
  notas_cierre TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cierre_id INTEGER REFERENCES cierres_caja(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  monto INTEGER NOT NULL DEFAULT 0,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_mozo_idempotency
  ON pedidos(mozo_usuario_id, idempotency_key)
  WHERE mozo_usuario_id IS NOT NULL AND idempotency_key <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_whatsapp_idempotency
  ON pedidos(idempotency_key)
  WHERE origen = 'whatsapp' AND idempotency_key <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_idempotency
  ON pedidos(idempotency_key)
  WHERE TRIM(COALESCE(idempotency_key,'')) != '';

-- Una mesa puede tener muchas comandas, pero la operación se asigna a un
-- único mozo mientras esté abierta. Evita cargas simultáneas sin contexto.
CREATE TABLE IF NOT EXISTS mesas_asignaciones (
  mesa TEXT PRIMARY KEY,
  mozo_usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  mozo_nombre TEXT NOT NULL DEFAULT '',
  asignada_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizada_en DATETIME DEFAULT CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS cupones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  descripcion TEXT DEFAULT '',
  tipo_descuento TEXT NOT NULL DEFAULT 'porcentaje',
  valor_descuento INTEGER NOT NULL DEFAULT 0,
  minimo_compra INTEGER DEFAULT 0,
  descuento_maximo INTEGER DEFAULT 0,
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
  monto_descuento INTEGER DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pedido_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 1,
  precio_unitario INTEGER NOT NULL DEFAULT 0,
  costo_unitario INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0,
  variantes_json TEXT DEFAULT '{}',
  extras_json TEXT DEFAULT '[]',
  categoria_id INTEGER,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventario_compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proveedor TEXT DEFAULT '',
  total INTEGER DEFAULT 0,
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
  cantidad INTEGER NOT NULL DEFAULT 0,
  costo_unitario INTEGER NOT NULL DEFAULT 0,
  subtotal INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- MARKETING
-- ============================================

CREATE TABLE IF NOT EXISTS marketing_promos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  tipo_promo TEXT NOT NULL DEFAULT 'descuento_fijo',
  valor INTEGER DEFAULT 0,
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
  presupuesto_estimado INTEGER DEFAULT 0,
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
  amount INTEGER DEFAULT 0,
  metadata_json TEXT DEFAULT '{}',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

-- ============================================
-- FIDELIZACIÓN
-- ============================================

CREATE TABLE IF NOT EXISTS fidelizacion_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  pesos_por_punto INTEGER DEFAULT 100,
  valor_punto_real INTEGER DEFAULT 10,
  dias_expiracion INTEGER DEFAULT 180,
  minimo_canje INTEGER DEFAULT 50,
  monto_minimo_sello INTEGER DEFAULT 10000,
  sellos_para_premio INTEGER DEFAULT 6,
  premio_descripcion TEXT DEFAULT '1 Pizza Muzzarella',
  premio_producto_id INTEGER,
  activo BOOLEAN DEFAULT 1,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS puntos_transacciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK(tipo IN ('ganancia', 'canje', 'expiracion', 'bonus', 'ajuste')),
  puntos INTEGER NOT NULL,
  puntos_disponibles INTEGER NOT NULL,
  descripcion TEXT DEFAULT '',
  fecha TEXT DEFAULT CURRENT_TIMESTAMP,
  fecha_expiracion TEXT,
  procesado BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS fidelizacion_niveles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL,
  gasto_minimo_anual INTEGER NOT NULL,
  color TEXT DEFAULT '#CD7F32',
  icono TEXT DEFAULT '🥉',
  multiplicador_puntos REAL DEFAULT 1.0,
  envio_gratis BOOLEAN DEFAULT 0,
  envio_gratis_minimo INTEGER DEFAULT 0,
  beneficio_cumpleanos TEXT DEFAULT '',
  atencion_prioritaria BOOLEAN DEFAULT 0,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cliente_niveles_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nivel_anterior TEXT,
  nivel_nuevo TEXT NOT NULL,
  gasto_calculado INTEGER NOT NULL,
  fecha_cambio TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carritos_abandonados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_telefono TEXT NOT NULL,
  cliente_nombre TEXT DEFAULT '',
  items TEXT NOT NULL,
  total INTEGER NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  token_recuperacion TEXT UNIQUE,
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  ultimo_recordatorio TEXT,
  recuperado_en TEXT
);

-- ============================================
-- PERSONAL MEJORADO
-- ============================================

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

CREATE TABLE IF NOT EXISTS personal_categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  orden INTEGER NOT NULL,
  color TEXT DEFAULT '#6B7280',
  icono TEXT DEFAULT '👤',
  sueldo_base_minimo INTEGER DEFAULT 0,
  beneficio_vacaciones_dias INTEGER DEFAULT 14,
  beneficio_dias_libres_mes INTEGER DEFAULT 4,
  descripcion TEXT DEFAULT '',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS personal_carrera_historial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  personal_id INTEGER NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
  categoria_anterior_id INTEGER REFERENCES personal_categorias(id),
  categoria_nueva_id INTEGER NOT NULL REFERENCES personal_categorias(id),
  sueldo_anterior INTEGER,
  sueldo_nuevo INTEGER,
  motivo TEXT DEFAULT '',
  fecha_cambio TEXT DEFAULT CURRENT_TIMESTAMP,
  registrado_por INTEGER REFERENCES usuarios(id)
);

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

CREATE TABLE IF NOT EXISTS personal_reconocimientos_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  puntos_por_puntualidad INTEGER DEFAULT 5,
  puntos_por_venta_destacada INTEGER DEFAULT 10,
  puntos_por_feedback_positivo INTEGER DEFAULT 15,
  umbral_canje_puntos INTEGER DEFAULT 50,
  recompensa_canje_pesos INTEGER DEFAULT 5000,
  activo BOOLEAN DEFAULT 1
);

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
);

CREATE TABLE IF NOT EXISTS tpv_pedidos_espera (
  id TEXT PRIMARY KEY,
  label TEXT DEFAULT '',
  total REAL DEFAULT 0,
  total_items INTEGER DEFAULT 0,
  snapshot TEXT DEFAULT '{}',
  creado_en TEXT DEFAULT ''
);

-- ============================================
-- ÍNDICES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_cliente_direcciones_cliente_id ON cliente_direcciones(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_asistencia_unique ON personal_asistencia(personal_id, fecha_operativa, turno_id);
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

CREATE INDEX IF NOT EXISTS idx_marketing_promos_activa ON marketing_promos(activa);
CREATE INDEX IF NOT EXISTS idx_marketing_contenidos_estado ON marketing_contenidos(estado);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_campanas_tracking_slug ON marketing_campanas(tracking_slug);
CREATE INDEX IF NOT EXISTS idx_marketing_campanas_activa ON marketing_campanas(activa);
CREATE INDEX IF NOT EXISTS idx_marketing_calendario_fecha ON marketing_calendario(fecha_programada);
CREATE INDEX IF NOT EXISTS idx_marketing_atribuciones_evento ON marketing_atribuciones(event_type, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_atribuciones_campana ON marketing_atribuciones(marketing_campana_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_publicador_destinos_tipo ON marketing_publicador_destinos(tipo, activo, orden);
CREATE INDEX IF NOT EXISTS idx_marketing_publicador_publicaciones_estado ON marketing_publicador_publicaciones(estado, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_publicador_envios_publicacion ON marketing_publicador_envios(publicacion_id, orden, estado);

CREATE INDEX IF NOT EXISTS idx_puntos_cliente ON puntos_transacciones(cliente_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_puntos_pedido ON puntos_transacciones(pedido_id);
CREATE INDEX IF NOT EXISTS idx_puntos_expiracion ON puntos_transacciones(fecha_expiracion, procesado);

CREATE INDEX IF NOT EXISTS idx_carritos_estado ON carritos_abandonados(estado, creado_en);
CREATE INDEX IF NOT EXISTS idx_carritos_telefono ON carritos_abandonados(cliente_telefono);

CREATE INDEX IF NOT EXISTS idx_personal_direcciones_personal ON personal_direcciones(personal_id);
CREATE INDEX IF NOT EXISTS idx_carrera_personal ON personal_carrera_historial(personal_id, fecha_cambio DESC);
CREATE INDEX IF NOT EXISTS idx_reconocimientos_personal ON personal_reconocimientos(personal_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_reconocimientos_tipo ON personal_reconocimientos(tipo);

CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_dia_historial_fecha_producto ON menu_dia_historial(fecha, producto_id);
CREATE INDEX IF NOT EXISTS idx_menu_dia_historial_fecha ON menu_dia_historial(fecha DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_codigo_tarjeta ON clientes(codigo_tarjeta);
CREATE UNIQUE INDEX IF NOT EXISTS idx_repartidores_personal_id ON repartidores(personal_id);

CREATE INDEX IF NOT EXISTS idx_repartidor_ubicaciones_rep ON repartidor_ubicaciones_log(repartidor_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_repartidor_ubicaciones_pedido ON repartidor_ubicaciones_log(pedido_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_notificaciones_envios_pedido ON notificaciones_envios(pedido_id, tipo);
CREATE INDEX IF NOT EXISTS idx_notificaciones_envios_telefono ON notificaciones_envios(cliente_telefono, creado_en DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_mensajes_message_id ON whatsapp_mensajes(whatsapp_message_id) WHERE TRIM(COALESCE(whatsapp_message_id, '')) != '';

CREATE INDEX IF NOT EXISTS idx_pedidos_marketing_campana ON pedidos(marketing_campana_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_marketing_codigo ON pedidos(marketing_codigo);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversaciones_marketing_campana ON whatsapp_conversaciones(marketing_campana_id, actualizado_en DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversaciones_marketing_codigo ON whatsapp_conversaciones(marketing_codigo);
CREATE INDEX IF NOT EXISTS idx_whatsapp_borrador_marketing_campana ON whatsapp_pedidos_borrador(marketing_campana_id, actualizado_en DESC);

CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_opcion_items_lista ON opcion_items(lista_id, orden);
CREATE INDEX IF NOT EXISTS idx_producto_opcion_listas_lista ON producto_opcion_listas(lista_id);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos(cliente_id);

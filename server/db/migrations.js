const logger = require('../utils/logger');
const {
  normalizeMetodoPago,
  normalizePagoEstado,
  resolveInitialPagoEstado,
  shouldAutoSettleOnEntrega,
} = require('../utils/paymentStatus');
const { backfillPedidoItems } = require('../utils/pedidoItems');
const { encriptar, estaEncriptado } = require('../utils/encryptConfig');

function hasColumn(db, table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((item) => item.name === column);
}

function ensureColumn(db, table, column, definition) {
  if (!hasColumn(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

/**
 * Las dos identidades con las que Modo Sabor publica en Facebook.
 *
 * No son "la cuenta de Facebook": son dos formas distintas de publicar, con
 * grupos y permisos propios. El mismo grupo puede estar disponible para una y
 * no para la otra.
 */
const IDENTIDADES_FACEBOOK = [
  { clave: 'fb_perfil', nombre: 'Perfil Modo Sabor', tipo: 'perfil' },
  { clave: 'fb_page', nombre: 'Fan Page Modo Sabor Delivery', tipo: 'page' },
];

/**
 * Pasa `social_destinations` a tener la identidad adentro de la clave única.
 *
 * ── Por qué hay que reconstruir la tabla ───────────────────────────────────
 *
 * SQLite no sabe modificar una restricción `UNIQUE` con `ALTER TABLE`. La
 * única forma es crear la tabla nueva, copiar las filas, borrar la vieja y
 * renombrar. Es incómodo pero es el camino oficial.
 *
 * ── Por qué se hace ahora ──────────────────────────────────────────────────
 *
 * Porque hoy no hay ningún destino cargado. La misma migración dentro de un
 * mes, con trescientos grupos sincronizados y campañas apuntándoles, es un
 * problema serio. Ahora es copiar cero filas.
 *
 * ── El detalle de las claves foráneas ──────────────────────────────────────
 *
 * Tres tablas apuntan a `social_destinations`. Con las claves activas, borrar
 * la tabla original haría cascada y se llevaría campañas y logs por delante.
 * Por eso se apagan durante la operación y se vuelven a encender al final —y
 * se verifica que quedaron consistentes antes de dar por buena la migración.
 */
function migrarIdentidadesSociales(db) {
  const tabla = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'social_destinations'")
    .get();

  /* Instalación nueva: la tabla ya nace bien y sólo hay que sembrar. */
  if (tabla?.sql && !/UNIQUE\s*\(\s*provider\s*,\s*tipo/i.test(tabla.sql)) {
    sembrarIdentidades(db);
    return;
  }
  if (!tabla) return;

  const identidadPorDefecto = sembrarIdentidades(db);

  const huerfanos = db
    .prepare('SELECT COUNT(*) AS total FROM social_destinations WHERE cuenta_id IS NULL')
    .get();

  db.pragma('foreign_keys = OFF');
  try {
    db.exec(`
      CREATE TABLE social_destinations_nueva (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cuenta_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        tipo TEXT NOT NULL,
        nombre TEXT NOT NULL,
        identificador_externo TEXT DEFAULT '',
        url TEXT DEFAULT '',
        metadata TEXT DEFAULT '{}',
        habilitada INTEGER DEFAULT 1,
        favorita INTEGER DEFAULT 0,
        ultimo_estado TEXT DEFAULT 'pendiente',
        creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, cuenta_id, tipo, identificador_externo)
      );
    `);

    /*
      Los destinos que no tenían identidad se adjudican al Perfil, que es la
      identidad principal. Se conserva el id para que las campañas y los logs
      que ya apuntaban a esos destinos sigan apuntando bien.
    */
    db.prepare(
      `INSERT INTO social_destinations_nueva
         (id, cuenta_id, provider, tipo, nombre, identificador_externo, url,
          metadata, habilitada, favorita, ultimo_estado, creado_en, actualizado_en)
       SELECT id, COALESCE(cuenta_id, ?), provider, tipo, nombre, identificador_externo, url,
              metadata, habilitada, favorita, ultimo_estado, creado_en, actualizado_en
         FROM social_destinations`
    ).run(identidadPorDefecto);

    db.exec('DROP TABLE social_destinations');
    db.exec('ALTER TABLE social_destinations_nueva RENAME TO social_destinations');
  } finally {
    db.pragma('foreign_keys = ON');
  }

  /*
    Si la copia dejó algo inconsistente, es mejor enterarse acá que descubrirlo
    el día que una campaña apunte a un destino que no existe.
  */
  const rotas = db.pragma('foreign_key_check');
  if (Array.isArray(rotas) && rotas.length > 0) {
    throw new Error(`La migración de identidades sociales dejó ${rotas.length} referencias rotas`);
  }

  if (Number(huerfanos?.total || 0) > 0) {
    logger.info(
      `  Social: ${huerfanos.total} destinos sin identidad quedaron asignados al Perfil.`
    );
  }
}

/** Crea las identidades si faltan. Devuelve el id de la principal. */
function sembrarIdentidades(db) {
  const alta = db.prepare(
    `INSERT INTO social_accounts (provider, nombre, identificador_externo, estado, metadata)
     VALUES ('facebook', ?, ?, 'desconectada', ?)
     ON CONFLICT DO NOTHING`
  );

  IDENTIDADES_FACEBOOK.forEach((identidad) => {
    const existe = db
      .prepare("SELECT id FROM social_accounts WHERE provider = 'facebook' AND nombre = ?")
      .get(identidad.nombre);
    if (!existe) {
      alta.run(identidad.nombre, identidad.clave, JSON.stringify({ tipo: identidad.tipo }));
    }
  });

  const perfil = db
    .prepare("SELECT id FROM social_accounts WHERE provider = 'facebook' AND nombre = ?")
    .get(IDENTIDADES_FACEBOOK[0].nombre);

  return Number(perfil?.id || 0);
}

function runMigrations(db) {
  ensureColumn(db, 'productos', 'subcategoria', "TEXT NOT NULL DEFAULT ''");
  // ============================================
  // ENSURE COLUMNS
  // ============================================

  ensureColumn(db, 'usuarios', 'avatar', "TEXT DEFAULT ''");
  // Incrementar esta versión invalida todos los JWT emitidos antes del cambio
  // de contraseña, rol o estado del usuario, sin conservar una lista en RAM.
  ensureColumn(db, 'usuarios', 'token_version', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'pedidos', 'motivo_cancelacion', "TEXT DEFAULT ''");
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
  /*
    ── La propina ─────────────────────────────────────────────────────────────

    Va en centavos y **aparte de `total`**, no adentro.

    `total` es lo que cuesta la comida, y es de lo que vive el negocio: es lo
    que suman los reportes de ventas, lo que se factura y sobre lo que se
    calculan los márgenes. La propina no es venta: es plata del mozo que pasa
    por la caja.

    Si se sumara a `total`, el ticket promedio, la facturación y la
    rentabilidad quedarían inflados por algo que el local no cobra.

    La consecuencia de tenerla afuera hay que asumirla en la caja: lo que hay
    en el cajón es ventas en efectivo **más** propinas en efectivo. Eso está
    resuelto en routes/caja.js.
  */
  ensureColumn(db, 'pedidos', 'propina', 'INTEGER DEFAULT 0');

  /*
    Descuento sobre una línea del pedido, en centavos, con su motivo.

    Hasta ahora sólo se podía descontar del total. Eso no cubre lo de todos los
    días: el plato que salió mal y se cobra a mitad, el postre de cortesía, el
    2x1 sobre una sola línea.

    En plata y no en porcentaje: un 15% sobre un precio que después cambia da un
    número distinto cada vez que se recalcula, y los centavos que se
    descontaron ese día son un hecho.
  */
  ensureColumn(db, 'pedido_items', 'descuento_item', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'pedido_items', 'descuento_motivo', "TEXT DEFAULT ''");
  // El costo se congela al crear el renglón: los reportes históricos no deben
  // cambiar cuando más adelante se actualiza el costo del producto.
  ensureColumn(db, 'pedido_items', 'costo_unitario', 'INTEGER DEFAULT 0');

  /*
    ── PIN de autorización del mozo ───────────────────────────────────────────

    Protege las mesas de un mozo de que las toque otro. Fudo lo tiene y el
    motivo es concreto: en un turno con varios mozos, cualquiera podía cobrar o
    modificar una mesa que no era suya, y cuando el arqueo no cerraba no había
    forma de saber quién había hecho qué.

    No confundir con los dos PIN que ya existían:
      · `pedidos.entrega_pin` — el que el cliente le dice al repartidor
      · `personal.clock_pin`  — el de fichar entrada y salida

    Se guarda hasheado, igual que las contraseñas. Son cuatro dígitos: si la
    base se filtra, un PIN en texto plano se prueba en un segundo.
  */
  ensureColumn(db, 'usuarios', 'pin_mozo_hash', "TEXT DEFAULT ''");

  /*
    ── Cuenta corriente de clientes ───────────────────────────────────────────

    El cliente consume ahora y paga después. Es común en un local de barrio: la
    oficina de al lado que pide todos los mediodías y arregla a fin de mes.

    Hasta ahora eso se anotaba en un cuaderno, y el que lo llevaba era el único
    que sabía cuánto debía cada uno.

    ── Por qué movimientos y no un saldo ──────────────────────────────────────

    El saldo se calcula sumando los movimientos, no se guarda en una columna.

    Un saldo guardado se desincroniza el día que algo falla a mitad de camino, y
    a partir de ahí nadie sabe cuál de los dos números es el bueno. Con los
    movimientos, el saldo siempre se puede reconstruir y cada peso tiene su
    fila con fecha, motivo y quién lo cargó — que es lo que hace falta cuando
    el cliente discute la cuenta.

    `limite_credito` en centavos. Cero significa **sin cuenta corriente
    habilitada**, no "crédito infinito": habilitarla tiene que ser una decisión
    explícita por cliente.
  */
  ensureColumn(db, 'clientes', 'limite_credito', 'INTEGER DEFAULT 0');
  db.exec(`
    CREATE TABLE IF NOT EXISTS cliente_cuenta_movimientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
      -- 'consumo' suma deuda · 'pago' la baja · 'ajuste' corrige a mano
      tipo TEXT NOT NULL,
      monto INTEGER NOT NULL,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
      nota TEXT DEFAULT '',
      usuario_id INTEGER,
      usuario_nombre TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ensureColumn(db, 'cliente_cuenta_movimientos', 'metodo_pago', "TEXT DEFAULT 'efectivo'");
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_cuenta_mov_cliente ON cliente_cuenta_movimientos(cliente_id)'
  );
  /*
    Un pedido no puede cargarse dos veces a la cuenta. Sin esto, reintentar el
    cobro le duplicaría la deuda al cliente — el mismo problema de idempotencia
    que en la creación de pedidos, pero acá la víctima es el que paga.
  */
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cuenta_mov_pedido
      ON cliente_cuenta_movimientos(pedido_id)
      WHERE pedido_id IS NOT NULL AND tipo = 'consumo'
  `);

  /*
    ── Listas de precios ──────────────────────────────────────────────────────

    El mismo plato puede valer distinto según por dónde se venda. La milanesa a
    $10.500 en el mostrador y a $11.500 por delivery, porque el envío propio
    cuesta y el precio de mostrador no tiene que subsidiarlo.

    Hasta ahora había un solo `productos.precio` para todo.

    ── Cómo está modelado ─────────────────────────────────────────────────────

    Una lista es un nombre. `producto_precios` guarda **sólo las excepciones**:
    si un producto no tiene fila en una lista, vale su precio normal.

    Eso es deliberado. La alternativa —copiar los 94 precios a cada lista— haría
    que subir un precio obligue a acordarse de subirlo en todos lados, y el día
    que alguien se olvide el delivery vende a precio viejo sin que nadie lo note.
    Así, una lista con tres excepciones tiene tres filas.

    Qué lista usa cada canal se guarda en `configuracion`, con las claves
    `lista_precios_mostrador`, `lista_precios_delivery` y `lista_precios_web`.
    Vacío significa "el precio de siempre".
  */
  db.exec(`
    CREATE TABLE IF NOT EXISTS listas_precios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT DEFAULT '',
      orden INTEGER DEFAULT 0,
      activo INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS producto_precios (
      lista_id INTEGER NOT NULL REFERENCES listas_precios(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      -- En centavos, igual que productos.precio.
      precio INTEGER NOT NULL,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (lista_id, producto_id)
    )
  `);
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
  ensureColumn(db, 'whatsapp_conversaciones', 'control_version', 'INTEGER DEFAULT 0');
  db.exec(`CREATE TRIGGER IF NOT EXISTS whatsapp_control_version
    AFTER UPDATE OF bot_silenciado ON whatsapp_conversaciones BEGIN
      UPDATE whatsapp_conversaciones SET control_version = COALESCE(control_version, 0) + 1 WHERE id = NEW.id;
    END`);
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

  // Septiembre 2026: el local extiende la venta y la caja del turno mañana
  // media hora. Sólo se ajusta el horario predeterminado anterior exacto;
  // configuraciones personalizadas se mantienen intactas.
  try {
    const row = db.prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'").get();
    const turnos = JSON.parse(row?.valor || '[]');
    let changed = false;
    if (Array.isArray(turnos)) {
      turnos.forEach((turno) => {
        if (turno?.id === 'manana' && turno?.desde === '10:00' && turno?.hasta === '14:30') {
          turno.hasta = '15:00';
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
    logger.error('Error al extender el turno de mañana', { message: e.message });
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

  crearBaseMultisucursal(db);
  crearTablasCotizaciones(db);
  db.prepare(
    "INSERT OR IGNORE INTO configuracion (clave, valor) VALUES ('backup_max_total_mb', '64')"
  ).run();
  configurarMotorCanonicoWhatsapp(db);
  encriptarClavesSensiblesExistentes(db);
  // WhatsApp actualiza compatibilidades de identidades sociales: la tabla
  // social_accounts debe existir antes de correr esas migraciones.
  crearTablasSocial(db);
  crearTablasWhatsapp(db);
  // Cada contacto puede recibir una promoción por turno operativo. El valor
  // persiste con el envío para que un reinicio no vuelva a habilitarlo.
  ensureColumn(db, 'wa_envios', 'turno_clave', "TEXT DEFAULT ''");
  ensureColumn(db, 'wa_campanas', 'segmento', "TEXT DEFAULT 'todos'");
  ensureColumn(db, 'wa_campanas', 'programada_para', 'DATETIME');
  ensureColumn(db, 'wa_campanas', 'ultimo_error', "TEXT DEFAULT ''");
  // El id de WhatsApp hace idempotente la importación del historial al volver
  // a vincular el número: un history sync repetido no duplica respuestas ni
  // altera los segmentos de la agenda.
  ensureColumn(db, 'wa_respuestas', 'mensaje_id', "TEXT DEFAULT ''");
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_wa_envios_turno_telefono ON wa_envios(turno_clave, telefono, estado)'
  );
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_respuestas_mensaje_id ON wa_respuestas(mensaje_id) WHERE mensaje_id <> ''"
  );
  migrateMoneyColumns(db);
  corregirPorcentajesDeCupones(db);
  migrarUmbralesDeNivel(db);
  migrarPuntosInflados(db);
  // Va después de `db.exec(tableStatements)` en db/index.js, así que
  // `opcion_listas` ya existe cuando esto corre.
  migrarGuarnicionesAListaCompartida(db);
  ensureColumn(db, 'opcion_items', 'imagen', "TEXT NOT NULL DEFAULT ''");
  migrarTamanosDelMenuDia(db);
}

/**
 * Cotizaciones comerciales persistentes.
 *
 * Los importes usan la misma unidad canonica que pedidos y productos:
 * centavos enteros. Los totales se recalculan siempre en el servidor y cada
 * renglon queda separado para poder imprimir propuestas de uno o varios
 * servicios sin guardar un JSON opaco.
 */
function crearTablasCotizaciones(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero TEXT UNIQUE,
      cliente_empresa TEXT NOT NULL,
      cliente_contacto TEXT DEFAULT '',
      cliente_cuit TEXT DEFAULT '',
      cliente_telefono TEXT DEFAULT '',
      cliente_email TEXT DEFAULT '',
      cliente_direccion TEXT DEFAULT '',
      fecha_emision TEXT NOT NULL,
      fecha_servicio TEXT,
      validez_dias INTEGER NOT NULL DEFAULT 7,
      estado TEXT NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'vencida')),
      condiciones_pago TEXT DEFAULT '',
      observaciones TEXT DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      descuento INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cotizacion_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cotizacion_id INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      descripcion TEXT NOT NULL,
      detalle TEXT DEFAULT '',
      cantidad INTEGER NOT NULL CHECK (cantidad > 0),
      precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
      subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
      orden INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha
      ON cotizaciones(fecha_emision DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente
      ON cotizaciones(cliente_empresa);
    CREATE INDEX IF NOT EXISTS idx_cotizacion_items_cotizacion
      ON cotizacion_items(cotizacion_id, orden, id);
  `);
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
    { table: 'cupones', column: 'minimo_compra' },
    { table: 'cupones', column: 'descuento_maximo' },
    { table: 'cupones_usados', column: 'monto_descuento' },
    { table: 'pedido_items', column: 'cantidad' },
    { table: 'pedido_items', column: 'precio_unitario' },
    { table: 'pedido_items', column: 'costo_unitario' },
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
 * `valor_descuento` no es siempre plata: en cupones porcentuales es 10, 20,
 * etc. La migración inicial de dinero lo multiplicó por 100 junto con los
 * montos fijos. Se revierten sólo valores imposibles (>100): así no se toca
 * un porcentaje que ya estuviera bien guardado en una instalación nueva.
 * Los cupones fijos permanecen en centavos.
 */
function corregirPorcentajesDeCupones(db) {
  const marca = 'migracion_cupon_porcentaje_unidad_v1';
  if (db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(marca)?.valor === '1') {
    return;
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE cupones SET valor_descuento = valor_descuento / 100.0 WHERE tipo_descuento = 'porcentaje' AND valor_descuento > 100"
    ).run();
    db.prepare(
      `INSERT INTO configuracion (clave, valor) VALUES (?, '1')
       ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
    ).run(marca);
  })();
  logger.info('Porcentajes de cupones normalizados; los montos fijos siguen en centavos');
}

/**
 * Base técnica para separar locales en una etapa posterior.
 *
 * La función crea únicamente el catálogo de sucursales y deja la función
 * desactivada. No agrega todavía `sucursal_id` a pedidos, caja, stock ni
 * personal: activar una separación parcial sería más peligroso que seguir
 * operando como un solo local.
 */
/**
 * Chispita se ejecuta dentro del backend. n8n deja de ser un segundo motor
 * operativo: duplicaba memoria, reglas y herramientas, y podía confirmar algo
 * distinto de lo que realmente quedó en la base. Gemini queda exclusivamente
 * como respaldo del proveedor principal y reutiliza la clave cifrada existente.
 *
 * La marca evita pisar una elección posterior del administrador en cada inicio.
 */
function configurarMotorCanonicoWhatsapp(db) {
  // v2 reemplaza 2.5-flash, retirado por Google para cuentas nuevas.
  const marca = 'migracion_motor_whatsapp_propio_gemini_v2';
  const aplicada = db.prepare('SELECT valor FROM configuracion WHERE clave = ?').get(marca);
  if (aplicada?.valor === '1') return;

  const guardar = db.prepare(
    `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
  );
  db.transaction(() => {
    guardar.run('whatsapp_motor_propio', '1');
    guardar.run('whatsapp_emergencia_activa', '1');
    guardar.run('whatsapp_emergencia_proveedor', 'Gemini');
    guardar.run('whatsapp_emergencia_base_url', 'https://generativelanguage.googleapis.com/v1beta');
    guardar.run('whatsapp_emergencia_modelo', 'gemini-3.6-flash');
    guardar.run(marca, '1');
  })();
}

/**
 * Las instalaciones anteriores a la bóveda guardaban estas claves como texto.
 * La lectura conserva compatibilidad, pero dejar el valor así en el volumen
 * vuelve inútil el cifrado de las altas nuevas. Esta migración es idempotente:
 * sólo transforma valores presentes que todavía no tengan el prefijo `enc:`.
 */
function encriptarClavesSensiblesExistentes(db) {
  const claves = ['ia_api_key', 'gemini_api_key', 'whatsapp_emergencia_api_key'];
  const leer = db.prepare('SELECT valor FROM configuracion WHERE clave = ?');
  const guardar = db.prepare('UPDATE configuracion SET valor = ? WHERE clave = ?');

  db.transaction(() => {
    for (const clave of claves) {
      const valor = String(leer.get(clave)?.valor || '');
      if (!valor || estaEncriptado(valor)) continue;
      guardar.run(encriptar(valor), clave);
    }
  })();
}

function crearBaseMultisucursal(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sucursales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      direccion TEXT DEFAULT '',
      telefono TEXT DEFAULT '',
      activa INTEGER DEFAULT 1,
      principal INTEGER DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_sucursales_principal
      ON sucursales(principal) WHERE principal = 1;
  `);

  db.prepare(
    `INSERT OR IGNORE INTO sucursales (codigo, nombre, activa, principal)
     VALUES ('principal', 'Modo Sabor', 1, 1)`
  ).run();

  const insertConfig = db.prepare(
    'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)'
  );
  insertConfig.run('multi_sucursal_activo', '0');
  insertConfig.run('sucursal_actual_codigo', 'principal');
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
    -- Agenda propia de WhatsApp. No se mezcla con clientes: un chat puede no
    -- haber comprado todavía y no por eso deja de ser un contacto válido.
    CREATE TABLE IF NOT EXISTS wa_contactos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL UNIQUE,
      telefono TEXT DEFAULT '',
      nombre TEXT DEFAULT '',
      foto TEXT DEFAULT '',
      ultimo_mensaje_en DATETIME,
      excluido INTEGER DEFAULT 0,
      origen TEXT DEFAULT 'gateway',
      score INTEGER DEFAULT 0,
      pausado_hasta TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
      segmento TEXT DEFAULT 'todos',
      programada_para DATETIME,
      ultimo_error TEXT DEFAULT '',
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
      turno_clave TEXT DEFAULT '',
      -- Identifica el mensaje remoto para registrar sus recibos.
      mensaje_id TEXT DEFAULT '',
      entregado_en DATETIME,
      leido_en DATETIME,
      enviado_en DATETIME,
      UNIQUE(campana_id, telefono)
    );

    CREATE TABLE IF NOT EXISTS wa_respuestas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT NOT NULL,
      texto TEXT DEFAULT '',
      es_baja INTEGER DEFAULT 0,
      mensaje_id TEXT DEFAULT '',
      recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wa_plantillas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      mensaje TEXT NOT NULL,
      imagen TEXT DEFAULT '',
      segmento TEXT DEFAULT 'todos',
      activa INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- CRM ligero sobre respuestas de campañas
    CREATE TABLE IF NOT EXISTS wa_crm (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      respuesta_id INTEGER REFERENCES wa_respuestas(id) ON DELETE CASCADE,
      telefono TEXT NOT NULL,
      estado TEXT DEFAULT 'nuevo',
      nota TEXT DEFAULT '',
      actor_id INTEGER,
      actor_nombre TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Etiquetas por contacto (tags libres)
    CREATE TABLE IF NOT EXISTS wa_etiquetas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contacto_id INTEGER NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
      etiqueta TEXT NOT NULL,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(contacto_id, etiqueta)
    );

    -- Notas por contacto
    CREATE TABLE IF NOT EXISTS wa_notas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contacto_id INTEGER NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
      nota TEXT NOT NULL,
      actor_id INTEGER,
      actor_nombre TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Recordatorios por contacto
    CREATE TABLE IF NOT EXISTS wa_recordatorios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contacto_id INTEGER NOT NULL REFERENCES wa_contactos(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      vence DATETIME,
      hecho INTEGER DEFAULT 0,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Plantillas sugeridas por segmento (promociones específicas)
    CREATE TABLE IF NOT EXISTS wa_plantillas_segmento (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      segmento TEXT NOT NULL,
      mensaje TEXT NOT NULL,
      activo INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Cierre diario de jornada (embudo, salud, métricas)
    CREATE TABLE IF NOT EXISTS wa_cierres_dia (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL UNIQUE,
      enviados INTEGER DEFAULT 0,
      respuestas INTEGER DEFAULT 0,
      salud_score INTEGER DEFAULT 0,
      embudo_json TEXT DEFAULT '{}',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- El cupo por ventana pregunta "cuántos salieron en los últimos 60
    -- minutos" antes de cada mensaje. Sin índice eso recorre la tabla entera
    -- ciento cincuenta veces por corrida.
    CREATE INDEX IF NOT EXISTS idx_wa_envios_fecha ON wa_envios(enviado_en);
    CREATE INDEX IF NOT EXISTS idx_wa_envios_campana ON wa_envios(campana_id);
    CREATE INDEX IF NOT EXISTS idx_wa_respuestas_fecha ON wa_respuestas(recibido_en);
    CREATE INDEX IF NOT EXISTS idx_wa_contactos_nombre ON wa_contactos(nombre COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_wa_contactos_telefono ON wa_contactos(telefono);
    CREATE INDEX IF NOT EXISTS idx_wa_crm_telefono ON wa_crm(telefono, estado);
    CREATE INDEX IF NOT EXISTS idx_wa_etiquetas_contacto ON wa_etiquetas(contacto_id);
    CREATE INDEX IF NOT EXISTS idx_wa_notas_contacto ON wa_notas(contacto_id, creado_en DESC);
    CREATE INDEX IF NOT EXISTS idx_wa_recordatorios_contacto ON wa_recordatorios(contacto_id, hecho, vence);
    CREATE INDEX IF NOT EXISTS idx_wa_cierres_dia_fecha ON wa_cierres_dia(fecha);
  `);

  // En instalaciones anteriores la tabla ya existía sin estos campos. Deben
  // agregarse después del CREATE para que también funcione una base nueva.
  ensureColumn(db, 'wa_contactos', 'score', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'wa_contactos', 'pausado_hasta', "TEXT DEFAULT ''");

  /*
    Recibos de WhatsApp.

    Hasta acá `wa_envios.estado = 'enviado'` sólo quería decir "salió de este
    servidor". No decía nada sobre si le llegó al cliente ni si lo abrió, y sin
    eso un número que WhatsApp empezó a frenar se ve exactamente igual que uno
    sano: los dos muestran "enviado".

    `mensaje_id` es lo que permite atar el recibo con el envío. Sin él, cuando
    WhatsApp avisa "el mensaje tal se entregó" no hay forma de saber a qué
    campaña ni a qué contacto corresponde.
  */
  /*
    Cuándo se revisó por última vez si este contacto tiene foto.

    Hace falta para distinguir "todavía no lo miramos" de "lo miramos y no
    tiene foto visible". Sin esta marca, el que oculta su foto por privacidad
    —que es mucha gente— queda como pendiente para siempre, y el goteo
    automático se la pasaría reintentando los mismos veinte contactos sin
    llegar nunca a los que faltan de verdad.
  */
  migrarIdentidadesSociales(db);

  /*
    El freno de mano de cada identidad.

    Va en la base y no en memoria a propósito: si el proceso se reinicia
    mientras algo está pausado, tiene que seguir pausado. Un freno que se
    suelta solo con un deploy no es un freno.

    `pausada_en` guarda desde cuándo, para poder decirlo en pantalla en vez de
    mostrar sólo un interruptor sin contexto.
  */
  ensureColumn(db, 'social_accounts', 'pausada', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'social_accounts', 'pausada_en', 'DATETIME');
  ensureColumn(db, 'social_accounts', 'pausada_motivo', "TEXT DEFAULT ''");

  /*
    Cuántas veces seguidas falló esta identidad.

    Se usa para la pausa automática: si una identidad acumula fallos, algo
    cambió del otro lado —la sesión venció, Facebook cambió la interfaz, el
    grupo bloqueó— y seguir intentando sólo empeora las cosas.

    Se reinicia con cada publicación exitosa.
  */
  ensureColumn(db, 'social_accounts', 'fallos_seguidos', 'INTEGER DEFAULT 0');

  ensureColumn(db, 'wa_contactos', 'foto_revisada_en', 'DATETIME');

  ensureColumn(db, 'wa_envios', 'mensaje_id', "TEXT DEFAULT ''");
  ensureColumn(db, 'wa_envios', 'entregado_en', 'DATETIME');
  ensureColumn(db, 'wa_envios', 'leido_en', 'DATETIME');
  db.exec('CREATE INDEX IF NOT EXISTS idx_wa_envios_mensaje ON wa_envios(mensaje_id)');

  /*
    ── Las reglas de cada grupo ─────────────────────────────────────────────

    Cada grupo de Facebook tiene sus propias reglas, y no las inventa el
    sistema: las pone el administrador del grupo. "Sólo ventas los martes",
    "prohibido publicar comercios", "una vez por semana". Romperlas es la forma
    más rápida de que te echen, y una vez que te echan no hay vuelta atrás.

    Hasta ahora esas reglas vivían en la cabeza de quien publicaba. Estas
    columnas las ponen en la base para que el sistema pueda respetarlas solo.

    Van como columnas y no adentro de `metadata` porque hay que filtrar por
    ellas al armar una campaña, y filtrar por un campo escondido en un JSON en
    SQLite es lento y frágil.
  */
  ensureColumn(db, 'social_destinations', 'permite_comercial', 'INTEGER DEFAULT 1');
  ensureColumn(db, 'social_destinations', 'frecuencia_maxima_horas', 'INTEGER');
  ensureColumn(db, 'social_destinations', 'bloqueado_manualmente', 'INTEGER DEFAULT 0');
  ensureColumn(db, 'social_destinations', 'notas', "TEXT DEFAULT ''");

  /*
    ── La huella del contenido ──────────────────────────────────────────────

    Un resumen del texto y las imágenes de la publicación, guardado en el
    destino en el momento de encolarlo.

    Sirve para no repetir: si ya se publicó exactamente esto en este grupo hace
    tres días, publicarlo de nuevo es lo que hace que la gente del grupo te
    silencie.

    Se guarda en el destino y no en la campaña a propósito. Es una foto del
    momento: si mañana se edita el texto de la campaña, lo que ya se publicó no
    cambió, y el historial tiene que seguir diciendo la verdad.
  */
  ensureColumn(db, 'social_post_targets', 'contenido_hash', "TEXT DEFAULT ''");
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_social_targets_dedupe
       ON social_post_targets(destino_id, contenido_hash, estado)`
  );

  /*
    ── Por dónde sale cada destino ──────────────────────────────────────────

    `browser` lo publica el Worker abriendo Chrome en la PC del local.
    `api` lo publica el servidor hablando con la API oficial, sin navegador.

    Va en columna y no se deduce del tipo porque la Fan Page va a migrar de una
    clase a la otra, y ese día hay que poder cambiar una fila sin tocar código.
    Mientras tanto todo lo existente sigue por navegador, que es donde estaba.

    `provider_clave` permite fijar un provider a mano. Con eso, migrar la Page a
    la API es cambiarle dos campos a un destino.
  */
  ensureColumn(db, 'social_destinations', 'execution_class', "TEXT DEFAULT 'browser'");
  ensureColumn(db, 'social_destinations', 'provider_clave', "TEXT DEFAULT ''");

  /*
    El ensayo: recorrer toda la cola sin publicar nada.

    Va en la campaña porque es una decisión de esa publicación —"probemos esta
    antes de mandarla"—, no del destino.
  */
  ensureColumn(db, 'social_campaigns', 'ensayo', 'INTEGER DEFAULT 0');

  /*
    El formato de la publicación: post, reel, historia o carrusel.

    ── Por qué en la campaña y no en el destino ────────────────────────────

    Lo elige quien escribe la publicación, no el lugar donde cae. Si viviera en
    el destino habría que duplicar cada destino por formato, y una lista con
    "Modo Sabor Delivery (reel)" al lado de "Modo Sabor Delivery (historia)" es
    una lista que nadie puede leer.

    ── Por qué 'post' por omisión y no vacío ───────────────────────────────

    Todas las campañas que ya existen son posteos. Dejar la columna vacía
    obligaría a que cada consulta se acuerde de traducir el vacío, y la que se
    olvide va a fallar con "no existe el formato «»" sobre datos viejos que
    estaban perfectos.
  */
  ensureColumn(db, 'social_campaigns', 'formato', "TEXT DEFAULT 'post'");

  /*
    El formato, ahora por red.

    ── Por qué no alcanzaba con uno solo ───────────────────────────────────

    La misma publicación puede querer salir como **posteo en Facebook y como
    reel en Instagram**: es el caso normal cuando tenés un video vertical y
    también querés que aparezca en el muro.

    Con un único `formato` por campaña, elegir Reel para Instagram se lo
    cambiaba también a Facebook — y Facebook lo rechazaba, porque el video que
    sirve para un reel no siempre sirve para el otro.

    Se guarda como JSON: `{"facebook":"post","instagram":"reel"}`.

    ── Por qué `formato` sigue existiendo ──────────────────────────────────

    Las campañas que ya están en la base tienen `formato` y no `formatos`.
    Migrarlas a mano sería una conversión de datos por una función que todavía
    no se usó nunca. Cuando `formatos` está vacío se cae a `formato`, que es lo
    que esas campañas siempre significaron: el mismo formato para todo.
  */
  ensureColumn(db, 'social_campaigns', 'formatos', "TEXT DEFAULT '{}'");

  /*
    La duración de los videos, en segundos.

    Meta rechaza reels de más de 90 segundos e historias de más de 60. Sin este
    dato habría que subir el archivo entero para que Meta lo rechace: con un
    video de 40 MB, eso son varios minutos y los datos de la conexión del local
    tirados a la basura.

    Cuando no se conoce queda en 0, y ahí decide Meta. Un valor por omisión
    inventado frenaría videos que en realidad sirven.
  */
  ensureColumn(db, 'social_media', 'duracion_segundos', 'REAL DEFAULT 0');

  crearAutolistas(db);
  destrabarFechasProgramadas(db);
  marcarClaseDeEjecucion(db);
  crearDestinosQueFaltan(db);
  limpiarDestinosQueNoSonGrupos(db);
}

/**
 * Saca de la lista los "grupos" que en realidad eran botones de Facebook.
 *
 * ── De dónde salieron ──────────────────────────────────────────────────────
 *
 * La pantalla de grupos tiene links que apuntan a `/groups/…` y no son grupos:
 * «Ver todo», «Ver grupo», «Unirte». La primera versión del lector los tomaba
 * como grupos y los guardaba como destinos.
 *
 * Quedaban en la lista con nombres que ni siquiera parecen un grupo, y peor:
 * si alguien los tildaba, la publicación intentaba salir en una pantalla de
 * Facebook y fallaba sin motivo entendible.
 *
 * ── Por qué se deshabilitan y no se borran ─────────────────────────────────
 *
 * Borrar arrastra en cascada las publicaciones que apuntaban a ese destino, y
 * con eso se perdería el registro de lo que se intentó. Deshabilitado sale de
 * la lista de elegibles, que es lo que importa, y el historial queda.
 */
function limpiarDestinosQueNoSonGrupos(db) {
  db.prepare(
    `UPDATE social_destinations
        SET habilitada = 0
      WHERE tipo = 'facebook_group'
        AND habilitada = 1
        AND (
          LENGTH(TRIM(nombre)) < 3
          OR LOWER(TRIM(nombre)) IN (
            'ver todo', 'ver grupo', 'ver más', 'ver mas',
            'unirte', 'descubrir', 'crear', 'tus grupos', 'inicio', 'see all'
          )
        )`
  ).run();
}

/**
 * Los destinos de las páginas e Instagram que se conectaron y no se crearon.
 *
 * ── El bug que repara ──────────────────────────────────────────────────────
 *
 * Conectar una página guardaba el token y el ID de Instagram en la identidad, y
 * ahí terminaba. Pero el sistema no publica en identidades: publica en
 * **destinos**, y nadie los creaba.
 *
 * En pantalla eso se veía como "Conectada «Modo Sabor Delivery», con Instagram
 * @modosaborok" —cierto— y después Instagram no aparecía por ningún lado para
 * poder elegirlo. Todo bien, nada roto, imposible de usar.
 *
 * ── Por qué una migración y no "reconectá de nuevo" ────────────────────────
 *
 * Porque la conexión está bien. El token es válido, el ID de Instagram es
 * correcto: lo único que falta es una fila. Mandar a rehacer todo el baile de
 * permisos de Meta por una fila que podemos crear nosotros es trasladarle
 * nuestro error a quien lo sufre.
 *
 * Es idempotente: se puede correr en cada arranque sin duplicar nada.
 */
function crearDestinosQueFaltan(db) {
  const identidades = db
    .prepare("SELECT id, nombre, metadata FROM social_accounts WHERE provider = 'facebook'")
    .all();

  const guardar = db.prepare(
    `INSERT INTO social_destinations
       (provider, cuenta_id, tipo, identificador_externo, nombre, url, habilitada, execution_class, provider_clave)
     VALUES ('facebook', ?, ?, ?, ?, ?, 1, 'api', ?)
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo)
     DO UPDATE SET execution_class = 'api', provider_clave = excluded.provider_clave`
  );

  const guardarPerfil = db.prepare(
    `INSERT INTO social_destinations
       (provider, cuenta_id, tipo, identificador_externo, nombre, url, habilitada,
        execution_class, provider_clave)
     VALUES ('facebook', ?, 'facebook_profile', 'me', ?, 'https://www.facebook.com/me/',
             1, 'browser', 'facebook_profile_browser')
     ON CONFLICT(provider, cuenta_id, tipo, identificador_externo)
     DO UPDATE SET execution_class = 'browser', provider_clave = 'facebook_profile_browser'`
  );

  for (const identidad of identidades) {
    let meta;
    try {
      meta = JSON.parse(identidad.metadata || '{}');
    } catch {
      continue;
    }

    /*
      El Perfil no tiene token oficial, pero sí es un destino real del Worker.
      Sin esta fila la pantalla puede mostrar sus grupos, aunque no existe
      ningún destino seleccionable para su muro, Reel o Historia.
    */
    if (meta.tipo === 'perfil') {
      guardarPerfil.run(identidad.id, meta.profileNombre || identidad.nombre);
    }

    /* Sin token no hay nada que publicar por API: el destino sería mentira. */
    if (!meta.token) continue;

    if (meta.pageId) {
      guardar.run(
        identidad.id,
        'facebook_page',
        String(meta.pageId),
        meta.pageNombre || identidad.nombre,
        `https://www.facebook.com/${meta.pageId}`,
        'facebook_page_api'
      );
    }

    if (meta.igId) {
      guardar.run(
        identidad.id,
        'instagram_feed',
        String(meta.igId),
        meta.igUsuario ? `@${meta.igUsuario}` : 'Instagram',
        meta.igUsuario ? `https://www.instagram.com/${meta.igUsuario}/` : '',
        'instagram_feed_api'
      );
    }
  }
}

/**
 * Las autolistas: contenido que se publica solo, para siempre.
 *
 * ── El problema que resuelven ──────────────────────────────────────────────
 *
 * Un local no tiene a nadie dedicado a las redes. Lo que pasa siempre es que
 * se publica tres días seguidos con entusiasmo y después nada por dos meses.
 *
 * Hay contenido que no caduca: que hacemos delivery hasta las 23, la pizza a
 * la piedra, cómo llegar, las fotos del salón. Eso se puede cargar una vez y
 * dejar girando.
 *
 * ── El modo circular ───────────────────────────────────────────────────────
 *
 * Cuando una publicación de la lista sale, **vuelve al final de la fila** en
 * vez de gastarse. Con diez piezas y tres salidas por semana, el mismo
 * contenido reaparece cada tres semanas y medio: suficiente para que nadie lo
 * sienta repetido, y sin que haya que escribir nada nuevo.
 *
 * Sin modo circular, cada pieza sale una vez y la lista se vacía. Sirve para
 * una campaña con principio y fin.
 */
function crearAutolistas(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_autolistas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      activa INTEGER DEFAULT 1,

      -- Con qué identidad publica y adónde.
      cuenta_id INTEGER REFERENCES social_accounts(id) ON DELETE CASCADE,
      destinos TEXT DEFAULT '[]',

      -- Cuándo. Días de la semana (0 domingo) y horas, en hora de Argentina.
      dias TEXT DEFAULT '[1,3,5]',
      horas TEXT DEFAULT '[11,20]',

      -- Si al publicarse la pieza vuelve al final de la fila.
      circular INTEGER DEFAULT 1,

      ultima_salida DATETIME,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_autolista_piezas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      autolista_id INTEGER NOT NULL REFERENCES social_autolistas(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      media_id INTEGER REFERENCES social_media(id) ON DELETE SET NULL,

      /*
        El lugar en la fila. Al publicarse, la pieza recibe el orden más alto
        de la lista + 1, y con eso pasa al final sin tener que renumerar todo.
      */
      orden INTEGER DEFAULT 0,

      veces_publicada INTEGER DEFAULT 0,
      ultima_vez DATETIME,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_autolista_piezas
      ON social_autolista_piezas(autolista_id, orden);
  `);
}

/**
 * Le pone a cada destino la clase de ejecución que le corresponde.
 *
 * ── Qué estaba mal ─────────────────────────────────────────────────────────
 *
 * La columna se creó con `DEFAULT 'browser'` y `createDestination` nunca la
 * escribía. Así que **todos** los destinos quedaban en `browser`, incluidos la
 * Fan Page e Instagram, que sí tienen API oficial.
 *
 * Consecuencia: cargar el token de Meta no servía de nada. El destino seguía
 * yendo al Worker —que para la Page no tiene camino— y el despachador del
 * servidor no lo miraba nunca porque filtra por esta columna.
 *
 * ── Por qué la lista está escrita acá y no se pregunta al registro ─────────
 *
 * Las migraciones corren antes que todo lo demás y no pueden depender de un
 * servicio que a su vez depende de la base. Son dos tipos: si aparece un
 * tercero, `createDestination` ya lo marca solo al darlo de alta.
 */
function marcarClaseDeEjecucion(db) {
  const existe = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'social_destinations'")
    .get();
  if (!existe) return;

  const porApi = {
    facebook_page: 'facebook_page_api',
    instagram_feed: 'instagram_feed_api',
  };

  let corregidos = 0;
  for (const [tipo, clave] of Object.entries(porApi)) {
    corregidos += db
      .prepare(
        `UPDATE social_destinations
            SET execution_class = 'api', provider_clave = ?
          WHERE tipo = ? AND COALESCE(execution_class, 'browser') <> 'api'`
      )
      .run(clave, tipo).changes;
  }

  if (corregidos) {
    logger.info(
      `[migración] ${corregidos} destinos pasaron a publicarse por la API oficial de Meta`
    );
  }
}

/**
 * Destraba las campañas que quedaron programadas para siempre.
 *
 * ── Qué pasaba ─────────────────────────────────────────────────────────────
 *
 * SQLite no tiene tipo fecha: guarda texto y compara texto. `CURRENT_TIMESTAMP`
 * escribe `2026-08-21 14:19:13`, con un espacio; `toISOString()` escribe
 * `2026-08-21T13:19:13.931Z`, con una T. La T es mayor que el espacio.
 *
 * Las dos colas del sistema comparan la columna pelada:
 *
 *   social_post_targets.programada_para <= CURRENT_TIMESTAMP
 *   wa_campanas.programada_para        <= CURRENT_TIMESTAMP
 *
 * Con un ISO guardado ahí, esa condición **nunca daba verdadero**. Programabas
 * una campaña para las 20:00 y no salía nunca: sin error, sin log, sin nada.
 *
 * El código ya no guarda ISO. Esto arregla lo que quedó escrito antes, que si
 * no seguiría trabado para siempre.
 *
 * ── Por qué se hace con SQL y no leyendo fila por fila ─────────────────────
 *
 * `replace(campo, 'T', ' ')` más `substr(..., 1, 19)` deja exactamente el
 * formato de SQLite, y sólo toca las filas que tienen la T. Las que ya están
 * bien no se tocan, así que correr la migración dos veces no cambia nada.
 */
function destrabarFechasProgramadas(db) {
  const arreglar = (tabla, columna) => {
    const existe = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tabla);
    // Una base anterior puede tener la tabla pero todavía no la columna. Esto
    // sucede durante el arranque: Social migra antes que WhatsApp termine de
    // agregar `programada_para`. Consultarla antes del ALTER aborta todo el
    // servidor, así que una migración de limpieza sólo actúa si existen ambos.
    if (!existe || !hasColumn(db, tabla, columna)) return 0;

    return db
      .prepare(
        `UPDATE ${tabla}
            SET ${columna} = substr(replace(replace(${columna}, 'T', ' '), 'Z', ''), 1, 19)
          WHERE ${columna} IS NOT NULL AND ${columna} LIKE '%T%'`
      )
      .run().changes;
  };

  const destrabadas =
    arreglar('social_post_targets', 'programada_para') +
    arreglar('social_campaigns', 'programada_para') +
    arreglar('wa_campanas', 'programada_para');

  if (destrabadas) {
    logger.info(`[migración] ${destrabadas} campañas destrabadas: la fecha estaba en formato ISO`);
  }
}

/**
 * Base persistente de Modo Sabor Social.
 *
 * La publicación se guarda por destino, no sólo por campaña: Facebook Page,
 * cada grupo y cada formato pueden terminar distinto sin ocultar un fallo.
 * El worker local reclama cada destino usando un lock en SQLite; así un
 * reinicio no deja tareas viviendo sólo en memoria ni duplica publicaciones.
 */
function crearTablasSocial(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      nombre TEXT NOT NULL,
      identificador_externo TEXT DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'desconectada',
      metadata TEXT DEFAULT '{}',
      habilitada INTEGER DEFAULT 1,
      ultimo_check_en DATETIME,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    /*
      Un destino pertenece siempre a una identidad.

      -- Por qué cuenta_id entra en la clave unica --

      El mismo grupo de Facebook es un destino distinto segun con que identidad
      se publique: "Compra Venta Monteros como Perfil Modo Sabor" y "Compra
      Venta Monteros como Fan Page Modo Sabor Delivery" son dos cosas
      separadas, con permisos distintos y resultados distintos.

      La clave anterior era UNIQUE(provider, tipo, identificador_externo), sin
      la identidad. Con esa clave, sincronizar los grupos de la Page pisaba los
      del Perfil: quedaba una sola fila que cambiaba de dueno con la ultima
      sincronizacion.

      -- Por que NOT NULL y no opcional --

      Ademas de que un destino sin identidad no significa nada, hay un motivo
      tecnico: en SQLite los NULL son distintos entre si dentro de un UNIQUE.
      Con cuenta_id nullable, diez filas con identidad nula y el mismo grupo
      convivirian sin conflicto, y el ON CONFLICT del alta nunca se dispararia.
      La restriccion existiria y no restringiria nada.

      CASCADE y no SET NULL por lo mismo: si se borra la identidad, sus
      destinos dejan de tener sentido.
    */
    CREATE TABLE IF NOT EXISTS social_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cuenta_id INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      identificador_externo TEXT DEFAULT '',
      url TEXT DEFAULT '',
      metadata TEXT DEFAULT '{}',
      habilitada INTEGER DEFAULT 1,
      favorita INTEGER DEFAULT 0,
      ultimo_estado TEXT DEFAULT 'pendiente',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(provider, cuenta_id, tipo, identificador_externo)
    );

    CREATE TABLE IF NOT EXISTS social_destination_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS social_destination_set_items (
      conjunto_id INTEGER NOT NULL REFERENCES social_destination_sets(id) ON DELETE CASCADE,
      destino_id INTEGER NOT NULL REFERENCES social_destinations(id) ON DELETE CASCADE,
      PRIMARY KEY (conjunto_id, destino_id)
    );

    CREATE TABLE IF NOT EXISTS social_media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      ruta TEXT NOT NULL,
      mime TEXT DEFAULT '',
      tamano INTEGER DEFAULT 0,
      tipo TEXT DEFAULT 'archivo',
      tags TEXT DEFAULT '[]',
      origen TEXT DEFAULT 'manual',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      texto TEXT DEFAULT '',
      tipo TEXT DEFAULT 'post',
      destinos_sugeridos TEXT DEFAULT '[]',
      conjuntos_sugeridos TEXT DEFAULT '[]',
      horario_sugerido TEXT DEFAULT '',
      media_id INTEGER REFERENCES social_media(id) ON DELETE SET NULL,
      activa INTEGER DEFAULT 1,
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS social_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      texto TEXT DEFAULT '',
      personalizaciones TEXT DEFAULT '{}',
      estado TEXT NOT NULL DEFAULT 'draft',
      programada_para DATETIME,
      iniciada_en DATETIME,
      finalizada_en DATETIME,
      creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      ultimo_error TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS social_campaign_media (
      campana_id INTEGER NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
      media_id INTEGER NOT NULL REFERENCES social_media(id) ON DELETE RESTRICT,
      orden INTEGER DEFAULT 0,
      PRIMARY KEY (campana_id, media_id)
    );
    CREATE TABLE IF NOT EXISTS social_post_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campana_id INTEGER NOT NULL REFERENCES social_campaigns(id) ON DELETE CASCADE,
      destino_id INTEGER NOT NULL REFERENCES social_destinations(id) ON DELETE RESTRICT,
      estado TEXT NOT NULL DEFAULT 'draft',
      programada_para DATETIME,
      lock_token TEXT DEFAULT '',
      lock_hasta DATETIME,
      intentos INTEGER DEFAULT 0,
      max_intentos INTEGER DEFAULT 2,
      proximo_reintento_en DATETIME,
      iniciado_en DATETIME,
      finalizado_en DATETIME,
      external_post_url TEXT DEFAULT '',
      ultimo_error TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(campana_id, destino_id)
    );
    CREATE TABLE IF NOT EXISTS social_publication_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campana_id INTEGER REFERENCES social_campaigns(id) ON DELETE CASCADE,
      target_id INTEGER REFERENCES social_post_targets(id) ON DELETE CASCADE,
      destino_id INTEGER REFERENCES social_destinations(id) ON DELETE SET NULL,
      nivel TEXT DEFAULT 'info',
      codigo TEXT DEFAULT '',
      mensaje TEXT NOT NULL,
      detalle TEXT DEFAULT '{}',
      screenshot_ruta TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS social_worker_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      estado TEXT NOT NULL DEFAULT 'pending',
      lock_token TEXT DEFAULT '',
      lock_hasta DATETIME,
      resultado TEXT DEFAULT '{}',
      error TEXT DEFAULT '',
      creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
      finalizado_en DATETIME
    );
    CREATE TABLE IF NOT EXISTS social_workers (
      codigo TEXT PRIMARY KEY,
      nombre TEXT DEFAULT 'Worker Social',
      estado TEXT DEFAULT 'offline',
      version TEXT DEFAULT '',
      detalle TEXT DEFAULT '{}',
      ultimo_heartbeat_en DATETIME,
      actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_social_targets_due
      ON social_post_targets(estado, programada_para, proximo_reintento_en);
    CREATE INDEX IF NOT EXISTS idx_social_targets_campaign ON social_post_targets(campana_id);
    CREATE INDEX IF NOT EXISTS idx_social_logs_campaign ON social_publication_logs(campana_id, creado_en);
  `);
}

module.exports = { runMigrations, destrabarFechasProgramadas };

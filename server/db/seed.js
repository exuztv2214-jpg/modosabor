const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

function runSeed(db) {
  // ============================================
  // DATOS POR DEFECTO (INSERT OR IGNORE)
  // ============================================

  // Niveles de fidelización
  db.prepare(
    `
    INSERT OR IGNORE INTO fidelizacion_niveles (id, nombre, orden, gasto_minimo_anual, color, icono, multiplicador_puntos, envio_gratis, envio_gratis_minimo, beneficio_cumpleanos, atencion_prioritaria)
    VALUES 
      (1, 'Bronce', 1, 0, '#CD7F32', '🥉', 1.0, 0, 0, '', 0),
      (2, 'Plata', 2, 50000, '#C0C0C0', '🥈', 1.5, 1, 8000, '15% OFF', 0),
      (3, 'Oro', 3, 150000, '#FFD700', '🥇', 2.0, 1, 0, 'Pizza gratis', 1),
      (4, 'Platino', 4, 300000, '#E5E4E2', '💎', 3.0, 1, 0, 'Combo gratis + delivery gratis', 1)
  `
  ).run();

  // Categorías de personal
  db.prepare(
    `
    INSERT OR IGNORE INTO personal_categorias (id, nombre, orden, color, icono, sueldo_base_minimo, beneficio_vacaciones_dias, beneficio_dias_libres_mes, descripcion)
    VALUES 
      (1, 'Trainee', 1, '#9CA3AF', '🌱', 0, 14, 4, 'En capacitación'),
      (2, 'Junior', 2, '#6B7280', '👤', 150000, 14, 4, 'Nivel inicial'),
      (3, 'Semi-Senior', 3, '#3B82F6', '⭐', 200000, 21, 6, 'Experiencia media'),
      (4, 'Senior', 4, '#8B5CF6', '🏆', 280000, 21, 8, 'Alto rendimiento'),
      (5, 'Lead/Supervisor', 5, '#F59E0B', '👑', 350000, 28, 8, 'Liderazgo de equipo')
  `
  ).run();

  // Configuración de reconocimientos
  db.prepare('INSERT OR IGNORE INTO personal_reconocimientos_config (id) VALUES (1)').run();

  // Configuración por defecto (settings)
  const defaultSettings = [
    ['rider_app_nombre', 'Modo Sabor Delivery'],
    ['rider_app_color_primario', '#5D87FF'],
    ['rider_app_color_secundario', '#49BEFF'],
    ['rider_app_bienvenida', '¡Hola! Revisa tus pedidos asignados para hoy.'],
    ['rider_app_logo', ''],
    ['rider_app_mostrar_logo', '1'],
    ['alertas_pedido_sonido', '1'],
    ['alertas_pedido_voz', '1'],
    ['alertas_voz_nombre', ''],
    ['alertas_voz_velocidad', '0.92'],
    ['alertas_voz_tono', '1'],
    ['alertas_voz_reemplazos', ''],
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
    // Minutos que tiene el rider para deshacer una entrega marcada por
    // error. Pasado ese tiempo la correccion la hace el local.
    ['delivery_ventana_deshacer_min', '5'],
    // ── Menu del día: precios base + lista de guarniciones + precios de extras ──
    // La lista de guarniciones globales se edita una sola vez desde la UI y
    // luego cada plato elige cuáles se ofrecen. Formato JSON array de strings.
    ['menu_dia_precio_economico', '5000'],
    ['menu_dia_precio_ejecutivo', '7000'],
    ['menu_dia_extra_postre_precio', '1000'],
    ['menu_dia_extra_bebida_postre_precio', '1000'],
    [
      'menu_dia_guarniciones_lista',
      JSON.stringify([
        'Arroz blanco',
        'Arroz a la provenzal',
        'Arroz primavera',
        'Puré',
        'Papas fritas',
        'Ensalada mixta',
        'Ensalada rusa',
        'Fideo a la provenzal',
        'Arroz',
        'Fideo',
        'Salsa roja',
        'Salsa blanca',
        'Salsa mixta',
      ]),
    ],
  ];

  const checkStmt = db.prepare('SELECT 1 FROM configuracion WHERE clave = ?');
  const insertStmt = db.prepare('INSERT INTO configuracion (clave, valor) VALUES (?, ?)');

  defaultSettings.forEach(([clave, valor]) => {
    if (!checkStmt.get(clave)) {
      insertStmt.run(clave, valor);
    }
  });

  // Bootstrap usuario admin inicial
  const userCount = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  if (userCount.c === 0) {
    const initialAdminEmail = String(process.env.INITIAL_ADMIN_EMAIL || '').trim();
    const initialAdminPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '').trim();
    const initialAdminName =
      String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim() || 'Administrador';

    if (!initialAdminEmail || !initialAdminPassword) {
      throw new Error(
        'No hay usuarios creados y faltan INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD para el bootstrap inicial'
      );
    }

    db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(
      initialAdminName,
      initialAdminEmail,
      bcrypt.hashSync(initialAdminPassword, 10),
      'admin'
    );
    logger.info(`Usuario admin inicial creado: ${initialAdminEmail}`);
  }

  // Emergency admin (solo en producción)
  if (
    process.env.NODE_ENV === 'production' &&
    String(process.env.EMERGENCY_ADMIN_ENABLED || '0') === '1'
  ) {
    const emergencyAdminEmail = String(process.env.EMERGENCY_ADMIN_EMAIL || '')
      .trim()
      .toLowerCase();
    const emergencyAdminPassword = String(process.env.EMERGENCY_ADMIN_PASSWORD || '').trim();
    const emergencyAdminName =
      String(process.env.EMERGENCY_ADMIN_NAME || 'Administrador').trim() || 'Administrador';

    if (emergencyAdminEmail && emergencyAdminPassword) {
      const existingEmergencyAdmin = db
        .prepare('SELECT id FROM usuarios WHERE lower(email) = ?')
        .get(emergencyAdminEmail);
      const passwordHash = bcrypt.hashSync(emergencyAdminPassword, 10);

      if (existingEmergencyAdmin) {
        db.prepare(
          'UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, activo = 1 WHERE id = ?'
        ).run(emergencyAdminName, passwordHash, 'admin', existingEmergencyAdmin.id);
      } else {
        db.prepare(
          'INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)'
        ).run(emergencyAdminName, emergencyAdminEmail, passwordHash, 'admin');
      }
    }
  }

  // Configuración por defecto del negocio
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
    public_app_url: '',
    public_api_url: '',
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
    crm_mensaje_recompra:
      'Hola {{cliente}}, te extrañamos en {{negocio}}. Volvé con el cupón {{cupon}} y pedí directo acá: {{pedido_url}}',
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
      { id: 'manana', nombre: 'Turno manana', desde: '10:00', hasta: '14:30', activo: true },
      { id: 'noche', nombre: 'Turno noche', desde: '20:30', hasta: '01:30', activo: true },
    ]),
    horarios: JSON.stringify({
      lunes: { abierto: true, desde: '18:00', hasta: '23:30' },
      martes: { abierto: true, desde: '18:00', hasta: '23:30' },
      miercoles: { abierto: true, desde: '18:00', hasta: '23:30' },
      jueves: { abierto: true, desde: '18:00', hasta: '23:30' },
      viernes: { abierto: true, desde: '18:00', hasta: '00:00' },
      sabado: { abierto: true, desde: '18:00', hasta: '00:00' },
      domingo: { abierto: true, desde: '18:00', hasta: '23:30' },
    }),
    numero_pedido_actual: '1',
  };

  const insertConfig = db.prepare(
    'INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)'
  );
  Object.entries(defaultConfig).forEach(([k, v]) => insertConfig.run(k, v));

  // Categorías de productos por defecto
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categorias').get();
  if (catCount.c === 0) {
    const cats = [
      ['Pizzas', '🍕', '#ef4444', 1],
      ['Empanadas', '🥟', '#f97316', 2],
      ['Milanesas', '🥩', '#84cc16', 3],
    ];
    const ins = db.prepare(
      'INSERT INTO categorias (nombre, icono, color, orden) VALUES (?, ?, ?, ?)'
    );
    cats.forEach((c) => ins.run(...c));
  }
}

module.exports = { runSeed };

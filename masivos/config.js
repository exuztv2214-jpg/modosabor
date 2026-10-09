// config.js — Toda la configuración del envío en un solo lugar.
// Ajustá estos valores a gusto. Podés dejar comentarios porque es un archivo .js

module.exports = {
  // ---------- Identidad mostrada en la previsualización ----------
  NEGOCIO_NOMBRE: 'Modo Sabor',
  NEGOCIO_LOGO: '/assets/logo.png',
  NEGOCIO_ESTADO: 'Cuenta oficial del delivery',

  // ---------- Versión de WhatsApp Web ----------

  // Versión fija de WhatsApp Web (sale de .wwebjs_cache/). Si WhatsApp se
  // actualiza y los envíos fallan, se vuelve a esta. Dejá "" para usar la última.
  WA_WEB_VERSION: '',

  // ---------- Tiempos (anti-bloqueo) ----------

  // Espera entre mensajes: se elige un valor RANDOM entre estos dos límites.
  DELAY_MIN_MS: 15 * 1000, // 15 segundos
  DELAY_MAX_MS: 45 * 1000, // 45 segundos

  // Pausa larga cada cierta cantidad de mensajes (protección extra).
  // Poné PAUSA_LARGA_CADA en 0 para desactivarla.
  PAUSA_LARGA_CADA: 15,
  PAUSA_LARGA_SEGUNDOS: 120,

  // Reintentos por contacto si el envío falla (espera 10s entre reintentos).
  REINTENTOS: 1,

  // ---------- Límites ----------

  // Máximo de mensajes por corrida. Si tenés más clientes que esto,
  // corré el script de nuevo más tarde: sigue con los que falten.
  MAX_POR_CORRIDA: 50,

  // No volver a enviar hoy a quien ya recibió (evita duplicados si
  // corréis el script dos veces o se cortó a la mitad).
  NO_REPETIR_MISMO_DIA: true,
  NO_REPETIR_MISMO_TURNO: true,

  // Cuántos días hacia atrás cuenta como "chat con conversación".
  // 3650 = todos los chats que alguna vez tuvieron mensajes.
  DIAS_HISTORIAL_MINIMO: 3650,

  // ---------- Archivos ----------

  ARCHIVO_CLIENTES: './data/clientes.json',
  ARCHIVO_EXCLUIDOS: './data/excluidos.json',
  ARCHIVO_MENSAJE: './mensaje.txt',
  ARCHIVO_LOG: './logs/log.txt',

  // Imagen del flyer (opcional). Puede ser UN archivo o una LISTA:
  //   ARCHIVO_IMAGEN: "./promo.jpg",
  //   ARCHIVO_IMAGEN: ["./promo1.jpg", "./promo2.jpg"],  <- rota al azar
  // Si el archivo no existe, manda solo texto sin romper nada.
  ARCHIVO_IMAGEN: './promo.jpg',

  // Menú en PDF (opcional). Si existe "menu.pdf" en la carpeta, se manda
  // como mensaje aparte después de la promo. Ponelo en false para no mandarlo.
  ADJUNTAR_PDF: true,

  // ---------- Calentamiento (rampa de volumen para cuidar el número) ----------
  // Si está activo, el límite por corrida CRECE día a día:
  //   día 1: CALENTAMIENTO_INICIO  ->  día 2: +INCREMENTO  ->  ...  hasta MAX_POR_CORRIDA
  // Cuenta los días previos con envíos reales (data/enviados-*.json).
  CALENTAMIENTO_ACTIVO: false,
  CALENTAMIENTO_INICIO: 20,
  CALENTAMIENTO_INCREMENTO: 10,

  // ---------- Tandas automáticas ----------
  // Si está activo, NO frena en MAX_POR_CORRIDA: manda una tanda de
  // MAX_POR_CORRIDA, espera ESPERA_ENTRE_TANDAS_MINUTOS, manda la siguiente,
  // y así hasta cubrir TODA la lista pendiente del día.
  // (Con calentamiento activo, el total del día lo manda el calentamiento.)
  MODO_TANDAS: false,
  ESPERA_ENTRE_TANDAS_MINUTOS: 20,

  // ---------- Baja automática (opt-out) ----------
  // Si un cliente responde "BAJA" (o similar), se agrega solo a
  // data/excluidos.json y recibe esta confirmación. Protege tu número.
  BAJA_AUTOMATICA: true,
  BAJA_RESPUESTA: '¡Listo, no te mando más promos! Cuando quieras pedir, escribinos 😊',

  // ---------- Envío programado ----------
  // Si está activo, la corrida sale SOLA todos los días a esta hora
  // (el panel tiene que estar abierto). Formato 24h "HH:MM".
  PROGRAMACION_ACTIVA: false,
  PROGRAMACION_HORA: '10:30',

  // Horario permitido para mandar promos (vacío = sin restricción). Una campaña que
  // llega al final del horario se detiene; lo que falta queda para retomar.
  HORARIO_ENVIO_DESDE: '08:00',
  HORARIO_ENVIO_HASTA: '22:00',

  // Línea para pedir al final de cada promo (el enlace se toca como un botón).
  LINK_PEDIDO_ACTIVO: true,
  LINK_PEDIDO_TEXTO: '🛒 *Pedí ahora* 👉',
  LINK_PEDIDO_URL: 'https://www.modosabor.com.ar',

  // Máximo de promos que recibe cada contacto en 30 días (0 = sin tope).
  MAX_PROMOS_POR_MES: 4,

  // ---------- Variaciones del mensaje ----------
  // {SALUDO} se reemplaza dentro de mensaje.txt. {NOMBRE} se reemplaza
  // por el primer nombre del contacto (si el chat tiene nombre).
  // El CIERRE se agrega solo al final del mensaje, elegido al azar.

  SALUDOS: [
    '¡Hola{NOMBRE}! 👋',
    '¡Buenas{NOMBRE}! 😋',
    '¡Qué tal{NOMBRE}! 🍴',
    '¡Hola{NOMBRE}, buen día! 🌞',
    '¡Buenas{NOMBRE}, cómo va! 🙌',
  ],

  CIERRES: [
    '¡Te esperamos! 🛵',
    '¡Hacé tu pedido! 📲',
    '¡Gracias por bancarnos siempre! ❤️',
    '¡Pedí ya que vuelan! 🔥',
  ],

  // ---------- Protección del número (anti-ban) ----------

  // Días de la semana SIN envíos (0 = domingo, 1 = lunes, ... 6 = sábado).
  // Ej: [0] para no mandar nunca los domingos.
  DIAS_NO_ENVIO: [0],

  // Máximo de mensajes por ventana (0 = sin límite). Si se alcanza, la corrida
  // espera sola hasta que haya cupo y sigue.
  MAX_POR_HORA: 60,
  VENTANA_CUPO_MINUTOS: 60,

  // Modo "solo respuestas": no se manda promo (ni manual ni programada)
  // pero el panel sigue recibiendo y mostrando respuestas/pedidos.
  MODO_SOLO_RESPUESTAS: false,

  // Footer anti-reporte: se agrega solo al final de cada mensaje.
  // Dejalo en "" para no agregar nada.
  FOOTER_BAJA: '_Respondé BAJA y no te mando más promos._',

  // Meta de pedidos por día (para la barra de progreso de la bandeja).
  META_PEDIDOS_DIA: 20,
};

// El panel web guarda sus ajustes en data/config-override.json.
// Si existe, pisa los valores de arriba (vale tanto para el panel como
// para los scripts de consola).
try {
  const fs = require('fs');
  const path = require('path');
  const override = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'config-override.json'), 'utf8')
  );
  Object.assign(module.exports, override);
} catch (e) {
  /* sin override: se usan los valores de arriba */
}

/**
 * Escribe el texto de una campaña.
 *
 * ── Qué hace y qué no ──────────────────────────────────────────────────────
 *
 * Escribe una vez y devuelve el texto. No conversa, no pregunta, no recuerda
 * lo anterior. Le decís "una promo de pizza para el finde" y te da el mensaje
 * listo para revisar. Si no te gusta, pedís otro.
 *
 * Y **nunca manda nada**. Escribe, la persona lee, la persona decide. Que la
 * IA redacte está bien; que le escriba a trescientos clientes sin que nadie
 * haya leído, no.
 *
 * ── Por qué se le pasa la carta de verdad ──────────────────────────────────
 *
 * Una IA sin datos inventa. Inventa precios que no son, platos que no están y
 * promociones que nadie autorizó — y eso llega al WhatsApp de un cliente con
 * el número del local como remitente.
 *
 * La forma de que no invente no es pedirle que no invente: es darle los datos.
 * Acá recibe el menú del día y las categorías reales con sus precios, así no
 * tiene que adivinar nada. Es lo que ninguna herramienta de afuera puede
 * hacer, porque ninguna sabe qué hay hoy en tu cocina.
 */
const db = require('../../db');
const logger = require('../../utils/logger');
const { conversar } = require('../iaProveedor');
const { getMenuOverview } = require('../../utils/systemClient');

/**
 * El menú del día de hoy, si está cargado.
 *
 * Sale de `menu_dia_historial`, que es una fila por plato del día. Se toman
 * sólo los disponibles y se arma la lista con el precio de cada tamaño.
 *
 * El día se corre tres horas para atrás porque el servidor está en UTC y acá
 * son tres menos: sin eso, después de las 21 el sistema ya cree que es mañana
 * y el menú de esta noche aparecería vacío.
 */
function menuDeHoy() {
  try {
    const filas = db
      .prepare(
        `SELECT h.descripcion, h.precio, h.precio_economico, h.precio_ejecutivo,
                p.nombre AS producto
           FROM menu_dia_historial h
           LEFT JOIN productos p ON p.id = h.producto_id
          WHERE date(h.fecha) = date('now', '-3 hours')
            AND h.disponible = 1
          ORDER BY h.destacado DESC, h.orden ASC, h.id ASC`
      )
      .all();

    if (!filas.length) return null;

    return filas.map((f) => ({
      nombre: f.producto || f.descripcion || 'Plato del día',
      descripcion: f.descripcion || '',
      economico: f.precio_economico ?? null,
      ejecutivo: f.precio_ejecutivo ?? null,
      precio: f.precio ?? null,
    }));
  } catch (error) {
    /* Si algo falla acá no se rompe la redacción: simplemente no hay menú del
       día que contar, y el prompt ya dice que en ese caso no lo mencione. */
    logger.warn('Redactor: no se pudo leer el menú del día', { message: error.message });
    return null;
  }
}

/** Los centavos como los diría una persona. */
const enPesos = (centavos) =>
  centavos === null || centavos === undefined
    ? ''
    : `$${Math.round(Number(centavos) / 100).toLocaleString('es-AR')}`;

/**
 * Un resumen corto de la carta.
 *
 * Corto a propósito: mandarle las 500 variantes al modelo cuesta plata, tarda
 * y no mejora nada. Con las categorías y unos pocos ejemplos por categoría
 * alcanza para que escriba con precios reales.
 */
function resumenDeLaCarta() {
  try {
    const overview = getMenuOverview(db, { limitPerCategory: 4 });
    const categorias = overview?.categories || overview?.categorias || [];
    return categorias
      .slice(0, 8)
      .map((cat) => {
        const items = (cat.products || cat.productos || [])
          .slice(0, 4)
          .map((p) => `${p.nombre} ${p.precio_texto || ''}`.trim())
          .filter(Boolean);
        return items.length ? `${cat.nombre}: ${items.join(', ')}` : null;
      })
      .filter(Boolean)
      .join('\n');
  } catch (error) {
    logger.warn('Redactor: no se pudo leer la carta', { message: error.message });
    return '';
  }
}

const SISTEMA = [
  'Sos Chispita, quien escribe los mensajes de Modo Sabor, una rotisería y delivery de Monteros, Tucumán.',
  '',
  'Escribís mensajes de WhatsApp para mandarle a clientes que ya compraron. Reglas:',
  '',
  '· Hablás de vos, en rioplatense, como habla el dueño de un local de barrio. Nada de "usted".',
  '· Corto. Cuatro o cinco líneas como mucho.',
  '· Un emoji cada tanto, no en cada renglón.',
  '· NUNCA inventes precios, platos, horarios ni promociones. Si no está en los datos que te paso, no existe.',
  '· Si no hay un dato, no lo menciones. Es mejor un mensaje sin precio que uno con un precio inventado.',
  '· Podés usar {NOMBRE} y se reemplaza por el nombre de cada cliente. Usalo una sola vez, al principio.',
  '· No pongas asunto, ni firma, ni comillas. Sólo el mensaje.',
  '· No prometas envío gratis ni descuentos que no estén en los datos.',
].join('\n');

/**
 * Escribe el mensaje.
 *
 * `pedido` es lo que la persona escribió: "una promo de pizza para el finde",
 * "el menú de hoy", "recuperar a los que no vienen hace un mes".
 */
async function redactarCampana(pedido) {
  const tema = String(pedido || '')
    .trim()
    .slice(0, 600);
  if (!tema) throw new Error('Contame de qué querés que sea el mensaje');

  const menu = menuDeHoy();
  const carta = resumenDeLaCarta();

  const textoMenu = menu
    ? `MENÚ DEL DÍA DE HOY:\n${menu
        .map((p) => {
          const precios = [
            p.economico ? `Económico ${enPesos(p.economico)}` : '',
            p.ejecutivo ? `Ejecutivo ${enPesos(p.ejecutivo)}` : '',
            !p.economico && !p.ejecutivo && p.precio ? enPesos(p.precio) : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `· ${p.nombre}${precios ? ` — ${precios}` : ''}`;
        })
        .join('\n')}`
    : 'MENÚ DEL DÍA: hoy no hay menú cargado. No lo menciones ni lo inventes.';

  const datos = [
    textoMenu,
    '',
    carta ? `LA CARTA:\n${carta}` : 'LA CARTA: no disponible. No menciones precios.',
  ].join('\n');

  const resultado = await conversar({
    sistema: SISTEMA,
    mensajes: [
      {
        rol: 'usuario',
        texto: `${datos}\n\nEscribí un mensaje de WhatsApp sobre: ${tema}`,
      },
    ],
  });

  const texto = String(resultado?.texto || '').trim();
  if (!texto) throw new Error('La IA no devolvió ningún texto. Probá de nuevo.');

  /*
    Se limpian las comillas de los extremos: algunos modelos devuelven el
    mensaje entrecomillado y esas comillas terminarían saliendo en el WhatsApp
    del cliente.
  */
  return texto.replace(/^["“'']+|["”'']+$/g, '').trim();
}

module.exports = { redactarCampana, menuDeHoy };

/**
 * Los emojis del compositor.
 *
 * ── Por qué una lista propia y no una librería ─────────────────────────────
 *
 * Los selectores de emoji que se instalan traen las 1.800 figuras del estándar
 * Unicode, un buscador en inglés y entre 300 y 800 KB de peso. Todo eso para
 * que alguien ponga una hamburguesa en una promo.
 *
 * Esta lista tiene los que se usan de verdad en un local de comida, ordenados
 * por para qué sirven, y **se busca en castellano**: escribir "pizza",
 * "contento" o "plata" encuentra. Con una librería en inglés habría que buscar
 * "burger" y "happy", que es exactamente la fricción que hace que nadie use la
 * función.
 *
 * ── Cómo se agregan ────────────────────────────────────────────────────────
 *
 * Cada entrada es `[emoji, 'palabras que lo encuentran']`. Las palabras van en
 * minúscula y sin tilde: el buscador normaliza lo que se escribe antes de
 * comparar, así "camión" encuentra lo mismo que "camion".
 */

export const CATEGORIAS_DE_EMOJI = [
  {
    nombre: 'Comida',
    icono: '🍔',
    emojis: [
      ['🍔', 'hamburguesa burger'],
      ['🍕', 'pizza muzzarella porcion'],
      ['🌭', 'pancho hot dog salchicha'],
      ['🥪', 'sandwich sanguche tostado'],
      ['🌮', 'taco mexicano'],
      ['🌯', 'burrito wrap'],
      ['🥙', 'shawarma arabe'],
      ['🧆', 'falafel'],
      ['🍟', 'papas fritas'],
      ['🍗', 'pollo pata muslo'],
      ['🍖', 'carne costilla asado'],
      ['🥩', 'bife carne lomo'],
      ['🥓', 'panceta bacon'],
      ['🌽', 'choclo maiz'],
      ['🥗', 'ensalada verde'],
      ['🥘', 'guiso cazuela'],
      ['🍝', 'fideos pasta tallarines'],
      ['🍜', 'sopa ramen'],
      ['🍲', 'guiso puchero'],
      ['🥟', 'empanada'],
      ['🍚', 'arroz'],
      ['🍞', 'pan'],
      ['🥐', 'medialuna factura croissant'],
      ['🥖', 'baguette pan flauta'],
      ['🧀', 'queso'],
      ['🥚', 'huevo'],
      ['🍳', 'huevo frito desayuno'],
      ['🥞', 'panqueques tortitas'],
      ['🧇', 'waffle'],
      ['🍰', 'torta porcion pastel'],
      ['🎂', 'torta cumpleanos'],
      ['🧁', 'muffin cupcake'],
      ['🍮', 'flan postre'],
      ['🍦', 'helado cucurucho'],
      ['🍨', 'helado copa'],
      ['🍫', 'chocolate'],
      ['🍪', 'galleta cookie'],
      ['🍩', 'dona rosquilla'],
      ['🍿', 'pochoclo pop'],
      ['🥜', 'mani frutos secos'],
    ],
  },
  {
    nombre: 'Bebidas',
    icono: '🥤',
    emojis: [
      ['🥤', 'gaseosa vaso bebida refresco'],
      ['🧃', 'jugo caja'],
      ['🧉', 'mate'],
      ['☕', 'cafe pocillo'],
      ['🍵', 'te infusion'],
      ['🍺', 'birra cerveza chopp'],
      ['🍻', 'birras brindis cerveza'],
      ['🍷', 'vino copa'],
      ['🥂', 'brindis champagne'],
      ['🍸', 'trago coctel'],
      ['🍹', 'trago tropical'],
      ['🥛', 'leche vaso'],
      ['🧊', 'hielo frio'],
      ['🍹', 'licuado batido'],
    ],
  },
  {
    nombre: 'Caras',
    icono: '😋',
    emojis: [
      ['😋', 'rico delicioso lengua sabroso'],
      ['🤤', 'baba antojo hambre'],
      ['😍', 'enamorado corazones encanta'],
      ['🥰', 'carinoso amor'],
      ['😊', 'contento feliz sonrisa'],
      ['😃', 'feliz alegre'],
      ['😄', 'risa feliz'],
      ['😁', 'sonrisa dientes'],
      ['😆', 'risa carcajada'],
      ['🤣', 'risa llorando jaja'],
      ['😂', 'llorando de risa jaja'],
      ['😉', 'guino picaro'],
      ['😎', 'lentes copado cool'],
      ['🤩', 'estrellas asombrado wow'],
      ['🥳', 'fiesta festejo cumpleanos'],
      ['😱', 'sorpresa grito shock'],
      ['😮', 'sorpresa boca abierta'],
      ['🤔', 'pensando duda'],
      ['😴', 'dormido sueno'],
      ['🥵', 'calor picante'],
      ['🥶', 'frio helado'],
      ['😇', 'angel inocente'],
      ['🙃', 'ironico al reves'],
      ['😅', 'nervioso alivio'],
      ['🫶', 'corazon manos amor'],
    ],
  },
  {
    nombre: 'Gestos',
    icono: '👌',
    emojis: [
      ['👌', 'ok perfecto bien'],
      ['👍', 'pulgar arriba like bien'],
      ['👎', 'pulgar abajo mal'],
      ['👏', 'aplausos bravo'],
      ['🙌', 'manos arriba festejo'],
      ['🤝', 'acuerdo saludo mano'],
      ['🙏', 'gracias por favor ruego'],
      ['✌️', 'paz victoria'],
      ['🤙', 'llamame shaka'],
      ['💪', 'fuerza musculo'],
      ['👇', 'abajo flecha mira'],
      ['👉', 'derecha flecha senala'],
      ['👈', 'izquierda flecha'],
      ['☝️', 'arriba atencion uno'],
      ['✋', 'alto mano pare'],
      ['🫵', 'vos te senala'],
    ],
  },
  {
    nombre: 'Delivery',
    icono: '🛵',
    emojis: [
      ['🛵', 'moto delivery reparto'],
      ['🏍️', 'moto'],
      ['🚗', 'auto coche'],
      ['🚚', 'camion reparto'],
      ['🚲', 'bici bicicleta'],
      ['📦', 'paquete caja pedido'],
      ['🛍️', 'bolsa compra'],
      ['🥡', 'para llevar takeaway caja'],
      ['🍽️', 'plato cubiertos comer'],
      ['🥢', 'palitos chinos'],
      ['🧾', 'ticket recibo cuenta'],
      ['💵', 'plata efectivo billete'],
      ['💳', 'tarjeta credito debito'],
      ['📲', 'celular pedido whatsapp'],
      ['📞', 'telefono llamar'],
      ['📍', 'ubicacion direccion donde'],
      ['🕐', 'hora reloj horario'],
      ['🚀', 'rapido veloz'],
    ],
  },
  {
    nombre: 'Destacar',
    icono: '🔥',
    emojis: [
      ['🔥', 'fuego tremendo picante'],
      ['⭐', 'estrella destacado'],
      ['🌟', 'brillo estrella'],
      ['✨', 'brillos nuevo'],
      ['💯', 'cien perfecto total'],
      ['❗', 'importante atencion'],
      ['❓', 'pregunta duda'],
      ['⚡', 'rayo rapido energia'],
      ['🎉', 'fiesta festejo'],
      ['🎊', 'papelitos festejo'],
      ['🎁', 'regalo premio'],
      ['🏆', 'trofeo ganador premio'],
      ['🥇', 'primero oro medalla'],
      ['💥', 'explosion boom'],
      ['🆕', 'nuevo new'],
      ['🆓', 'gratis free'],
      ['🔝', 'top mejor'],
      ['✅', 'listo tilde si'],
      ['❌', 'no cruz mal'],
      ['⏰', 'alarma despertador urgente'],
    ],
  },
  {
    nombre: 'Corazones',
    icono: '❤️',
    emojis: [
      ['❤️', 'corazon rojo amor'],
      ['🧡', 'corazon naranja'],
      ['💛', 'corazon amarillo'],
      ['💚', 'corazon verde'],
      ['💙', 'corazon azul'],
      ['💜', 'corazon violeta'],
      ['🖤', 'corazon negro'],
      ['🤍', 'corazon blanco'],
      ['💖', 'corazon brillante'],
      ['💕', 'corazones dos amor'],
      ['💘', 'flecha cupido'],
      ['💝', 'regalo corazon'],
    ],
  },
  {
    nombre: 'Lugar',
    icono: '🏠',
    emojis: [
      ['🏠', 'casa local'],
      ['🏡', 'casa jardin'],
      ['🏢', 'edificio'],
      ['🏪', 'kiosco tienda local'],
      ['🍴', 'restaurante cubiertos'],
      ['🪑', 'silla mesa salon'],
      ['🌇', 'atardecer tarde'],
      ['🌙', 'noche luna'],
      ['☀️', 'sol dia'],
      ['🌧️', 'lluvia'],
      ['❄️', 'frio nieve invierno'],
      ['🎄', 'navidad arbol'],
      ['🎃', 'halloween calabaza'],
      ['⚽', 'futbol pelota partido'],
      ['🏟️', 'estadio cancha'],
      ['🎵', 'musica nota'],
    ],
  },
];

/** Todos, aplanados, para cuando se busca sin categoría. */
export const TODOS_LOS_EMOJIS = CATEGORIAS_DE_EMOJI.flatMap((c) => c.emojis);

/**
 * Saca tildes y pasa a minúscula.
 *
 * Sin esto, buscar "camion" no encontraría "camión" y buscar "ATENCION" no
 * encontraría nada. Es la diferencia entre un buscador que sirve y uno que
 * funciona sólo si escribís igual que quien cargó la lista.
 */
const normalizar = (texto) =>
  String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Los que coinciden con lo que se escribió. */
export function buscarEmojis(consulta) {
  const busca = normalizar(consulta).trim();
  if (!busca) return [];

  return TODOS_LOS_EMOJIS.filter(([, palabras]) => normalizar(palabras).includes(busca));
}

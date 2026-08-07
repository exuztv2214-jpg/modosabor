// Money conversion helpers – shared between the global middleware (index.js)
// and individual routes that receive multipart/FormData bodies (where the
// global middleware fires before multer has populated req.body).

const MONEY_PATTERNS = [
  'precio',
  'costo',
  'total',
  'subtotal',
  'costo_envio',
  'descuento',
  'monto',
  'efectivo',
  'diferencia',
  'valor',
];

/**
 * Campos de plata cuyo nombre no contiene ninguno de los patrones de arriba.
 *
 * La base guarda todo en centavos y el middleware de respuesta divide por 100
 * solamente los campos que reconoce como plata. Estos siete no los reconocia,
 * asi que viajaban en centavos y la pantalla los mostraba cien veces mas
 * grandes: un ticket promedio de $8.500 se leia "$850.000", los pagos
 * digitales del cierre de caja igual, y la ganancia operativa del control
 * diario tambien.
 *
 * Va por igualdad exacta y no por substring a proposito: "pendiente" o
 * "gastos" como fragmento pisarian contadores como `recompensas_pendientes`
 * o `publicaciones_pendientes`, que son cantidades y no plata.
 */
const MONEY_KEYS = new Set([
  /*
    El margen es plata, pero ningún patrón de arriba lo agarra: no contiene
    "total" ni "precio" ni "monto". El tablero mostraba "Margen de hoy
    $5.700.000" arriba de "Ventas del día $57.000", y encima disparaba el
    aviso de "margen casi 100%, revisá los costos" porque la cuenta se hacía
    entre un número en centavos y otro en pesos.
  */
  'margen',
  'margenBruto',
  'margenBrutoHoy',
  'margenBrutoAyer',
  'margenAyer',
  'ganancia',
  'gananciaBruta',
  'gananciaNeta',
  'costoHoy',
  'costoTotal',
  'recaudado',
  'facturacion',
  'ingreso',
  'ingresos',
  'egreso',
  'egresos',
  /*
    Los dos son `SUM(pedidos.total)` con otro nombre, así que viajan en
    centavos igual que la columna.
  */
  'ingreso_generado',
  'ventas_atribuidas',
  'digitales',
  'ticketPromedio',
  'pendiente',
  'gastos',
  'ingresosExtra',
  'deliveryDiario',
  'gananciaOperativa',
  /*
    ── Repartidores ──

    `facturado` es la suma de `pedidos.total` de un rider: plata pura, en
    centavos como todo lo demás. No lo reconocía ninguno de los patrones, así
    que llegaba sin dividir y la app del rider mostraba "Cobrado hoy
    $1.900.000" cuando en realidad eran $19.000.

    Lo devuelven dos endpoints —las estadísticas del rider y los reportes de
    delivery— y en ninguno de los dos el cliente lo dividía a mano.
  */
  'facturado',
  // ── Personal ──
  // `neto_sugerido_base` sale de `monto_base - pendiente_total`. Los dos
  // sumandos si estaban reconocidos y se dividian por 100, pero el resultado
  // no: la ficha del empleado mostraba "Sueldo base $300.000", "Pendiente
  // $50.000" y "Neto a liquidar $25.000.000".
  'neto_sugerido_base',
  // Mismo caso: el desglose de lo que se le debe a alguien. `descuentos` ya
  // entraba por el patron 'descuento', estos dos hermanos no.
  'pendiente_adelantos',
  'pendiente_consumos',
  'adelantos',
  'consumos',
  // Saldo vivo de un movimiento y lo que queda despues de aplicarlo en una
  // liquidacion. Hoy no se muestran en pantalla, pero viajan en centavos.
  'saldo_pendiente',
  'saldo_restante',
]);

const EXCLUDED_KEYS = new Set([
  'puntos_disponibles',
  'puntos_reconocimiento',
  'total_clientes',
  'total_pedidos',
  'totalPedidos',
  'total_items',
  'totalItems',
  'total_registros',
  'total_tables',
  'total_clientes_con_puntos',
  'condicion_valor',
  'descuento_empleado_pct',
  'descuento_ratio_pct',
]);

/**
 * Columnas que guardan JSON como TEXTO y llevan plata adentro.
 *
 * `productos.variantes` es `[{ nombre, opciones: [{ nombre, precio_extra }] }]`
 * y `productos.extras` es `[{ nombre, precio }]`, pero los dos viven en la base
 * como un string. Para el conversor un string no es plata, asi que esos numeros
 * quedaban afuera del sistema de unidades mientras `productos.precio` —en la
 * misma fila— si se convertia.
 *
 * El resultado eran dos verdades distintas segun quien escribiera la fila:
 *
 *   - El panel de Productos manda multipart, y en el schema `extras` esta
 *     declarado `z.string()`. Nunca se convertia: un extra de $1.200 se
 *     guardaba como 1200. Se veia bien en pantalla, pero `preciosServidor`
 *     suma ese numero a un precio en centavos, asi que en los pedidos de la
 *     web el bacon de $1.200 cobraba $12.
 *
 *   - Operacion → Menu del dia manda JSON, y ahi el precio del postre si se
 *     convertia a centavos antes de copiarse dentro del extra. Se cobraba
 *     bien, pero el TPV lo mostraba como "+$100.000".
 *
 * Los dos rotos, en direcciones opuestas. La unidad canonica es el centavo,
 * igual que `productos.precio` y que lo que ya asume `preciosServidor`; estas
 * dos columnas entran al conversor como cualquier otro campo.
 */
const JSON_MONEY_COLUMNS = new Set(['variantes', 'extras']);

/**
 * Aplica `convert` adentro de una columna JSON y la devuelve como texto.
 *
 * Si el valor no es JSON valido se devuelve intacto: una columna corrupta no
 * puede hacer fallar una respuesta entera.
 */
function convertJsonColumn(raw, convert) {
  if (typeof raw !== 'string' || raw.trim() === '') return raw;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (parsed === null || typeof parsed !== 'object') return raw;
  return JSON.stringify(convert(parsed));
}

function isMoneyKey(key) {
  if (EXCLUDED_KEYS.has(key)) return false;
  if (MONEY_KEYS.has(key)) return true;
  const lower = String(key).toLowerCase();
  return MONEY_PATTERNS.some((pat) => lower.includes(pat));
}

function pesosToCents(obj, parentIsMoneyKey = false) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    return parentIsMoneyKey ? Math.round(obj * 100) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => pesosToCents(item, parentIsMoneyKey));
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (JSON_MONEY_COLUMNS.has(k) && typeof v === 'string') {
        result[k] = convertJsonColumn(v, (parsed) => pesosToCents(parsed, false));
        continue;
      }
      result[k] = pesosToCents(v, isMoneyKey(k));
    }
    return result;
  }
  return obj;
}

function centsToPesos(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(centsToPesos);
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (JSON_MONEY_COLUMNS.has(k) && typeof v === 'string') {
        result[k] = convertJsonColumn(v, centsToPesos);
      } else if (isMoneyKey(k) && typeof v === 'number' && Number.isInteger(v)) {
        result[k] = v / 100;
      } else {
        result[k] = centsToPesos(v);
      }
    }
    return result;
  }
  return obj;
}

module.exports = {
  isMoneyKey,
  pesosToCents,
  centsToPesos,
  MONEY_PATTERNS,
  MONEY_KEYS,
  EXCLUDED_KEYS,
  JSON_MONEY_COLUMNS,
};

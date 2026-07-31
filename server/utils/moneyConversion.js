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

function isMoneyKey(key) {
  if (EXCLUDED_KEYS.has(key)) return false;
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
      if (isMoneyKey(k) && typeof v === 'number' && Number.isInteger(v)) {
        result[k] = v / 100;
      } else {
        result[k] = centsToPesos(v);
      }
    }
    return result;
  }
  return obj;
}

module.exports = { isMoneyKey, pesosToCents, centsToPesos, MONEY_PATTERNS, EXCLUDED_KEYS };

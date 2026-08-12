const mainDb = require('../db');
const { getConfigMap } = require('./mercadoPago');
const { quoteDelivery, parseZones } = require('./deliveryZones');
const { decorateProductsWithInventory } = require('./inventory');
const { resolveInitialPagoEstado } = require('./paymentStatus');
const { loadPedidoItems } = require('./pedidoItems');
const { getCurrentShiftInfo } = require('./shifts');
const { hoyArgentina } = require('./fechaLocal');
const {
  buildPedidoPayload,
  createPedidoWithInventory,
  hydratePedido,
} = require('../services/pedidoService');

const TERM_ALIASES = [
  ['muzza', ['muzza', 'muzzarella', 'muzzarela', 'mozzarella', 'mozza', 'muzarela']],
  ['napolitana', ['napo', 'napolitana']],
  ['jamon y queso', ['jyq', 'jamon y queso', 'jamon queso', 'jamon/queso']],
  ['fugazzeta', ['fugazza', 'fugazzeta']],
  ['cuatro quesos', ['4 quesos', 'cuatro quesos']],
  ['a caballo', ['caballo', 'a caballo']],
  ['con guarnicion', ['con guarnicion', 'con guarni', 'guarnicion', 'con fritas']],
  ['media docena', ['media doc', 'media docena', '1/2 docena', 'media']],
  ['docena', ['doc', 'docena', '12']],
  ['unidad', ['unidad', 'una', '1 unidad']],
  ['grande', ['grande', 'gran', 'gde']],
  ['familiar', ['familiar', 'fam']],
  ['chica', ['chica', 'chico']],
  ['entera', ['entera', 'completa']],
  ['mitad', ['mitad', 'media']],
  ['ternera', ['ternera', 'carne', 'vacuna']],
  ['pollo', ['pollo', 'pechuga']],
  ['coca', ['coca', 'coca cola', 'cocacola']],
];

const CATEGORY_ALIASES = [
  ['Pizzas', ['pizza', 'pizzas', 'muzza', 'muzzas']],
  ['Empanadas', ['empanada', 'empanadas']],
  ['Milanesas', ['milanesa', 'milanesas', 'mila', 'milas']],
  ['Papas', ['papa', 'papas', 'papas fritas']],
];

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function comparablePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Los montos en la base (productos.precio, delivery_zonas.costo_envio,
// pedidos.total, etc.) se guardan en CENTAVOS (convencion del sistema). Todas
// las funciones de este archivo trabajan internamente con esos valores en
// centavos tal cual vienen de la base, asi que cualquier texto legible para
// humanos tiene que dividir por 100 aca. Antes esta funcion no dividia, asi
// que cada *_texto/money_text quedaba inflado x100 (nunca se noto porque este
// modulo no estaba conectado a ninguna ruta todavia).
function formatMoney(value) {
  return `$${(Number(value || 0) / 100).toLocaleString('es-AR')}`;
}

function expandAliasTerms(value) {
  const normalized = normalizeText(value);
  const terms = new Set([normalized]);

  TERM_ALIASES.forEach(([canonical, aliases]) => {
    const normalizedCanonical = normalizeText(canonical);
    const normalizedAliases = aliases.map((alias) => normalizeText(alias));
    if (normalizedCanonical === normalized || normalizedAliases.includes(normalized)) {
      terms.add(normalizedCanonical);
      normalizedAliases.forEach((alias) => terms.add(alias));
      return;
    }

    if (
      normalizedAliases.some((alias) => normalized.includes(alias)) ||
      normalized.includes(normalizedCanonical)
    ) {
      terms.add(normalizedCanonical);
      normalizedAliases.forEach((alias) => terms.add(alias));
    }
  });

  return Array.from(terms).filter(Boolean);
}

function mapCategoryRow(row) {
  if (!row) return null;

  return {
    id: Number(row.id),
    nombre: row.nombre || '',
    icono: row.icono || '',
    color: row.color || '',
    orden: Number(row.orden || 0),
    activo: Number(row.activo) === 1,
  };
}

function mapProductRow(row) {
  if (!row) return null;

  return {
    ...row,
    id: Number(row.id),
    categoria_id: row.categoria_id ? Number(row.categoria_id) : null,
    precio: Number(row.precio || 0),
    costo: Number(row.costo || 0),
    stock_directo: Number(row.stock_directo || 0),
    stock_disponible: Number(row.stock_disponible ?? row.stock_directo ?? 0),
    destacado: Number(row.destacado) === 1,
    activo: Number(row.activo) === 1,
    disponible_para_venta:
      typeof row.disponible_para_venta === 'boolean'
        ? row.disponible_para_venta
        : Number(row.disponible_para_venta) === 1,
    variantes: parseJsonArray(row.variantes),
    extras: parseJsonArray(row.extras),
  };
}

function decorateProducts(db, rows = []) {
  return decorateProductsWithInventory(db, rows).map(mapProductRow);
}

function getBusinessInfo(db) {
  const config = getConfigMap(db);
  return {
    negocio_nombre: config.negocio_nombre || 'Modo Sabor',
    negocio_telefono: config.negocio_telefono || '',
    negocio_direccion: config.negocio_direccion || '',
    metodos_pago: parseJsonArray(config.metodos_pago || '[]'),
    costo_envio_base: Number(config.costo_envio_base || 0),
    tiempo_delivery: Number(config.tiempo_delivery || 0),
    tiempo_retiro: Number(config.tiempo_retiro || 0),
    delivery_validacion_activa: String(config.delivery_validacion_activa || '0') === '1',
  };
}

function getCategories(db, options = {}) {
  const activeOnly = options.activeOnly !== false;
  const query = activeOnly
    ? 'SELECT * FROM categorias WHERE activo = 1 ORDER BY orden ASC, nombre ASC'
    : 'SELECT * FROM categorias ORDER BY orden ASC, nombre ASC';
  return db.prepare(query).all().map(mapCategoryRow);
}

function getProducts(db, options = {}) {
  const params = [];
  let query = `
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE 1 = 1
  `;

  if (options.activeOnly !== false) {
    query += ' AND p.activo = 1';
  }

  if (options.categoryId) {
    query += ' AND p.categoria_id = ?';
    params.push(Number(options.categoryId));
  }

  if (options.excludeMenuDia) {
    query += ' AND COALESCE(p.menu_dia_base, 0) = 0';
  }

  query += ' ORDER BY p.destacado DESC, c.orden ASC, p.nombre ASC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(Number(options.limit));
  }

  const rows = decorateProducts(db, db.prepare(query).all(...params));
  if (options.sellableOnly) {
    return rows.filter((product) => product.disponible_para_venta);
  }
  return rows;
}

function getFeaturedProducts(db, limit = 5) {
  return getProducts(db, {
    activeOnly: true,
    sellableOnly: true,
    limit,
  });
}

function getProductById(db, productId) {
  const row = db
    .prepare(
      `
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE p.id = ?
  `
    )
    .get(Number(productId));

  if (!row) return null;
  return decorateProducts(db, [row])[0] || null;
}

function scoreCategory(category, query) {
  const normalizedQuery = normalizeText(query);
  const categoryTerms = new Set([
    normalizeText(category.nombre),
    ...CATEGORY_ALIASES.filter(
      ([name]) => normalizeText(name) === normalizeText(category.nombre)
    ).flatMap(([, aliases]) => aliases.map((alias) => normalizeText(alias))),
  ]);

  let score = 0;
  categoryTerms.forEach((term) => {
    if (!term) return;
    if (normalizedQuery === term) score = Math.max(score, 120);
    else if (normalizedQuery.includes(term)) score = Math.max(score, 95);
    else if (term.includes(normalizedQuery)) score = Math.max(score, 80);
  });
  return score;
}

function findCategoryMatch(db, query) {
  const categories = getCategories(db);
  const scored = categories
    .map((category) => ({ category, score: scoreCategory(category, query) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.category.orden - right.category.orden ||
        left.category.nombre.localeCompare(right.category.nombre)
    );

  if (!scored.length) {
    return {
      status: 'not_found',
      query,
      categories,
    };
  }

  if (scored.length === 1 || scored[0].score >= scored[1].score + 20) {
    return {
      status: 'single',
      category: scored[0].category,
    };
  }

  return {
    status: 'ambiguous',
    candidates: scored.slice(0, 4).map((entry) => entry.category),
  };
}

function buildProductSearchTerms(product) {
  return Array.from(
    new Set(
      [
        ...expandAliasTerms(product.nombre),
        normalizeText(product.descripcion || ''),
        normalizeText(product.categoria_nombre || ''),
      ].filter(Boolean)
    )
  );
}

function scoreProduct(product, query) {
  const normalizedQuery = normalizeText(query);
  const productName = normalizeText(product.nombre);
  const categoryName = normalizeText(product.categoria_nombre || '');
  const terms = buildProductSearchTerms(product);
  const queryWords = normalizedQuery.split(/\s+/).filter(Boolean);

  let score = 0;
  if (productName === normalizedQuery) score = Math.max(score, 140);
  if (terms.includes(normalizedQuery)) score = Math.max(score, 130);
  if (productName.includes(normalizedQuery)) score = Math.max(score, 115);
  if (normalizedQuery.includes(productName)) score = Math.max(score, 110);
  if (categoryName && normalizedQuery.includes(categoryName)) score += 10;

  const overlap = queryWords.filter(
    (word) => word.length > 1 && terms.some((term) => term.includes(word) || word.includes(term))
  );
  if (overlap.length) {
    score += overlap.length * 10;
  }

  if (product.destacado) score += 2;
  return score;
}

function searchProducts(db, query, limit = 6, options = {}) {
  const products = getProducts(db, {
    activeOnly: true,
    sellableOnly: false,
  });

  const scored = products
    .map((product) => ({
      ...product,
      score: scoreProduct(product, query),
    }))
    .filter((product) => product.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.destacado) - Number(left.destacado) ||
        left.nombre.localeCompare(right.nombre)
    );

  const filtered = options.sellableOnly
    ? scored.filter((product) => product.disponible_para_venta)
    : scored;

  return filtered.slice(0, Number(limit || 6));
}

function findProductMatch(db, query) {
  const results = searchProducts(db, query, 5, { sellableOnly: false });
  if (!results.length) {
    return {
      status: 'not_found',
      query,
      candidates: [],
    };
  }

  if (results.length === 1) {
    return {
      status: 'single',
      product: results[0],
      candidates: results,
    };
  }

  const [top, second] = results;
  const normalizedQuery = normalizeText(query);
  const topIsExact =
    normalizeText(top.nombre) === normalizedQuery ||
    expandAliasTerms(top.nombre).includes(normalizedQuery);

  if (topIsExact && top.score >= second.score + 10) {
    return {
      status: 'single',
      product: top,
      candidates: results,
    };
  }

  if (top.score >= second.score + 20 && top.score >= 110) {
    return {
      status: 'single',
      product: top,
      candidates: results,
    };
  }

  return {
    status: 'ambiguous',
    query,
    candidates: results,
  };
}

function lookupProductsByNames(db, categoryId, names = []) {
  const products = getProducts(db, {
    activeOnly: true,
    categoryId,
    sellableOnly: false,
  });

  return names
    .map((name) => {
      const searchTerms = expandAliasTerms(name);
      return (
        products.find((product) => {
          const productTerms = expandAliasTerms(product.nombre);
          return searchTerms.some(
            (term) => productTerms.includes(term) || normalizeText(product.nombre).includes(term)
          );
        }) || null
      );
    })
    .filter(Boolean);
}

function detectProductType(product) {
  const category = normalizeText(product.categoria_nombre || '');
  const name = normalizeText(product.nombre || '');
  if (category.includes('pizza') || name.includes('pizza')) return 'pizza';
  if (category.includes('empanada') || name.includes('empanada')) return 'empanada';
  if (category.includes('milanesa') || name.includes('mila')) return 'milanesa';
  return 'general';
}

function getFlavorSuggestions(db, product) {
  if (!product?.categoria_id) return [];
  const type = detectProductType(product);
  if (!['pizza', 'empanada'].includes(type)) {
    return [];
  }

  return getProducts(db, {
    activeOnly: true,
    categoryId: product.categoria_id,
    sellableOnly: true,
  })
    .filter((item) => Number(item.id) !== Number(product.id))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      nombre: item.nombre,
      precio: Number(item.precio || 0),
      aliases: expandAliasTerms(item.nombre).filter(
        (alias) => alias !== normalizeText(item.nombre)
      ),
    }));
}

function getOrderRules(product, variantGroups = []) {
  const type = detectProductType(product);
  const optionNames = variantGroups.flatMap((group) =>
    parseJsonArray(group?.opciones).map((option) => normalizeText(option?.nombre || ''))
  );

  return {
    type,
    allows_halves: type === 'pizza',
    supports_flavor_mix: type === 'empanada',
    available_presentations: optionNames.filter(
      (name) =>
        name.includes('unidad') ||
        name.includes('media docena') ||
        name.includes('docena') ||
        name.includes('mitad') ||
        name.includes('entera')
    ),
  };
}

function getProductOptionsDetail(db, productId) {
  const product = getProductById(db, productId);
  if (!product) {
    throw new Error('Producto no encontrado');
  }

  const variantGroups = parseJsonArray(product.variantes).map((group) => ({
    nombre: group?.nombre || '',
    opciones: parseJsonArray(group?.opciones).map((option) => ({
      nombre: option?.nombre || '',
      precio_extra: Number(option?.precio_extra || 0),
    })),
  }));

  const extras = parseJsonArray(product.extras).map((extra) => ({
    nombre: extra?.nombre || '',
    precio: Number(extra?.precio || 0),
  }));

  return {
    id: product.id,
    nombre: product.nombre,
    precio: Number(product.precio || 0),
    categoria: product.categoria_nombre || '',
    descripcion: product.descripcion || '',
    disponible_para_venta: product.disponible_para_venta,
    stock_disponible: Number(product.stock_disponible || 0),
    variant_groups: variantGroups,
    extras,
    sugerencias_sabores: getFlavorSuggestions(db, product),
    order_rules: getOrderRules(product, variantGroups),
  };
}

function matchVariantSelection(group, selectedOptionName) {
  const normalizedOptionName = normalizeText(selectedOptionName);
  const options = parseJsonArray(group?.opciones);

  const scored = options
    .map((option) => {
      const optionLabel = normalizeText(option?.nombre || '');
      const optionTerms = expandAliasTerms(option?.nombre || '');
      const words = optionLabel.split(/\s+/).filter(Boolean);
      let score = 0;

      if (normalizedOptionName === optionLabel) score = Math.max(score, 120);
      if (normalizedOptionName.includes(optionLabel) && optionLabel) score = Math.max(score, 100);
      if (words.length > 0 && words.every((word) => normalizedOptionName.includes(word))) {
        score = Math.max(score, 90 + words.length);
      }

      const includedTerms = optionTerms.filter((term) => normalizedOptionName.includes(term));
      if (includedTerms.length > 0) {
        score = Math.max(score, 40 + includedTerms.reduce((acc, term) => acc + term.length, 0));
      }

      return { option, score };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        String(left.option?.nombre || '').localeCompare(String(right.option?.nombre || ''))
    );

  return scored[0]?.option || null;
}

function matchExtraSelection(extras, name) {
  const normalizedName = normalizeText(name);
  return (
    extras.find((extra) => {
      const extraTerms = expandAliasTerms(extra?.nombre || '');
      return (
        extraTerms.includes(normalizedName) ||
        extraTerms.some((term) => normalizedName.includes(term) || term.includes(normalizedName))
      );
    }) || null
  );
}

function getPresentationCount(selectedVariants) {
  const values = Object.values(selectedVariants || {}).map((option) =>
    normalizeText(option?.nombre || '')
  );
  if (values.some((value) => value.includes('media docena'))) return 6;
  if (values.some((value) => value.includes('docena'))) return 12;
  if (values.some((value) => value.includes('unidad'))) return 1;
  return null;
}

function resolveFlavorNames(db, product, names = []) {
  if (!product?.categoria_id) {
    return names.map((name) => cleanText(name)).filter(Boolean);
  }

  const matched = lookupProductsByNames(db, product.categoria_id, names);
  if (!matched.length) {
    return names.map((name) => cleanText(name)).filter(Boolean);
  }

  return matched.map((item) => item.nombre);
}

function normalizeFlavorCounts(
  db,
  product,
  flavorCounts = [],
  sabores = [],
  selectedVariants = {}
) {
  const fromCounts = parseJsonArray(flavorCounts)
    .map((entry) => ({
      sabor: cleanText(entry?.sabor || entry?.nombre || ''),
      cantidad: Math.max(0, Number(entry?.cantidad || 0)),
    }))
    .filter((entry) => entry.sabor && entry.cantidad > 0);

  if (fromCounts.length > 0) {
    return fromCounts.map((entry) => {
      const resolved = resolveFlavorNames(db, product, [entry.sabor])[0] || entry.sabor;
      return { ...entry, sabor: resolved };
    });
  }

  const fromSabores = resolveFlavorNames(db, product, parseJsonArray(sabores))
    .map((name) => ({ sabor: cleanText(name), cantidad: 1 }))
    .filter((entry) => entry.sabor);
  if (fromSabores.length > 0) {
    return fromSabores;
  }

  const requiredFlavorCount = getPresentationCount(selectedVariants);
  if (detectProductType(product) === 'empanada' && requiredFlavorCount) {
    return [{ sabor: product.nombre, cantidad: requiredFlavorCount }];
  }

  return [];
}

function validateConfiguredSelection(product, selectedVariants, mitadSabores, flavorCounts) {
  const type = detectProductType(product);
  const requiredFlavorCount = getPresentationCount(selectedVariants);

  if (type === 'pizza') {
    if (Array.isArray(mitadSabores) && mitadSabores.length === 1) {
      throw new Error('Para pizza por mitades hacen falta 2 sabores');
    }
    if (Array.isArray(mitadSabores) && mitadSabores.length > 0 && mitadSabores.length !== 2) {
      throw new Error('La pizza por mitades debe tener exactamente 2 sabores');
    }
  }

  if (type === 'empanada' && requiredFlavorCount) {
    const totalRequested = flavorCounts.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    if (totalRequested === 0) {
      throw new Error(`Faltan definir los sabores para completar ${requiredFlavorCount} empanadas`);
    }
    if (totalRequested !== requiredFlavorCount) {
      throw new Error(
        `La seleccion debe sumar ${requiredFlavorCount} empanadas y hoy suma ${totalRequested}`
      );
    }
  }
}

function computeConfiguredPrice(db, product, selectedVariants, selectedExtras, mitadSabores) {
  let basePrice = Number(product.precio || 0);

  if (Array.isArray(mitadSabores) && mitadSabores.length > 1 && product.categoria_id) {
    const related = lookupProductsByNames(db, product.categoria_id, mitadSabores);
    if (related.length) {
      basePrice = Math.max(basePrice, ...related.map((item) => Number(item.precio || 0)));
    }
  }

  const variantsTotal = Object.values(selectedVariants || {}).reduce(
    (acc, option) => acc + Number(option?.precio_extra || 0),
    0
  );
  const extrasTotal = (selectedExtras || []).reduce(
    (acc, extra) => acc + Number(extra?.precio || 0),
    0
  );

  return basePrice + variantsTotal + extrasTotal;
}

function buildConfiguredDescription({
  selectedVariants,
  selectedExtras,
  mitadSabores,
  sabores,
  flavorCounts,
  nota,
}) {
  const parts = [];

  Object.entries(selectedVariants || {}).forEach(([groupName, option]) => {
    if (option?.nombre) {
      parts.push(`${groupName}: ${option.nombre}`);
    }
  });

  if (Array.isArray(mitadSabores) && mitadSabores.length >= 2) {
    parts.push(`Mitades: ${mitadSabores.join(' / ')}`);
  }

  if (Array.isArray(flavorCounts) && flavorCounts.length > 0) {
    parts.push(
      `Sabores: ${flavorCounts.map((item) => `${item.cantidad} ${item.sabor}`).join(', ')}`
    );
  } else if (Array.isArray(sabores) && sabores.length > 0) {
    parts.push(`Sabores: ${sabores.join(', ')}`);
  }

  if (Array.isArray(selectedExtras) && selectedExtras.length > 0) {
    parts.push(`Extras: ${selectedExtras.map((extra) => extra.nombre).join(', ')}`);
  }

  if (nota) {
    parts.push(`Nota: ${nota}`);
  }

  return parts.join(' | ');
}

function configuredItemName(product, mitadSabores, sabores, selectedVariants, flavorCounts) {
  const type = detectProductType(product);
  const variantValues = Object.values(selectedVariants || {})
    .map((option) => option?.nombre)
    .filter(Boolean);
  const normalizedVariants = variantValues.map((value) => normalizeText(value));

  if (type === 'pizza' && Array.isArray(mitadSabores) && mitadSabores.length >= 2) {
    return 'Pizza mitad y mitad';
  }

  const hasPackVariant = normalizedVariants.some(
    (value) => value.includes('docena') || value.includes('media')
  );
  if (
    type === 'empanada' &&
    ((Array.isArray(sabores) && sabores.length > 1) ||
      (Array.isArray(flavorCounts) && flavorCounts.length > 1)) &&
    hasPackVariant
  ) {
    return 'Empanadas surtidas';
  }

  return product.nombre;
}

function resolveSelectionsFromText(db, product, query) {
  const normalizedQuery = normalizeText(query);
  const optionGroups = parseJsonArray(product.variantes);
  const extrasCatalog = parseJsonArray(product.extras);
  const selectedVariants = {};
  const missingGroups = [];

  optionGroups.forEach((group) => {
    const match = matchVariantSelection(group, normalizedQuery);
    if (match) {
      selectedVariants[group.nombre] = {
        nombre: match.nombre,
        precio_extra: Number(match.precio_extra || 0),
      };
      return;
    }

    // En Modo Sabor "una pizza" significa una pizza ENTERA con cremoso.
    // Media o muzza son excepciones que el cliente debe pedir expresamente.
    // Resolverlo aca evita que el modelo pregunte algo que el negocio no
    // pregunta y, sobre todo, hace que el precio se calcule con la variante
    // correcta aunque el proveedor de IA cambie.
    if (detectProductType(product) === 'pizza') {
      const options = parseJsonArray(group?.opciones);
      const wantsHalf = /\b(media|mitad)\b/.test(normalizedQuery);
      const wantsMuzza = /\b(muzza|muzzarella|muzzarela|mozzarella|mozza|muzarela)\b/.test(
        normalizedQuery
      );
      const preferredName = `${wantsHalf ? 'Media' : 'Entera'} ${wantsMuzza ? 'Muzza' : 'Cremoso'}`;
      const defaultOption =
        options.find((option) => normalizeText(option?.nombre) === normalizeText(preferredName)) ||
        options.find(
          (option) =>
            normalizeText(option?.nombre).includes(wantsHalf ? 'media' : 'entera') &&
            (!wantsMuzza || normalizeText(option?.nombre).includes('muzza'))
        );
      if (defaultOption) {
        selectedVariants[group.nombre] = {
          nombre: defaultOption.nombre,
          precio_extra: Number(defaultOption.precio_extra || 0),
        };
        return;
      }
    }

    if (parseJsonArray(group?.opciones).length > 1) {
      missingGroups.push({
        grupo: group?.nombre || '',
        opciones: parseJsonArray(group?.opciones)
          .map((option) => option?.nombre || '')
          .filter(Boolean),
      });
    }
  });

  const selectedExtras = extrasCatalog
    .map((extra) => matchExtraSelection(extrasCatalog, extra?.nombre || ''))
    .filter(Boolean)
    .filter((extra) =>
      expandAliasTerms(query).some((term) => expandAliasTerms(extra.nombre).includes(term))
    );

  const wantsHalves = detectProductType(product) === 'pizza' && normalizedQuery.includes('mitad');
  const normalizedMitades = wantsHalves
    ? resolveFlavorNames(
        db,
        product,
        getFlavorSuggestions(db, product)
          .filter((item) =>
            expandAliasTerms(query).some((term) => expandAliasTerms(item.nombre).includes(term))
          )
          .map((item) => item.nombre)
      )
    : [];

  const normalizedSabores = resolveFlavorNames(
    db,
    product,
    getFlavorSuggestions(db, product)
      .filter((item) =>
        expandAliasTerms(query).some((term) => expandAliasTerms(item.nombre).includes(term))
      )
      .map((item) => item.nombre)
  );
  const normalizedFlavorCounts = normalizeFlavorCounts(
    db,
    product,
    [],
    normalizedSabores,
    selectedVariants
  );

  return {
    selectedVariants,
    selectedExtras,
    normalizedMitades,
    normalizedSabores,
    normalizedFlavorCounts,
    missingGroups,
  };
}

function summarizeProduct(product) {
  return {
    id: product.id,
    nombre: product.nombre,
    categoria: product.categoria_nombre || '',
    precio_base: Number(product.precio || 0),
    disponible_para_venta: product.disponible_para_venta,
    stock_disponible: Number(product.stock_disponible || 0),
  };
}

function quoteProduct(db, query) {
  const match = findProductMatch(db, query);
  if (match.status === 'not_found') {
    return {
      status: 'not_found',
      query,
    };
  }

  if (match.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      query,
      candidates: match.candidates.map(summarizeProduct),
    };
  }

  const product = getProductById(db, match.product.id);
  if (!product) {
    return {
      status: 'not_found',
      query,
    };
  }

  if (Number(product.menu_dia_base || 0) === 1) {
    const shift = getCurrentShiftInfo(getConfigMap(db));
    if (!shift.abierto_ahora || shift.turno_actual?.id !== 'manana') {
      return {
        status: 'unavailable',
        product: summarizeProduct(product),
        message: 'El menú del día se vende solamente durante el turno de la mañana.',
      };
    }
  }

  if (!product.disponible_para_venta) {
    return {
      status: 'unavailable',
      product: summarizeProduct(product),
    };
  }

  const selection = resolveSelectionsFromText(db, product, query);
  if (selection.missingGroups.length > 0) {
    return {
      status: 'needs_clarification',
      product: summarizeProduct(product),
      missing_groups: selection.missingGroups,
    };
  }

  try {
    validateConfiguredSelection(
      product,
      selection.selectedVariants,
      selection.normalizedMitades,
      selection.normalizedFlavorCounts
    );
  } catch (error) {
    return {
      status: 'needs_clarification',
      product: summarizeProduct(product),
      message: error.message || 'Faltan datos para cotizarlo bien',
    };
  }

  const price = computeConfiguredPrice(
    db,
    product,
    selection.selectedVariants,
    selection.selectedExtras,
    selection.normalizedMitades
  );

  if (!Number.isFinite(price) || price <= 0) {
    return {
      status: 'price_unavailable',
      product: summarizeProduct(product),
    };
  }

  return {
    status: 'ok',
    product: summarizeProduct(product),
    price_total: price,
    money_text: formatMoney(price),
    item_name: configuredItemName(
      product,
      selection.normalizedMitades,
      selection.normalizedSabores,
      selection.selectedVariants,
      selection.normalizedFlavorCounts
    ),
    description: buildConfiguredDescription({
      selectedVariants: selection.selectedVariants,
      selectedExtras: selection.selectedExtras,
      mitadSabores: selection.normalizedMitades,
      sabores: selection.normalizedSabores,
      flavorCounts: selection.normalizedFlavorCounts,
      nota: '',
    }),
    // Bloque listo para copiar en crear_pedido. Evita que el modelo pierda
    // la variante que acaba de cotizar entre un mensaje y la confirmación.
    order_item: {
      producto_id: product.id,
      cantidad: 1,
      variantes: selection.selectedVariants,
      extras: selection.selectedExtras,
      mitad_sabores: selection.normalizedMitades,
      sabores: selection.normalizedSabores,
      sabores_cantidades: selection.normalizedFlavorCounts,
      seleccion_texto: cleanText(query),
    },
  };
}

function buildProductPreview(product) {
  const variantGroups = parseJsonArray(product.variantes);
  const optionsSummary = variantGroups
    .map((group) => {
      const options = parseJsonArray(group?.opciones)
        .map((option) => option?.nombre || '')
        .filter(Boolean);
      if (!options.length) return '';
      return `${group?.nombre || 'Opciones'}: ${options.join(', ')}`;
    })
    .filter(Boolean);

  let displayPrice = Number(product.precio || 0);
  let priceLabel = 'Precio';
  if (detectProductType(product) === 'pizza') {
    const presentation = variantGroups.find((group) =>
      normalizeText(group?.nombre).includes('presentacion')
    );
    const wholeCream = parseJsonArray(presentation?.opciones).find(
      (option) => normalizeText(option?.nombre) === 'entera cremoso'
    );
    if (wholeCream) {
      displayPrice += Number(wholeCream.precio_extra || 0);
      priceLabel = 'Entera con cremoso';
    }
  }

  return {
    id: product.id,
    nombre: product.nombre,
    categoria: product.categoria_nombre || '',
    precio_desde: displayPrice,
    precio_desde_texto: formatMoney(displayPrice),
    precio_referencia: priceLabel,
    descripcion: product.descripcion || '',
    disponible_para_venta: product.disponible_para_venta,
    stock_disponible: Number(product.stock_disponible || 0),
    opciones: optionsSummary,
  };
}

function getMenuDiaToday(db) {
  /*
    El menú diario es una foto fechada. `menu_dia_disponible_hoy` queda como
    compatibilidad para la pantalla de Operación, pero no sirve para atender:
    puede quedar encendido desde ayer y terminar ofreciendo platos viejos.
  */
  const fecha = hoyArgentina();
  const rows = db
    .prepare(
      `SELECT p.*, c.nombre AS categoria_nombre,
              h.precio AS precio_hoy,
              h.stock_directo AS stock_hoy,
              h.descripcion AS descripcion_hoy,
              h.destacado AS destacado_hoy,
              h.orden AS orden_hoy
         FROM menu_dia_historial h
         JOIN productos p ON p.id = h.producto_id
         LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE h.fecha = ?
          AND h.disponible = 1
          AND p.activo = 1
          AND h.stock_directo > 0
        ORDER BY h.destacado DESC, h.orden ASC, p.nombre ASC`
    )
    .all(fecha)
    .map((row) => ({
      ...row,
      precio: Number(row.precio_hoy),
      stock_directo: Number(row.stock_hoy),
      descripcion: row.descripcion_hoy || row.descripcion,
      destacado: Number(row.destacado_hoy),
    }));
  return decorateProducts(db, rows)
    .filter((product) => product.disponible_para_venta)
    .map(buildProductPreview);
}

function getMenuOverview(db, options = {}) {
  const categoryQuery = cleanText(options.categoryQuery || '');
  const limitPerCategory = Math.max(1, Number(options.limitPerCategory || 6));

  if (categoryQuery) {
    const categoryMatch = findCategoryMatch(db, categoryQuery);
    if (categoryMatch.status !== 'single') {
      return {
        status: categoryMatch.status,
        query: categoryQuery,
        candidates: categoryMatch.candidates || [],
        categories: getCategories(db),
      };
    }

    const products = getProducts(db, {
      activeOnly: true,
      categoryId: categoryMatch.category.id,
      sellableOnly: true,
      excludeMenuDia: true,
    }).map(buildProductPreview);

    return {
      status: 'ok',
      negocio: getBusinessInfo(db),
      category: categoryMatch.category,
      products,
    };
  }

  const categories = getCategories(db).map((category) => ({
    ...category,
    products: getProducts(db, {
      activeOnly: true,
      categoryId: category.id,
      sellableOnly: true,
      excludeMenuDia: true,
      limit: limitPerCategory,
    }).map(buildProductPreview),
  }));

  return {
    status: 'ok',
    negocio: getBusinessInfo(db),
    categories,
  };
}

function getDeliveryInfo(db, address = '') {
  const config = getConfigMap(db);
  const quote = quoteDelivery(config, address);
  return {
    negocio: getBusinessInfo(db),
    address: cleanText(address),
    available: quote.available,
    matched: quote.matched,
    pending: quote.pending,
    zone_name: quote.zone_name || '',
    costo_envio: Number(quote.costo_envio || 0),
    costo_envio_texto: formatMoney(quote.costo_envio || 0),
    tiempo_estimado_min: Number(quote.tiempo_estimado_min || 0),
    message: quote.message || '',
    zones: parseZones(config).filter((zone) => zone.activa),
  };
}

function pickBestPhoneRow(rows, phoneField, phone) {
  const comparable = comparablePhone(phone);
  if (!comparable) return null;
  const normalizedRows = rows.filter((row) => comparablePhone(row?.[phoneField]) === comparable);
  if (normalizedRows.length) {
    return normalizedRows[0];
  }
  return rows[0] || null;
}

function findClienteByPhone(db, phone) {
  const comparable = comparablePhone(phone);
  if (!comparable) return null;
  const rows = db
    .prepare(
      `
    SELECT *
    FROM clientes
    WHERE REPLACE(REPLACE(REPLACE(telefono, ' ', ''), '+', ''), '-', '') LIKE ?
    ORDER BY id DESC
  `
    )
    .all(`%${comparable}`);
  return pickBestPhoneRow(rows, 'telefono', phone);
}

function getLastOrderByPhone(db, phone) {
  const comparable = comparablePhone(phone);
  if (!comparable) return null;
  const rows = db
    .prepare(
      `
    SELECT *
    FROM pedidos
    WHERE REPLACE(REPLACE(REPLACE(cliente_telefono, ' ', ''), '+', ''), '-', '') LIKE ?
      AND estado != 'cancelado'
    ORDER BY datetime(creado_en) DESC, id DESC
  `
    )
    .all(`%${comparable}`);
  return pickBestPhoneRow(rows, 'cliente_telefono', phone);
}

function summarizeOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    numero: order.numero,
    estado: order.estado,
    total: Number(order.total || 0),
    total_texto: formatMoney(order.total || 0),
    tipo_entrega: order.tipo_entrega || '',
    metodo_pago: order.metodo_pago || '',
    direccion: order.cliente_direccion || '',
    items: loadPedidoItems(mainDb, order, { backfill: false }).map((item) => ({
      nombre: item.nombre || '',
      cantidad: Number(item.cantidad || 0),
      precio_unitario: Number(item.precio_unitario || 0),
    })),
  };
}

function getCustomerSnapshot(db, phone) {
  const cliente = findClienteByPhone(db, phone);
  const lastOrder = getLastOrderByPhone(db, phone);
  const direcciones = cliente
    ? db
        .prepare(
          `
      SELECT id, etiqueta, direccion, referencia, departamento, principal, activa
      FROM cliente_direcciones
      WHERE cliente_id = ? AND activa = 1
      ORDER BY principal DESC, updated_at DESC, id DESC
    `
        )
        .all(cliente.id)
    : [];

  return {
    cliente: cliente
      ? {
          id: cliente.id,
          nombre: cliente.nombre || '',
          telefono: cliente.telefono || '',
          direccion: cliente.direccion || '',
          total_pedidos: Number(cliente.total_pedidos || 0),
          total_gastado: Number(cliente.total_gastado || 0),
        }
      : null,
    direcciones,
    ultimo_pedido: summarizeOrder(lastOrder),
  };
}

function getCurrentOrderSnapshot(db, phone) {
  const order = getLastOrderByPhone(db, phone);
  if (!order) {
    return {
      encontrado: false,
      mensaje: 'No encontré pedidos activos o recientes para este teléfono.',
    };
  }
  const summary = summarizeOrder(order);
  const stateLabels = {
    nuevo: 'recibido por el local',
    confirmado: 'confirmado',
    preparando: 'en preparación',
    listo: order.tipo_entrega === 'delivery' ? 'listo para salir' : 'listo para retirar',
    en_camino: 'en camino',
    entregado: 'entregado',
  };
  return {
    encontrado: true,
    pedido: {
      ...summary,
      estado_texto: stateLabels[order.estado] || order.estado || 'sin estado',
      tiempo_estimado_min: Number(order.eta_min_dinamico || order.tiempo_estimado_min || 0),
      creado_en: order.creado_en || '',
    },
  };
}

// Recalcula el precio unitario SIEMPRE desde el catalogo cuando hay
// producto_id, matcheando variantes/extras por nombre contra lo que el
// producto realmente tiene configurado. Nunca confia en un precio_unitario
// que venga de afuera (agente de IA, o cualquier llamador) para un producto
// conocido - eso evita que un pedido quede cargado con un precio inventado o
// mal calculado. Solo se acepta precio_unitario "a ciegas" para items sin
// producto_id (caso raro, no deberia usarse desde el agente de WhatsApp).
function resolvePriceFromCatalog(product, variantes = {}, extras = []) {
  let total = Number(product?.precio || 0);

  const variantGroups = parseJsonArray(product?.variantes);
  Object.entries(variantes || {}).forEach(([groupName, selected]) => {
    const group = variantGroups.find(
      (g) => normalizeText(g?.nombre || '') === normalizeText(groupName)
    );
    const options = group ? parseJsonArray(group?.opciones) : [];
    const option = options.find(
      (o) => normalizeText(o?.nombre || '') === normalizeText(selected?.nombre || '')
    );
    if (option) total += Number(option.precio_extra || 0);
  });

  const extrasCatalog = parseJsonArray(product?.extras);
  (extras || []).forEach((extra) => {
    const match = extrasCatalog.find(
      (e) => normalizeText(e?.nombre || '') === normalizeText(extra?.nombre || '')
    );
    if (match) total += Number(match.precio || 0);
  });

  return total;
}

function enrichOrderItemsWithCatalog(db, items = []) {
  return (items || []).map((item) => {
    const productId = item?.producto_id ? Number(item.producto_id) : null;
    const product = productId ? getProductById(db, productId) : null;
    if (productId && !product) {
      throw new Error(`No encontre el producto ${productId} en el sistema`);
    }

    const quantity = Math.max(1, Number(item?.cantidad || 1));
    let variants = item?.variantes || {};
    let extras = item?.extras || [];
    const selectionText = cleanText(
      item?.seleccion_texto || item?.descripcion || item?.nombre || ''
    );
    if (product && Object.keys(variants).length === 0 && selectionText) {
      const selection = resolveSelectionsFromText(db, product, selectionText);
      if (selection.missingGroups.length === 0) {
        variants = selection.selectedVariants;
        extras = selection.selectedExtras;
      }
    }
    const variantsForOrder = Object.fromEntries(
      Object.entries(variants).map(([groupName, selected]) => [
        groupName,
        typeof selected === 'string' ? selected : selected?.nombre || '',
      ])
    );
    const unitPrice = product
      ? resolvePriceFromCatalog(product, variants, extras)
      : Number(item?.precio_unitario ?? 0);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      throw new Error(
        `Todavia no tengo un precio validado para ${item?.nombre || product?.nombre || 'ese item'}`
      );
    }

    return {
      producto_id: product?.id || null,
      categoria_id: product?.categoria_id || item?.categoria_id || null,
      nombre: cleanText(item?.nombre || product?.nombre),
      cantidad: quantity,
      precio_unitario: unitPrice,
      variantes: variantsForOrder,
      extras,
      descripcion: cleanText(item?.descripcion || ''),
    };
  });
}

async function createRealOrder(db, body = {}) {
  const existingCustomer = findClienteByPhone(db, body.cliente_telefono || '');
  const enrichedItems = enrichOrderItemsWithCatalog(db, body.items || []);
  const menuDiaIds = enrichedItems
    .map((item) => Number(item.producto_id || 0))
    .filter(Boolean)
    .filter((productId) => {
      const row = db.prepare('SELECT menu_dia_base FROM productos WHERE id = ?').get(productId);
      return Number(row?.menu_dia_base || 0) === 1;
    });
  if (menuDiaIds.length > 0) {
    const shift = getCurrentShiftInfo(getConfigMap(db));
    if (!shift.abierto_ahora || shift.turno_actual?.id !== 'manana') {
      throw new Error('El menú del día solo puede cargarse durante el turno de la mañana');
    }
  }
  const normalizedBody = {
    ...body,
    cliente_nombre: cleanText(body.cliente_nombre || existingCustomer?.nombre || ''),
    cliente_telefono: cleanText(existingCustomer?.telefono || body.cliente_telefono || ''),
    cliente_direccion: cleanText(body.cliente_direccion || ''),
    items: enrichedItems,
    origen: cleanText(body.origen || 'whatsapp') || 'whatsapp',
    // La atencion por WhatsApp es delivery y pago al recibir. Retiro y
    // transferencia solo se conservan cuando el cliente los pidio de forma
    // explicita y el agente los incluyo.
    tipo_entrega: normalizeText(body.tipo_entrega) === 'retiro' ? 'retiro' : 'delivery',
    metodo_pago: normalizeText(body.metodo_pago).includes('transfer')
      ? 'transferencia'
      : 'efectivo',
  };

  const payload = await buildPedidoPayload(normalizedBody, { config: getConfigMap(db) });
  const pedido = createPedidoWithInventory({
    ...payload,
    pago_estado: resolveInitialPagoEstado({
      metodoPago: payload.metodo_pago,
      origen: payload.origen,
    }),
  });
  return hydratePedido(pedido);
}

module.exports = {
  cleanText,
  normalizeText,
  comparablePhone,
  parseJsonArray,
  formatMoney,
  expandAliasTerms,
  getBusinessInfo,
  getCategories,
  getProducts,
  getFeaturedProducts,
  getProductById,
  getProductOptionsDetail,
  getMenuOverview,
  getMenuDiaToday,
  searchProducts,
  findProductMatch,
  findCategoryMatch,
  quoteProduct,
  getDeliveryInfo,
  findClienteByPhone,
  getLastOrderByPhone,
  getCustomerSnapshot,
  getCurrentOrderSnapshot,
  enrichOrderItemsWithCatalog,
  createRealOrder,
};

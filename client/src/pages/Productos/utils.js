export const EMPTY_FORM = {
  nombre: '',
  descripcion: '',
  precio: '',
  precio_anterior: '',
  costo: '',
  categoria_id: '',
  tiempo_preparacion: 15,
  activo: 1,
  destacado: 0,
  imagen: '',
  stock: 0,
};

export const CONTROL =
  'h-11 rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

export function fmtMoney(value) {
  return `$${Number(value || 0).toLocaleString('es-AR')}`;
}

export function rgba(hex, alpha) {
  const clean = (hex || '#f97316').replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  const value = Number.parseInt(full, 16);
  if (Number.isNaN(value)) return `rgba(249,115,22,${alpha})`;
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function codeFor(id, index) {
  return `PROD-${String(id ?? index + 1).padStart(3, '0')}`;
}

export function parseJsonList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saca del editor lo que vino de una lista compartida.
 *
 * La API mezcla las listas asignadas adentro de `variantes` y `extras` para que
 * el TPV, la web y la app del rider no tengan que enterarse de que existen.
 * Pero el formulario de Productos hace el viaje de ida y vuelta: carga esos
 * mismos campos y los vuelve a guardar.
 *
 * Sin filtrarlos, abrir un plato y apretar Guardar le copiaría la lista
 * compartida adentro de su propio JSON. No rompe nada en el momento —se ve
 * igual, se cobra igual— pero a la semana cada plato tiene otra vez su copia
 * privada, y volvemos a los dieciséis lugares donde cambiar el precio del
 * queso extra.
 *
 * Se reconocen por `lista_id`, que se lo pone el servidor al mezclarlas.
 */
export function sinListasCompartidas(items) {
  return (items || []).filter((item) => !item?.lista_id);
}

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeVariantGroups(groups) {
  return (groups || [])
    .map((group) => ({
      nombre: String(group?.nombre || '').trim(),
      opciones: (group?.opciones || [])
        .map((option) => ({
          nombre: String(option?.nombre || '').trim(),
          precio_extra: Number(option?.precio_extra || 0),
        }))
        .filter((option) => option.nombre),
    }))
    .filter((group) => group.nombre && group.opciones.length > 0);
}

export function normalizeExtras(extras) {
  return (extras || [])
    .map((extra) => ({
      nombre: String(extra?.nombre || '').trim(),
      precio: Number(extra?.precio || 0),
    }))
    .filter((extra) => extra.nombre);
}

export function getStructuredPricingConfig(categoryName) {
  const name = normalizeText(categoryName);

  if (name.includes('pizza')) {
    return {
      groupName: 'Presentacion',
      baseOption: 'Entera',
      options: [
        { nombre: 'Entera', label: 'Precio entera' },
        { nombre: 'Mitad', label: 'Precio mitad' },
      ],
      helper:
        'El precio principal visible sera la entera. La mitad se carga como presentacion con precio final propio. Para stock real usa inventario por receta e insumos compartidos.',
    };
  }

  if (name.includes('empanada')) {
    return {
      groupName: 'Presentacion',
      baseOption: 'Docena',
      options: [
        { nombre: 'Docena', label: 'Precio docena' },
        { nombre: 'Media docena', label: 'Precio media docena' },
      ],
      helper:
        'El precio principal visible sera la docena. La media docena se carga como presentacion con precio final propio. Para stock real usa inventario por receta e insumos compartidos.',
    };
  }

  if (name.includes('milanesa')) {
    return {
      groupName: 'Tipo',
      baseOption: 'Ternera',
      options: [
        { nombre: 'Ternera', label: 'Precio carne' },
        { nombre: 'Pollo', label: 'Precio pollo' },
      ],
      helper:
        'El precio principal visible sera el de carne. Pollo se carga como tipo con precio final propio. Para stock real usa inventario por receta e insumos compartidos.',
    };
  }

  return null;
}

export function ensureStructuredPricingGroups(categoryName, groups) {
  const config = getStructuredPricingConfig(categoryName);
  const normalized = normalizeVariantGroups(groups);
  if (!config) return normalized;

  const otherGroups = normalized.filter(
    (group) => normalizeText(group.nombre) !== normalizeText(config.groupName)
  );
  const currentGroup = normalized.find(
    (group) => normalizeText(group.nombre) === normalizeText(config.groupName)
  );
  const optionMap = new Map(
    (currentGroup?.opciones || []).map((option) => [
      normalizeText(option.nombre),
      {
        nombre: String(option?.nombre || '').trim(),
        precio_extra: Number(option?.precio_extra || 0),
      },
    ])
  );

  return [
    {
      nombre: config.groupName,
      opciones: config.options.map((option) => ({
        nombre: option.nombre,
        precio_extra:
          option.nombre === config.baseOption
            ? 0
            : Number(optionMap.get(normalizeText(option.nombre))?.precio_extra || 0),
      })),
    },
    ...otherGroups,
  ];
}

export function normalizeStructuredPricingState(categoryName, basePrice, groups) {
  const config = getStructuredPricingConfig(categoryName);
  const normalizedGroups = normalizeVariantGroups(groups);
  const parsedBase = Number(basePrice || 0);

  if (!config) {
    return {
      basePrice: parsedBase,
      groups: normalizedGroups,
    };
  }

  const pricingGroup = normalizedGroups.find(
    (group) => normalizeText(group.nombre) === normalizeText(config.groupName)
  );
  const currentFinals = new Map();

  (pricingGroup?.opciones || []).forEach((option) => {
    currentFinals.set(normalizeText(option.nombre), parsedBase + Number(option.precio_extra || 0));
  });

  const nextBasePrice = Number(currentFinals.get(normalizeText(config.baseOption)) ?? parsedBase);
  const otherGroups = normalizedGroups.filter(
    (group) => normalizeText(group.nombre) !== normalizeText(config.groupName)
  );

  return {
    basePrice: nextBasePrice,
    groups: [
      {
        nombre: config.groupName,
        opciones: config.options.map((option) => {
          const optionKey = normalizeText(option.nombre);
          const targetFinal = Number(
            currentFinals.get(optionKey) ??
              (optionKey === normalizeText(config.baseOption) ? nextBasePrice : nextBasePrice)
          );
          return {
            nombre: option.nombre,
            precio_extra: targetFinal - nextBasePrice,
          };
        }),
      },
      ...otherGroups,
    ],
  };
}

export function getPricingOptionTotals(categoryName, basePrice, groups) {
  const config = getStructuredPricingConfig(categoryName);
  const normalizedState = normalizeStructuredPricingState(categoryName, basePrice, groups);
  const base = Number(normalizedState.basePrice || 0);
  if (!config) return [{ nombre: 'Precio', label: 'Precio', finalPrice: base }];

  const pricingGroup = normalizedState.groups.find(
    (group) => normalizeText(group.nombre) === normalizeText(config.groupName)
  );
  const optionMap = new Map(
    (pricingGroup?.opciones || []).map((option) => [
      normalizeText(option.nombre),
      Number(option?.precio_extra || 0),
    ])
  );

  return config.options.map((option) => ({
    nombre: option.nombre,
    label: option.label,
    finalPrice:
      base +
      (option.nombre === config.baseOption
        ? 0
        : Number(optionMap.get(normalizeText(option.nombre)) || 0)),
  }));
}

export function updateStructuredPricing(
  categoryName,
  groups,
  basePrice,
  optionName,
  nextFinalPrice
) {
  const config = getStructuredPricingConfig(categoryName);
  const normalizedState = normalizeStructuredPricingState(categoryName, basePrice, groups);
  if (!config)
    return {
      basePrice: Number(nextFinalPrice || basePrice || 0),
      groups: normalizeVariantGroups(groups),
    };

  const currentTotals = getPricingOptionTotals(
    categoryName,
    normalizedState.basePrice,
    normalizedState.groups
  );
  const currentTotalsMap = new Map(
    currentTotals.map((option) => [normalizeText(option.nombre), Number(option.finalPrice || 0)])
  );
  const nextValue = Math.max(0, Number(nextFinalPrice || 0));
  const baseOptionKey = normalizeText(config.baseOption);
  const changedKey = normalizeText(optionName);
  const nextBasePrice =
    changedKey === baseOptionKey ? nextValue : Math.max(0, Number(normalizedState.basePrice || 0));
  const otherGroups = normalizeVariantGroups(normalizedState.groups).filter(
    (group) => normalizeText(group.nombre) !== normalizeText(config.groupName)
  );

  return {
    basePrice: nextBasePrice,
    groups: [
      {
        nombre: config.groupName,
        opciones: config.options.map((option) => {
          const optionKey = normalizeText(option.nombre);
          if (optionKey === baseOptionKey) {
            return { nombre: option.nombre, precio_extra: 0 };
          }

          const targetFinal =
            optionKey === changedKey
              ? nextValue
              : Number(currentTotalsMap.get(optionKey) ?? nextBasePrice);

          return {
            nombre: option.nombre,
            precio_extra: targetFinal - nextBasePrice,
          };
        }),
      },
      ...otherGroups,
    ],
  };
}

export function getVariantTemplate(categoryName) {
  const config = getStructuredPricingConfig(categoryName);
  if (config) {
    return ensureStructuredPricingGroups(categoryName, []);
  }
  return [];
}

export function getTemplateHint(categoryName) {
  const name = normalizeText(categoryName);

  if (name.includes('pizza')) {
    return 'Plantilla sugerida: un producto por gusto. Precio principal = entera. La mitad se elige al vender.';
  }

  if (name.includes('empanada')) {
    return 'Plantilla sugerida: un producto por gusto. Precio principal = docena. La media docena se elige al vender.';
  }

  if (name.includes('milanesa')) {
    return 'Plantilla sugerida: un producto por gusto. Precio principal = carne. Pollo se elige al vender.';
  }

  return 'Usa la plantilla sugerida para arrancar rápido y después ajusta nombres o precios si hace falta.';
}

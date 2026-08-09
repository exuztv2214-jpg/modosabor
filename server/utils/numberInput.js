function parseLocalizedNumber(value, { defaultValue = 0 } = {}) {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : defaultValue;
  }

  let raw = String(value || '').trim();
  if (!raw) return defaultValue;

  raw = raw.replace(/\s+/g, '').replace(/\$/g, '');

  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');

  if (hasDot && hasComma) {
    const lastDot = raw.lastIndexOf('.');
    const lastComma = raw.lastIndexOf(',');
    const decimalSeparator = lastDot > lastComma ? '.' : ',';
    const thousandsSeparator = decimalSeparator === '.' ? ',' : '.';

    raw = raw.split(thousandsSeparator).join('');
    if (decimalSeparator === ',') {
      raw = raw.replace(',', '.');
    }
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ',';
    const parts = raw.split(separator).filter((part) => part !== '');

    if (parts.length > 2) {
      raw = parts.join('');
    } else if (parts.length === 2) {
      const [integerPart, decimalPart] = parts;
      if (decimalPart.length === 3) {
        raw = `${integerPart}${decimalPart}`;
      } else {
        raw = `${integerPart}.${decimalPart}`;
      }
    }
  }

  raw = raw.replace(/[^0-9.-]/g, '');

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function roundLocalizedNumber(value) {
  return Math.round(parseLocalizedNumber(value) * 100) / 100;
}

/**
 * Pasa a centavos un importe escrito a mano.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * Todo el sistema guarda la plata en centavos, y el conversor de la API se
 * ocupa de multiplicar lo que entra. Pero ese conversor **sólo mira los
 * números**, y hay formularios que mandan texto: campos donde se escribe
 * "150.000" con separador de miles, como se escribe en la vida real.
 *
 *     pesosToCents({ monto_base: 150000 })    → 15000000   (número: convierte)
 *     pesosToCents({ monto_base: '150000' })  → '150000'   (texto: lo deja)
 *
 * Ese texto pasaba de largo, la ruta lo interpretaba con
 * `roundLocalizedNumber` —que devuelve pesos— y lo guardaba tal cual en una
 * columna de centavos. Le pasó al módulo de Personal entero: la ficha mostraba
 * "$100" donde se habían cargado $10.000, y al liquidar, ese número iba a
 * `caja_movimientos.monto`, que sí está en centavos. La caja registraba los
 * pagos al personal cien veces más chicos.
 *
 * ── Cuándo usarla y cuándo no ──────────────────────────────────────────────
 *
 * Sólo para lo que llega de un formulario. Si el valor cae de vuelta a algo ya
 * guardado —`existing.monto_base`, por ejemplo— ese ya está en centavos y
 * multiplicarlo otra vez es el error inverso, que tampoco avisa.
 *
 * Y sólo para plata. Cantidades, unidades y porcentajes se escriben igual pero
 * no se convierten: multiplicar un porcentaje por cien no da un número raro,
 * da uno plausible y equivocado.
 *
 * Vive acá, junto a las otras funciones de números, y no adentro de una ruta,
 * para que los tests puedan probar la de verdad. La primera versión estaba
 * metida en `routes/personal.js` y el test tenía una copia: cuando se probó
 * rompiendo la multiplicación, el test siguió en verde porque estaba midiendo
 * su propia copia.
 */
function pesosACentavos(value) {
  return Math.round(roundLocalizedNumber(value) * 100);
}

module.exports = {
  parseLocalizedNumber,
  roundLocalizedNumber,
  pesosACentavos,
};

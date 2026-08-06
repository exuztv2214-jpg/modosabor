/**
 * Pruebas de la ruta por calles.
 *
 * Se corren con:  node client/src/lib/rutaCalles.test.mjs
 *
 * Lo que se verifica acá es lo que rompe en silencio: el orden lng/lat que pide
 * OSRM (invertirlo devuelve rutas en el océano) y que cualquier falla del
 * servicio termine en `null` para que el mapa vuelva a la línea recta en vez de
 * quedarse colgado.
 */
import assert from 'node:assert';

const { metrosEntre, necesitaRecalcular, obtenerRutaPorCalles } = await import('./rutaCalles.js');

let fallos = 0;
const test = async (nombre, fn) => {
  try {
    await fn();
    console.log(`  OK   ${nombre}`);
  } catch (error) {
    fallos += 1;
    console.error(`  FALLA ${nombre}`);
    console.error(`        ${error.message}`);
  }
};

console.log('\nTests de rutaCalles.js');

// ── Distancia ──────────────────────────────────────────────────────────────
await test('mide bien una distancia conocida', () => {
  // Dos puntos separados ~1113 m en latitud (0.01°).
  const d = metrosEntre(-27.16, -65.49, -27.17, -65.49);
  assert.ok(d > 1050 && d < 1150, `esperaba ~1113 m, dio ${Math.round(d)}`);
});

// ── Cuándo recalcular ──────────────────────────────────────────────────────
await test('la primera vez siempre calcula', () => {
  assert.strictEqual(necesitaRecalcular(null, -27.16, -65.49), true);
});

await test('no recalcula si el rider casi no se movió', () => {
  const origen = { lat: -27.16, lng: -65.49 };
  // ~11 metros
  assert.strictEqual(necesitaRecalcular(origen, -27.1601, -65.49), false);
});

await test('recalcula si se movió más de 150 m', () => {
  const origen = { lat: -27.16, lng: -65.49 };
  // ~333 metros
  assert.strictEqual(necesitaRecalcular(origen, -27.163, -65.49), true);
});

await test('coordenadas inválidas no disparan un pedido', () => {
  assert.strictEqual(necesitaRecalcular(null, NaN, -65.49), false);
});

// ── Llamada al servicio ────────────────────────────────────────────────────
const fetchOriginal = globalThis.fetch;

await test('arma la URL con el orden lng,lat que espera OSRM', async () => {
  let urlPedida = '';
  globalThis.fetch = async (url) => {
    urlPedida = url;
    return {
      ok: true,
      json: async () => ({
        routes: [
          {
            geometry: { coordinates: [[-65.49, -27.16], [-65.5, -27.17]] },
            distance: 1200,
            duration: 300,
          },
        ],
      }),
    };
  };

  const ruta = await obtenerRutaPorCalles({
    desdeLat: -27.16,
    desdeLng: -65.49,
    hastaLat: -27.17,
    hastaLng: -65.5,
  });

  assert.ok(
    urlPedida.includes('-65.49,-27.16;-65.5,-27.17'),
    `la URL debe ir lng,lat — salió: ${urlPedida}`
  );
  // Y de vuelta tiene que devolver [lat, lng] para Leaflet.
  assert.deepStrictEqual(ruta.puntos[0], [-27.16, -65.49]);
  assert.strictEqual(ruta.metros, 1200);
});

await test('si el servicio responde con error devuelve null', async () => {
  globalThis.fetch = async () => ({ ok: false });
  assert.strictEqual(
    await obtenerRutaPorCalles({
      desdeLat: -27.16,
      desdeLng: -65.49,
      hastaLat: -27.17,
      hastaLng: -65.5,
    }),
    null
  );
});

await test('si el servicio se cae devuelve null en vez de romper', async () => {
  globalThis.fetch = async () => {
    throw new Error('ECONNREFUSED');
  };
  assert.strictEqual(
    await obtenerRutaPorCalles({
      desdeLat: -27.16,
      desdeLng: -65.49,
      hastaLat: -27.17,
      hastaLng: -65.5,
    }),
    null
  );
});

await test('una respuesta sin ruta devuelve null', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ routes: [] }) });
  assert.strictEqual(
    await obtenerRutaPorCalles({
      desdeLat: -27.16,
      desdeLng: -65.49,
      hastaLat: -27.17,
      hastaLng: -65.5,
    }),
    null
  );
});

await test('coordenadas inválidas ni llaman al servicio', async () => {
  let llamo = false;
  globalThis.fetch = async () => {
    llamo = true;
    return { ok: true, json: async () => ({}) };
  };
  const ruta = await obtenerRutaPorCalles({ desdeLat: null, desdeLng: null });
  assert.strictEqual(ruta, null);
  assert.strictEqual(llamo, false, 'no debería haber llamado al servicio');
});

globalThis.fetch = fetchOriginal;

console.log(fallos === 0 ? '\nTodos los tests de rutaCalles pasaron' : `\n${fallos} fallaron`);
process.exit(fallos > 0 ? 1 : 0);

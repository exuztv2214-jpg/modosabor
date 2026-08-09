/**
 * Que una pestaña vieja se recupere sola después de un deploy.
 *
 * El sistema se parte en pedazos que se bajan cuando hacen falta, y cada uno
 * lleva un código en el nombre: `Operacion-UyuekIOu.js`. Al deployar ese
 * código cambia. Una pestaña que ya estaba abierta se quedó con la lista vieja
 * en memoria —una aplicación de este tipo no vuelve a pedir el index.html
 * mientras corre— así que al entrar a una pantalla que todavía no había
 * visitado pide un archivo que ya no existe.
 *
 * Pasó de verdad: se deployó a las 21:30, en pleno servicio, y al entrar a
 * Operación saltó "Failed to fetch dynamically imported module".
 *
 * Este test cubre las dos mitades del arreglo: reconocer el error en los
 * distintos navegadores, y que el servidor mande las cabeceras de caché que
 * hacen que la recarga traiga la versión nueva de verdad.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

/** Copia de la detección del cliente, para poder probarla desde acá. */
function esVersionVieja(mensajeCrudo) {
  const mensaje = String(mensajeCrudo || '').toLowerCase();
  return (
    mensaje.includes('dynamically imported module') ||
    mensaje.includes('error loading dynamically') ||
    mensaje.includes('importing a module script failed') ||
    mensaje.includes('failed to fetch dynamically') ||
    mensaje.includes('unable to preload css')
  );
}

function run() {
  console.log('\n🔄 Pestaña vieja después de un deploy\n');

  // ── Lo que dice cada navegador ────────────────────────────────────────────
  //
  // El mensaje de Chrome es el que se vio en pantalla. Los otros salen de que
  // cada motor redacta el suyo, y el local usa lo que tenga cada uno.
  const deVerdad = [
    'Failed to fetch dynamically imported module: https://modosabor.com.ar/assets/Operacion-UyuekIOu.js',
    'error loading dynamically imported module',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/index-abc123.css',
  ];
  for (const mensaje of deVerdad) {
    assert.ok(esVersionVieja(mensaje), `no reconoció: ${mensaje}`);
  }
  console.log(`  ✓ reconoce el error en los ${deVerdad.length} navegadores`);

  // ── Lo que NO tiene que recargar ──────────────────────────────────────────
  //
  // Esto es lo que más importa. Recargar ante cualquier error convierte un bug
  // común en una pantalla que parpadea para siempre, y encima se lleva puesto
  // el pedido que el cajero estaba cargando.
  const otrosErrores = [
    "Cannot read properties of undefined (reading 'total')",
    'Network request failed',
    'pedido is not defined',
    'Unexpected token < in JSON at position 0',
    '',
    null,
  ];
  for (const mensaje of otrosErrores) {
    assert.ok(!esVersionVieja(mensaje), `recargaría de más por: ${mensaje}`);
  }
  console.log('  ✓ no recarga por errores comunes de la aplicación');

  // ── Que el cliente siga teniendo la protección contra el bucle ────────────
  //
  // Recargar una sola vez por pestaña. Si después de recargar vuelve a fallar
  // ya no es la versión vieja —puede ser la red— y seguir recargando deja la
  // pantalla parpadeando sin que nadie llegue a leer qué pasó.
  const boundary = fs.readFileSync(
    path.join(__dirname, '../../../client/src/components/AppErrorBoundary.jsx'),
    'utf8'
  );
  assert.ok(boundary.includes('sessionStorage'), 'se perdió la marca que evita el bucle');
  assert.ok(boundary.includes('window.location.reload'), 'ya no recarga');
  assert.ok(
    boundary.includes('esVersionVieja'),
    'la recarga dejó de estar condicionada al error de versión'
  );
  console.log('  ✓ recarga una sola vez por pestaña, no en bucle');

  // ── Las cabeceras de caché ────────────────────────────────────────────────
  //
  // La recarga sólo sirve si el navegador vuelve a pedir el index.html. Si se
  // sirviera con caché, recargaría y volvería a recibir la lista vieja: el
  // mismo error, ahora en bucle. Y al revés, los archivos con hash en el
  // nombre se pueden guardar para siempre, porque ese nombre nunca va a
  // apuntar a otro contenido.
  const indexServidor = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
  assert.ok(
    indexServidor.includes('max-age=31536000, immutable'),
    'los archivos con hash dejaron de cachearse para siempre'
  );
  assert.ok(
    indexServidor.includes("'Cache-Control', 'no-cache'"),
    'el index.html se está cacheando'
  );
  console.log('  ✓ el index.html no se cachea y los assets sí\n');

  console.log('✅ Pestaña vieja: todo en orden\n');
}

if (require.main === module) run();

module.exports = { run };

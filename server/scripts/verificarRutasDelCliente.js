/**
 * Compara lo que el cliente llama contra lo que el servidor expone.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * La pantalla de Menú del día llamaba a `PUT /operacion/menu-dia`. Esa ruta no
 * existe: el servidor sólo tiene `POST`. La pantalla compilaba, pasaba el lint,
 * se veía perfecta, y no podía guardar nada. El error recién aparecía apretando
 * Guardar, en el navegador, con un 404 disfrazado de "No se pudo guardar".
 *
 * Ni el build ni los tests lo agarran, porque del lado del cliente es un string
 * y del lado del servidor es otro string, y nadie los compara.
 *
 * Esto los compara.
 *
 * ── Qué hace y qué no ──────────────────────────────────────────────────────
 *
 * Lee cada `api.get(...)`, `api.post(...)`, etc. del cliente y busca una ruta
 * que coincida entre las registradas en `server/routes/*.js`.
 *
 * Sólo mira llamadas con la ruta escrita literal. Una armada con plantilla
 * —`api.get(\`/pedidos/${id}\`)`— se cuenta como "no verificable" y se lista
 * aparte: es preferible decir "esto no lo sé" a dar por buena una ruta que
 * nunca se miró.
 *
 *     node server/scripts/verificarRutasDelCliente.js
 *
 * Sale con código 1 si encuentra una llamada rota, así puede ir en un hook de
 * pre-commit.
 */

const fs = require('fs');
const path = require('path');

const raizServidor = path.join(__dirname, '..');
const raizCliente = path.join(raizServidor, '..', 'client', 'src');
const carpetaRutas = path.join(raizServidor, 'routes');

/** Todos los .js/.jsx de una carpeta, recursivo. */
function archivos(carpeta, extensiones) {
  const encontrados = [];
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const completo = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      encontrados.push(...archivos(completo, extensiones));
      continue;
    }
    if (extensiones.some((ext) => entrada.name.endsWith(ext))) encontrados.push(completo);
  }
  return encontrados;
}

/*
  Los comentarios se sacan antes de buscar.

  No es un detalle: en este repo ya pasó tres veces que una búsqueda encontró
  el comentario que explicaba el código en vez del código, y dio por bueno algo
  que no estaba. Un ejemplo escrito en un comentario no es una llamada real.
*/
function sinComentarios(texto) {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Dónde monta index.js cada archivo de rutas.
 *
 * Acá se monta en línea —`app.use('/api/pedidos', require('./routes/pedidos'))`—
 * y no con una variable intermedia. Se lee el nombre del archivo directo del
 * require, que además es exacto: no hay que adivinar qué variable corresponde
 * a qué archivo.
 *
 * Devuelve, por ejemplo: 'pedidos' → '/api/pedidos'.
 */
function prefijosDeMontaje() {
  const indice = sinComentarios(fs.readFileSync(path.join(raizServidor, 'index.js'), 'utf8'));
  const prefijos = new Map();
  const patron =
    /app\.use\(\s*['"](\/api[^'"]*)['"]\s*,(?:[^)]*?)require\(\s*['"]\.\/routes\/([\w-]+)['"]\s*\)/g;
  let coincidencia;
  while ((coincidencia = patron.exec(indice))) {
    prefijos.set(coincidencia[2], coincidencia[1]);
  }
  return prefijos;
}

function rutasDelServidor() {
  const prefijos = prefijosDeMontaje();
  const rutas = [];

  for (const archivo of archivos(carpetaRutas, ['.js'])) {
    const texto = sinComentarios(fs.readFileSync(archivo, 'utf8'));
    const prefijo = prefijos.get(path.basename(archivo, '.js'));
    if (!prefijo) continue;

    const patron = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]*)['"]/g;
    let coincidencia;
    while ((coincidencia = patron.exec(texto))) {
      const ruta = (prefijo + coincidencia[2]).replace(/\/+$/, '') || '/';
      rutas.push({
        metodo: coincidencia[1].toUpperCase(),
        ruta,
        archivo: path.relative(raizServidor, archivo),
      });
    }
  }
  return rutas;
}

function llamadasDelCliente() {
  const literales = [];
  const dinamicas = [];

  for (const archivo of archivos(raizCliente, ['.js', '.jsx'])) {
    const texto = sinComentarios(fs.readFileSync(archivo, 'utf8'));
    const relativo = path.relative(path.join(raizCliente, '..', '..'), archivo);

    const patronLiteral = /\bapi\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
    let coincidencia;
    while ((coincidencia = patronLiteral.exec(texto))) {
      literales.push({
        metodo: coincidencia[1].toUpperCase(),
        ruta: coincidencia[2],
        archivo: relativo,
      });
    }

    const patronPlantilla = /\bapi\.(get|post|put|patch|delete)\(\s*`([^`]+)`/g;
    while ((coincidencia = patronPlantilla.exec(texto))) {
      dinamicas.push({
        metodo: coincidencia[1].toUpperCase(),
        ruta: coincidencia[2],
        archivo: relativo,
      });
    }
  }
  return { literales, dinamicas };
}

/** `/pedidos/:id` matchea `/pedidos/7`. */
function coincide(rutaServidor, rutaCliente) {
  const partesServidor = rutaServidor.split('/').filter(Boolean);
  const partesCliente = rutaCliente.split('?')[0].split('/').filter(Boolean);
  if (partesServidor.length !== partesCliente.length) return false;
  return partesServidor.every(
    (parte, indice) => parte.startsWith(':') || parte === partesCliente[indice]
  );
}

function main() {
  const rutas = rutasDelServidor();
  const { literales, dinamicas } = llamadasDelCliente();

  console.log('\n🔌 Llamadas del cliente contra rutas del servidor\n');
  console.log(`   ${rutas.length} rutas registradas · ${literales.length} llamadas literales\n`);

  const rotas = [];
  for (const llamada of literales) {
    // El cliente escribe '/pedidos'; el servidor las monta bajo '/api'.
    const completa = llamada.ruta.startsWith('/api') ? llamada.ruta : `/api${llamada.ruta}`;
    const existeRuta = rutas.some((r) => coincide(r.ruta, completa));
    if (!existeRuta) {
      rotas.push({ ...llamada, completa, motivo: 'no existe esa ruta' });
      continue;
    }
    const existeMetodo = rutas.some(
      (r) => r.metodo === llamada.metodo && coincide(r.ruta, completa)
    );
    if (!existeMetodo) {
      const metodos = rutas
        .filter((r) => coincide(r.ruta, completa))
        .map((r) => r.metodo)
        .join(', ');
      rotas.push({ ...llamada, completa, motivo: `la ruta existe pero sólo con ${metodos}` });
    }
  }

  if (rotas.length === 0) {
    console.log('   ✅ Ninguna llamada rota.\n');
  } else {
    console.log(`   ❌ ${rotas.length} llamada${rotas.length === 1 ? '' : 's'} rota:\n`);
    for (const rota of rotas) {
      console.log(`      ${rota.metodo} ${rota.completa}`);
      console.log(`         ${rota.motivo}`);
      console.log(`         ${rota.archivo}\n`);
    }
  }

  if (dinamicas.length > 0) {
    console.log(`   ⓘ  ${dinamicas.length} llamadas con la ruta armada por plantilla.`);
    console.log('      No se pueden verificar así; hay que mirarlas a ojo.\n');
  }

  if (rotas.length > 0) process.exitCode = 1;
}

main();

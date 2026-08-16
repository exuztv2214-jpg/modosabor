const fs = require('fs');
const path = require('path');

/*
  Los tests se cargan todos en este mismo proceso, así que el primero que
  hace `require('../../db')` dispara el seed para todos. Si la tabla de
  usuarios está vacía, `seed.js` corta con:

      No hay usuarios creados y faltan INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD

  En una máquina de trabajo eso no pasa nunca —la base ya tiene usuarios—, pero
  en el CI el checkout es limpio y la base nace vacía. Un solo `require` se
  cae y arrastra a los sesenta y pico que vienen atrás, que es por qué el CI
  reportaba decenas de tests rotos cuando el problema era uno.

  Se definen acá, antes de cargar nada, y con valores obviamente de prueba: no
  son credenciales, son lo que hace falta para que la base arranque vacía.
*/
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.INITIAL_ADMIN_EMAIL = process.env.INITIAL_ADMIN_EMAIL || 'test@example.invalid';
process.env.INITIAL_ADMIN_PASSWORD = process.env.INITIAL_ADMIN_PASSWORD || 'test-only-password';

function findTests(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findTests(fullPath));
    } else if (entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function run() {
  const testsDir = path.join(__dirname, 'utils');
  const tests = findTests(testsDir);

  console.log(`🔍 Encontrados ${tests.length} archivos de test\n`);

  let passed = 0;
  let failed = 0;

  for (const testFile of tests) {
    try {
      const modulo = require(testFile);
      /*
        Hay dos estilos de test en esta carpeta. Los viejos hacen sus
        comprobaciones mientras se cargan, así que con el `require` alcanza.
        Los nuevos las meten adentro de una función `run` y la llaman sólo si
        el archivo se ejecuta directo:

            if (require.main === module) run();
            module.exports = { run };

        Eso, visto desde acá, es un archivo que se carga sin hacer nada. Siete
        de los veintinueve tests estaban en ese grupo: se cargaban, no
        fallaban, y se contaban como pasados. `npm test` daba verde sin haber
        probado una sola de sus comprobaciones.

        Se descubrió al agregar un test que estaba escrito así y ver que el
        resultado no cambiaba ni rompiendo a propósito el código que probaba.
      */
      if (typeof modulo?.run === 'function') await modulo.run();
      passed++;
    } catch (error) {
      failed++;
      console.error(`❌ Test falló: ${testFile}`);
      console.error(error.message);
    }
  }

  console.log(`\n📊 Resultados: ${passed} pasados, ${failed} fallados`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

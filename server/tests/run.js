const fs = require('fs');
const path = require('path');

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

function run() {
  const testsDir = path.join(__dirname, 'utils');
  const tests = findTests(testsDir);

  console.log(`🔍 Encontrados ${tests.length} archivos de test\n`);

  let passed = 0;
  let failed = 0;

  for (const testFile of tests) {
    try {
      require(testFile);
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

run();

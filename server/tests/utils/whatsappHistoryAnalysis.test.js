const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function run() {
  console.log('\nTests del análisis seudonimizado de WhatsApp');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'modo-wa-analysis-'));
  const input = path.join(work, 'historial.json');
  const script = path.resolve(__dirname, '../../../agente-whatsapp/analizar-historial.js');
  const outputDir = path.resolve(__dirname, '../../../agente-whatsapp/entrenamiento');
  const outputNames = [
    'resumen-historial.json',
    'configuracion-generada.json',
    'manual-atencion.md',
  ];
  const previous = outputNames.map((name) => {
    const target = path.join(outputDir, name);
    return { name, content: fs.existsSync(target) ? fs.readFileSync(target) : null };
  });

  fs.writeFileSync(
    input,
    JSON.stringify({
      tipo: 'analisis_seudonimizado',
      chats: [
        {
          chat_id: 'chat_demo',
          nombre: '[CLIENTE]',
          mensajes: [
            { timestamp: 1_700_000_000, from_me: false, texto: 'Hola quiero una pizza' },
            { timestamp: 1_700_000_060, from_me: true, texto: 'Dale, ¿qué variedad?' },
          ],
        },
      ],
    })
  );

  try {
    execFileSync(process.execPath, [script, input], { stdio: 'pipe' });
    const result = JSON.parse(fs.readFileSync(path.join(outputDir, 'resumen-historial.json')));
    assert.strictEqual(result.volumen.chats, 1);
    assert.strictEqual(result.volumen.mensajes, 2);
    assert.strictEqual(result.familias_producto.find((item) => item.name === 'pizzas').count, 1);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('Hola quiero una pizza'));
    assert.ok(!serialized.includes('chat_demo'));
    console.log('  ✓ genera agregados sin copiar chats ni identificadores');
  } finally {
    for (const file of previous) {
      const target = path.join(outputDir, file.name);
      if (file.content) fs.writeFileSync(target, file.content);
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log('✅ Análisis de historial verificado\n');
}

module.exports = { run };

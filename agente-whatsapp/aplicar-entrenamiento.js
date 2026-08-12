const fs = require('fs');
const path = require('path');

const db = require('../server/db');

const configPath = path.join(__dirname, 'entrenamiento', 'configuracion-generada.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const allowedKeys = [
  'whatsapp_agente_nombre',
  'whatsapp_agente_estilo',
  'whatsapp_agente_reglas_generales',
  'whatsapp_agente_reglas_turnos',
  'whatsapp_agente_ejemplos',
];

const save = db.prepare(
  `INSERT INTO configuracion (clave, valor)
   VALUES (?, ?)
   ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
);

db.transaction(() => {
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(config, key)) {
      throw new Error(`Falta la clave requerida: ${key}`);
    }
    const value =
      key === 'whatsapp_agente_reglas_turnos' ? JSON.stringify(config[key]) : String(config[key]);
    save.run(key, value);
  }

  // El entrenamiento nunca habilita respuestas reales por sí solo.
  save.run('whatsapp_atencion_ia_activa', '0');
})();

console.log(
  JSON.stringify({
    ok: true,
    claves_actualizadas: allowedKeys.length,
    atencion_ia_activa: false,
  })
);

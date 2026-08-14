const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const alerts = fs.readFileSync(
  path.join(root, 'client', 'src', 'components', 'GlobalOrderAlerts.jsx'),
  'utf8'
);
const whatsapp = fs.readFileSync(
  path.join(root, 'client', 'src', 'components', 'Configuracion', 'SeccionWhatsapp.jsx'),
  'utf8'
);

console.log('\nTests de alerta humana para WhatsApp');

assert.ok(alerts.includes("socketManager.on(\n      'whatsapp_necesita_persona'"));
assert.ok(alerts.includes('runOrderAlert({'));
assert.ok(alerts.includes('WhatsApp necesita una persona'));
assert.ok(alerts.includes("query.set('conversacion'"));
assert.ok(alerts.includes('unsubscribeWhatsappHuman()'));
assert.ok(whatsapp.includes('whatsapp-conversacion-${chat.id}'));
assert.ok(whatsapp.includes("scrollIntoView({ behavior: 'smooth'"));

console.log('  ✓ suena, muestra el motivo, navega y resalta la conversación existente');
console.log('✅ Alerta humana de WhatsApp verificada\n');

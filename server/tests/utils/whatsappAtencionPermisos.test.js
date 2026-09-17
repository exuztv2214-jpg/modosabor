const assert = require('assert');
const { permisoWhatsapp } = require('../../utils/whatsappPermissions');
const { hasPermission } = require('../../utils/permissions');

for (const [method, path] of [
  ['GET', '/conversaciones'],
  ['GET', '/conversaciones/12/mensajes'],
  ['PUT', '/conversaciones/12/control'],
  ['POST', '/responder'],
]) {
  assert.equal(permisoWhatsapp(method, path), 'whatsapp.attend');
  assert.equal(hasPermission({ rol: 'caja' }, permisoWhatsapp(method, path)), true);
  assert.equal(hasPermission({ rol: 'cocina' }, permisoWhatsapp(method, path)), false);
}
for (const [method, path] of [
  ['POST', '/conectar'],
  ['POST', '/desconectar'],
  ['GET', '/config'],
  ['GET', '/estado'],
  ['POST', '/campanas'],
  ['DELETE', '/conversaciones/12'],
  ['GET', '/conversaciones/12/exportar'],
]) {
  assert.equal(permisoWhatsapp(method, path), 'marketing.edit');
  assert.equal(hasPermission({ rol: 'caja' }, permisoWhatsapp(method, path)), false);
  assert.equal(hasPermission({ rol: 'admin' }, permisoWhatsapp(method, path)), true);
}
console.log('✓ Atención de Caja separada de administración de WhatsApp');

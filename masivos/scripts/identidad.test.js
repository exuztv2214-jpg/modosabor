const assert = require('node:assert/strict');
const { test } = require('node:test');
const { imagenIdentidad, usuarioPerfil } = require('../identidad');
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=';
test('la carga de identidad acepta PNG y rechaza SVG, archivos falsos y exceso de tamaño', () => {
  assert.equal(imagenIdentidad(png).extension, 'png');
  assert.throws(() => imagenIdentidad('data:image/svg+xml;base64,PHN2Zz4='));
  assert.throws(() => imagenIdentidad('data:image/png;base64,aG9sYQ=='));
  assert.throws(() => imagenIdentidad('data:image/png;base64,' + 'A'.repeat(3 * 1024 * 1024)));
});
test('el perfil usa solo la identidad del proxy autenticado o el usuario local', () => {
  const req = { headers: { 'x-masivos-user-id': '../../otro' } };
  assert.equal(usuarioPerfil(req, false), 'local');
  assert.throws(() => usuarioPerfil(req, true));
  req.headers['x-masivos-user-id'] = '42';
  assert.equal(usuarioPerfil(req, true), '42');
});

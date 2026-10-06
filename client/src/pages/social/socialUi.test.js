import test from 'node:test';
import assert from 'node:assert/strict';

import { estadoVisualDeVia } from './socialUi.js';

test('una vía desconectada nunca se presenta como conectada', () => {
  assert.deepEqual(estadoVisualDeVia({ estado: 'sin_conectar' }), {
    etiqueta: 'Sin conectar',
    tono: 'pendiente',
    accion: 'Conectar',
  });
});

test('cada estado ofrece una acción de recuperación concreta', () => {
  assert.equal(estadoVisualDeVia({ estado: 'sin_configurar' }).accion, 'Configurar');
  assert.equal(estadoVisualDeVia({ estado: 'comprobando' }).accion, 'Comprobar');
  assert.equal(estadoVisualDeVia({ estado: 'requiere_atencion' }).accion, 'Revisar');
  assert.equal(estadoVisualDeVia({ estado: 'en_pausa' }).accion, 'Reanudar');
  assert.equal(estadoVisualDeVia({ estado: 'lista' }).accion, null);
});

test('el estado de una vía no modifica el de otra', () => {
  const pagina = estadoVisualDeVia({ estado: 'lista' });
  const grupos = estadoVisualDeVia({ estado: 'sin_conectar' });
  assert.equal(pagina.etiqueta, 'Lista');
  assert.equal(grupos.etiqueta, 'Sin conectar');
});

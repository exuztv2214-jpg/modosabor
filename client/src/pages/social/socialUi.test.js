import test from 'node:test';
import assert from 'node:assert/strict';

import { estadoVisualDeVia, planDeGuardado, resumenDeRevision } from './socialUi.js';

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

test('una revisión vacía no habilita la publicación', () => {
  const revision = resumenDeRevision(
    { texto: '', destinoIds: [], mediaIds: [], programadaPara: '' },
    [],
    []
  );
  assert.equal(revision.destinos.length, 0);
  assert.equal(revision.puedePublicar, false);
  assert.deepEqual(revision.alertas, ['Falta contenido.', 'Falta elegir al menos un destino.']);
});

test('la revisión enumera una sola vez el contenido elegido', () => {
  const revision = resumenDeRevision(
    {
      texto: 'Promo del día',
      destinoIds: [2, 2, 4],
      mediaIds: [8, 8],
      programadaPara: '',
    },
    [
      { id: 2, nombre: 'Página' },
      { id: 4, nombre: 'Grupo' },
    ],
    [{ id: 8, nombre: 'menu.jpg' }]
  );
  assert.equal(revision.texto, 'Promo del día');
  assert.deepEqual(revision.destinos, ['Página', 'Grupo']);
  assert.deepEqual(revision.adjuntos, ['menu.jpg']);
  assert.equal(revision.momento, 'Ahora');
  assert.equal(revision.puedePublicar, true);
});

test('una fecha inválida se informa y nunca se interpreta como ahora', () => {
  const revision = resumenDeRevision(
    { texto: 'Promo', destinoIds: [2], mediaIds: [], programadaPara: 'fecha rota' },
    [{ id: 2, nombre: 'Página' }],
    []
  );
  assert.equal(revision.momento, 'Fecha inválida');
  assert.equal(revision.puedePublicar, false);
  assert.deepEqual(revision.alertas, ['La fecha programada no es válida.']);
});

test('guardar borrador nunca encola ni programa', () => {
  assert.deepEqual(planDeGuardado('borrador', '2026-10-07T20:00'), {
    programadaPara: '',
    autoPublicar: false,
    encolar: false,
  });
  assert.equal(planDeGuardado('publicar').encolar, true);
  assert.equal(planDeGuardado('programar', '2026-10-07T20:00').encolar, false);
});

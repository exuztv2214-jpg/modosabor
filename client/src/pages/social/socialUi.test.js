import test from 'node:test';
import assert from 'node:assert/strict';

import {
  estadoVisualDeVia,
  estadoLegibleDeDestino,
  actividadParaOperador,
  destinosSeleccionadosDeCuenta,
  destinoPrincipalDeCuenta,
  destinoIdsParaIdentidad,
  esDiagnosticoDePrueba,
  formatearPorcentajeMetrica,
  mediaSeleccionada,
  nombreCampanaVisible,
  planDeGuardado,
  rutasDuplicadasDeGrupos,
  resumenDeRevision,
  resumenDeDestinos,
  hayGruposElegidos,
  hayCampanasProgramadasEnPeriodo,
  tieneAlcanceReal,
} from './socialUi.js';

test('los estados técnicos de grupos se traducen antes de llegar a la pantalla', () => {
  assert.equal(estadoLegibleDeDestino('no_detectado'), 'No apareció en la última sincronización');
  assert.equal(estadoLegibleDeDestino('detectado'), '');
  assert.equal(estadoLegibleDeDestino(''), '');
});

test('el resumen separa destinos detectados, activos y grupos aptos', () => {
  assert.deepEqual(
    resumenDeDestinos([
      { id: 1, tipo: 'facebook_group', habilitada: true },
      { id: 2, tipo: 'facebook_page', habilitada: true },
      { id: 3, tipo: 'facebook_group', habilitada: false },
    ]),
    { detectados: 3, activos: 2, gruposAptos: 1 }
  );
});

test('la semana vacía se decide por las publicaciones de esa semana, no por el historial completo', () => {
  const lunes = new Date(2026, 9, 5);
  const campanas = [
    { programada_para: '2026-09-28 19:00:00' },
    { programada_para: '2026-10-12 19:00:00' },
  ];

  assert.equal(hayCampanasProgramadasEnPeriodo(campanas, lunes), false);
  assert.equal(
    hayCampanasProgramadasEnPeriodo(
      [...campanas, { programada_para: '2026-10-07 19:00:00' }],
      lunes
    ),
    true
  );
});

test('los adjuntos respetan el orden elegido y el primero queda como portada', () => {
  const elegidos = mediaSeleccionada(
    [
      { id: 1, nombre: 'primera.jpg' },
      { id: 2, nombre: 'segunda.jpg' },
    ],
    [2, 1, 2, 999]
  );
  assert.deepEqual(
    elegidos.map((item) => item.nombre),
    ['segunda.jpg', 'primera.jpg']
  );
});

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
  assert.equal(estadoVisualDeVia({ estado: 'en_pausa' }).accion, 'Ver pausa');
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

test('una métrica sin muestra dice Sin datos y no cero por ciento', () => {
  assert.equal(formatearPorcentajeMetrica(null), 'Sin datos');
  assert.equal(formatearPorcentajeMetrica(undefined), 'Sin datos');
  assert.equal(formatearPorcentajeMetrica(0), '0 %');
  assert.equal(formatearPorcentajeMetrica(68), '68 %');
});

test('el alcance sólo se muestra cuando el proveedor lo entregó', () => {
  assert.equal(tieneAlcanceReal({ disponible: false }), false);
  assert.equal(tieneAlcanceReal(null), false);
  assert.equal(tieneAlcanceReal({ disponible: true }), true);
});

test('avisa si el mismo grupo se eligió desde dos identidades', () => {
  const repetidas = rutasDuplicadasDeGrupos(
    [
      {
        id: 1,
        tipo: 'facebook_group',
        provider: 'facebook',
        cuenta_id: 10,
        identificador_externo: 'g-1',
        nombre: 'Grupo A',
      },
      {
        id: 2,
        tipo: 'facebook_group',
        provider: 'facebook',
        cuenta_id: 20,
        identificador_externo: 'g-1',
        nombre: 'Grupo A',
      },
    ],
    [1, 2]
  );
  assert.deepEqual(repetidas, ['Grupo A']);
});

test('los diagnósticos técnicos se separan y se traducen para el operador', () => {
  const log = {
    codigo: 'PRUEBA_TOKEN_VENCIDO',
    mensaje: 'Fan Page: token vencido por el proveedor',
  };
  assert.equal(esDiagnosticoDePrueba(log), true);
  assert.equal(actividadParaOperador(log).mensaje, 'La conexión venció y necesita revisarse.');
  assert.equal(actividadParaOperador(log).detalle, log.mensaje);
  assert.equal(
    esDiagnosticoDePrueba({
      codigo: 'sync_facebook_groups',
      mensaje: 'Worker completó sync_facebook_groups',
    }),
    true
  );
});

test('un nombre histórico no expone la fecha técnica generada por el sistema', () => {
  assert.equal(
    nombreCampanaVisible('Reel Perfil Modo Sabor 2026-08-25T01:18:31.504Z'),
    'Reel Perfil Modo Sabor'
  );
});

test('al elegir una identidad se preselecciona su destino principal y no un grupo', () => {
  const destinos = [
    { id: 1, cuenta_id: 10, tipo: 'facebook_group', nombre: 'Grupo Perfil' },
    { id: 2, cuenta_id: 10, tipo: 'facebook_profile', nombre: 'Perfil Modo Sabor' },
    { id: 3, cuenta_id: 20, tipo: 'facebook_group', nombre: 'Grupo Fan Page' },
    { id: 4, cuenta_id: 20, tipo: 'facebook_page', nombre: 'Fan Page Modo Sabor' },
    { id: 5, cuenta_id: 30, tipo: 'instagram_feed', nombre: '@modosaborok' },
  ];

  assert.equal(
    destinoPrincipalDeCuenta(destinos, {
      cuentaId: 10,
      red: 'facebook',
      tipos: ['facebook_profile', 'facebook_group'],
    })?.id,
    2
  );
  assert.equal(
    destinoPrincipalDeCuenta(destinos, {
      cuentaId: 20,
      red: 'facebook',
      tipos: ['facebook_page', 'facebook_group'],
    })?.id,
    4
  );
  assert.equal(destinoPrincipalDeCuenta(destinos, { cuentaId: 30, red: 'instagram' })?.id, 5);
});

test('la identidad elegida conserva sus grupos y siempre suma su destino principal', () => {
  const destinos = [
    { id: 1, cuenta_id: 10, tipo: 'facebook_group', nombre: 'Grupo Perfil' },
    { id: 2, cuenta_id: 10, tipo: 'facebook_profile', nombre: 'Perfil Modo Sabor' },
    { id: 3, cuenta_id: 20, tipo: 'facebook_page', nombre: 'Fan Page Modo Sabor' },
  ];

  assert.deepEqual(
    destinoIdsParaIdentidad(destinos, [1, 3], {
      cuentaId: 10,
      red: 'facebook',
      tipos: ['facebook_profile', 'facebook_group'],
    }),
    [2, 1]
  );
});

test('el resumen de destinos sólo cuenta lo elegido para la identidad activa', () => {
  const destinos = [
    { id: 1, cuenta_id: 10, tipo: 'facebook_profile', nombre: 'Perfil Modo Sabor' },
    { id: 2, cuenta_id: 10, tipo: 'facebook_group', nombre: 'Grupo Perfil' },
    { id: 3, cuenta_id: 10, tipo: 'instagram_feed', nombre: '@modosaborok' },
    { id: 4, cuenta_id: 20, tipo: 'facebook_page', nombre: 'Fan Page' },
  ];

  assert.deepEqual(
    destinosSeleccionadosDeCuenta(destinos, [1, 2, 3, 4], {
      cuentaId: 10,
      red: 'facebook',
    }).map((destino) => destino.id),
    [1, 2]
  );
});

test('el chip sólo dice grupos cuando hay un grupo elegido de esa identidad', () => {
  const destinos = [
    { id: 1, cuenta_id: 10, tipo: 'facebook_profile' },
    { id: 2, cuenta_id: 10, tipo: 'facebook_group' },
    { id: 3, cuenta_id: 20, tipo: 'facebook_group' },
  ];
  const cuenta = { cuentaId: 10, red: 'facebook' };

  assert.equal(hayGruposElegidos(destinos, [1], cuenta), false);
  assert.equal(hayGruposElegidos(destinos, [1, 2], cuenta), true);
  assert.equal(hayGruposElegidos(destinos, [1, 3], cuenta), false);
});

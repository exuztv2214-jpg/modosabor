const assert = require('assert');
const fs = require('fs');
const path = require('path');

const menuPath = path.join(__dirname, '..', '..', '..', 'client', 'src', 'pages', 'MenuDelDia.jsx');
const source = fs.readFileSync(menuPath, 'utf8');

/*
  El arrastre pasó de HTML5 a eventos de puntero.

  La assertion anterior pedía `dataTransfer.setData(...)`, que arreglaba el
  arrastre en Firefox pero no servía de nada en una pantalla táctil: el arrastre
  nativo de HTML5 no existe con el dedo, no hay `dragstart`.

  `pointerdown`, `pointermove` y `pointerup` son los mismos eventos para mouse,
  dedo y lápiz, así que cubren los dos casos con un solo camino. Lo que se
  verifica ahora son las cuatro piezas sin las cuales no funciona:
*/
assert.match(source, /onPointerDown=/, 'el arrastre tiene que empezar con un evento de puntero');
assert.match(
  source,
  /touch-none/,
  'sin touch-action:none el navegador se lleva la página en vez de la tarjeta'
);
assert.match(
  source,
  /elementFromPoint/,
  'hace falta para saber sobre qué columna se soltó el dedo'
);
assert.match(source, /data-columna=/, 'las columnas tienen que ser identificables al soltar');
assert.doesNotMatch(
  source,
  /dataTransfer|draggable/,
  'no puede quedar nada del arrastre viejo: convivir con los dos rompe el táctil'
);
assert.match(source, /\+ Económico/, 'debe poder agregarse un plato con una acción táctil');
assert.match(source, /\+ Ejecutivo/, 'debe poder agregarse un plato con una acción táctil');
assert.match(source, /const moverEn =/, 'debe poder reordenarse sin depender del arrastre');
assert.match(source, /aria-label={`Subir /, 'los controles táctiles deben ser accesibles');
assert.match(source, /aria-label={`Bajar /, 'los controles táctiles deben ser accesibles');

console.log('menuDiaTouch.test.js OK');

'use strict';

const fs = require('fs');
const path = require('path');

const RE_MEDIO = /^(promo(-\d+)?\.(jpg|jpeg|png|webp)|menu\.pdf)$/i;

// Las versiones anteriores guardaban flyers y menú en la raíz del proyecto, fuera
// del volumen persistente. Los mueve a data/media sin pisar lo que ya esté ahí.
function moverMediosAlVolumen(origen, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const movidos = [];
  for (const nombre of fs.readdirSync(origen)) {
    if (!RE_MEDIO.test(nombre)) continue;
    const desde = path.join(origen, nombre);
    const hacia = path.join(destino, nombre);
    if (!fs.statSync(desde).isFile() || fs.existsSync(hacia)) continue;
    fs.copyFileSync(desde, hacia);
    fs.rmSync(desde);
    movidos.push(nombre);
  }
  return movidos;
}

module.exports = { moverMediosAlVolumen };

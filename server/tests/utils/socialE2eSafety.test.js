const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..', '..');
const service = fs.readFileSync(path.join(root, 'server', 'services', 'socialService.js'), 'utf8');
const scheduler = fs.readFileSync(
  path.join(root, 'server', 'services', 'socialScheduler.js'),
  'utf8'
);
const worker = fs.readFileSync(path.join(root, 'social-worker', 'index.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'client', 'src', 'pages', 'Social.jsx'), 'utf8');
const { porQueFrenaElModoSeguro } = require('../../services/social/modoSeguro');

console.log('\nValidaciones de seguridad E2E de Social');

/*
  Antes esto pedía el texto literal `'requires_approval', 'ambiguous'`, los dos
  en la misma línea. El formateador partió el array en varias líneas y el test
  empezó a fallar sin que nada del comportamiento hubiera cambiado.

  Un test que verifica **cómo está escrito** el código y no qué hace es peor que
  no tenerlo: falla por un espacio y entrena a ignorar el rojo. Y cuando algo se
  ignora por costumbre, el día que falle de verdad tampoco lo va a mirar nadie.

  Ahora se chequea cada estado por separado. Sigue siendo una prueba sobre el
  texto —no hay forma de ejecutar esto sin levantar el worker— pero al menos no
  se rompe si alguien corre Prettier.
*/
/*
  Se busca adentro del bloque `TARGET_STATES` y no en todo el archivo.

  Buscar en todo el archivo no sirve: `'ambiguous'` también aparece más abajo,
  en el cálculo del nivel de alerta. Con esa comprobación floja, alguien podía
  borrar el estado del listado y el test seguía en verde — lo probé sacándolo y
  no se enteró.
*/
const bloqueEstados = (service.match(/TARGET_STATES = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
assert.ok(bloqueEstados, 'no encontré la lista de estados: ¿le cambiaron el nombre?');
assert.ok(
  bloqueEstados.includes("'requires_approval'"),
  'requires_approval salió de los estados: una publicación podría irse sin aprobar'
);
assert.ok(
  bloqueEstados.includes("'ambiguous'"),
  'ambiguous salió de los estados: no habría forma de marcar una publicación dudosa'
);
assert.ok(service.includes("estado = 'failed' AND intentos < max_intentos"));
/*
  Se prueba la regla, no una frase dentro de createCampaign.

  La regla se extrajo a `modoSeguro.js`; seguir buscando `ids.length !== 1`
  hacía fallar el test aunque la protección siguiera activa y probada.
*/
assert.ok(
  porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 0 }),
  'el modo seguro debe frenar si no hay destino'
);
assert.strictEqual(
  porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 1 }),
  '',
  'el modo seguro debe permitir exactamente un destino'
);
assert.ok(
  porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 2 }),
  'el modo seguro debe frenar dos destinos'
);
assert.ok(
  porQueFrenaElModoSeguro({ modoSeguro: true, cantidadDestinos: 1, cantidadConjuntos: 1 }),
  'el modo seguro no debe admitir conjuntos'
);
assert.ok(scheduler.includes("estado = 'ambiguous'"));
assert.ok(scheduler.includes('PUBLICATION_AMBIGUOUS'));
assert.ok(
  worker.includes("facebook_session: checkpoint ? 'CHECKPOINT' : login ? 'EXPIRED' : 'ACTIVE'"),
  'el worker debe distinguir un checkpoint de una sesion vencida y una sesion activa'
);
assert.ok(worker.includes("estado: 'ambiguous'"));
assert.ok(!worker.includes('context.cookies('));
const bloqueHistoriaPerfil =
  (worker.match(
    /async function publicarHistoriaDePerfil\([\s\S]*?\n}\n\nasync function publishFacebookGroup/
  ) || [])[0] || '';
assert.ok(
  bloqueHistoriaPerfil.includes('confirmacionHistoria'),
  'la Historia de Perfil no puede marcarse publicada sólo porque se cerró el compositor'
);
assert.ok(
  ui.includes("cuenta.igAccountType !== 'BUSINESS'"),
  'la interfaz no debe ofrecer historias a una cuenta Creator de Instagram'
);
assert.ok(/modo seguro/i.test(ui));
assert.ok(ui.includes('Reintentar fallidos'));
console.log('  ✓ modo prueba, retry limitado, sesión vencida y ambigüedad protegidos');
console.log('✅ Seguridad E2E de Social verificada\n');

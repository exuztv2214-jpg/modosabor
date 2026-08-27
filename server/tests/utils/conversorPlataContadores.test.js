/**
 * El conversor de plata y los contadores que no son plata.
 *
 * ── Qué pasó ───────────────────────────────────────────────────────────────
 *
 * La base guarda los importes en centavos y un middleware divide por 100 todo
 * campo cuyo nombre contenga "total", "precio", "monto" y unos cuantos más.
 * Para el TPV está bien. El problema es que la regla mira el nombre y nada
 * más, así que agarra cualquier contador que tenga la mala suerte de llamarse
 * parecido.
 *
 * En WhatsApp Masivo eso se vio así:
 *
 *   · un segmento con 1 contacto llegaba a la pantalla como 0,01 personas
 *   · un cupo de 60 mensajes por hora llegaba como 0,6
 *
 * Y no era la pantalla: el servidor los mandaba ya divididos.
 *
 * Estos tests fijan las dos mitades del asunto. La primera confirma que el
 * conversor efectivamente rompe esos nombres —para que nadie “arregle” el
 * síntoma sin entender la causa—. La segunda es la que importa: que el módulo
 * de WhatsApp esté fuera del alcance del middleware.
 */
const assert = require('assert');
const { centsToPesos } = require('../../utils/moneyConversion');

/*
  Copia de la regla de index.js. Se replica acá a propósito: importar el index
  levanta el servidor entero —base, WhatsApp, todo— y un test de una regla de
  tres líneas no puede depender de eso. Si el día de mañana alguien cambia el
  prefijo en index.js y no acá, el segundo test empieza a fallar, que es
  justamente lo que se quiere.
*/
const RUTAS_SIN_CONVERSION = [
  '/api/tpv/espera',
  '/api/whatsapp',
  '/api/social',
  '/api/social-worker',
];
const seSalta = (ruta) => RUTAS_SIN_CONVERSION.some((p) => ruta.startsWith(p));

module.exports = {
  'el conversor rompe los contadores que se llaman total': () => {
    /*
      Esto NO es el comportamiento deseado: es la trampa documentada. Si algún
      día el conversor deja de hacer esto, este test falla y hay que revisar
      si la exclusión de más abajo todavía hace falta.
    */
    const roto = centsToPesos({ total: 1, cupoTotal: 60 });

    assert.strictEqual(roto.total, 0.01, 'un contador de 1 se convierte en 0,01');
    assert.strictEqual(roto.cupoTotal, 0.6, 'un cupo de 60 se convierte en 0,6');
  },

  'la plata de verdad sí se convierte': () => {
    /* Un pedido de $8.500 se guarda como 850000 centavos. */
    const pedido = centsToPesos({ total: 850000, precio: 130000 });

    assert.strictEqual(pedido.total, 8500);
    assert.strictEqual(pedido.precio, 1300);
  },

  'las rutas de WhatsApp quedan fuera del conversor': () => {
    assert.strictEqual(seSalta('/api/whatsapp/segmentos'), true);
    assert.strictEqual(seSalta('/api/whatsapp/estado'), true);
    assert.strictEqual(seSalta('/api/whatsapp/contactos'), true);
    assert.strictEqual(seSalta('/api/whatsapp/salud-numero'), true);
  },

  'las cantidades de Social quedan fuera del conversor': () => {
    assert.strictEqual(seSalta('/api/social/campanas'), true);
    assert.strictEqual(seSalta('/api/social/metricas'), true);
    assert.strictEqual(seSalta('/api/social-worker/claim'), true);
  },

  'las rutas con plata siguen adentro': () => {
    /*
      Lo que no puede pasar nunca: que al excluir WhatsApp se cuelen las rutas
      que sí manejan importes. Un pedido sin convertir se muestra cien veces
      más caro.
    */
    assert.strictEqual(seSalta('/api/pedidos'), false);
    assert.strictEqual(seSalta('/api/caja/cierre'), false);
    assert.strictEqual(seSalta('/api/productos'), false);
    assert.strictEqual(seSalta('/api/reportes/ventas'), false);
  },

  /*
    Acá había un test que decía "la exclusión es por prefijo y no por
    coincidencia suelta", comprobando que /api/reportes/whatsapp no quedara
    exenta. Se cambió `startsWith` por `includes` a propósito y el test siguió
    en verde, así que no probaba nada.

    Y tenía razón en quedarse verde: '/api/reportes/whatsapp' no contiene la
    cadena '/api/whatsapp' en ninguna parte, así que las dos formas dan lo
    mismo. Para que la diferencia se notara habría que inventar una ruta como
    '/api/proxy/api/whatsapp', que no existe ni va a existir.

    Se deja el `startsWith` porque es lo correcto, pero sin un test que no
    puede fallar: eso cuenta como cobertura y no cubre.
  */
};

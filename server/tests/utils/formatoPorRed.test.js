/**
 * Un formato por red.
 *
 * ── El caso que esto habilita ──────────────────────────────────────────────
 *
 * Tenés un video vertical del local lleno. Querés que salga como **reel en
 * Instagram** —que es donde el reel funciona— y como **posteo común en la Fan
 * Page**, porque en el muro un reel se ve peor.
 *
 * Con un solo formato por campaña había que armar dos publicaciones distintas
 * con el mismo contenido, o elegir uno y aceptar que en la otra red saliera
 * mal.
 *
 * ── Lo que se cuida ────────────────────────────────────────────────────────
 *
 * Que las campañas viejas —las que sólo tienen `formato`— sigan saliendo
 * exactamente igual que antes. El día que se agregó esta función había
 * campañas guardadas: si el respaldo fallara, todas pasarían a ser posteos sin
 * que nadie lo pida.
 */
const assert = require('assert');
const social = require('../../services/socialService');

/* Una fila como la que devuelve el despachador, con lo justo. */
const destino = ({ tipo, formato, formatos, cuentaId }) => ({
  destino_tipo: tipo,
  cuenta_id: cuentaId,
  formato,
  formatos: formatos === undefined ? null : JSON.stringify(formatos),
});

module.exports = {
  'cada red usa el suyo': () => {
    const formatos = { facebook: 'post', instagram: 'reel' };

    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'facebook_page', formatos })),
      'post'
    );
    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'instagram_feed', formatos })),
      'reel'
    );
  },

  'Perfil y Fan Page usan formatos distintos aunque ambos sean Facebook': () => {
    const formatos = { '1|facebook': 'historia', '2|facebook': 'reel' };

    assert.strictEqual(
      social.formatoParaLaRed(
        destino({ tipo: 'facebook_profile', cuentaId: 1, formato: 'post', formatos })
      ),
      'historia'
    );
    assert.strictEqual(
      social.formatoParaLaRed(
        destino({ tipo: 'facebook_page', cuentaId: 2, formato: 'post', formatos })
      ),
      'reel'
    );
  },

  'los grupos y el perfil cuentan como Facebook': () => {
    /*
      Un grupo no es una red aparte: es Facebook. Si contara como otra cosa,
      elegir el formato de Facebook no lo alcanzaría y saldría siempre el de
      por omisión.
    */
    const formatos = { facebook: 'historia', instagram: 'reel' };

    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'facebook_group', formatos })),
      'historia'
    );
    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'facebook_profile', formatos })),
      'historia'
    );
  },

  'una campaña vieja sigue usando su formato único': () => {
    /*
      Éste es el test que importa de verdad. Las campañas que existían antes
      de esta función tienen `formato` y no `formatos`. Sin este respaldo,
      todas habrían pasado a ser posteos el día del cambio.
    */
    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'facebook_page', formato: 'reel' })),
      'reel'
    );
    assert.strictEqual(
      social.formatoParaLaRed(destino({ tipo: 'instagram_feed', formato: 'reel' })),
      'reel'
    );
  },

  'lo elegido por red le gana al formato único': () => {
    /*
      Si están los dos, manda el específico: es el que se eligió después y con
      más información.
    */
    const fila = destino({
      tipo: 'instagram_feed',
      formato: 'post',
      formatos: { instagram: 'historia' },
    });

    assert.strictEqual(social.formatoParaLaRed(fila), 'historia');
  },

  'una red sin elección cae en el formato único': () => {
    /*
      Se eligió algo para Instagram y nada para Facebook. Facebook no puede
      quedarse sin formato: usa el de la campaña.
    */
    const fila = destino({
      tipo: 'facebook_page',
      formato: 'reel',
      formatos: { instagram: 'historia' },
    });

    assert.strictEqual(social.formatoParaLaRed(fila), 'reel');
  },

  'sin nada, es un posteo': () => {
    assert.strictEqual(social.formatoParaLaRed(destino({ tipo: 'facebook_page' })), 'post');
    assert.strictEqual(social.formatoParaLaRed({}), 'post');
    assert.strictEqual(social.formatoParaLaRed(null), 'post');
  },

  'un JSON roto no rompe la publicación': () => {
    /*
      Prudencia: si la columna quedó con basura, se publica como posteo en vez
      de reventar. Una campaña que no sale por un JSON mal escrito es peor que
      una que sale en el formato de siempre.
    */
    const fila = { destino_tipo: 'facebook_page', formato: 'reel', formatos: 'no soy json' };
    assert.strictEqual(social.formatoParaLaRed(fila), 'reel');
  },
};

/**
 * Qué formato puede recibir cada destino.
 *
 * ── Por qué esta tabla merece tests propios ────────────────────────────────
 *
 * Es la única pieza que impide que alguien mande un reel a un grupo. Si se
 * afloja, la campaña se encola sin quejarse, el Worker publica **un posteo
 * común**, y el sistema lo reporta como éxito.
 *
 * O sea: pediste un reel, salió un posteo, y nadie te avisó. Ese error no se
 * descubre hasta que alguien mira Facebook a mano.
 *
 * ── De dónde salen los límites ─────────────────────────────────────────────
 *
 * De la documentación de Meta de agosto de 2026:
 *   - Reels e historias existen sólo en páginas
 *   - La API de grupos no existe más desde abril de 2024
 *   - El carrusel es sólo de Instagram
 */
const assert = require('assert');
const providers = require('../../services/social/providers');

const grupo = { tipo: 'facebook_group' };
const perfil = { tipo: 'facebook_profile' };
const pagina = { tipo: 'facebook_page' };
const instagram = { tipo: 'instagram_feed' };

const noAcepta = (destino, formato) => providers.porQueNoAceptaElFormato(destino, formato);

module.exports = {
  // ── Lo que sí se puede ──────────────────────────────────────────────────
  'la Fan Page acepta posteo, reel e historia': () => {
    assert.strictEqual(noAcepta(pagina, 'post'), '');
    assert.strictEqual(noAcepta(pagina, 'reel'), '');
    assert.strictEqual(noAcepta(pagina, 'historia'), '');
  },

  'Instagram acepta los cuatro': () => {
    assert.strictEqual(noAcepta(instagram, 'post'), '');
    assert.strictEqual(noAcepta(instagram, 'reel'), '');
    assert.strictEqual(noAcepta(instagram, 'historia'), '');
    assert.strictEqual(noAcepta(instagram, 'carrusel'), '');
  },

  'los grupos y el perfil aceptan posteo': () => {
    assert.strictEqual(noAcepta(grupo, 'post'), '');
    assert.strictEqual(noAcepta(perfil, 'post'), '');
  },

  // ── Lo que no, y por qué ────────────────────────────────────────────────
  'un reel a un grupo se rechaza y se explica': () => {
    const motivo = noAcepta(grupo, 'reel');
    assert.ok(motivo, 'tiene que rechazarlo');
    assert.match(motivo, /2024/, 'y decir desde cuándo, que es lo que nadie sabe');
  },

  'una historia a un grupo también': () => {
    assert.ok(noAcepta(grupo, 'historia'));
  },

  'el Perfil acepta reel e historia mediante el Worker': () => {
    assert.strictEqual(noAcepta(perfil, 'reel'), '');
    assert.strictEqual(noAcepta(perfil, 'historia'), '');
  },

  'el carrusel no existe en Facebook': () => {
    const motivo = noAcepta(pagina, 'carrusel');
    assert.ok(motivo);
    assert.match(motivo, /Instagram/, 'dice dónde sí');
  },

  'un formato inventado se rechaza con su nombre': () => {
    /*
      Con el nombre adentro, porque el que lo lee suele ser el que lo escribió
      mal.
    */
    const motivo = noAcepta(pagina, 'transmision');
    assert.match(motivo, /transmision/);
  },

  'sin formato se asume posteo': () => {
    /*
      Todas las campañas que ya existían son posteos. Si el vacío se tratara
      como inválido, los datos viejos empezarían a fallar de golpe.
    */
    assert.strictEqual(noAcepta(grupo, ''), '');
    assert.strictEqual(noAcepta(grupo, undefined), '');
  },

  'un destino desconocido sólo acepta posteo': () => {
    /*
      Lo más prudente ante algo que no conocemos: el posteo es el único formato
      que existe en todas las redes.
    */
    const raro = { tipo: 'tiktok_feed' };
    assert.strictEqual(noAcepta(raro, 'post'), '');
    assert.ok(noAcepta(raro, 'reel'), 'no se asume que soporta reels');
  },

  // ── El provider del Worker también valida ───────────────────────────────
  'el provider del grupo rechaza el reel, no sólo la tabla': () => {
    /*
      La tabla podría estar bien y el provider no consultarla. Este test entra
      por el camino real: el que usa el despachador.
    */
    const provider = providers.resolverProvider(grupo);
    const revision = provider.validar({
      destino: grupo,
      contenido: { texto: 'hola', media: [], formato: 'reel' },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(
      revision.errores.some((e) => /reel|grupo/i.test(e)),
      'y el motivo habla del reel o del grupo'
    );
  },

  'el provider del grupo deja pasar un posteo': () => {
    const provider = providers.resolverProvider(grupo);
    const revision = provider.validar({
      destino: grupo,
      contenido: { texto: 'Hoy hay milanesas', media: [], formato: 'post' },
    });

    assert.strictEqual(revision.ok, true, revision.errores.join(' / '));
  },

  'el Perfil exige video para un reel': () => {
    const provider = providers.resolverProvider(perfil);
    const revision = provider.validar({
      destino: perfil,
      contenido: {
        texto: 'mirá esto',
        media: [{ mime: 'image/jpeg', ruta: 'foto.jpg' }],
        formato: 'reel',
      },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /video/i.test(e)));
  },

  'el Perfil exige archivo para una historia': () => {
    const provider = providers.resolverProvider(perfil);
    const revision = provider.validar({
      destino: perfil,
      contenido: { texto: 'hola', media: [], formato: 'historia' },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /foto|video/i.test(e)));
  },

  'la Fan Page rechaza un reel sin video': () => {
    /*
      El formato está permitido pero falta la media. Son dos chequeos distintos
      y los dos tienen que estar.
    */
    const provider = providers.resolverProvider(pagina);
    const revision = provider.validar({
      destino: pagina,
      contenido: {
        texto: 'mirá esto',
        media: [{ mime: 'image/jpeg', ruta: 'x.jpg' }],
        formato: 'reel',
      },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /video/i.test(e)));
  },

  'Instagram no le pide JPEG a un reel': () => {
    /*
      El reel es puro video. Exigirle JPEG lo frenaría por una regla que no le
      corresponde — y era el bug fácil de cometer al agregar formatos.
    */
    const provider = providers.resolverProvider(instagram);
    const revision = provider.validar({
      destino: instagram,
      contenido: {
        texto: 'Pizza a la piedra',
        media: [{ mime: 'video/mp4', ruta: 'reel.mp4' }],
        formato: 'reel',
      },
    });

    assert.strictEqual(revision.ok, true, revision.errores.join(' / '));
  },

  'Instagram sigue pidiendo JPEG en un posteo con foto': () => {
    const provider = providers.resolverProvider(instagram);
    const revision = provider.validar({
      destino: instagram,
      contenido: {
        texto: 'x',
        media: [{ mime: 'image/png', ruta: 'a.png' }],
        formato: 'post',
      },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /JPEG/i.test(e)));
  },

  'una historia de Instagram no se frena por el largo del texto': () => {
    /*
      Instagram descarta el pie en las historias, así que su largo no importa.
      Frenar por eso sería inventar un límite.
    */
    const provider = providers.resolverProvider(instagram);
    const revision = provider.validar({
      destino: instagram,
      contenido: {
        texto: 'x'.repeat(3000),
        media: [{ mime: 'image/jpeg', ruta: 'a.jpg' }],
        formato: 'historia',
      },
    });

    assert.strictEqual(revision.ok, true, revision.errores.join(' / '));
  },

  'un posteo de Instagram sí se frena a los 2200': () => {
    const provider = providers.resolverProvider(instagram);
    const revision = provider.validar({
      destino: instagram,
      contenido: {
        texto: 'x'.repeat(3000),
        media: [{ mime: 'image/jpeg', ruta: 'a.jpg' }],
        formato: 'post',
      },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /2200/.test(e)));
  },

  'un carrusel de una sola pieza se rechaza al validar': () => {
    const provider = providers.resolverProvider(instagram);
    const revision = provider.validar({
      destino: instagram,
      contenido: {
        texto: 'x',
        media: [{ mime: 'image/jpeg', ruta: 'a.jpg' }],
        formato: 'carrusel',
      },
    });

    assert.strictEqual(revision.ok, false);
    assert.ok(revision.errores.some((e) => /dos piezas/i.test(e)));
  },
};

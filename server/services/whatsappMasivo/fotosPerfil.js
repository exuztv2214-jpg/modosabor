/**
 * Fotos de perfil de los contactos.
 *
 * ── De dónde sale esto ─────────────────────────────────────────────────────
 *
 * La idea es del script de Kimi (`masivos/server.js`, función `correrFotos`).
 * Ahí funciona con `whatsapp-web.js`, que maneja un navegador de verdad;
 * nosotros usamos Baileys, que habla el protocolo directo. Así que no se copió
 * el código sino la forma de hacerlo, que es lo que valía:
 *
 *   · pedir una foto por vez, nunca todas juntas;
 *   · dejar pasar un rato entre una y otra;
 *   · guardar cada tanto, no sólo al final;
 *   · tratar "no tiene foto" como un resultado normal y no como un error.
 *
 * ── Por qué la pausa entre fotos ───────────────────────────────────────────
 *
 * Cada foto es un pedido al servidor de WhatsApp. Quinientos pedidos seguidos,
 * sin respirar, es exactamente el patrón que hace que marquen un número: nadie
 * abre quinientos perfiles en cuatro segundos. La espera de medio segundo hace
 * que sincronizar una agenda entera tarde unos minutos, y esos minutos son el
 * precio de que el número del local siga sirviendo para vender.
 *
 * ── Por qué se guarda el archivo y no la URL ───────────────────────────────
 *
 * La URL que devuelve WhatsApp vence. Si guardáramos el link, la pantalla
 * andaría hoy y mostraría cuadros rotos la semana que viene. Se baja la imagen
 * una vez y se guarda con nosotros.
 */
const fs = require('fs');
const path = require('path');

const logger = require('../../utils/logger');
const { uploadsDir, ensureDir } = require('../../utils/storagePaths');

const CARPETA = path.join(uploadsDir, 'whatsapp-fotos');
const RUTA_PUBLICA = '/uploads/whatsapp-fotos';

/* Medio segundo entre fotos, como en el script de Kimi. */
const ESPERA_ENTRE_FOTOS_MS = 500;

/* Cada cuántas fotos se guarda el avance en la base. */
const GUARDAR_CADA = 10;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Nombre de archivo a partir del jid.
 *
 * Se limpia todo lo que no sea número o letra: un jid trae `@`, `:` y puntos,
 * y `:` es inválido en nombres de archivo de Windows. Sin esto la escritura
 * falla en la máquina del local y anda en el servidor, que es la peor clase de
 * error: el que aparece sólo en un lado.
 */
function nombreArchivo(jid) {
  return `${String(jid).replace(/[^a-zA-Z0-9]/g, '')}.jpg`;
}

/* Cuánto se espera una descarga antes de darla por perdida. */
const ESPERA_DESCARGA_MS = 15000;

/**
 * Baja la imagen a disco. Devuelve el nombre del archivo.
 *
 * ── Por qué el corte por tiempo ────────────────────────────────────────────
 *
 * `fetch` sin plazo puede quedarse esperando para siempre. Acá eso no sería un
 * contacto sin foto: sería el bucle entero congelado en el contacto número
 * doce, con la bandera de "corriendo" en true y el botón inutilizado hasta
 * reiniciar el servidor.
 *
 * Es el mismo agujero que le marqué al código de Kimi en el módulo social. Lo
 * escribí igual acá y lo estoy corrigiendo antes de que llegue a producción.
 */
async function bajarImagen(url, archivo) {
  const respuesta = await fetch(url, { signal: AbortSignal.timeout(ESPERA_DESCARGA_MS) });
  if (!respuesta.ok) throw new Error(`El servidor respondió ${respuesta.status}`);
  const datos = Buffer.from(await respuesta.arrayBuffer());
  if (!datos.length) throw new Error('La imagen vino vacía');
  ensureDir(CARPETA);
  fs.writeFileSync(path.join(CARPETA, archivo), datos);
  return archivo;
}

/**
 * El trabajo en curso.
 *
 * Vive en memoria porque muere con el proceso y no tiene sentido guardarlo: si
 * el servidor se reinicia a mitad de camino, lo que se bajó ya está en disco y
 * la próxima corrida sigue desde ahí sin repetir nada.
 */
const trabajo = {
  corriendo: false,
  hechos: 0,
  total: 0,
  conFoto: 0,
  sinFoto: 0,
  empezado: null,
  ultimoError: null,
};

function estado() {
  return { ...trabajo };
}

/**
 * Sincroniza las fotos que faltan.
 *
 * Por defecto sólo va por los que no tienen foto guardada. Con `todos: true`
 * refresca también los que ya la tienen, para cuando alguien se la cambió.
 */
async function sincronizar({ db, conexion, todos = false, limite = 0 } = {}) {
  if (trabajo.corriendo) throw new Error('Ya se están bajando las fotos');
  if (!conexion?.listo) throw new Error('WhatsApp no está conectado');

  ensureDir(CARPETA);

  const filas = db
    .prepare(
      `SELECT jid, foto, foto_revisada_en FROM wa_contactos
        WHERE excluido = 0 AND jid <> ''
        ORDER BY COALESCE(foto_revisada_en, '') ASC, ultimo_mensaje_en DESC`
    )
    .all();

  /*
    Un contacto está pendiente si nunca lo revisamos, o si tiene foto anotada
    pero el archivo ya no está en disco. Ese segundo caso pasa cuando alguien
    limpia la carpeta de subidas: sin el chequeo, la base diría que hay foto y
    la pantalla mostraría cuadros rotos para siempre.

    El que ya se revisó y no tenía foto visible **no vuelve a la cola**. Con
    `todos: true` se fuerza igual, que es lo que hace el botón de la pantalla
    cuando alguien quiere refrescar porque cambió su foto.

    El orden pone primero a los nunca revisados: si se corta a la mitad, la
    próxima vuelta sigue donde quedó en vez de empezar de nuevo.
  */
  const pendientes = filas.filter((fila) => {
    if (todos) return true;
    if (fila.foto) return !fs.existsSync(path.join(CARPETA, fila.foto));
    return !fila.foto_revisada_en;
  });

  const cola = limite > 0 ? pendientes.slice(0, limite) : pendientes;

  trabajo.corriendo = true;
  trabajo.hechos = 0;
  trabajo.total = cola.length;
  trabajo.conFoto = 0;
  trabajo.sinFoto = 0;
  trabajo.empezado = new Date().toISOString();
  trabajo.ultimoError = null;

  /*
    Siempre se marca la revisión, con foto o sin ella. Es lo que evita que el
    goteo se quede dando vueltas sobre los mismos contactos sin foto visible.
  */
  const anotar = db.prepare(
    `UPDATE wa_contactos
        SET foto = ?,
            foto_revisada_en = CURRENT_TIMESTAMP,
            actualizado_en = CURRENT_TIMESTAMP
      WHERE jid = ?`
  );

  logger.info('WhatsApp: bajando fotos de perfil', { pendientes: cola.length });

  try {
    for (const fila of cola) {
      try {
        const url = await conexion.fotoDePerfil(fila.jid);
        if (url) {
          const archivo = await bajarImagen(url, nombreArchivo(fila.jid));
          anotar.run(archivo, fila.jid);
          trabajo.conFoto += 1;
        } else {
          /*
            Sin foto visible. Se limpia lo que hubiera anotado: si alguien
            sacó su foto, dejar la vieja sería mostrar algo que esa persona
            decidió esconder.
          */
          anotar.run('', fila.jid);
          trabajo.sinFoto += 1;
        }
      } catch (error) {
        trabajo.sinFoto += 1;
        trabajo.ultimoError = error.message;
      }

      trabajo.hechos += 1;

      if (trabajo.hechos % GUARDAR_CADA === 0) {
        logger.debug('WhatsApp: fotos en curso', {
          hechos: trabajo.hechos,
          total: trabajo.total,
        });
      }

      await esperar(ESPERA_ENTRE_FOTOS_MS);
    }

    logger.info('WhatsApp: fotos listas', {
      conFoto: trabajo.conFoto,
      sinFoto: trabajo.sinFoto,
    });
  } finally {
    /*
      Pase lo que pase, la bandera se baja. Si quedara en true por una
      excepción, el botón diría "ya se están bajando" para siempre y la única
      salida sería reiniciar el servidor.
    */
    trabajo.corriendo = false;
  }

  return estado();
}

/* Cada cuánto se fija si hay fotos nuevas por bajar. */
const CADA_MS = 10 * 60 * 1000;

/* Cuántas baja por vuelta. */
const POR_VUELTA = 15;

let goteo = null;

/**
 * Las fotos que faltan, de a poco y sin que nadie apriete nada.
 *
 * ── Por qué a cuentagotas y no todas al vincular ───────────────────────────
 *
 * Los chats entran solos: al vincular el teléfono, WhatsApp manda el historial
 * y la agenda queda cargada. Las fotos no venían con eso, así que había que
 * apretar "Traer fotos" a mano y acordarse de hacerlo cada vez que entra gente
 * nueva.
 *
 * Bajarlas todas juntas apenas se conecta sería lo peor que se puede hacer:
 * quinientos pedidos de perfil en los primeros minutos es exactamente el
 * patrón de alguien raspando la agenda, y encima justo cuando la sesión es
 * nueva y está más vigilada.
 *
 * Así que van de a quince cada diez minutos, con el mismo medio segundo entre
 * una y otra. Una agenda de quinientos tarda unas cinco horas en completarse,
 * y eso está bien: nadie está esperando esas fotos.
 *
 * ── Cuándo no hace nada ────────────────────────────────────────────────────
 *
 * Si WhatsApp está desconectado, si hay un envío en curso, o si ya se está
 * corriendo la sincronización a mano. El número no puede estar mandando una
 * campaña y raspando perfiles al mismo tiempo.
 */
function arrancarGoteo() {
  if (goteo) return goteo;

  const vuelta = async () => {
    try {
      /* Se piden acá adentro para no armar un ciclo de requires al cargar. */
      const db = require('../../db');
      const { conexion } = require('./conexion');
      const { motor } = require('./motor');

      if (!conexion?.listo) return;
      if (motor?.corriendo) return;
      if (trabajo.corriendo) return;

      const faltan = db
        .prepare(
          `SELECT COUNT(*) AS total FROM wa_contactos
            WHERE excluido = 0 AND jid <> '' AND COALESCE(foto, '') = ''`
        )
        .get();

      if (!Number(faltan?.total || 0)) return;

      await sincronizar({ db, conexion, limite: POR_VUELTA });
    } catch (error) {
      logger.warn('WhatsApp: el goteo de fotos falló esta vuelta', { message: error.message });
    }
  };

  goteo = setInterval(vuelta, CADA_MS);
  /*
    `unref` para que este reloj no mantenga vivo el proceso. Sin eso, apagar el
    servidor con Ctrl+C se queda esperando hasta diez minutos.
  */
  goteo.unref?.();
  return goteo;
}

module.exports = {
  sincronizar,
  estado,
  arrancarGoteo,
  nombreArchivo,
  CARPETA,
  RUTA_PUBLICA,
  ESPERA_ENTRE_FOTOS_MS,
};

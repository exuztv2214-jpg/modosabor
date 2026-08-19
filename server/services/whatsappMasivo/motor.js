const { EventEmitter } = require('events');
const fs = require('fs');

const db = require('../../db');
const logger = require('../../utils/logger');
const { uploadPublicPathToFile } = require('../../utils/storagePaths');
const { conexion } = require('./conexion');
const { aJid, normalizarTelefono } = require('./telefono');
const reglas = require('./reglas');
const { getShiftForDate, getBusinessTimeParts } = require('../../utils/shifts');

/**
 * El bucle de envío.
 *
 * ── Qué hace y qué no ──────────────────────────────────────────────────────
 *
 * Recorre los destinatarios, aplica las reglas de `reglas.js` y manda. Toda
 * la decisión —cuánto esperar, si hay cupo, si hoy se manda— vive allá y es
 * pura; acá sólo está lo que toca el mundo: la base, el reloj y WhatsApp.
 *
 * ── Las tres cosas que no pueden fallar ────────────────────────────────────
 *
 *  1. **Nadie recibe dos veces.** Cada destinatario se marca en `wa_envios`
 *     ANTES de mandar, no después. Si el proceso se cae en el medio, el que
 *     quedó a mitad de camino figura como intentado y no se le vuelve a
 *     escribir. Es preferible perder un mensaje a mandar el mismo dos veces.
 *
 *  2. **Se puede parar en cualquier momento.** La pausa y el corte se
 *     revisan antes de cada mensaje y también durante la espera, que puede
 *     ser de dos minutos. Un botón de detener que tarda dos minutos en
 *     responder no es un botón de detener.
 *
 *  3. **El cupo se mide contra la base, no contra un contador en memoria.**
 *     Si el servidor se reinicia a mitad de corrida, un contador en memoria
 *     vuelve a cero y la siguiente tanda sale sin límite. La base sabe
 *     cuántos salieron de verdad en la última hora.
 */

const HOY = () => {
  // El servidor corre en UTC y Argentina es UTC-3. Sin corregir, después de
  // las 21:00 "hoy" ya es mañana y el tope diario se reinicia en pleno envío.
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

function fechaArgentina(date = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
  return `${partes.year}-${partes.month}-${partes.day}`;
}

function minutos(value) {
  const [horas, minutosTurno] = String(value || '00:00')
    .split(':')
    .map((parte) => Number(parte || 0));
  return horas * 60 + minutosTurno;
}

/**
 * Una noche que cruza medianoche sigue siendo el mismo turno: 00:30 pertenece
 * a la noche que empezó ayer, no a una noche nueva. Esa distinción es la que
 * reemplaza el viejo bloqueo de "una vez por día".
 */
function claveTurno(config, date = new Date()) {
  const turno = getShiftForDate(config, date);
  let fecha = fechaArgentina(date);
  if (!turno?.id) return `${fecha}:fuera-de-turno`;

  const ahora = getBusinessTimeParts(date);
  const ahoraMinutos = ahora.hours * 60 + ahora.minutes;
  if (minutos(turno.hasta) < minutos(turno.desde) && ahoraMinutos <= minutos(turno.hasta)) {
    fecha = new Date(Date.parse(`${fecha}T12:00:00Z`) - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
  }
  return `${fecha}:${String(turno.id).trim().toLowerCase()}`;
}

class Motor extends EventEmitter {
  constructor() {
    super();
    this.corriendo = false;
    this.pausado = false;
    this.detenerPedido = false;
    this.campanaId = null;
    this.stats = { total: 0, hechos: 0, ok: 0, fallidos: 0, simulacro: false };
  }

  resumen() {
    return {
      corriendo: this.corriendo,
      pausado: this.pausado,
      campanaId: this.campanaId,
      stats: { ...this.stats },
    };
  }

  emitir() {
    this.emit('estado', this.resumen());
  }

  /** Config del envío, guardada en `configuracion` con prefijo `wa_`. */
  leerConfig() {
    const filas = db
      .prepare("SELECT clave, valor FROM configuracion WHERE clave LIKE 'wa_%'")
      .all();
    const crudo = {};
    filas.forEach(({ clave, valor }) => {
      const k = clave.slice(3);
      try {
        crudo[k] = JSON.parse(valor);
      } catch {
        crudo[k] = valor;
      }
    });
    return reglas.conDefectos(crudo);
  }

  leerConfigNegocio() {
    return {
      turnos_negocio:
        db.prepare("SELECT valor FROM configuracion WHERE clave = 'turnos_negocio'").get()?.valor ||
        '[]',
    };
  }

  turnoClaveActual(date = new Date()) {
    return claveTurno(this.leerConfigNegocio(), date);
  }

  /** Cuántos salieron en la ventana de cupo. Se pregunta a la base. */
  enviadosEnVentana(minutos) {
    const fila = db
      .prepare(
        `SELECT COUNT(*) AS c FROM wa_envios
          WHERE estado = 'enviado' AND enviado_en >= datetime('now', ?)`
      )
      .get(`-${Math.max(1, minutos)} minutes`);
    return fila.c;
  }

  enviadosHoy() {
    return db
      .prepare(
        `SELECT COUNT(*) AS c FROM wa_envios
          WHERE estado = 'enviado' AND DATE(enviado_en, '-3 hours') = ?`
      )
      .get(HOY()).c;
  }

  /** Jornadas anteriores con envíos, para la rampa de calentamiento. */
  diasConEnvios() {
    return db
      .prepare(
        `SELECT COUNT(DISTINCT DATE(enviado_en, '-3 hours')) AS c FROM wa_envios
          WHERE estado = 'enviado' AND DATE(enviado_en, '-3 hours') < ?`
      )
      .get(HOY()).c;
  }

  /**
   * A quiénes se les puede escribir.
   *
   * Sale de la agenda propia de WhatsApp. Así la campaña ve los chats reales
   * del número vinculado y no sólo quienes ya tienen una compra en el TPV.
   */
  destinatarios({ soloIds = null, segmento = 'todos', turnoClave = this.turnoClaveActual() } = {}) {
    const filas = db
      .prepare(
        `SELECT id, nombre, telefono, 0 AS total_pedidos,
                COALESCE(ultimo_mensaje_en, '') AS ultima_compra
           FROM wa_contactos
          WHERE COALESCE(telefono, '') <> '' AND excluido = 0`
      )
      .all();

    const excluidos = new Set(
      db
        .prepare('SELECT telefono FROM wa_excluidos')
        .all()
        .map((x) => x.telefono)
    );
    const yaEnTurno = new Set(
      db
        .prepare(
          `SELECT telefono FROM wa_envios
            WHERE estado = 'enviado' AND turno_clave = ?`
        )
        .all(turnoClave)
        .map((x) => x.telefono)
    );

    const permitidos = soloIds ? new Set(soloIds.map(Number)) : null;

    const tipo = ['todos', 'frecuentes', 'nuevos', 'inactivos'].includes(segmento)
      ? segmento
      : 'todos';
    const haceTreintaDias = Date.now() - 30 * 24 * 60 * 60 * 1000;

    return filas
      .map((c) => ({ ...c, tel: normalizarTelefono(c.telefono) }))
      .filter((c) => c.tel)
      .filter((c) => !permitidos || permitidos.has(Number(c.id)))
      .filter((c) => !excluidos.has(c.tel))
      .filter((c) => !yaEnTurno.has(c.tel))
      .filter((c) => {
        const pedidos = Number(c.total_pedidos || 0);
        const ultima = new Date(c.ultima_compra || 0).getTime();
        if (tipo === 'frecuentes') return pedidos >= 5;
        if (tipo === 'nuevos') return pedidos <= 1;
        if (tipo === 'inactivos') return pedidos > 0 && (!ultima || ultima < haceTreintaDias);
        return true;
      });
  }

  /**
   * Arma la campaña sin mandar nada.
   *
   * Es el paso de "revisar antes de disparar": devuelve a cuántos les va a
   * llegar y con qué texto, y recién con el id de la campaña se arranca.
   */
  preparar({
    mensaje,
    nombre = '',
    imagen = '',
    simulacro = false,
    clientesIds = null,
    segmento = 'todos',
  }) {
    const config = this.leerConfig();
    const turnoClave = this.turnoClaveActual();
    const lista = this.destinatarios({ soloIds: clientesIds, segmento, turnoClave });

    const permitido = reglas.puedeArrancar({
      config,
      conectado: conexion.listo || simulacro,
      mensaje,
      pendientes: lista.length,
    });
    if (!permitido.puede) {
      const error = new Error(permitido.motivo);
      error.httpStatus = 409;
      throw error;
    }

    const tope = Math.min(
      reglas.limiteDeHoy(config, this.diasConEnvios()),
      config.modoTandas ? Infinity : reglas.limiteDeHoy(config, this.diasConEnvios())
    );
    const elegidos = lista.slice(0, tope);

    const crear = db.prepare(
      `INSERT INTO wa_campanas (nombre, mensaje, imagen, estado, simulacro, total)
       VALUES (?, ?, ?, 'borrador', ?, ?)`
    );
    const insertar = db.prepare(
      `INSERT OR IGNORE INTO wa_envios (campana_id, cliente_id, telefono, nombre, turno_clave)
       VALUES (?, ?, ?, ?, ?)`
    );

    let campanaId;
    db.transaction(() => {
      campanaId = crear.run(
        nombre || `Promo ${HOY()}`,
        mensaje,
        imagen,
        simulacro ? 1 : 0,
        elegidos.length
      ).lastInsertRowid;
      elegidos.forEach((c) => insertar.run(campanaId, c.id, c.tel, c.nombre || '', turnoClave));
    })();

    return {
      campanaId,
      total: elegidos.length,
      dejadosAfuera: lista.length - elegidos.length,
      tope,
      simulacro,
      segmento,
      turnoClave,
      muestra: elegidos.slice(0, 40).map((c) => ({ nombre: c.nombre, telefono: c.tel })),
    };
  }

  /** Espera cortable: revisa el corte cada medio segundo. */
  async esperar(ms) {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (this.detenerPedido) return;
      await new Promise((r) => setTimeout(r, Math.min(500, fin - Date.now())));
    }
  }

  async arrancar(campanaId) {
    if (this.corriendo) {
      const e = new Error('Ya hay un envío en curso');
      e.httpStatus = 409;
      throw e;
    }
    const campana = db.prepare('SELECT * FROM wa_campanas WHERE id = ?').get(campanaId);
    if (!campana) {
      const e = new Error('No existe esa campaña');
      e.httpStatus = 404;
      throw e;
    }

    this.corriendo = true;
    this.pausado = false;
    this.detenerPedido = false;
    this.campanaId = campanaId;
    this.stats = {
      total: campana.total,
      hechos: 0,
      ok: 0,
      fallidos: 0,
      simulacro: Boolean(campana.simulacro),
    };
    db.prepare(
      "UPDATE wa_campanas SET estado = 'enviando', iniciado_en = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(campanaId);
    this.emitir();

    // Sin await: la petición HTTP contesta enseguida y el bucle sigue solo.
    this.correr(campana).catch((error) => {
      logger.error('WhatsApp: el envío se cortó por un error', { message: error.message });
      this.terminar('cancelada');
    });

    return this.resumen();
  }

  async correr(campana) {
    const config = this.leerConfig();
    const pendientes = db
      .prepare("SELECT * FROM wa_envios WHERE campana_id = ? AND estado = 'pendiente' ORDER BY id")
      .all(campana.id);

    const marcar = db.prepare(
      'UPDATE wa_envios SET estado = ?, error = ?, enviado_en = CURRENT_TIMESTAMP WHERE id = ?'
    );

    for (const destino of pendientes) {
      if (this.detenerPedido) break;

      // Dos campañas pueden haberse preparado antes de que la primera
      // arrancara. Se revalida justo antes de enviar para que la segunda no
      // repita un contacto dentro del mismo turno.
      const yaRecibioEnEsteTurno = db
        .prepare(
          `SELECT 1 FROM wa_envios
            WHERE telefono = ? AND turno_clave = ? AND estado = 'enviado' AND id <> ?
            LIMIT 1`
        )
        .get(destino.telefono, destino.turno_clave, destino.id);
      if (yaRecibioEnEsteTurno) {
        db.prepare(
          "UPDATE wa_envios SET estado = 'salteado', error = 'Ya recibió un mensaje en este turno' WHERE id = ?"
        ).run(destino.id);
        this.stats.hechos += 1;
        continue;
      }

      // La pausa se revisa acá y no adentro de la espera: pausar no tiene que
      // consumir el turno del contacto que venía.
      while (this.pausado && !this.detenerPedido) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (this.detenerPedido) break;

      // Cupo por ventana. Si no queda, se espera en vez de cortar: la corrida
      // sigue sola cuando se libera, que es lo que se quiere de noche.
      let cupo = reglas.cupoDisponible(config, this.enviadosEnVentana(config.ventanaMinutos));
      while (cupo <= 0 && !this.detenerPedido) {
        this.emit('espera', { motivo: 'cupo', minutos: config.ventanaMinutos });
        await this.esperar(60_000);
        cupo = reglas.cupoDisponible(config, this.enviadosEnVentana(config.ventanaMinutos));
      }
      if (this.detenerPedido) break;

      const texto = reglas.armarMensaje({
        plantilla: campana.mensaje,
        nombre: destino.nombre,
        saludos: config.saludos || [],
        cierres: config.cierres || [],
        footer: config.footerBaja || '',
      });

      /*
        Se marca ANTES de mandar. Si el proceso muere entre el envío y el
        registro, este contacto queda como intentado y no lo recibe dos
        veces. Un mensaje perdido molesta; uno repetido hace que te reporten.
      */
      marcar.run('enviado', '', destino.id);

      try {
        if (campana.simulacro) {
          this.emit('linea', { tipo: 'sim', texto: `[SIM] ${destino.telefono}` });
        } else if (campana.imagen) {
          const archivo = uploadPublicPathToFile(campana.imagen);
          if (!archivo || !fs.existsSync(archivo)) {
            throw new Error('El adjunto de la campaña ya no está disponible');
          }
          const ext = String(archivo).toLowerCase().split('.').pop();
          const mimetype =
            ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          await conexion.enviarArchivo(aJid(destino.telefono), fs.readFileSync(archivo), {
            mimetype,
            fileName: String(campana.imagen).split('/').pop(),
            caption: texto,
          });
        } else {
          await conexion.enviarTexto(aJid(destino.telefono), texto);
        }
        this.stats.ok += 1;
      } catch (error) {
        marcar.run('fallido', String(error.message || '').slice(0, 200), destino.id);
        this.stats.fallidos += 1;
        this.emit('linea', { tipo: 'err', texto: `${destino.telefono}: ${error.message}` });
      }

      this.stats.hechos += 1;
      db.prepare('UPDATE wa_campanas SET enviados = ?, fallidos = ? WHERE id = ?').run(
        this.stats.ok,
        this.stats.fallidos,
        campana.id
      );
      this.emitir();

      if (this.stats.hechos < pendientes.length) {
        await this.esperar(reglas.esperaAntesDelProximo(config, this.stats.hechos));
      }
    }

    this.terminar(this.detenerPedido ? 'cancelada' : 'terminada');
  }

  terminar(estado) {
    if (this.campanaId) {
      db.prepare(
        'UPDATE wa_campanas SET estado = ?, terminado_en = CURRENT_TIMESTAMP, enviados = ?, fallidos = ? WHERE id = ?'
      ).run(estado, this.stats.ok, this.stats.fallidos, this.campanaId);
    }
    logger.info('WhatsApp: envío terminado', {
      estado,
      ok: this.stats.ok,
      fallidos: this.stats.fallidos,
    });
    this.corriendo = false;
    this.pausado = false;
    this.detenerPedido = false;
    this.emitir();
  }

  pausar() {
    if (this.corriendo) this.pausado = true;
    this.emitir();
    return this.resumen();
  }

  reanudar() {
    this.pausado = false;
    this.emitir();
    return this.resumen();
  }

  detener() {
    this.detenerPedido = true;
    this.pausado = false;
    this.emitir();
    return this.resumen();
  }
}

const motor = new Motor();

/**
 * Baja automática.
 *
 * Es lo que protege el número: alguien que no puede salir de la lista
 * termina reportando, y los reportes son lo que dispara el bloqueo.
 */
function registrarRespuesta({ telefono, texto }) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  const baja = reglas.pideLaBaja(texto);

  db.prepare('INSERT INTO wa_respuestas (telefono, texto, es_baja) VALUES (?, ?, ?)').run(
    tel,
    String(texto || '').slice(0, 2000),
    baja ? 1 : 0
  );

  if (baja) {
    db.prepare(
      "INSERT OR IGNORE INTO wa_excluidos (telefono, motivo) VALUES (?, 'pidió la baja')"
    ).run(tel);
    logger.info('WhatsApp: baja automática', { telefono: tel });
  }
  return { baja };
}

module.exports = { motor, registrarRespuesta, HOY, claveTurno };

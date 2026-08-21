const { EventEmitter } = require('events');
const fs = require('fs');

const db = require('../../db');
const logger = require('../../utils/logger');
const { uploadPublicPathToFile } = require('../../utils/storagePaths');
const { getShiftForDate, getBusinessTimeParts } = require('../../utils/shifts');
const { sqlFecha } = require('../../utils/fechaLocal');
const { conexion } = require('./conexion');
const { aJid, normalizarTelefono } = require('./telefono');
const reglas = require('./reglas');
const { audiencia, resumenSegmentos } = require('./agenda');

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
    const filas = audiencia(db).filter((contacto) => !contacto.excluido);

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

    const tipo = String(segmento || 'todos');

    return filas
      .map((c) => ({ ...c, tel: normalizarTelefono(c.telefono) }))
      .filter((c) => c.tel)
      .filter((c) => !permitidos || permitidos.has(Number(c.id)))
      .filter((c) => !excluidos.has(c.tel))
      .filter((c) => !yaEnTurno.has(c.tel))
      .filter((c) => tipo === 'todos' || c.segmentos.includes(tipo));
  }

  resumenSegmentos() {
    return resumenSegmentos(db);
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
      `INSERT INTO wa_campanas (nombre, mensaje, imagen, segmento, estado, simulacro, total)
       VALUES (?, ?, ?, ?, 'borrador', ?, ?)`
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
        segmento,
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
    if (!campana.simulacro && !conexion.listo) {
      const e = new Error('WhatsApp no está conectado');
      e.httpStatus = 409;
      throw e;
    }
    if (!['borrador', 'programada'].includes(campana.estado)) {
      const e = new Error('La campaña no está disponible para iniciar');
      e.httpStatus = 409;
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
    const anotarId = db.prepare('UPDATE wa_envios SET mensaje_id = ? WHERE id = ?');

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
        Un simulacro nunca debe consumir el turno de nadie. Antes se marcaba
        "enviado" antes de entrar a esta rama: después de una prueba, la
        campaña real dejaba a todos afuera hasta el turno siguiente.
      */
      if (campana.simulacro) {
        marcar.run('salteado', 'Simulacro: no se envió ningún mensaje', destino.id);
        this.emit('linea', { tipo: 'sim', texto: `[SIM] ${destino.telefono}` });
        this.stats.hechos += 1;
        this.emitir();
        continue;
      }

      /*
        Se marca ANTES de mandar. Si el proceso muere entre el envío y el
        registro, este contacto queda como intentado y no lo recibe dos
        veces. Un mensaje perdido molesta; uno repetido hace que te reporten.
      */
      marcar.run('enviado', '', destino.id);

      try {
        let resultado;
        if (campana.imagen) {
          const archivo = uploadPublicPathToFile(campana.imagen);
          if (!archivo || !fs.existsSync(archivo)) {
            throw new Error('El adjunto de la campaña ya no está disponible');
          }
          const ext = String(archivo).toLowerCase().split('.').pop();
          const mimetype =
            ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
          resultado = await conexion.enviarArchivo(
            aJid(destino.telefono),
            fs.readFileSync(archivo),
            {
              mimetype,
              fileName: String(campana.imagen).split('/').pop(),
              caption: texto,
            }
          );
        } else {
          resultado = await conexion.enviarTexto(aJid(destino.telefono), texto);
        }

        /*
          El id que devuelve WhatsApp es lo único que ata este envío con los
          recibos que van a llegar después —entregado, leído—, que vienen
          sueltos y sin ninguna otra referencia.
        */
        const mensajeId = String(resultado?.key?.id || '');
        if (mensajeId) anotarId.run(mensajeId, destino.id);

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

  programar(campanaId, fecha) {
    const when = new Date(fecha);
    if (!Number.isFinite(when.getTime()) || when.getTime() <= Date.now()) {
      const e = new Error('Elegí una fecha y hora futura para programar');
      e.httpStatus = 400;
      throw e;
    }
    const result = db
      .prepare(
        "UPDATE wa_campanas SET estado = 'programada', programada_para = ? WHERE id = ? AND estado = 'borrador'"
      )
      .run(sqlFecha(when), campanaId);
    if (!result.changes) {
      const e = new Error('La campaña ya no está disponible para programar');
      e.httpStatus = 409;
      throw e;
    }
    /* La respuesta va en ISO: es para el navegador, no para la base. */
    return { campanaId, programadaPara: when.toISOString(), estado: 'programada' };
  }

  async procesarProgramadas() {
    if (this.corriendo) return null;
    const next = db
      .prepare(
        "SELECT id FROM wa_campanas WHERE estado = 'programada' AND programada_para <= CURRENT_TIMESTAMP ORDER BY programada_para ASC LIMIT 1"
      )
      .get();
    if (!next) return null;
    try {
      return await this.arrancar(next.id);
    } catch (error) {
      db.prepare("UPDATE wa_campanas SET estado = 'cancelada', ultimo_error = ? WHERE id = ?").run(
        String(error.message || 'No se pudo iniciar').slice(0, 220),
        next.id
      );
      logger.warn('WhatsApp: campaña programada cancelada', {
        campanaId: next.id,
        message: error.message,
      });
      return null;
    }
  }
}

const motor = new Motor();
const scheduler = setInterval(() => {
  motor
    .procesarProgramadas()
    .catch((error) =>
      logger.warn('WhatsApp: no se pudo revisar campañas programadas', { message: error.message })
    );
}, 30_000);
scheduler.unref?.();

/**
 * Anota que un mensaje se entregó o se leyó.
 *
 * ── Por qué sólo escribe si estaba vacío ───────────────────────────────────
 *
 * Los recibos de WhatsApp llegan desordenados y repetidos: puede venir el de
 * leído antes que el de entregado, o el mismo tres veces. Con un UPDATE a
 * secas, el segundo recibo pisaría la hora del primero y la marca terminaría
 * diciendo cuándo llegó el último aviso en vez de cuándo pasó la cosa.
 *
 * `COALESCE(columna, ...)` deja la primera y descarta el resto. Es la
 * diferencia entre "lo leyó a las 20:15" y "el último recibo entró a las
 * 20:47".
 */
function registrarRecibo({ id, entregado = false, leido = false } = {}) {
  const mensajeId = String(id || '');
  if (!mensajeId) return false;

  const r = db
    .prepare(
      `UPDATE wa_envios
          SET entregado_en = CASE WHEN ? THEN COALESCE(entregado_en, CURRENT_TIMESTAMP) ELSE entregado_en END,
              leido_en     = CASE WHEN ? THEN COALESCE(leido_en, CURRENT_TIMESTAMP) ELSE leido_en END
        WHERE mensaje_id = ?`
    )
    .run(entregado ? 1 : 0, leido ? 1 : 0, mensajeId);

  return r.changes > 0;
}

/*
  Se engancha una sola vez, al cargar el módulo. La conexión avisa de cada
  recibo y esto lo persiste; si el enganche viviera adentro de una campaña,
  los recibos que llegan después de terminarla —que son la mayoría— se
  perderían.
*/
// La implementación real es un EventEmitter. La guarda deja que el motor se
// cargue también con conectores mínimos en pruebas o recuperación, sin perder
// el seguimiento de recibos en el gateway real.
if (typeof conexion?.on === 'function') {
  conexion.on('recibo', (dato) => {
    try {
      registrarRecibo(dato);
    } catch (error) {
      logger.warn('WhatsApp: no se pudo anotar el recibo', { message: error.message });
    }
  });
}

/**
 * Baja automática.
 *
 * Es lo que protege el número: alguien que no puede salir de la lista
 * termina reportando, y los reportes son lo que dispara el bloqueo.
 */
function registrarRespuesta({ telefono, texto, mensajeId = '', recibidoEn = null }) {
  const tel = normalizarTelefono(telefono);
  if (!tel) return null;
  const baja = reglas.pideLaBaja(texto);

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO wa_respuestas (telefono, texto, es_baja, mensaje_id, recibido_en)
     VALUES (?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
    )
    .run(
      tel,
      String(texto || '').slice(0, 2000),
      baja ? 1 : 0,
      String(mensajeId || '').slice(0, 180),
      recibidoEn || null
    );

  if (result.changes > 0) {
    motor.emit('respuesta', {
      telefono: tel,
      texto,
      esBaja: baja,
      mensajeId,
      recibidoEn: recibidoEn || new Date().toISOString(),
    });
  }

  if (baja) {
    db.prepare(
      "INSERT OR IGNORE INTO wa_excluidos (telefono, motivo) VALUES (?, 'pidió la baja')"
    ).run(tel);
    logger.info('WhatsApp: baja automática', { telefono: tel });
  }
  return { baja };
}

module.exports = { motor, registrarRespuesta, registrarRecibo, HOY, claveTurno };

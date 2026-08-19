const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const pino = require('pino');

const logger = require('../../utils/logger');
const { dataDir, ensureDir } = require('../../utils/storagePaths');
const db = require('../../db');
const { deJid, normalizarTelefono } = require('./telefono');

/**
 * Conexión con WhatsApp, desde el servidor.
 *
 * ── Por qué Baileys y no whatsapp-web.js ───────────────────────────────────
 *
 * La app de envíos que veníamos usando corre sobre `whatsapp-web.js`, que por
 * dentro abre un Chromium de verdad y automatiza la web de WhatsApp. Eso pide
 * un navegador instalado, medio giga de RAM y una pantalla virtual: funciona
 * en una PC, es un problema en un contenedor.
 *
 * Baileys habla el protocolo WebSocket de WhatsApp directamente. Sin
 * navegador, sin Chromium, sin pantalla. Es lo que hace que esto pueda vivir
 * adentro del sistema en vez de en una máquina del local que hay que dejar
 * prendida.
 *
 * ── Dónde vive la sesión ───────────────────────────────────────────────────
 *
 * En `DATA_DIR/whatsapp-sesion`, que en Railway es el volumen persistente —el
 * mismo donde está la base. Eso importa: si la sesión se guardara en el disco
 * efímero del contenedor, cada deploy pediría escanear el QR de nuevo.
 *
 * ── Sobre reconectar ───────────────────────────────────────────────────────
 *
 * WhatsApp corta la conexión seguido y es normal. Se reintenta con espera
 * creciente, salvo cuando el motivo es `loggedOut`: ahí el celular
 * desvinculó la sesión y reintentar no sirve, hay que escanear otra vez. Un
 * reintento infinito contra una sesión cerrada es la forma más rápida de que
 * WhatsApp marque el número.
 */

const CARPETA_SESION = path.join(dataDir, 'whatsapp-sesion');

// Baileys registra estructuras internas de Signal cuando su logger queda en el
// nivel por defecto. Esas estructuras pueden incluir material efimero de la
// sesion y no pertenecen a los logs operativos del negocio. Los estados que el
// operador necesita siguen saliendo por nuestro logger, sin datos sensibles.
const BAILEYS_LOGGER = pino({ level: 'silent' });

/** Espera creciente entre reintentos, en milisegundos. */
const ESPERAS_RECONEXION = [3000, 8000, 20000, 60000, 120000];

function contenidoInterno(message = {}) {
  let content = message?.message || {};
  // WhatsApp puede envolver una nota de voz en más de una capa. Si sólo
  // abrimos las dos variantes viejas, el gateway la clasifica como texto y
  // nunca llega a Whisper.
  while (true) {
    const wrapped =
      content.ephemeralMessage?.message ||
      content.viewOnceMessage?.message ||
      content.viewOnceMessageV2?.message ||
      content.viewOnceMessageV2Extension?.message;
    if (!wrapped) return content;
    content = wrapped;
  }
}
class ConexionWhatsapp extends EventEmitter {
  constructor({ carpetaSesion = CARPETA_SESION } = {}) {
    super();
    this.carpetaSesion = carpetaSesion;
    this.socket = null;
    /** apagado | conectando | qr | conectado | error */
    this.estado = 'apagado';
    this.detalle = null;
    this.qr = null;
    this.numero = null;
    this.intentos = 0;
    this.cerradoAProposito = false;
    this.reintento = null;
    this.enviadosPorSistema = new Set();
    this.enviosEsperados = [];
    this.downloadMediaMessage = null;
  }

  resumen() {
    return {
      estado: this.estado,
      detalle: this.detalle,
      // El QR sólo se expone mientras hace falta escanearlo. Es una
      // credencial: quien lo escanea se lleva la sesión.
      qr: this.estado === 'qr' ? this.qr : null,
      numero: this.numero,
      intentos: this.intentos,
    };
  }

  cambiarEstado(estado, detalle = null) {
    this.estado = estado;
    this.detalle = detalle;
    this.emit('estado', this.resumen());
  }

  /**
   * Sólo se invoca cuando WhatsApp confirmó `loggedOut`. Esas credenciales ya
   * no pueden producir otro QR: conservarlas deja al botón reconectando una
   * sesión muerta para siempre. El directorio es exclusivamente de Baileys;
   * no contiene campañas, clientes ni datos operativos.
   */
  limpiarSesionInvalida() {
    fs.rmSync(this.carpetaSesion, { recursive: true, force: true });
  }

  programarReconexion(espera) {
    clearTimeout(this.reintento);
    this.reintento = setTimeout(() => {
      this.reintento = null;
      if (this.cerradoAProposito || this.socket) return;

      // `conectar` evita dos aperturas simultáneas cuando el estado dice
      // "conectando". El intento anterior ya terminó al recibir `close`, por
      // lo que hay que liberarlo antes de abrir el socket nuevo. Sin esto el
      // callback volvía de inmediato y el QR quedaba en "Reconectando".
      this.estado = 'apagado';
      this.conectar();
    }, espera);
  }

  async conectar() {
    if (this.socket || this.estado === 'conectando') return this.resumen();

    this.cerradoAProposito = false;
    this.cambiarEstado('conectando');
    ensureDir(this.carpetaSesion);

    /*
      Baileys se carga acá adentro y no arriba del archivo a propósito. Es una
      dependencia grande y sólo hace falta cuando alguien conecta WhatsApp: si
      se pidiera al arrancar, un problema suyo tiraría abajo todo el servidor
      —incluida la caja y los pedidos— por un módulo de marketing.
    */
    let baileys;
    try {
      baileys = require('@whiskeysockets/baileys');
    } catch (error) {
      this.cambiarEstado('error', 'Falta instalar @whiskeysockets/baileys en el servidor');
      logger.error('WhatsApp: no se pudo cargar Baileys', { message: error.message });
      return this.resumen();
    }

    const crearSocket = baileys.default || baileys.makeWASocket;
    const {
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
      downloadMediaMessage,
    } = baileys;
    this.downloadMediaMessage = downloadMediaMessage;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.carpetaSesion);
      let version;
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch {
        // Sin red hacia el CDN de versiones se usa la que trae la librería.
        version = undefined;
      }

      const socket = crearSocket({
        version,
        auth: state,
        // Sin esto Baileys escupe el QR por consola con caracteres de bloque,
        logger: BAILEYS_LOGGER,
        // que en los logs de Railway es basura ilegible. El QR lo mostramos
        // nosotros en el panel.
        printQRInTerminal: false,
        browser: ['Modo Sabor', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });
      this.socket = socket;

      socket.ev.on('creds.update', saveCreds);

      // Un solo socket alimenta todos los consumidores del sistema. La
      // conexión no decide si un mensaje pertenece a atención, campañas o
      // métricas: publica el evento normalizado y cada servicio aplica sus
      // propias reglas.
      socket.ev.on('messages.upsert', ({ messages = [], type }) => {
        if (type !== 'notify') return;
        messages.forEach((message) => {
          const jid = String(message?.key?.remoteJid || '');
          if (!jid || jid === 'status@broadcast' || jid.endsWith('@g.us')) return;
          const telefono = normalizarTelefono(deJid(jid));
          if (telefono) {
            db.prepare(
              `INSERT INTO wa_contactos (jid, telefono, nombre, ultimo_mensaje_en, origen)
               VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'gateway')
               ON CONFLICT(jid) DO UPDATE SET
                 telefono = excluded.telefono,
                 nombre = CASE WHEN excluded.nombre <> '' THEN excluded.nombre ELSE wa_contactos.nombre END,
                 ultimo_mensaje_en = CURRENT_TIMESTAMP, actualizado_en = CURRENT_TIMESTAMP`
            ).run(
              `${telefono}@s.whatsapp.net`,
              telefono,
              String(message?.pushName || '')
                .trim()
                .slice(0, 160)
            );
          }
          const messageId = String(message?.key?.id || '');
          const texto = String(
            message?.message?.conversation ||
              message?.message?.extendedTextMessage?.text ||
              message?.message?.imageMessage?.caption ||
              ''
          ).trim();
          const ahora = Date.now();
          this.enviosEsperados = this.enviosEsperados.filter((item) => item.hasta > ahora);
          const indiceEsperado = message?.key?.fromMe
            ? this.enviosEsperados.findIndex((item) => item.jid === jid && item.texto === texto)
            : -1;
          const enviadoPorSistema = Boolean(
            (messageId && this.enviadosPorSistema.has(messageId)) || indiceEsperado >= 0
          );
          if (enviadoPorSistema) this.enviadosPorSistema.delete(messageId);
          if (indiceEsperado >= 0) this.enviosEsperados.splice(indiceEsperado, 1);
          this.emit('mensaje', { ...message, enviadoPorSistema });
        });
      });

      socket.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect, qr } = u;

        if (qr) {
          this.qr = qr;
          this.cambiarEstado('qr', 'Escaneá el código desde WhatsApp del local');
        }

        if (connection === 'open') {
          this.qr = null;
          this.intentos = 0;
          this.numero = String(socket.user?.id || '').split(':')[0] || null;
          this.cambiarEstado('conectado');
          logger.info('WhatsApp conectado', { numero: this.numero });
        }

        if (connection === 'close') {
          const motivo = lastDisconnect?.error?.output?.statusCode;
          const desvinculado = motivo === DisconnectReason?.loggedOut;
          this.socket = null;

          if (this.cerradoAProposito) {
            this.cambiarEstado('apagado');
            return;
          }
          if (desvinculado) {
            /*
              El celular cerró la sesión. Reintentar no la recupera y sólo
              suma intentos fallidos contra el número: hay que escanear.
            */
            try {
              this.limpiarSesionInvalida();
            } catch (error) {
              this.cambiarEstado('error', 'No se pudo preparar la nueva vinculación');
              logger.error('WhatsApp: no se pudo limpiar la sesión inválida', {
                message: error.message,
              });
              return;
            }

            this.qr = null;
            this.numero = null;
            this.intentos = 0;
            logger.warn('WhatsApp: sesión cerrada desde el celular; generando nuevo QR');
            // La sesión inválida ya no existe: una conexión nueva emite QR sin
            // que el operador tenga que reiniciar Railway ni presionar dos veces.
            this.cambiarEstado('apagado', 'Preparando un código nuevo…');
            this.conectar();
            return;
          }

          const espera = ESPERAS_RECONEXION[Math.min(this.intentos, ESPERAS_RECONEXION.length - 1)];
          this.intentos += 1;
          this.cambiarEstado('conectando', `Reconectando en ${Math.round(espera / 1000)}s`);
          this.programarReconexion(espera);
        }
      });

      return this.resumen();
    } catch (error) {
      this.socket = null;
      this.cambiarEstado('error', error.message);
      logger.error('WhatsApp: error conectando', { message: error.message });
      return this.resumen();
    }
  }

  async desconectar() {
    this.cerradoAProposito = true;
    clearTimeout(this.reintento);
    const socket = this.socket;
    this.socket = null;
    this.qr = null;
    try {
      await socket?.end?.();
    } catch {
      // Cerrar una conexión ya rota no es un problema.
    }
    this.cambiarEstado('apagado');
    return this.resumen();
  }

  async desvincular() {
    this.cerradoAProposito = true;
    clearTimeout(this.reintento);
    const socket = this.socket;
    this.socket = null;
    this.qr = null;
    this.numero = null;
    try {
      await socket?.logout?.();
    } catch {
      // Si el socket ya estaba roto, borrar sus credenciales locales produce
      // el mismo resultado operativo: el próximo inicio pedirá un QR nuevo.
    }
    this.limpiarSesionInvalida();
    this.cambiarEstado('apagado', 'Sesión desvinculada');
    return this.resumen();
  }

  get listo() {
    return this.estado === 'conectado' && Boolean(this.socket);
  }

  /**
   * Manda un texto. Tira si la conexión no está lista, para que el motor de
   * envío lo cuente como fallo del contacto y no lo dé por entregado.
   */
  async enviarTexto(jid, texto) {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    const contenido = String(texto || '').trim();
    this.enviosEsperados.push({ jid, texto: contenido, hasta: Date.now() + 60000 });
    const result = await this.socket.sendMessage(jid, { text: contenido });
    const id = String(result?.key?.id || '');
    if (id) this.enviadosPorSistema.add(id);
    return result;
  }

  async enviarImagen(jid, buffer, epigrafe = '') {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    this.enviosEsperados.push({
      jid,
      texto: String(epigrafe || '').trim(),
      hasta: Date.now() + 60000,
    });
    const result = await this.socket.sendMessage(jid, {
      image: buffer,
      caption: epigrafe || undefined,
    });
    const id = String(result?.key?.id || '');
    if (id) this.enviadosPorSistema.add(id);
    return result;
  }

  /** Envía una pieza de campaña como imagen o documento, con el texto como caption. */
  async enviarArchivo(jid, buffer, { mimetype, fileName, caption = '' } = {}) {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    const esImagen = String(mimetype || '').startsWith('image/');
    const texto = String(caption || '').trim();
    this.enviosEsperados.push({ jid, texto, hasta: Date.now() + 60000 });
    const result = await this.socket.sendMessage(
      jid,
      esImagen
        ? { image: buffer, caption: texto || undefined }
        : {
            document: buffer,
            mimetype,
            fileName: fileName || 'archivo.pdf',
            caption: texto || undefined,
          }
    );
    const id = String(result?.key?.id || '');
    if (id) this.enviadosPorSistema.add(id);
    return result;
  }

  async enviarPresencia(jid, tipo = 'composing') {
    if (!this.listo) return;
    try {
      await this.socket.presenceSubscribe(jid);
      await this.socket.sendPresenceUpdate(tipo, jid);
    } catch {
      // El indicador de escritura es cosmético; una falla no debe impedir la
      // respuesta ni cortar el pedido.
    }
  }

  async descargarAudio(message) {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    const content = contenidoInterno(message);
    if (!content.audioMessage) throw new Error('El mensaje no contiene un audio');
    if (typeof this.downloadMediaMessage !== 'function') {
      throw new Error('El descargador de audio de WhatsApp no está disponible');
    }
    const normalizedMessage = { ...message, message: content };
    return this.downloadMediaMessage(
      normalizedMessage,
      'buffer',
      {},
      {
        // Baileys usa este logger sólo cuando WhatsApp pide volver a subir el
        // medio (404/410). Sin logger el propio reintento fallaba antes de
        // recuperar la nota de voz.
        logger: { info: () => {} },
        reuploadRequest:
          typeof this.socket.updateMediaMessage === 'function'
            ? this.socket.updateMediaMessage.bind(this.socket)
            : undefined,
      }
    );
  }

  /**
   * Pregunta a WhatsApp si el número existe.
   *
   * Escribirle a un número que no tiene cuenta es de las cosas que más rápido
   * hacen que marquen el tuyo: es la huella de una lista comprada.
   */
  async existeEnWhatsapp(jid) {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    try {
      const [res] = await this.socket.onWhatsApp(jid);
      return Boolean(res?.exists);
    } catch {
      // Ante la duda se asume que sí: perder un cliente real por un chequeo
      // que falló es peor que mandarle a uno que no está.
      return true;
    }
  }
}

const conexion = new ConexionWhatsapp();

module.exports = { conexion, ConexionWhatsapp, CARPETA_SESION, contenidoInterno };

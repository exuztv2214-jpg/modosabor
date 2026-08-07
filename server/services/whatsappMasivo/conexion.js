const path = require('path');
const { EventEmitter } = require('events');

const logger = require('../../utils/logger');
const { dataDir, ensureDir } = require('../../utils/storagePaths');

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

/** Espera creciente entre reintentos, en milisegundos. */
const ESPERAS_RECONEXION = [3000, 8000, 20000, 60000, 120000];

class ConexionWhatsapp extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    /** apagado | conectando | qr | conectado | error */
    this.estado = 'apagado';
    this.detalle = null;
    this.qr = null;
    this.numero = null;
    this.intentos = 0;
    this.cerradoAProposito = false;
    this.reintento = null;
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

  async conectar() {
    if (this.socket || this.estado === 'conectando') return this.resumen();

    this.cerradoAProposito = false;
    this.cambiarEstado('conectando');
    ensureDir(CARPETA_SESION);

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
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    try {
      const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION);
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
        // que en los logs de Railway es basura ilegible. El QR lo mostramos
        // nosotros en el panel.
        printQRInTerminal: false,
        browser: ['Modo Sabor', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });
      this.socket = socket;

      socket.ev.on('creds.update', saveCreds);

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
            this.qr = null;
            this.numero = null;
            this.cambiarEstado(
              'error',
              'La sesión se cerró desde el celular. Hay que escanear de nuevo.'
            );
            logger.warn('WhatsApp: sesión cerrada desde el celular');
            return;
          }

          const espera = ESPERAS_RECONEXION[Math.min(this.intentos, ESPERAS_RECONEXION.length - 1)];
          this.intentos += 1;
          this.cambiarEstado('conectando', `Reconectando en ${Math.round(espera / 1000)}s`);
          clearTimeout(this.reintento);
          this.reintento = setTimeout(() => this.conectar(), espera);
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

  get listo() {
    return this.estado === 'conectado' && Boolean(this.socket);
  }

  /**
   * Manda un texto. Tira si la conexión no está lista, para que el motor de
   * envío lo cuente como fallo del contacto y no lo dé por entregado.
   */
  async enviarTexto(jid, texto) {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    return this.socket.sendMessage(jid, { text: texto });
  }

  async enviarImagen(jid, buffer, epigrafe = '') {
    if (!this.listo) throw new Error('WhatsApp no está conectado');
    return this.socket.sendMessage(jid, { image: buffer, caption: epigrafe || undefined });
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

module.exports = { conexion, CARPETA_SESION };

const fs = require('fs');
const path = require('path');
const defaultDb = require('../db');
const { desencriptar } = require('../utils/encryptConfig');
const { getConfigMap } = require('../utils/mercadoPago');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { getCustomerSnapshot, formatMoney } = require('../utils/systemClient');
const logger = require('../utils/logger');
const { crearCarritoWhatsapp } = require('./carritoWhatsapp');
const { ejecutarAgente } = require('./motorAgente');
const { conversar, conversarConProveedor } = require('./iaProveedor');
const { crearMemoriaConversacion } = require('./memoriaConversacion');
const { buildAgentTraining } = require('./whatsappAgentTraining');
const { catalogoParaPerfil, ejecutarRegistrada } = require('./registroHerramientas');
const { registrarMetricaAgente } = require('./metricasAgente');

function historialAMensajes(historial = '') {
  return String(historial || '')
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean)
    .slice(-12)
    .map((linea) => {
      const esAsistente = /^Chispita:\s*/i.test(linea);
      return {
        rol: esAsistente ? 'asistente' : 'usuario',
        texto: linea.replace(/^(?:Cliente|Chispita):\s*/i, '').slice(0, 2000),
      };
    });
}

function instruccionesCliente(atencion) {
  return `Sos ${atencion.nombre || 'Chispita'}, quien atiende WhatsApp para Modo Sabor.
Hablá en castellano rioplatense, de vos, con mensajes breves y cálidos.
Usá las herramientas para consultar carta, stock, clientes, pedidos y para armar el pedido.
Nunca inventes productos, disponibilidad, direcciones ni precios. Los precios salen del servidor.
No digas que un pedido quedó confirmado hasta que crear_pedido devuelva el pedido real.
La ficha y el teléfono del cliente son los del contexto; nunca consultes a otra persona.
Si falta un dato indispensable, preguntá solamente ese dato. Si el cliente pide una persona, derivá.
Saludá una sola vez por conversación: si hay historial reciente, continuá sin reiniciar ni repetir el nombre.
Conservá los detalles de cocina que diga el cliente (por ejemplo “con ají” o “sin cebolla”) dentro de la descripción/notas del ítem y repetilos en el resumen antes de confirmar.
Antes de crear_pedido, enviá un resumen completo (ítems, variantes/notas, dirección y total) y esperá una confirmación posterior. Aceptá como confirmación natural “sí”, “si”, “confirmo”, “dale”, “ok”, “okay”, “de una”, “mandalo”, “listo”, “está bien”, “correcto” y variantes equivalentes, pero sólo si acabás de enviar ese resumen y no falta ningún dato.
Después de crear un pedido real, respondé agradecimientos y referencias al mismo pedido sin abrir una venta nueva; para demora o estado usá consultar_pedido_actual.
El nombre que figura en la ficha del cliente es el dato principal. No lo cambies ni inventes otro nombre. Sólo registrá un nombre distinto si el cliente lo declara expresamente (por ejemplo, “me llamo…” o “mi nombre es…”), usando actualizar_datos_pedido.
No preguntes cómo va a pagar por iniciativa propia. Si el cliente dice que pagará por transferencia, registrá “transferencia” con actualizar_datos_pedido y compartí exactamente los datos de transferencia configurados abajo. No inventes alias, titulares ni bancos. Si esos datos están vacíos, derivá a una persona en vez de dar información de pago incompleta.

Datos de transferencia configurados:
${atencion.datos_transferencia || '(sin datos cargados)'}

Estilo configurado:
${atencion.estilo || ''}

Reglas generales:
${atencion.reglas_generales || ''}

Reglas del turno:
${atencion.turno?.instrucciones || ''}

Ejemplos configurados:
${atencion.ejemplos || ''}

${atencion.regla_catalogo || ''}`;
}

function leerPoliticaConversacional() {
  try {
    return fs.readFileSync(
      path.join(__dirname, '../../agente-whatsapp/politica-conversacional.md'),
      'utf8'
    );
  } catch {
    return '';
  }
}

/*
  El respaldo de WhatsApp es independiente del asistente del panel. Así una
  cuota agotada o una rotación de la clave principal no deja sin respuesta a
  los clientes. No devolvemos una configuración incompleta: marcar el switch
  sin guardar clave no puede aparentar que existe un plan B.
*/
function proveedorRespaldoWhatsapp(config = {}) {
  if (String(config.whatsapp_emergencia_activa || '0') !== '1') return null;

  const nombre = String(config.whatsapp_emergencia_proveedor || 'Respaldo WhatsApp').trim();
  const usaGemini = /\b(?:google\s+)?gemini\b/i.test(nombre);
  const baseConfigurada = String(config.whatsapp_emergencia_base_url || '')
    .trim()
    .replace(/\/+$/, '');
  const modeloConfigurado = String(config.whatsapp_emergencia_modelo || '').trim();
  const clavePropia = desencriptar(config.whatsapp_emergencia_api_key) || '';
  // Gemini ya se usa para alertas y transcripción. Reutilizar esa clave desde
  // el servidor evita copiarla a otro campo y no la envía nunca al navegador.
  const clave = usaGemini ? clavePropia || desencriptar(config.gemini_api_key) || '' : clavePropia;
  const baseUrl = usaGemini
    ? /generativelanguage\.googleapis\.com/i.test(baseConfigurada)
      ? baseConfigurada
      : 'https://generativelanguage.googleapis.com/v1beta'
    : baseConfigurada;
  const modelo = usaGemini
    ? /^gemini-/i.test(modeloConfigurado)
      ? modeloConfigurado
      : 'gemini-3.6-flash'
    : modeloConfigurado;
  if (!baseUrl || !modelo || !clave) return null;

  return {
    id: usaGemini ? 'gemini_whatsapp_emergencia' : 'whatsapp_emergencia',
    nombre,
    familia: usaGemini ? 'gemini' : 'openai',
    baseUrl,
    modelo,
    clave,
  };
}

/*
  El estado del carrito, escrito para que el modelo lo tenga siempre delante.

  Antes sólo lo sabía si se acordaba de llamar a `ver_carrito`. En producción
  eso terminó en una conversación cerrada con "¡Hasta la próxima!" mientras el
  cliente tenía media docena de empanadas cargadas y una guarnición a medio
  elegir. Ese pedido se perdió y nadie se enteró.

  Un dato que decide si la conversación puede terminar no puede depender de que
  el modelo se acuerde de preguntarlo.
*/
function resumenDelCarrito(db, telefono) {
  try {
    const carrito = crearCarritoWhatsapp(db).verCarrito(telefono);
    const items = Array.isArray(carrito?.items) ? carrito.items : [];
    if (!items.length) return 'Carrito: vacío.';

    const detalle = items
      .map((item) => {
        const cantidad = Number(item?.cantidad || 1);
        const nombre = String(item?.nombre || item?.descripcion || 'ítem');
        return `${cantidad}× ${nombre}`;
      })
      .join(', ');

    const total = Number(carrito?.total || 0);
    return (
      `Carrito EN CURSO: ${detalle}` +
      (total ? ` · ${formatMoney(total)}` : '') +
      '. Hay un pedido a medio armar: no cierres ni te despidas sin confirmarlo ' +
      'o sin preguntar si lo deja para después.'
    );
  } catch {
    return '';
  }
}

async function atenderConMotorPropio(payload, dependencias = {}) {
  const inicio = Date.now();
  const db = dependencias.db || defaultDb;
  const ejecutarMotor = dependencias.ejecutarAgente || ejecutarAgente;
  const memoria = dependencias.memoria || crearMemoriaConversacion(db);
  const config = getConfigMap(db);
  const resolverPrincipal = dependencias.conversarPrincipal || conversar;
  const obtenerRespaldo = dependencias.obtenerRespaldo || proveedorRespaldoWhatsapp;
  const resolverRespaldo = dependencias.conversarRespaldo || conversarConProveedor;
  const respaldo = obtenerRespaldo(config);
  let usandoRespaldo = false;
  const conversarConRespaldo = async (opciones) => {
    if (usandoRespaldo) return resolverRespaldo({ ...opciones, proveedor: respaldo });
    try {
      return await resolverPrincipal(opciones);
    } catch (errorPrincipal) {
      if (!respaldo) throw errorPrincipal;
      try {
        const respuesta = await resolverRespaldo({ ...opciones, proveedor: respaldo });
        usandoRespaldo = true;
        return {
          ...respuesta,
          _meta: {
            ...(respuesta?._meta || {}),
            fallback: true,
            proveedorOriginal: respuesta?._meta?.proveedorOriginal || 'principal',
          },
        };
      } catch (errorRespaldo) {
        // El error final conserva los dos motivos, sin incluir claves ni texto
        // de clientes. Sirve para diagnosticar el panel de WhatsApp.
        throw new Error(
          `Falló la IA principal y el respaldo: ${String(errorPrincipal.message || errorPrincipal).slice(0, 160)} / ${String(errorRespaldo.message || errorRespaldo).slice(0, 160)}`
        );
      }
    }
  };
  const turno = payload?.turno_actual || getCurrentShiftInfo(config).turno_actual;
  const atencion = payload?.atencion || buildAgentTraining(config, turno);
  const telefono = String(payload?.telefono || '').trim();
  if (!telefono) throw new Error('Falta el teléfono de la conversación');

  let cliente = payload?.cliente;
  if (cliente === undefined) {
    cliente = getCustomerSnapshot(db, telefono);
  }
  const contexto = {
    db,
    telefono,
    cliente,
    turno,
    mensajeId: payload?.mensaje_id || '',
    dependenciasPedido: dependencias.dependenciasPedido,
  };
  const herramientas = catalogoParaPerfil('cliente', contexto);
  /*
    Resumir una charla larga también usa IA. Es una mejora de contexto, no una
    condición para atender: si el proveedor está lento, sin cuota o el resumen
    falla, seguimos con los últimos mensajes en vez de dejar al cliente sin
    respuesta. El gateway registrará el fallo de la respuesta real si ésa sí
    ocurre; este aviso no incluye contenido ni teléfono.
  */
  let memoriaActual = { resumen: '', mensajes: [] };
  try {
    memoriaActual = await memoria.obtenerContexto(telefono);
  } catch (error) {
    logger.warn('WhatsApp: no se pudo resumir el contexto; se atiende igual', {
      detalle: String(error?.message || error).slice(0, 200),
    });
  }
  const historial = memoriaActual.mensajes?.length
    ? memoriaActual.mensajes.map(({ rol, texto }) => ({ rol, texto }))
    : historialAMensajes(payload?.historial);
  const textoActual = String(payload?.texto || '').slice(0, 8000);
  const ultimo = historial[historial.length - 1];
  const mensajes =
    ultimo?.rol === 'usuario' && ultimo.texto === textoActual
      ? historial
      : [...historial, { rol: 'usuario', texto: textoActual }];
  const herramientasUsadas = [];
  const guardarMetrica = dependencias.registrarMetrica || registrarMetricaAgente;
  try {
    const resultado = await ejecutarMotor({
      sistema: `${instruccionesCliente(atencion)}\n\n${leerPoliticaConversacional()}${
        memoriaActual.resumen
          ? `\n\nResumen guardado de la conversación:\n${memoriaActual.resumen}`
          : ''
      }\n\n${resumenDelCarrito(db, telefono)}`,
      mensajes,
      herramientas,
      _conversar: conversarConRespaldo,
      ejecutar: (nombre, argumentos) => ejecutarRegistrada(nombre, argumentos, contexto, 'cliente'),
      onPaso: async (paso) => {
        herramientasUsadas.push(paso.llamada.nombre);
        await dependencias.onPaso?.(paso);
      },
    });

    const texto = String(resultado?.respuesta?.texto || resultado?.detenido?.texto || '').trim();
    if (!texto) {
      if (resultado?.agotado) throw new Error('La IA agotó sus intentos sin responder');
      throw new Error('La IA no devolvió una respuesta');
    }
    const meta = resultado?.respuesta?._meta || {};
    guardarMetrica(
      {
        telefono,
        mensajeId: contexto.mensajeId,
        latenciaMs: Date.now() - inicio,
        tokensEntrada: resultado?.uso?.entrada,
        tokensSalida: resultado?.uso?.salida,
        proveedor: meta.proveedor,
        modelo: meta.modelo,
        herramientas: herramientasUsadas,
        handoff: herramientasUsadas.includes('derivar_a_persona'),
        pedidoCreado: herramientasUsadas.includes('crear_pedido'),
      },
      db
    );
    return texto;
  } catch (error) {
    guardarMetrica(
      {
        telefono,
        mensajeId: contexto.mensajeId,
        latenciaMs: Date.now() - inicio,
        herramientas: herramientasUsadas,
        error: error.message,
        handoff: herramientasUsadas.includes('derivar_a_persona'),
        pedidoCreado: herramientasUsadas.includes('crear_pedido'),
      },
      db
    );
    throw error;
  }
}

async function elegirMotorWhatsapp({ usarMotorPropio, payload, llamarN8n, llamarMotor }) {
  if (usarMotorPropio) return llamarMotor(payload);
  return llamarN8n(payload);
}

module.exports = {
  atenderConMotorPropio,
  elegirMotorWhatsapp,
  historialAMensajes,
  instruccionesCliente,
  leerPoliticaConversacional,
  proveedorRespaldoWhatsapp,
  resumenDelCarrito,
};

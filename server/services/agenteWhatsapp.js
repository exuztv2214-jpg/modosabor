const fs = require('fs');
const path = require('path');
const defaultDb = require('../db');
const { getConfigMap } = require('../utils/mercadoPago');
const { getCurrentShiftInfo } = require('../utils/shifts');
const { getCustomerSnapshot, formatMoney } = require('../utils/systemClient');
const { crearCarritoWhatsapp } = require('./carritoWhatsapp');
const { ejecutarAgente } = require('./motorAgente');
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
Después de crear un pedido real, respondé agradecimientos y referencias al mismo pedido sin abrir una venta nueva; para demora o estado usá consultar_pedido_actual.

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
  const memoriaActual = await memoria.obtenerContexto(telefono);
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
  resumenDelCarrito,
};

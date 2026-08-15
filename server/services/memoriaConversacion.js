const defaultDb = require('../db');
const { conversar } = require('./iaProveedor');

function aMensaje(fila) {
  return {
    id: Number(fila.id),
    rol: fila.direccion === 'saliente' ? 'asistente' : 'usuario',
    texto: String(fila.contenido || ''),
    creado_en: fila.creado_en,
  };
}

function minutosDesde(fecha) {
  if (!fecha) return Infinity;
  const normalizada = /(?:Z|[+-]\d\d:\d\d)$/.test(fecha)
    ? fecha
    : `${String(fecha).replace(' ', 'T')}Z`;
  const instante = new Date(normalizada).getTime();
  return Number.isFinite(instante) ? Math.max(0, (Date.now() - instante) / 60000) : Infinity;
}

async function resumirPorDefecto({ resumenAnterior, mensajes }) {
  const contenido = mensajes
    .map((m) => `${m.rol === 'usuario' ? 'Cliente' : 'Chispita'}: ${m.texto}`)
    .join('\n');
  const respuesta = await conversar({
    sistema:
      'Resumí esta conversación de un restaurante en datos operativos breves: pedido, preferencias, dirección mencionada, correcciones y pendientes. No inventes nada.',
    mensajes: [
      {
        rol: 'usuario',
        texto: `${resumenAnterior ? `Resumen anterior:\n${resumenAnterior}\n\n` : ''}Mensajes nuevos:\n${contenido}`,
      },
    ],
    herramientas: [],
  });
  return String(respuesta?.texto || '').trim();
}

function crearMemoriaConversacion(db = defaultDb, dependencias = {}) {
  const resumir = dependencias.resumir || resumirPorDefecto;

  async function obtenerContexto(telefono, { maxMensajes = 12, minutosInactividad = 120 } = {}) {
    const numero = String(telefono || '').trim();
    const conversacion = db
      .prepare(
        `SELECT id, telefono, COALESCE(resumen_texto, '') resumen_texto,
                COALESCE(resumen_hasta_mensaje_id, 0) resumen_hasta_mensaje_id
           FROM whatsapp_conversaciones WHERE telefono = ?`
      )
      .get(numero);
    if (!conversacion) return { resumen: '', mensajes: [], nueva: true };

    const ultimo = db
      .prepare(
        `SELECT id, creado_en FROM whatsapp_mensajes
          WHERE conversacion_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(conversacion.id);
    if (!ultimo || minutosDesde(ultimo.creado_en) > Number(minutosInactividad)) {
      return { resumen: '', mensajes: [], nueva: true };
    }

    const nuevos = db
      .prepare(
        `SELECT id, direccion, contenido, creado_en FROM whatsapp_mensajes
          WHERE conversacion_id = ? AND id > ? ORDER BY id`
      )
      .all(conversacion.id, Number(conversacion.resumen_hasta_mensaje_id || 0))
      .map(aMensaje);

    let resumen = conversacion.resumen_texto || '';
    if (nuevos.length > Number(maxMensajes)) {
      resumen = await resumir({ resumenAnterior: resumen, mensajes: nuevos, telefono: numero });
      const hastaId = nuevos[nuevos.length - 1].id;
      db.prepare(
        `UPDATE whatsapp_conversaciones
            SET resumen_texto = ?, resumen_hasta_mensaje_id = ?, actualizado_en = CURRENT_TIMESTAMP
          WHERE id = ?`
      ).run(resumen, hastaId, conversacion.id);
    }

    const recientes = db
      .prepare(
        `SELECT id, direccion, contenido, creado_en FROM whatsapp_mensajes
          WHERE conversacion_id = ? ORDER BY id DESC LIMIT ?`
      )
      .all(conversacion.id, Math.max(1, Number(maxMensajes)))
      .reverse()
      .map(aMensaje);

    return { resumen, mensajes: recientes, nueva: false };
  }

  return { obtenerContexto };
}

module.exports = {
  crearMemoriaConversacion,
  obtenerContexto: (...args) => crearMemoriaConversacion(defaultDb).obtenerContexto(...args),
  minutosDesde,
};

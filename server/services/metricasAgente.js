const defaultDb = require('../db');
const logger = require('../utils/logger');

function registrarMetricaAgente(datos, db = defaultDb) {
  try {
    const conversacion = db
      .prepare('SELECT id FROM whatsapp_conversaciones WHERE telefono = ?')
      .get(String(datos.telefono || ''));
    db.prepare(
      `INSERT INTO agente_metricas
        (conversacion_id, telefono, mensaje_id, latencia_ms, tokens_entrada, tokens_salida,
         proveedor, modelo, herramientas, error, handoff, pedido_creado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      conversacion?.id || null,
      String(datos.telefono || ''),
      String(datos.mensajeId || ''),
      Number(datos.latenciaMs || 0),
      Number(datos.tokensEntrada || 0),
      Number(datos.tokensSalida || 0),
      String(datos.proveedor || ''),
      String(datos.modelo || ''),
      JSON.stringify(datos.herramientas || []),
      String(datos.error || '').slice(0, 500),
      datos.handoff ? 1 : 0,
      datos.pedidoCreado ? 1 : 0
    );
  } catch (error) {
    logger.warn('IA: no se pudo guardar la métrica del agente', { message: error.message });
  }
}

module.exports = { registrarMetricaAgente };

const fs = require('fs');
const path = require('path');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: node agente-whatsapp/analizar-historial.js <backup-seudonimizado.json>');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (source.tipo !== 'analisis_seudonimizado' || !Array.isArray(source.chats)) {
  throw new Error('El archivo debe ser el backup seudonimizado generado por la herramienta local');
}

const categories = {
  saludo: /\b(hola|holi|buen(?:a|as)|buen dia|buenas noches)\b/i,
  menu_precio: /\b(menu|menú|carta|precio|cuanto|cuánto|sale|promo|promocion|promoción)\b/i,
  pedido:
    /\b(quiero|queria|quería|pedido|pedir|manda(?:me)?|lleva(?:me)?|encargo|agrega(?:me)?)\b/i,
  delivery_retiro: /\b(delivery|envio|envío|domicilio|retir(?:o|ar)|buscar)\b/i,
  direccion:
    /\b(direccion|dirección|calle|altura|esquina|barrio|referencia|ubicacion|ubicación)\b/i,
  pago: /\b(efectivo|transferencia|transferir|alias|pago|mercado pago)\b/i,
  horario: /\b(abierto|abren|cierran|horario|atienden|hasta que hora|hasta qué hora)\b/i,
  confirmacion: /\b(confirmo|confirmado|dale|si|sí|perfecto|correcto|eso seria|eso sería)\b/i,
  demora: /\b(cuanto tarda|cuánto tarda|demora|tiempo|falta mucho|cuando llega|cuándo llega)\b/i,
  reclamo: /\b(reclamo|problema|equivoc|falt[oa]|frio|frío|tarde|cancelar|devolver)\b/i,
  agradecimiento: /\b(gracias|genial|joya|buenisimo|buenísimo)\b/i,
};

const productFamilies = {
  hamburguesas: /\b(hamburguesa|burger|smash|bacon cheese|route 66)\b/i,
  milanesas: /\b(mila|milanesa|napolitana|caballo|roquefort)\b/i,
  pizzas: /\b(pizza|muzz?a|muzza|pizzas)\b/i,
  sandwiches: /\b(lomito|sandwich|sándwich|sanguche)\b/i,
  empanadas: /\b(empanada|docena|media docena)\b/i,
  papas: /\b(papas|papas fritas|salchipapa|cheddar)\b/i,
  bebidas: /\b(pepsi|mirinda|jugo|bebida|gaseosa)\b/i,
};

function localHour(timestamp) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Tucuman',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000));
  return Number(parts.find((part) => part.type === 'hour')?.value || 0);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function median(values) {
  return percentile(values, 0.5);
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

const stats = {
  chats: source.chats.length,
  mensajes: 0,
  entrantes: 0,
  salientes: 0,
  multimedia: 0,
  horas: Array(24).fill(0),
  motivos: Object.fromEntries(Object.keys(categories).map((key) => [key, 0])),
  productos: Object.fromEntries(Object.keys(productFamilies).map((key) => [key, 0])),
  palabrasSalientes: [],
  respuestasMinutos: [],
  emojisSalientes: 0,
  preguntasSalientes: 0,
  secuenciasConfirmacion: 0,
};

for (const chat of source.chats) {
  const messages = [...(chat.mensajes || [])].sort((a, b) => a.timestamp - b.timestamp);
  stats.mensajes += messages.length;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const text = String(message.texto || '').trim();
    const outbound = message.from_me === true;
    if (outbound) {
      stats.salientes += 1;
      stats.palabrasSalientes.push(text ? text.split(/\s+/).length : 0);
      if (/\p{Extended_Pictographic}/u.test(text)) stats.emojisSalientes += 1;
      if (text.includes('?') || text.includes('¿')) stats.preguntasSalientes += 1;
    } else {
      stats.entrantes += 1;
      for (const [key, expression] of Object.entries(categories)) {
        if (expression.test(text)) stats.motivos[key] += 1;
      }
      for (const [key, expression] of Object.entries(productFamilies)) {
        if (expression.test(text)) stats.productos[key] += 1;
      }
      if (message.timestamp) stats.horas[localHour(message.timestamp)] += 1;

      const next = messages[index + 1];
      if (next?.from_me && next.timestamp >= message.timestamp) {
        const minutes = (next.timestamp - message.timestamp) / 60;
        if (minutes <= 360) stats.respuestasMinutos.push(minutes);
      }
      if (categories.confirmacion.test(text)) {
        const nearby = messages.slice(index + 1, index + 4);
        if (nearby.some((item) => item.from_me)) stats.secuenciasConfirmacion += 1;
      }
    }
    if (message.tiene_multimedia) stats.multimedia += 1;
  }
}

const topHours = stats.horas
  .map((count, hour) => ({ hour, count }))
  .sort((a, b) => b.count - a.count)
  .slice(0, 5);
const topProducts = Object.entries(stats.productos)
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count);
const topReasons = Object.entries(stats.motivos)
  .map(([name, count]) => ({ name, count }))
  .sort((a, b) => b.count - a.count);

const summary = {
  generado_en: new Date().toISOString(),
  origen: path.basename(inputPath),
  privacidad:
    'Solo contiene agregados estadísticos. No incluye textos, nombres, teléfonos, direcciones ni IDs de chats.',
  volumen: {
    chats: stats.chats,
    mensajes: stats.mensajes,
    entrantes: stats.entrantes,
    salientes: stats.salientes,
    multimedia: stats.multimedia,
  },
  estilo_local: {
    palabras_mediana: median(stats.palabrasSalientes),
    palabras_p75: percentile(stats.palabrasSalientes, 0.75),
    porcentaje_con_emoji: Number(
      ((stats.emojisSalientes / Math.max(stats.salientes, 1)) * 100).toFixed(1)
    ),
    porcentaje_con_pregunta: Number(
      ((stats.preguntasSalientes / Math.max(stats.salientes, 1)) * 100).toFixed(1)
    ),
  },
  operacion: {
    respuesta_mediana_minutos: Number(median(stats.respuestasMinutos).toFixed(1)),
    respuesta_promedio_minutos: Number(average(stats.respuestasMinutos).toFixed(1)),
    confirmaciones_con_respuesta: stats.secuenciasConfirmacion,
    horas_mas_activas: topHours,
  },
  motivos: topReasons,
  familias_producto: topProducts,
};

const maxWords = Math.max(12, Math.min(35, summary.estilo_local.palabras_p75 || 20));
const peakHours = topHours.map((item) => `${String(item.hour).padStart(2, '0')}:00`).join(', ');
const dominantProducts = topProducts
  .filter((item) => item.count > 0)
  .slice(0, 4)
  .map((item) => item.name)
  .join(', ');

const training = {
  whatsapp_agente_nombre: 'Chispita',
  whatsapp_agente_estilo: `Hablá como el local: con voseo argentino, mensajes breves, cálidos y directos. Hacé una pregunta por vez. Como referencia, mantené normalmente cada respuesta debajo de ${maxWords} palabras. ${summary.estilo_local.porcentaje_con_emoji < 10 ? 'No uses emojis salvo que el cliente los use primero.' : 'Usá como máximo un emoji cuando resulte natural.'}`,
  whatsapp_agente_reglas_generales:
    'Entendé mensajes cortos, incompletos y enviados en varias partes; usá el historial reciente antes de volver a preguntar. No inventes productos, precios, promociones, stock ni tiempos. Cotizá cada producto. Todos los pedidos son delivery salvo retiro explícito; reutilizá la dirección guardada o pedila. No preguntes forma de pago: se abona al recibir. Las pizzas son enteras con cremoso por defecto; media o muzza solo si se pide. Antes de crear el pedido, enviá un único resumen con ítems, variantes, envío y total, y esperá confirmación explícita.',
  whatsapp_agente_reglas_turnos: {
    manana: 'Se vende el menú del día disponible y también la carta completa.',
    noche: 'Se vende únicamente la carta habitual. No ofrezcas menú del día.',
  },
  whatsapp_agente_ejemplos:
    'Cliente: Hola.\nRespuesta: Hola, ¿qué querés pedir?\n\nCliente: Quiero una pizza común.\nRespuesta: Dale, una común entera con cremoso. ¿Algo más?\n\nCliente: Eso es todo.\nRespuesta: Perfecto. ¿A qué dirección te lo mando?\n\nCliente: Confirmo.\nRespuesta: Perfecto, dame un segundo que cargo el pedido.\n\nCliente: Me llegó mal el pedido.\nRespuesta: Disculpá. Ya te deriva con una persona del local para resolverlo.',
};

const outputDir = path.join(__dirname, 'entrenamiento');
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'resumen-historial.json'), JSON.stringify(summary, null, 2));
fs.writeFileSync(
  path.join(outputDir, 'configuracion-generada.json'),
  JSON.stringify(training, null, 2)
);

const report = `# Manual de atención generado desde el historial

Este documento se construyó con agregados del backup seudonimizado. No contiene conversaciones, teléfonos, direcciones ni nombres de clientes.

## Evidencia analizada

- ${summary.volumen.chats.toLocaleString('es-AR')} chats y ${summary.volumen.mensajes.toLocaleString('es-AR')} mensajes.
- ${summary.volumen.entrantes.toLocaleString('es-AR')} mensajes entrantes y ${summary.volumen.salientes.toLocaleString('es-AR')} salientes.
- Respuesta histórica mediana: ${summary.operacion.respuesta_mediana_minutos} minutos.
- Horas de mayor actividad: ${peakHours || 'sin datos suficientes'}.
- Familias más mencionadas: ${dominantProducts || 'sin datos suficientes'}.

## Forma de atender

- Voseo argentino, respuesta cálida y directa.
- Una pregunta por mensaje y normalmente no más de ${maxWords} palabras.
- Interpretar mensajes fragmentados usando el historial reciente.
- No repetir datos que el cliente ya informó.
- No inventar disponibilidad, precios, promociones, envío ni demora.

## Flujo obligatorio

1. Verificar que el local esté abierto y aplicar las reglas del turno actual.
2. Identificar producto, cantidad y variante; aclarar solo lo que falte.
3. Cotizar cada ítem contra el sistema.
4. Definir retiro o delivery; para delivery validar dirección y costo.
5. Preguntar forma de pago.
6. Enviar un resumen completo y pedir confirmación explícita.
7. Crear el pedido una sola vez y devolver su número.
8. Derivar reclamos, cancelaciones, pagos dudosos o mensajes incomprensibles.

## Límite de aprendizaje

El historial enseña tono y patrones conversacionales. Productos, stock, precios, horarios y promociones siempre se consultan en vivo al sistema.
`;
fs.writeFileSync(path.join(outputDir, 'manual-atencion.md'), report);

console.log(
  JSON.stringify(
    {
      ok: true,
      chats: summary.volumen.chats,
      mensajes: summary.volumen.mensajes,
      archivos: [
        'agente-whatsapp/entrenamiento/resumen-historial.json',
        'agente-whatsapp/entrenamiento/configuracion-generada.json',
        'agente-whatsapp/entrenamiento/manual-atencion.md',
      ],
    },
    null,
    2
  )
);

const isProduction = () => String(process.env.NODE_ENV || '').trim() === 'production';

function buildEntry(level, message, meta = {}) {
  return {
    level,
    timestamp: new Date().toISOString(),
    message,
    ...meta,
  };
}

function log(level, message, meta = {}) {
  const entry = buildEntry(level, message, meta);
  const output = JSON.stringify(entry);

  if (level === 'error') {
    console.error(output);
    return;
  }

  if (level === 'warn') {
    console.warn(output);
    return;
  }

  /*
    "notice" es para lo que hay que poder ver en producción sin que sea un
    problema: qué modelo de Whisper se cargó, qué versión arrancó, cosas que
    uno va a buscar al log cuando algo anda raro.

    Hacía falta porque `info` se descarta en producción y `warn` miente: pinta
    de amarillo algo que está funcionando bien. Sin este nivel, la única forma
    de verificar el modelo de Whisper era mandar un audio y adivinar por la
    calidad de la transcripción.

    Es para eventos ocasionales, no para el pulso de cada request.
  */
  if (level === 'notice') {
    console.log(output);
    return;
  }

  // En producción omitimos logs informativos para reducir ruido.
  if (isProduction()) return;

  console.log(output);
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  notice: (message, meta) => log('notice', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};

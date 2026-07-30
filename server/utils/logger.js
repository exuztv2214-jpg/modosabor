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

  // En producción omitimos logs informativos para reducir ruido.
  if (isProduction()) return;

  console.log(output);
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};

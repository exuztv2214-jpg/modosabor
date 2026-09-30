function trimTrailingSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '');
}

const DEFAULT_PUBLIC_APP_URL = trimTrailingSlash(
  import.meta.env.VITE_PUBLIC_APP_URL || 'https://www.modosabor.club'
);

function getBrowserOrigin() {
  if (typeof window === 'undefined') return '';
  return trimTrailingSlash(window.location.origin);
}

function safeParseUrl(value) {
  try {
    return value ? new URL(value) : null;
  } catch {
    return null;
  }
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '[::1]') return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
  return false;
}

// Railway es útil como URL técnica del backend, pero no debería terminar en
// QR o links que reciben clientes cuando la app ya está abierta desde el
// dominio público. Se reconoce sólo el patrón de hosting, sin bloquear otros
// dominios válidos que el negocio pueda configurar.
function isRailwayHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  return host.endsWith('.up.railway.app') || host.endsWith('.railway.app');
}

export function getPublicAppUrlDiagnostics(config = {}) {
  const configuredBase = trimTrailingSlash(config?.public_app_url || DEFAULT_PUBLIC_APP_URL);
  const browserBase = getBrowserOrigin();
  const configuredUrl = safeParseUrl(configuredBase);
  const browserUrl = safeParseUrl(browserBase);

  const configuredIsPrivate = Boolean(configuredUrl && isPrivateHostname(configuredUrl.hostname));
  const configuredIsPublicHttps = Boolean(
    configuredUrl && configuredUrl.protocol === 'https:' && !configuredIsPrivate
  );
  const configuredIsRailway = Boolean(configuredUrl && isRailwayHostname(configuredUrl.hostname));
  const configuredIsInsecurePublic = Boolean(
    configuredUrl && configuredUrl.protocol !== 'https:' && !configuredIsPrivate
  );
  const browserIsPublicHttps = Boolean(
    browserUrl && browserUrl.protocol === 'https:' && !isPrivateHostname(browserUrl.hostname)
  );

  let base = configuredBase || browserBase;
  let warning = '';
  let reason = 'ok';

  if (configuredBase) {
    if (!configuredUrl) {
      if (browserBase) {
        base = browserBase;
        reason = 'configured-invalid';
        warning =
          'La URL publica configurada no es valida. El sistema usara la URL actual del navegador mientras tanto.';
      } else {
        reason = 'configured-invalid';
        warning =
          'La URL pública configurada no es válida. Corregila antes de compartir links o imprimir QR.';
      }
    } else if (browserIsPublicHttps && configuredIsRailway && browserBase !== configuredBase) {
      // Si el usuario está viendo el panel desde el dominio público, ese es el
      // origen correcto para compartir. Railway queda disponible como
      // fallback cuando se accede directamente por su URL técnica.
      base = browserBase;
      reason = 'configured-hosting-fallback';
      warning =
        'La URL configurada apunta al dominio técnico de Railway. Para compartir se usa el dominio público actual.';
    } else if (browserIsPublicHttps && !configuredIsPublicHttps) {
      base = browserBase;
      reason = configuredIsPrivate ? 'configured-private' : 'configured-insecure';
      warning = configuredIsPrivate
        ? 'La URL publica configurada apunta a una red privada. Para compartir links al cliente conviene usar el dominio publico.'
        : 'La URL publica configurada no usa HTTPS. Para tarjetas y links compartidos conviene dejar el dominio publico seguro.';
    } else if (configuredIsPrivate) {
      reason = 'configured-private';
      warning =
        'La URL publica configurada es interna/LAN. Los QR y links solo funcionaran dentro de esa red.';
    } else if (configuredIsInsecurePublic) {
      reason = 'configured-insecure';
      warning =
        'La URL pública configurada no usa HTTPS. Actualizala para que el cliente reciba links seguros.';
    }
  } else if (browserBase) {
    reason = 'configured-empty';
    warning = browserIsPublicHttps
      ? 'Todavia no hay URL publica guardada. El sistema esta usando el dominio actual del navegador.'
      : 'Todavía no hay URL pública guardada. Definila antes de imprimir o compartir tarjetas.';
  }

  return {
    base,
    browserBase,
    configuredBase,
    configuredIsPrivate,
    configuredIsPublicHttps,
    configuredIsRailway,
    reason,
    usesFallback: Boolean(base && configuredBase && base !== configuredBase),
    warning,
  };
}

export function getPublicAppBaseUrl(config = {}) {
  return getPublicAppUrlDiagnostics(config).base;
}

export function buildPublicAppUrl(path = '/', config = {}) {
  const base = getPublicAppBaseUrl(config);
  const normalizedPath = String(path || '/').startsWith('/')
    ? String(path || '/')
    : `/${String(path || '')}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}

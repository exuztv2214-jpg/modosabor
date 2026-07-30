function clean(value) {
  return String(value || '').trim();
}

function cleanUrl(value) {
  return clean(value).replace(/\/$/, '');
}

function isLocalUrl(value) {
  return /localhost|127\.0\.0\.1/i.test(clean(value));
}

function isPrivateNetworkUrl(value) {
  const raw = clean(value);
  if (!raw) return false;

  try {
    const { hostname } = new URL(raw);
    return /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(hostname);
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  const raw = clean(value);
  if (!raw) return false;

  try {
    return new URL(raw).protocol === 'https:';
  } catch {
    return false;
  }
}

function isPublicHttpsUrl(value) {
  return isHttpsUrl(value) && !isLocalUrl(value);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = clean(value);
    if (normalized) return normalized;
  }
  return '';
}

function mergeRuntimeConfig(config = {}) {
  const env = process.env;
  const railwayUrl = clean(env.RAILWAY_PUBLIC_DOMAIN)
    ? `https://${clean(env.RAILWAY_PUBLIC_DOMAIN)}`
    : '';

  return {
    ...config,
    public_app_url: cleanUrl(
      firstNonEmpty(
        env.PUBLIC_APP_URL,
        env.FRONTEND_URL,
        env.APP_URL,
        railwayUrl,
        config.public_app_url
      )
    ),
    public_api_url: cleanUrl(
      firstNonEmpty(
        env.PUBLIC_API_URL,
        env.BACKEND_URL,
        env.API_URL,
        env.RENDER_EXTERNAL_URL,
        railwayUrl,
        config.public_api_url
      )
    ),
  };
}

module.exports = {
  clean,
  cleanUrl,
  isLocalUrl,
  isPrivateNetworkUrl,
  isHttpsUrl,
  isPublicHttpsUrl,
  mergeRuntimeConfig,
};

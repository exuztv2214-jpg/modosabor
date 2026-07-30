import { UPLOADS_BASE_URL } from './runtime.js';

function trimTrailingSlash(value) {
  return String(value || '')
    .trim()
    .replace(/\/$/, '');
}

export function resolveAssetUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  if (raw.startsWith('/uploads/')) {
    return `${trimTrailingSlash(UPLOADS_BASE_URL)}${raw}`;
  }
  return raw;
}

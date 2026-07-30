export function applyBranding(config = {}) {
  if (typeof document === 'undefined') return;

  const businessName = config.negocio_nombre || 'Modo Sabor';
  document.title = `${businessName} - Sistema`;

  const iconHref = config.negocio_favicon || config.negocio_logo || '';
  if (iconHref) {
    let icon = document.querySelector("link[rel='icon']");
    if (!icon) {
      icon = document.createElement('link');
      icon.setAttribute('rel', 'icon');
      document.head.appendChild(icon);
    }
    icon.setAttribute('href', iconHref);

    let appleIcon = document.querySelector("link[rel='apple-touch-icon']");
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.setAttribute('rel', 'apple-touch-icon');
      document.head.appendChild(appleIcon);
    }
    appleIcon.setAttribute('href', iconHref);
  }

  let appleTitle = document.querySelector("meta[name='apple-mobile-web-app-title']");
  if (!appleTitle) {
    appleTitle = document.createElement('meta');
    appleTitle.setAttribute('name', 'apple-mobile-web-app-title');
    document.head.appendChild(appleTitle);
  }
  appleTitle.setAttribute('content', businessName);

  if (config.color_primario) {
    document.documentElement.style.setProperty('--ms-brand-primary', config.color_primario);

    let themeMeta = document.querySelector("meta[name='theme-color']");
    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    themeMeta.setAttribute('content', config.color_primario);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ms-branding-updated', { detail: config }));
  }
}

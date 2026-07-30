/**
 * Helpers de impresión centralizados.
 * Evita duplicación de imprimirEnIframe en múltiples archivos.
 */

/**
 * Imprime contenido HTML en un iframe invisible y lo remueve después.
 * @param {string} html - Contenido HTML a imprimir
 * @param {string} title - Título del documento (opcional)
 */
export function imprimirEnIframe(html, title = 'Impresión') {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '-9999px';
  iframe.style.left = '-9999px';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          @media print {
            body { margin: 0; padding: 8px; font-family: monospace; font-size: 12px; }
          }
        </style>
      </head>
      <body>${html}</body>
    </html>
  `);
  doc.close();

  iframe.contentWindow.focus();
  iframe.contentWindow.print();

  // Remover iframe después de un delay
  setTimeout(() => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  }, 5000);
}

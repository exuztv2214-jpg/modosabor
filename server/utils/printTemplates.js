const fs = require('fs');
const path = require('path');

const { loadPedidoItems } = require('./pedidoItems');
const { uploadPublicPathToFile } = require('./storagePaths');

/**
 * Documentos impresos de Modo Sabor: comanda de cocina, ticket del cliente,
 * hoja de reparto, precuenta de mesa y cierre de caja.
 *
 * El diseño está pensado para una impresora hogareña con papel A4, que es lo
 * que hay hoy en el local. Antes el ticket y la hoja de reparto forzaban
 * `@page { size: A6 }`: en una A4 eso imprime el contenido apretado en un
 * rectángulo chico arriba de la hoja y desperdicia tres cuartos del papel.
 *
 * Ahora la geometría sale del formato configurado. Si algún día entra una
 * impresora térmica, cambiando ese ajuste los mismos documentos se reacomodan
 * a rollo sin tocar código.
 *
 * Cada documento tiene una prioridad distinta y por eso no se parecen:
 *
 *  - La comanda la lee un cocinero de lejos, con las manos ocupadas y apuro.
 *    Manda el tamaño de letra: número de pedido gigante y productos grandes.
 *  - El ticket es el comprobante del cliente. Manda la prolijidad.
 *  - La hoja de reparto la usa el rider en la calle. Mandan la dirección y
 *    cuánto tiene que cobrar.
 */

const BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value, symbol = '$') {
  return `${symbol}${Number(value || 0).toLocaleString('es-AR')}`;
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const hasTimezone = /([zZ]|[+-]\d{2}:\d{2})$/.test(raw);
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const isoValue = hasTimezone ? normalized : `${normalized}Z`;
  const parsed = new Date(isoValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatBusinessDateTime(value, mode = 'datetime') {
  const date = parseDateLike(value);
  if (!date) return String(value || '');

  const options =
    mode === 'time'
      ? { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit' }
      : {
          timeZone: BUSINESS_TIMEZONE,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        };

  return date.toLocaleString('es-AR', options);
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseItems(items) {
  if (Array.isArray(items)) return items;
  return parseJson(items || '[]', []);
}

const TIPOS_IMAGEN = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/*
  Un logo de más de medio mega convertido a base64 infla el documento en casi
  700 KB. Para un logo impreso de 45 mm eso no aporta nada, y en cambio hace
  lenta la vista previa y pesada la impresión.
*/
const MAX_LOGO_BYTES = 512 * 1024;

/**
 * Convierte el logo en un `data:` embebido dentro del documento.
 *
 * ── Por qué no alcanza con la URL ──────────────────────────────────────────
 *
 * El logo se guarda como una ruta relativa (`/uploads/logo.png`). Eso funciona
 * sólo si quien abre el documento está en el mismo dominio que la API, y hay
 * tres situaciones donde no lo está:
 *
 *   · La vista previa del panel usa un iframe con `sandbox` cerrado. Adentro no
 *     hay origen, así que una ruta relativa no resuelve contra nada y el logo
 *     aparece roto. Esto es lo que se veía mal en Configuración.
 *   · El panel corriendo en un dominio distinto al de la API.
 *   · La app nativa, donde la página no vive en un servidor web.
 *
 * Incrustándolo, el documento se basta solo: se ve igual en la vista previa, en
 * la impresora y en un PDF guardado, sin depender de la red.
 *
 * Si el archivo no está o es demasiado grande, se cae a la URL de siempre.
 */
function embedAsset(assetUrl, publicApiUrl) {
  const raw = String(assetUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw;

  if (!/^(https?:)?\/\//i.test(raw)) {
    try {
      const archivo = uploadPublicPathToFile(raw);
      if (archivo && fs.existsSync(archivo)) {
        const { size } = fs.statSync(archivo);
        const tipo = TIPOS_IMAGEN[path.extname(archivo).toLowerCase()];
        if (tipo && size > 0 && size <= MAX_LOGO_BYTES) {
          return `data:${tipo};base64,${fs.readFileSync(archivo).toString('base64')}`;
        }
      }
    } catch {
      // Sin permisos o disco raro: se sigue con la URL, que puede funcionar.
    }
  }

  if (/^(https?:)?\/\//i.test(raw)) return raw;

  const base = String(publicApiUrl || '')
    .trim()
    .replace(/\/$/, '');
  if (!base) return raw;
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

function isEnabled(config, key, fallback = false) {
  const value = config?.[key];
  if (value === undefined || value === null || value === '') return fallback;
  return value === '1' || value === 1 || value === true;
}

function configMap(db) {
  return db
    .prepare('SELECT * FROM configuracion')
    .all()
    .reduce((acc, row) => {
      acc[row.clave] = row.valor;
      return acc;
    }, {});
}

function tipoEntregaLabel(tipo) {
  if (tipo === 'mesa') return 'Mesa';
  if (tipo === 'delivery') return 'Delivery';
  if (tipo === 'retiro') return 'Retira';
  return tipo || 'Pedido';
}

/**
 * Desarma la descripción de un item en líneas legibles.
 *
 * Los sabores y las mitades vienen concatenados en una sola cadena. En una
 * comanda eso es una línea larga que el cocinero tiene que descifrar; partido
 * en viñetas se lee de un vistazo.
 */
function itemDetailLines(item) {
  if (item.descripcion) {
    return String(item.descripcion)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        if (part.startsWith('Sabores:') && part.includes(',')) {
          return part
            .replace('Sabores:', '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
        }
        if (part.startsWith('Mitades:') && part.includes('/')) {
          return part
            .replace('Mitades:', '')
            .split('/')
            .map((entry) => entry.trim())
            .filter(Boolean);
        }
        return [part];
      });
  }

  const lines = [];
  if (item.variantes && typeof item.variantes === 'object') {
    Object.entries(item.variantes).forEach(([key, value]) => {
      lines.push(`${key}: ${value?.nombre || value}`);
    });
  }
  if (Array.isArray(item.extras) && item.extras.length > 0) {
    lines.push(
      `Extras: ${item.extras
        .map((extra) => extra?.nombre)
        .filter(Boolean)
        .join(', ')}`
    );
  }
  return lines.filter(Boolean);
}

/**
 * Geometría de página según el formato configurado.
 *
 * `rollo` cubre las térmicas de 58 y 80 mm; el resto son hojas. La diferencia
 * no es sólo el ancho: en rollo el alto es infinito y no tiene sentido
 * reservar espacio ni centrar nada verticalmente.
 */
function pageGeometry(formato) {
  switch (formato) {
    case 'ticket58':
      return { css: '58mm auto', maxWidth: '58mm', chico: true, escala: 0.76, totales: '100%' };
    case 'ticket80':
      return { css: '80mm auto', maxWidth: '80mm', chico: true, escala: 0.86, totales: '100%' };
    case 'a5':
      return { css: 'A5 portrait', maxWidth: '135mm', chico: false, escala: 0.94, totales: '68mm' };
    case 'a4':
      return { css: 'A4 portrait', maxWidth: '190mm', chico: false, escala: 1, totales: '75mm' };
    // A6 es el formato que usa el local: documentos chicos impresos sobre
    // papel A4 y después cortados. `chico` compacta márgenes internos y
    // manda los totales a ancho completo, porque en 105 mm no entra una
    // columna al costado sin que el texto se apile letra por letra.
    default:
      return { css: 'A6 portrait', maxWidth: '100%', chico: true, escala: 0.84, totales: '100%' };
  }
}

function baseStyles(data) {
  const { config } = data;
  const geo = pageGeometry(config.impresion_formato);
  const compact = isEnabled(config, 'impresion_compacta');
  const marginMm = Number(config.impresion_margen_mm || (geo.chico ? 6 : 12));

  let fontFamily = '"Helvetica Neue", Arial, sans-serif';
  if (config.impresion_tipo_letra === 'mono') {
    fontFamily = '"Courier New", Courier, monospace';
  }
  if (config.impresion_tipo_letra === 'serif') fontFamily = 'Georgia, serif';

  const base = (parseInt(config.impresion_tamano_fuente, 10) || 12) * geo.escala;
  const gap = compact ? 0.6 : 1;

  return `
    <style>
      @page { size: ${geo.css}; margin: ${marginMm}mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: ${fontFamily};
        font-size: ${base}px;
        line-height: ${compact ? 1.25 : 1.45};
        color: #111827;
        background: #f3f4f6;
      }
      /*
        El margen de página ya lo pone @page. Acá no se agrega relleno en los
        formatos chicos: en una hoja A6 de 105 mm, cada milímetro que se come
        el diseño es una palabra menos por renglón.
      */
      .sheet {
        width: 100%;
        max-width: ${geo.maxWidth};
        margin: 0 auto;
        background: #fff;
        padding: ${geo.chico ? '0' : `${8 * gap}mm`};
      }

      /* ── Cabecera de marca ── */
      .brand { display: flex; align-items: center; gap: ${(geo.chico ? 2.5 : 4) * gap}mm; padding-bottom: ${(geo.chico ? 2 : 3) * gap}mm; border-bottom: 1px solid #e5e7eb; }
      .brand-logo { max-height: ${geo.chico ? '12mm' : '18mm'}; max-width: ${geo.chico ? '30mm' : '45mm'}; object-fit: contain; }
      .brand-name { font-size: ${base * 1.5}px; font-weight: 700; letter-spacing: -0.01em; }
      .brand-meta { font-size: ${base * 0.85}px; color: #6b7280; margin-top: 1mm; }
      .brand-right { margin-left: auto; text-align: right; }

      /* ── Banda de identificación del documento ── */
      .band { background: #111827; color: #fff; padding: ${(geo.chico ? 2 : 3) * gap}mm ${(geo.chico ? 3 : 4) * gap}mm; display: flex; align-items: center; gap: ${(geo.chico ? 2.5 : 4) * gap}mm; }
      .band-kind { font-size: ${base * 0.8}px; letter-spacing: .14em; text-transform: uppercase; opacity: .75; }
      .band-number { font-size: ${base * (geo.chico ? 2.2 : 2.6)}px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
      .band-right { margin-left: auto; text-align: right; font-size: ${base * 0.95}px; }
      .band-strong { font-size: ${base * 1.35}px; font-weight: 700; }

      /* ── Datos en rejilla ── */
      .facts { display: flex; flex-wrap: wrap; gap: ${(geo.chico ? 2 : 3) * gap}mm ${(geo.chico ? 5 : 8) * gap}mm; padding: ${(geo.chico ? 2.5 : 4) * gap}mm 0; border-bottom: 1px solid #e5e7eb; }
      .fact-label { font-size: ${base * 0.75}px; letter-spacing: .12em; text-transform: uppercase; color: #9ca3af; }
      .fact-value { font-size: ${base * 1.05}px; font-weight: 600; margin-top: 0.5mm; }
      .fact-big { font-size: ${base * 1.6}px; font-weight: 700; }

      /* ── Items ── */
      .items { width: 100%; border-collapse: collapse; margin-top: ${2 * gap}mm; }
      .items th { font-size: ${base * 0.75}px; letter-spacing: .12em; text-transform: uppercase; color: #9ca3af; text-align: left; padding: ${2 * gap}mm 0; border-bottom: 1px solid #e5e7eb; font-weight: 600; }
      .items td { padding: ${(geo.chico ? 1.8 : 2.5) * gap}mm 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
      .items tr:last-child td { border-bottom: 0; }
      .col-qty { width: ${geo.chico ? '11mm' : '14mm'}; }
      .col-price { width: ${geo.chico ? '22mm' : '30mm'}; text-align: right; white-space: nowrap; }
      .qty-pill { display: inline-block; min-width: ${geo.chico ? '7mm' : '9mm'}; padding: 0.5mm 1.5mm; border-radius: 1.5mm; background: #f3f4f6; text-align: center; font-weight: 700; }
      .item-name { font-weight: 600; }
      .item-detail { color: #4b5563; font-size: ${base * 0.9}px; margin-top: 1mm; }
      .item-detail span { display: inline-block; background: #f3f4f6; border-radius: 1.5mm; padding: 0.4mm 1.6mm; margin: 0.6mm 1.2mm 0 0; }

      /* ── Comanda: todo más grande, se lee de lejos ── */
      .kitchen .items td { padding: ${3.5 * gap}mm 0; }
      .kitchen .qty-pill { font-size: ${base * 1.7}px; min-width: 13mm; padding: 1mm 2mm; background: #111827; color: #fff; }
      .kitchen .item-name { font-size: ${base * 1.6}px; font-weight: 700; }
      .kitchen .item-detail { font-size: ${base * 1.15}px; color: #111827; }
      .kitchen .item-detail span { background: #f3f4f6; padding: 1mm 2.5mm; }

      /* ── Totales ── */
      .totals { margin-top: ${(geo.chico ? 2.5 : 4) * gap}mm; margin-left: auto; width: ${geo.totales}; }
      .totals-row { display: flex; justify-content: space-between; padding: ${1.5 * gap}mm 0; font-size: ${base * 0.95}px; color: #4b5563; }
      .totals-grand { display: flex; justify-content: space-between; align-items: baseline; margin-top: ${2 * gap}mm; padding-top: ${2.5 * gap}mm; border-top: 2px solid #111827; }
      .totals-grand span:first-child { font-size: ${base * 1.05}px; font-weight: 600; }
      .totals-grand span:last-child { font-size: ${base * 2}px; font-weight: 800; letter-spacing: -0.02em; }

      /* ── Cobro destacado (hoja de reparto) ── */
      .cobro { border: 2px solid #111827; border-radius: 2mm; padding: ${(geo.chico ? 2.5 : 4) * gap}mm; margin-top: ${(geo.chico ? 2.5 : 4) * gap}mm; display: flex; align-items: center; gap: ${(geo.chico ? 3 : 4) * gap}mm; }
      .cobro-monto { font-size: ${base * (geo.chico ? 2.3 : 2.8)}px; font-weight: 800; line-height: 1; letter-spacing: -0.02em; }
      .cobro-right { margin-left: auto; text-align: right; }

      /* ── Dirección gigante ── */
      .address { margin-top: ${(geo.chico ? 2.5 : 4) * gap}mm; }
      .address-value { font-size: ${base * (geo.chico ? 1.6 : 1.9)}px; font-weight: 700; line-height: 1.2; }

      /* ── Nota ── */
      .note { margin-top: ${(geo.chico ? 2.5 : 4) * gap}mm; border-left: ${geo.chico ? 2 : 3}mm solid #111827; background: #f9fafb; padding: ${(geo.chico ? 2 : 3) * gap}mm ${(geo.chico ? 2.5 : 4) * gap}mm; }
      .note-label { font-size: ${base * 0.75}px; letter-spacing: .12em; text-transform: uppercase; color: #6b7280; }
      .note-text { font-size: ${base * 1.2}px; font-weight: 600; margin-top: 1mm; }

      /* ── Pie ── */
      .foot { margin-top: ${(geo.chico ? 3 : 6) * gap}mm; padding-top: ${(geo.chico ? 2 : 3) * gap}mm; border-top: 1px solid #e5e7eb; display: flex; align-items: flex-end; gap: ${(geo.chico ? 3 : 5) * gap}mm; }
      .foot-message { font-size: ${base * 1.05}px; font-weight: 600; }
      .foot-note { font-size: ${base * 0.8}px; color: #9ca3af; margin-top: 1mm; }
      .qr { margin-left: auto; text-align: center; }
      .qr img { width: ${geo.chico ? '19mm' : '26mm'}; height: ${geo.chico ? '19mm' : '26mm'}; display: block; }
      .qr-label { font-size: ${base * 0.7}px; letter-spacing: .1em; text-transform: uppercase; color: #9ca3af; margin-top: 1mm; }

      /* ── Firma de entrega ── */
      .signature { margin-top: ${(geo.chico ? 6 : 10) * gap}mm; display: flex; gap: ${(geo.chico ? 5 : 10) * gap}mm; }
      .signature > div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 2mm; font-size: ${base * 0.8}px; color: #6b7280; }

      /* ── Barra de acción en pantalla ── */
      .actions { position: sticky; bottom: 0; display: flex; justify-content: center; gap: 8px; padding: 16px; background: #f3f4f6; }
      .print-btn { border: 0; border-radius: 10px; padding: 12px 24px; background: #dc1f2d; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
      .print-hint { align-self: center; font-size: 12px; color: #6b7280; }

      @media print {
        body { background: #fff; }
        .actions { display: none !important; }
        .sheet { padding: 0; max-width: none; }
      }
    </style>
  `;
}

function renderBrand(data, { compacto = false } = {}) {
  const { config, negocioNombre, negocioDireccion, negocioTelefono } = data;
  const showLogo = isEnabled(config, 'impresion_mostrar_logo', true);
  const showName = isEnabled(config, 'impresion_mostrar_nombre_negocio', true);
  const showAddress = isEnabled(config, 'impresion_mostrar_direccion', true) && !compacto;
  const showPhone = isEnabled(config, 'impresion_mostrar_telefono', true) && !compacto;
  const logoUrl = showLogo ? embedAsset(data.logoUrl, data.publicApiUrl) : '';

  if (!logoUrl && !showName && !showAddress && !showPhone) return '';

  const meta = [showAddress ? negocioDireccion : '', showPhone ? negocioTelefono : '']
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="brand">
      ${logoUrl ? `<img class="brand-logo" src="${escapeHtml(logoUrl)}" alt="" />` : ''}
      <div>
        ${showName ? `<div class="brand-name">${escapeHtml(negocioNombre)}</div>` : ''}
        ${meta ? `<div class="brand-meta">${escapeHtml(meta)}</div>` : ''}
      </div>
    </div>
  `;
}

function renderBand({ kind, numero, right = '', rightLabel = '' }) {
  return `
    <div class="band">
      <div>
        <div class="band-kind">${escapeHtml(kind)}</div>
        <div class="band-number">#${escapeHtml(numero)}</div>
      </div>
      ${
        right
          ? `<div class="band-right">
               ${rightLabel ? `<div class="band-kind">${escapeHtml(rightLabel)}</div>` : ''}
               <div class="band-strong">${escapeHtml(right)}</div>
             </div>`
          : ''
      }
    </div>
  `;
}

function renderFacts(entries) {
  const visibles = entries.filter((entry) => entry && entry.value);
  if (visibles.length === 0) return '';
  return `
    <div class="facts">
      ${visibles
        .map(
          (entry) => `
        <div>
          <div class="fact-label">${escapeHtml(entry.label)}</div>
          <div class="fact-value ${entry.big ? 'fact-big' : ''}">${escapeHtml(entry.value)}</div>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

function renderItemsTable(items, { symbol = '$', withPrice = false, showDetails = true } = {}) {
  const filas = items
    .map((item) => {
      const detalles = showDetails ? itemDetailLines(item) : [];
      return `
        <tr>
          <td class="col-qty"><span class="qty-pill">${escapeHtml(item.cantidad)}</span></td>
          <td>
            <div class="item-name">${escapeHtml(item.nombre)}</div>
            ${
              detalles.length > 0
                ? `<div class="item-detail">${detalles
                    .map((linea) => `<span>${escapeHtml(linea)}</span>`)
                    .join('')}</div>`
                : ''
            }
          </td>
          ${
            withPrice
              ? `<td class="col-price">${escapeHtml(
                  money(
                    Number(
                      item.subtotal ??
                        Number(item.precio_unitario || 0) * Number(item.cantidad || 0)
                    ),
                    symbol
                  )
                )}</td>`
              : ''
          }
        </tr>
      `;
    })
    .join('');

  return `
    <table class="items">
      <thead>
        <tr>
          <th class="col-qty">Cant.</th>
          <th>Producto</th>
          ${withPrice ? '<th class="col-price">Importe</th>' : ''}
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;
}

function renderNote(texto, label = 'Nota del pedido') {
  if (!texto) return '';
  return `
    <div class="note">
      <div class="note-label">${escapeHtml(label)}</div>
      <div class="note-text">${escapeHtml(texto)}</div>
    </div>
  `;
}

/**
 * QR de seguimiento.
 *
 * Antes esto imprimía literalmente un rectángulo gris con el texto "QR CODE":
 * salía así en cada ticket entregado a un cliente. Ahora se genera de verdad.
 *
 * La imagen viene de un servicio externo, así que si el local se queda sin
 * internet no carga. Por eso debajo va la dirección escrita: el cliente
 * siempre tiene forma de seguir su pedido, con o sin QR.
 */
function renderQr(data) {
  const { pedido, publicAppUrl } = data;
  if (!pedido?.id || !publicAppUrl) return '';

  const url = `${String(publicAppUrl).replace(/\/$/, '')}/seguimiento/${pedido.id}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(url)}`;

  return `
    <div class="qr">
      <img src="${escapeHtml(qrSrc)}" alt="" onerror="this.style.display='none'" />
      <div class="qr-label">Seguí tu pedido</div>
    </div>
  `;
}

function renderDocumentHtml({ title, styles, bodyHtml, hint = '' }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${styles}
  </head>
  <body>
    ${bodyHtml}
    <div class="actions">
      <button class="print-btn" onclick="window.print()">Imprimir</button>
      ${hint ? `<span class="print-hint">${escapeHtml(hint)}</span>` : ''}
    </div>
  </body>
</html>`;
}

// ── Comanda de cocina ────────────────────────────────────────────────
function renderKitchenBody(data) {
  const { pedido, items, config } = data;
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const showClient = isEnabled(config, 'impresion_comanda_mostrar_cliente', true);

  return `
    <div class="sheet kitchen">
      ${renderBand({
        kind: 'Comanda de cocina',
        numero: pedido.numero,
        rightLabel: tipoEntregaLabel(pedido.tipo_entrega),
        right: pedido.hora_entrega
          ? `Entregar ${pedido.hora_entrega}`
          : showDate
            ? formatBusinessDateTime(pedido.creado_en, 'time')
            : '',
      })}

      ${renderFacts([
        pedido.tipo_entrega === 'mesa' && pedido.mesa
          ? { label: 'Mesa', value: String(pedido.mesa), big: true }
          : null,
        showClient && pedido.cliente_nombre
          ? { label: 'Cliente', value: pedido.cliente_nombre }
          : null,
        pedido.turno_operativo ? { label: 'Turno', value: pedido.turno_operativo } : null,
        showDate
          ? { label: 'Tomado', value: formatBusinessDateTime(pedido.creado_en, 'time') }
          : null,
      ])}

      ${renderItemsTable(items, { withPrice: false, showDetails })}

      ${renderNote(pedido.notas, 'Atención cocina')}
    </div>
  `;
}

// ── Ticket del cliente ───────────────────────────────────────────────
function renderTicketBody(data) {
  const { pedido, items, moneda, mensajeTicket, paymentLabel, config } = data;
  const showPrices = isEnabled(config, 'impresion_mostrar_precios_ticket', true);
  const showQr = isEnabled(config, 'impresion_mostrar_qr_seguimiento', true);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);

  const entrega =
    pedido.tipo_entrega === 'mesa' && pedido.mesa
      ? `Mesa ${pedido.mesa}`
      : tipoEntregaLabel(pedido.tipo_entrega);

  return `
    <div class="sheet">
      ${renderBrand(data)}

      ${renderFacts([
        { label: 'Pedido', value: `#${pedido.numero}`, big: true },
        showDate ? { label: 'Fecha', value: formatBusinessDateTime(pedido.creado_en) } : null,
        { label: 'Entrega', value: entrega },
        pedido.hora_entrega ? { label: 'Horario', value: pedido.hora_entrega } : null,
        { label: 'Pago', value: paymentLabel },
        pedido.cliente_nombre ? { label: 'Cliente', value: pedido.cliente_nombre } : null,
        pedido.cliente_telefono ? { label: 'Teléfono', value: pedido.cliente_telefono } : null,
        pedido.tipo_entrega === 'delivery' && pedido.cliente_direccion
          ? { label: 'Dirección', value: pedido.cliente_direccion }
          : null,
      ])}

      ${renderItemsTable(items, { symbol: moneda, withPrice: showPrices, showDetails })}

      ${
        showPrices
          ? `
        <div class="totals">
          <div class="totals-row"><span>Subtotal</span><span>${escapeHtml(money(pedido.subtotal, moneda))}</span></div>
          ${Number(pedido.costo_envio || 0) > 0 ? `<div class="totals-row"><span>Envío</span><span>${escapeHtml(money(pedido.costo_envio, moneda))}</span></div>` : ''}
          ${Number(pedido.descuento || 0) > 0 ? `<div class="totals-row"><span>Descuento</span><span>-${escapeHtml(money(pedido.descuento, moneda))}</span></div>` : ''}
          <div class="totals-grand"><span>Total</span><span>${escapeHtml(money(pedido.total, moneda))}</span></div>
        </div>
      `
          : ''
      }

      ${renderNote(pedido.notas)}

      <div class="foot">
        <div>
          ${mensajeTicket ? `<div class="foot-message">${escapeHtml(mensajeTicket)}</div>` : ''}
          <div class="foot-note">Documento no válido como factura.</div>
        </div>
        ${showQr ? renderQr(data) : ''}
      </div>
    </div>
  `;
}

// ── Hoja de reparto ──────────────────────────────────────────────────
function renderDeliveryTicketBody(data) {
  const { pedido, items, moneda, paymentLabel, config } = data;
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const pagado = String(pedido.pago_estado || '').toLowerCase() === 'pagado';

  return `
    <div class="sheet">
      ${renderBand({
        kind: 'Hoja de reparto',
        numero: pedido.numero,
        rightLabel: pedido.hora_entrega ? 'Entregar' : 'Zona',
        right: pedido.hora_entrega || pedido.delivery_zona || '',
      })}

      <div class="address">
        <div class="fact-label">Dirección de entrega</div>
        <div class="address-value">${escapeHtml(pedido.cliente_direccion || 'Sin dirección cargada')}</div>
      </div>

      ${renderFacts([
        pedido.cliente_nombre ? { label: 'Cliente', value: pedido.cliente_nombre } : null,
        pedido.cliente_telefono
          ? { label: 'Teléfono', value: pedido.cliente_telefono, big: true }
          : null,
        pedido.delivery_zona ? { label: 'Zona', value: pedido.delivery_zona } : null,
        pedido.entrega_pin
          ? { label: 'PIN de entrega', value: pedido.entrega_pin, big: true }
          : null,
        pedido.repartidor_nombre ? { label: 'Rider', value: pedido.repartidor_nombre } : null,
      ])}

      <!-- Lo que el rider cobra va en grande y con el estado bien claro. -->
      <div class="cobro">
        <div>
          <div class="fact-label">${pagado ? 'Ya está pagado' : 'A cobrar'}</div>
          <div class="cobro-monto">${escapeHtml(pagado ? '—' : money(pedido.total, moneda))}</div>
        </div>
        <div class="cobro-right">
          <div class="fact-label">Método</div>
          <div class="fact-big">${escapeHtml(paymentLabel)}</div>
        </div>
      </div>

      ${renderItemsTable(items, { withPrice: false, showDetails })}

      ${renderNote(pedido.notas, 'Indicaciones')}

      <div class="signature">
        <div>Firma de quien recibe</div>
        <div>Aclaración</div>
      </div>
    </div>
  `;
}

function documentStyles(data) {
  return baseStyles(data);
}

function renderKitchenHtml(data) {
  return renderDocumentHtml({
    title: `Comanda #${data.pedido.numero}`,
    styles: documentStyles(data),
    bodyHtml: renderKitchenBody(data),
  });
}

function renderTicketHtml(data) {
  return renderDocumentHtml({
    title: `Ticket #${data.pedido.numero}`,
    styles: documentStyles(data),
    bodyHtml: renderTicketBody(data),
  });
}

function renderDeliveryTicketHtml(data) {
  return renderDocumentHtml({
    title: `Reparto #${data.pedido.numero}`,
    styles: documentStyles(data),
    bodyHtml: renderDeliveryTicketBody(data),
  });
}

/**
 * Paquete de impresión del TPV: los documentos de un pedido, uno por hoja.
 *
 * La hoja de reparto se puede desactivar desde Configuración. Cuando los
 * riders trabajen sólo con la app en el celular, imprimirla es papel tirado:
 * el `impresion_hoja_reparto_activa` en cero la saca de acá y del pack sin
 * tocar nada más.
 */
function renderPrintPackHtml(data) {
  const paginas = [renderKitchenBody(data), renderTicketBody(data)];

  const repartoActivo = isEnabled(data.config, 'impresion_hoja_reparto_activa', true);
  if (data.pedido.tipo_entrega === 'delivery' && repartoActivo) {
    paginas.push(renderDeliveryTicketBody(data));
  }

  return renderDocumentHtml({
    title: `Pedido #${data.pedido.numero}`,
    hint: `${paginas.length} ${paginas.length === 1 ? 'hoja' : 'hojas'}`,
    styles: `
      ${documentStyles(data)}
      <style>
        .pack-page { page-break-after: always; break-after: page; }
        .pack-page:last-of-type { page-break-after: auto; break-after: auto; }
        @media screen { .pack-page + .pack-page { margin-top: 12px; } }
      </style>
    `,
    bodyHtml: paginas.map((pagina) => `<section class="pack-page">${pagina}</section>`).join(''),
  });
}

// ── Precuenta de mesa ────────────────────────────────────────────────
function renderMesaPrecuentaHtml(data) {
  const { mesa, pedidos, moneda, totalMesa, config } = data;
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showPrices = isEnabled(config, 'impresion_mostrar_precios_ticket', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);

  const bloques = pedidos
    .map(
      (pedido) => `
      <div style="margin-top: 6mm;">
        <div class="fact-label">Pedido #${escapeHtml(pedido.numero)}${
          showDate ? ` · ${escapeHtml(formatBusinessDateTime(pedido.creado_en, 'time'))}` : ''
        }</div>
        ${renderItemsTable(parseItems(pedido.items), {
          symbol: moneda,
          withPrice: showPrices,
          showDetails,
        })}
      </div>
    `
    )
    .join('');

  return renderDocumentHtml({
    title: `Precuenta mesa ${mesa}`,
    styles: documentStyles(data),
    bodyHtml: `
      <div class="sheet">
        ${renderBrand(data)}
        ${renderFacts([
          { label: 'Mesa', value: String(mesa), big: true },
          { label: 'Pedidos', value: String(pedidos.length) },
          showDate ? { label: 'Emitida', value: formatBusinessDateTime(new Date()) } : null,
        ])}
        ${bloques}
        <div class="totals">
          <div class="totals-grand"><span>Total de la mesa</span><span>${escapeHtml(money(totalMesa, moneda))}</span></div>
        </div>
        <div class="foot">
          <div>
            <div class="foot-message">Resumen de consumo</div>
            <div class="foot-note">Documento no válido como factura.</div>
          </div>
        </div>
      </div>
    `,
  });
}

// ── Muestra y prueba de impresión ────────────────────────────────────

/**
 * Pedido de ejemplo para previsualizar y probar la impresión.
 *
 * Lleva lo que más suele romper un diseño: un producto con nombre largo y
 * dos líneas de detalle, otro con guarniciones, una nota, un envío y un PIN.
 * Si un documento se ve bien con esto, se ve bien con cualquier pedido real.
 */
function samplePedido() {
  return {
    id: 0,
    numero: 142,
    creado_en: new Date().toISOString(),
    tipo_entrega: 'delivery',
    mesa: '',
    hora_entrega: '21:30',
    turno_operativo: 'Noche',
    cliente_nombre: 'Juan Pérez',
    cliente_telefono: '3863 40-1122',
    cliente_direccion: 'B° 100 Viviendas, Mza F Casa 1, Monteros',
    delivery_zona: 'Monteros centro',
    entrega_pin: '4821',
    repartidor_nombre: 'Cristian Galván',
    metodo_pago: 'efectivo',
    pago_estado: 'pendiente',
    notas: 'Tocar timbre del fondo. Sin aceitunas en la pizza.',
    subtotal: 26000,
    costo_envio: 1500,
    descuento: 0,
    total: 27500,
  };
}

function sampleItems() {
  return [
    {
      cantidad: 1,
      nombre: 'Pizza grande especial de la casa',
      descripcion: 'Mitades: muzzarella / napolitana | Extras: aceitunas, morrón',
      precio_unitario: 12000,
      subtotal: 12000,
    },
    {
      cantidad: 1,
      nombre: 'Menú ejecutivo',
      descripcion: 'Guarnición: puré | Postre incluido',
      precio_unitario: 7000,
      subtotal: 7000,
    },
    { cantidad: 2, nombre: 'Gaseosa 1,5 L', precio_unitario: 3500, subtotal: 7000 },
  ];
}

function buildSampleData(db) {
  const config = configMap(db);
  return {
    pedido: samplePedido(),
    items: sampleItems(),
    config,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    mensajeTicket: config.impresion_mensaje_ticket || '¡Gracias por elegirnos!',
    paymentLabel: 'Efectivo',
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
    publicAppUrl: config.public_app_url || '',
  };
}

/**
 * Documento de muestra para la vista previa del panel.
 *
 * Usa exactamente los mismos renderizadores que la impresión real. Antes la
 * pestaña de Configuración tenía su propia maqueta en React imitando el
 * resultado: unas trescientas líneas que había que mantener en paralelo y
 * que, apenas cambiaba una, mostraban una cosa distinta de la que salía por
 * la impresora. Ahora la vista previa es el documento.
 */
function buildPrintPreviewDocument(db, tipo = 'ticket') {
  const data = buildSampleData(db);

  if (tipo === 'comanda') {
    return { tipo, html: renderKitchenHtml(data) };
  }
  if (tipo === 'delivery') {
    return { tipo, html: renderDeliveryTicketHtml(data) };
  }
  return { tipo: 'ticket', html: renderTicketHtml(data) };
}

function buildPrintTestDocument(db, tipo = 'ticket') {
  const data = buildSampleData(db);
  const { html } = buildPrintPreviewDocument(db, tipo);

  return { tipo: 'prueba_impresion', area: 'configuracion', payload: data, html };
}

// ── Cierre de caja ───────────────────────────────────────────────────
function renderCajaCierreHtml(data) {
  const { activa, resumen, moneda, config } = data;
  const diferencia =
    Number(activa.monto_final_declarado || 0) - Number(activa.efectivo_esperado || 0);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);

  const fila = (label, value, extra = '') =>
    `<div class="totals-row" ${extra}><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;

  return renderDocumentHtml({
    title: `Cierre de caja #${activa.id}`,
    styles: documentStyles(data),
    bodyHtml: `
      <div class="sheet">
        ${renderBrand(data)}
        ${renderBand({
          kind: 'Cierre de caja',
          numero: String(activa.id),
          rightLabel: showDate ? 'Cerrada' : '',
          right: showDate ? formatBusinessDateTime(new Date()) : '',
        })}

        <div class="totals" style="width:100%;">
          ${fila('Fondo inicial', money(activa.monto_inicial, moneda))}
          ${fila('Ventas en efectivo', money(resumen.efectivoVentas, moneda))}
          ${fila('Ingresos manuales', money(resumen.totalIngresosManuales, moneda))}
          ${fila('Gastos y egresos', `-${money(resumen.totalEgresosManuales, moneda)}`)}
          <div class="totals-grand"><span>Efectivo esperado</span><span>${escapeHtml(money(activa.efectivo_esperado, moneda))}</span></div>
          ${fila('Efectivo contado', money(activa.monto_final_declarado, moneda))}
          <div class="totals-grand"><span>Diferencia</span><span>${diferencia > 0 ? '+' : ''}${escapeHtml(money(diferencia, moneda))}</span></div>
        </div>

        <div style="margin-top: 8mm;">
          <div class="fact-label">Ventas por método</div>
          <div class="totals" style="width:100%; margin-top:2mm;">
            ${(resumen.porMetodo || [])
              .map((metodo) => fila(metodo.metodo_pago, money(metodo.total, moneda)))
              .join('')}
          </div>
        </div>

        ${renderFacts([
          { label: 'Pedidos', value: String(resumen.pedidos) },
          { label: 'Venta bruta', value: money(resumen.totalVentas, moneda) },
          activa.cerrada_por_nombre ? { label: 'Cerró', value: activa.cerrada_por_nombre } : null,
        ])}

        <div class="signature">
          <div>Firma del responsable</div>
          <div>Aclaración</div>
        </div>
      </div>
    `,
  });
}

function buildPrintDocument(db, pedido, tipo) {
  const config = configMap(db);
  const items = loadPedidoItems(db, pedido);
  const paymentLabel = pedido.metodo_pago === 'mercadopago' ? 'Mercado Pago' : pedido.metodo_pago;

  const data = {
    pedido,
    config,
    items,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    mensajeTicket: config.impresion_mensaje_ticket || '¡Gracias por elegirnos!',
    paymentLabel,
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
    publicAppUrl: config.public_app_url || '',
  };

  if (tipo === 'comanda_cocina') {
    return { tipo, area: 'cocina', payload: data, html: renderKitchenHtml(data) };
  }

  if (tipo === 'delivery_ticket') {
    return { tipo, area: 'delivery', payload: data, html: renderDeliveryTicketHtml(data) };
  }

  if (tipo === 'tpv_pack') {
    return { tipo, area: 'caja', payload: data, html: renderPrintPackHtml(data) };
  }

  return { tipo: 'ticket_cliente', area: 'caja', payload: data, html: renderTicketHtml(data) };
}

function buildMesaPrecuentaDocument(db, mesa, pedidos) {
  const config = configMap(db);
  const pedidosConItems = (pedidos || []).map((pedido) => ({
    ...pedido,
    items: loadPedidoItems(db, pedido),
  }));
  const totalMesa = pedidos.reduce((acc, pedido) => acc + Number(pedido.total || 0), 0);
  const data = {
    mesa,
    pedidos: pedidosConItems,
    totalMesa,
    config,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
    publicAppUrl: config.public_app_url || '',
  };

  return {
    tipo: 'precuenta_mesa',
    area: 'caja',
    payload: data,
    html: renderMesaPrecuentaHtml(data),
  };
}

function buildCajaCierreDocument(db, activa, resumen) {
  const config = configMap(db);
  const data = {
    activa,
    resumen,
    config,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
    publicAppUrl: config.public_app_url || '',
  };

  return { tipo: 'cierre_caja', area: 'caja', payload: data, html: renderCajaCierreHtml(data) };
}

module.exports = {
  buildPrintDocument,
  buildMesaPrecuentaDocument,
  buildPrintTestDocument,
  buildPrintPreviewDocument,
  buildCajaCierreDocument,
};

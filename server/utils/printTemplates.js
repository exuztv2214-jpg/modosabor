const { loadPedidoItems } = require('./pedidoItems');

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

const BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';

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
      ? { timeZone: BUSINESS_TIMEZONE, hour: '2-digit', minute: '2-digit', second: '2-digit' }
      : {
          timeZone: BUSINESS_TIMEZONE,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
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

function absoluteAssetUrl(assetUrl, publicApiUrl) {
  const raw = String(assetUrl || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;

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

function itemDetailLines(item) {
  if (item.descripcion) {
    return String(item.descripcion)
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        if (part.startsWith('Sabores:') && part.includes(',')) {
          const flavors = part
            .replace('Sabores:', '')
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
          return ['Sabores:', ...flavors.map((entry) => `- ${entry}`)];
        }
        if (part.startsWith('Mitades:') && part.includes('/')) {
          const halves = part
            .replace('Mitades:', '')
            .split('/')
            .map((entry) => entry.trim())
            .filter(Boolean);
          return ['Mitades:', ...halves.map((entry) => `- ${entry}`)];
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

function baseStyles({
  a6 = false,
  marginMm = 8,
  fontScale = 1,
  compact = false,
  fontType = 'mono',
  fontSize = '12px',
} = {}) {
  const scale = Number(fontScale || 1);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const titleSize = (a6 ? 18 : 24) * safeScale;
  const metaSize = (a6 ? 11 : 13) * safeScale;
  const grandSize = (a6 ? 13 : 15) * safeScale;

  let fontFamily = 'Arial, sans-serif';
  if (fontType === 'mono') fontFamily = '"Courier New", Courier, monospace';
  if (fontType === 'serif') fontFamily = 'Georgia, serif';

  const baseSize = parseInt(fontSize) || 12;
  const scaledBaseSize = baseSize * safeScale;

  return `
    <style>
      @page { size: ${a6 ? 'A6 portrait' : 'auto'}; margin: ${Number(marginMm || 8)}mm; }
      * { box-sizing: border-box; }
      body { 
        margin: 0; 
        font-family: ${fontFamily}; 
        font-size: ${scaledBaseSize}px;
        color: #0f172a; 
        background: #fff; 
        line-height: ${compact ? '1.2' : '1.45'};
      }
      .sheet { width: 100%; max-width: ${a6 ? '105mm' : '720px'}; margin: 0 auto; }
      .head { text-align: center; border-bottom: 2px solid #111827; padding-bottom: ${compact ? '4px' : '8px'}; margin-bottom: ${compact ? '6px' : '10px'}; }
      .logo-wrap { margin-bottom: ${compact ? '4px' : '8px'}; display: flex; justify-content: center; }
      .logo-wrap img { display: block; max-width: ${a6 ? '54mm' : '72mm'}; max-height: ${a6 ? '20mm' : '28mm'}; object-fit: contain; }
      .title { font-size: ${titleSize}px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
      .meta, .row, .muted, .item-subline { font-size: ${metaSize}px; }
      .meta, .muted { color: #64748b; }
      .section { margin-top: ${compact ? '6px' : '12px'}; }
      .section-label { font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #64748b; margin-bottom: ${compact ? '2px' : '6px'}; }
      .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: ${compact ? '6px' : '10px'}; }
      .items { border-top: 1px dashed #cbd5e1; border-bottom: 1px dashed #cbd5e1; padding: ${compact ? '4px 0' : '8px 0'}; }
      .item { padding: ${compact ? '3px 0' : '7px 0'}; border-bottom: 1px dashed #e2e8f0; }
      .item:last-child { border-bottom: 0; }
      .row { display: flex; gap: 12px; justify-content: space-between; align-items: flex-start; }
      .item-name { font-weight: 700; }
      .qty { min-width: 32px; font-weight: 800; display: inline-block; }
      .right { text-align: right; white-space: nowrap; }
      .item-subline { color: #475569; margin-top: ${compact ? '1px' : '4px'}; padding-left: 32px; font-size: 0.9em; }
      .totals { margin-top: ${compact ? '4px' : '8px'}; }
      .totals .row { padding: ${compact ? '1px 0' : '3px 0'}; }
      .grand { border-top: 2px solid #111827; margin-top: ${compact ? '2px' : '6px'}; padding-top: ${compact ? '4px' : '8px'}; font-size: ${grandSize}px; font-weight: 800; }
      .badge { display: inline-block; padding: 2px 6px; border-radius: 999px; background: #f1f5f9; font-size: 9px; font-weight: 700; text-transform: uppercase; }
      .notes { margin-top: 8px; padding: 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 11px; }
      .footer { text-align: center; margin-top: 14px; font-size: 11px; color: #64748b; }
      .qr-wrap { text-align: center; margin-top: 12px; }
      .qr-box { display: inline-block; padding: 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
      .actions { margin-top: 16px; display: flex; justify-content: center; }
      .print-btn { border: 0; border-radius: 999px; padding: 10px 16px; background: #ea580c; color: #fff; font-weight: 700; cursor: pointer; }
      @media print { .actions { display: none; } body { background: #fff; } }
    </style>
  `;
}

function renderHeader(data, showMeta = true) {
  const { config, negocioNombre, negocioDireccion, negocioTelefono } = data;
  const showLogo = isEnabled(config, 'impresion_mostrar_logo', true);
  const showName = isEnabled(config, 'impresion_mostrar_nombre_negocio', true);
  const showAddress = isEnabled(config, 'impresion_mostrar_direccion', true) && showMeta;
  const showPhone = isEnabled(config, 'impresion_mostrar_telefono', true) && showMeta;

  if (!showLogo && !showName && !showAddress && !showPhone) return '';

  return `
    <div class="head">
      ${showLogo ? renderLogo(data) : ''}
      ${showName ? `<div class="title">${escapeHtml(negocioNombre)}</div>` : ''}
      ${showAddress && negocioDireccion ? `<div class="meta">${escapeHtml(negocioDireccion)}</div>` : ''}
      ${showPhone && negocioTelefono ? `<div class="meta">${escapeHtml(negocioTelefono)}</div>` : ''}
    </div>
  `;
}

function renderLogo(data) {
  const logoUrl = absoluteAssetUrl(data.logoUrl, data.publicApiUrl);
  if (!logoUrl) return '';
  return `<div class="logo-wrap"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(data.negocioNombre || 'Logo')}" /></div>`;
}

function renderItems(items, symbol, withPrice, showDetails = true) {
  return items
    .map((item) => {
      const details = showDetails
        ? itemDetailLines(item)
            .map((line) => `<div class="item-subline">${escapeHtml(line)}</div>`)
            .join('')
        : '';

      return `
      <div class="item">
        <div class="row">
          <div class="item-name"><span class="qty">${escapeHtml(item.cantidad)}x</span>${escapeHtml(item.nombre)}</div>
          ${withPrice ? `<div class="right">${escapeHtml(money(Number(item.precio_unitario || 0) * Number(item.cantidad || 0), symbol))}</div>` : ''}
        </div>
        ${details}
      </div>
    `;
    })
    .join('');
}

function renderDocumentHtml({ title, styles, bodyHtml }) {
  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        ${styles}
      </head>
      <body>
        ${bodyHtml}
      </body>
    </html>
  `;
}

function renderKitchenBody(data) {
  const { pedido, items, config } = data;
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const showClient = isEnabled(config, 'impresion_comanda_mostrar_cliente', true);

  const tipoEntrega =
    pedido.tipo_entrega === 'mesa'
      ? 'Salon'
      : pedido.tipo_entrega === 'delivery'
        ? 'Delivery'
        : pedido.tipo_entrega || 'pedido';

  return `
    <div class="sheet">
      ${renderHeader(data, false)}
      
      <div class="row">
        <div class="badge">Comanda #${escapeHtml(pedido.numero)}</div>
        <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(pedido.creado_en)) : ''}</div>
      </div>

      <div class="section">
        <div class="box">
          <div class="row"><div><strong>Tipo</strong></div><div class="right">${escapeHtml(tipoEntrega)}</div></div>
          ${pedido.tipo_entrega === 'mesa' && pedido.mesa ? `<div class="row" style="margin-top:4px;"><div><strong>Mesa</strong></div><div class="right">${escapeHtml(pedido.mesa)}</div></div>` : ''}
          ${showClient && pedido.cliente_nombre ? `<div class="row" style="margin-top:4px;"><div><strong>Cliente</strong></div><div class="right">${escapeHtml(pedido.cliente_nombre)}</div></div>` : ''}
          ${pedido.hora_entrega ? `<div class="row" style="margin-top:4px;"><div><strong>Hora entrega</strong></div><div class="right">${escapeHtml(pedido.hora_entrega)}</div></div>` : ''}
          ${pedido.turno_operativo ? `<div class="row" style="margin-top:4px;"><div><strong>Turno</strong></div><div class="right">${escapeHtml(pedido.turno_operativo)}</div></div>` : ''}
        </div>
      </div>

      <div class="section">
        <div class="section-label">Produccion</div>
        <div class="items">${renderItems(items, data.moneda, false, showDetails)}</div>
      </div>

      ${pedido.notas ? `<div class="notes"><strong>Nota:</strong> ${escapeHtml(pedido.notas)}</div>` : ''}
    </div>
  `;
}

function renderKitchenHtml(data) {
  return renderDocumentHtml({
    title: `Comanda #${data.pedido.numero}`,
    styles: `${baseStyles({
      marginMm: data.marginMm,
      fontScale: data.fontScale,
      compact: isEnabled(data.config, 'impresion_compacta'),
      fontType: data.config.impresion_tipo_letra,
      fontSize: data.config.impresion_tamano_fuente,
    })}`,
    bodyHtml: `${renderKitchenBody(data)}<div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>`,
  });
}

function renderTicketBody(data) {
  const { pedido, items, moneda, mensajeTicket, paymentLabel, config } = data;
  const showPrices = isEnabled(config, 'impresion_mostrar_precios_ticket', true);
  const showQr = isEnabled(config, 'impresion_mostrar_qr_seguimiento', true);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);

  return `
    <div class="sheet">
      ${renderHeader(data, true)}
      
      <div class="row">
        <div><strong>Pedido #${escapeHtml(pedido.numero)}</strong></div>
        <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(pedido.creado_en)) : ''}</div>
      </div>

      <div class="section">
        <div class="items">${renderItems(items, moneda, showPrices, showDetails)}</div>
      </div>

      <div class="totals">
        ${
          showPrices
            ? `
          <div class="row"><div>Subtotal</div><div class="right">${escapeHtml(money(pedido.subtotal, moneda))}</div></div>
          ${Number(pedido.costo_envio || 0) > 0 ? `<div class="row"><div>Envío</div><div class="right">${escapeHtml(money(pedido.costo_envio, moneda))}</div></div>` : ''}
          ${Number(pedido.descuento || 0) > 0 ? `<div class="row"><div>Descuento</div><div class="right">-${escapeHtml(money(pedido.descuento, moneda))}</div></div>` : ''}
          <div class="row grand"><div>Total</div><div class="right">${escapeHtml(money(pedido.total, moneda))}</div></div>
        `
            : `
          <div class="row grand"><div>Pedido #${escapeHtml(pedido.numero)}</div><div class="right">${escapeHtml(pedido.tipo_entrega)}</div></div>
        `
        }
      </div>

      <div class="section">
        <div class="row"><div>Pago</div><div class="right">${escapeHtml(paymentLabel)}</div></div>
        <div class="row" style="margin-top:4px;"><div>Entrega</div><div class="right">${escapeHtml(pedido.tipo_entrega || '')}${pedido.mesa ? ` / Mesa ${escapeHtml(pedido.mesa)}` : ''}</div></div>
        ${pedido.hora_entrega ? `<div class="row" style="margin-top:4px;"><div>Hora entrega</div><div class="right">${escapeHtml(pedido.hora_entrega)}</div></div>` : ''}
        ${pedido.cliente_nombre ? `<div class="row" style="margin-top:4px;"><div>Cliente</div><div class="right">${escapeHtml(pedido.cliente_nombre)}</div></div>` : ''}
        ${pedido.cliente_telefono ? `<div class="row" style="margin-top:4px;"><div>Teléfono</div><div class="right">${escapeHtml(pedido.cliente_telefono)}</div></div>` : ''}
        ${pedido.tipo_entrega === 'delivery' && pedido.cliente_direccion ? `<div class="row" style="margin-top:4px;"><div>Dirección</div><div class="right">${escapeHtml(pedido.cliente_direccion)}</div></div>` : ''}
        ${pedido.tipo_entrega === 'delivery' && pedido.delivery_zona ? `<div class="row" style="margin-top:4px;"><div>Zona</div><div class="right">${escapeHtml(pedido.delivery_zona)}</div></div>` : ''}
        ${pedido.tipo_entrega === 'delivery' && pedido.entrega_pin ? `<div class="row" style="margin-top:4px;"><div>PIN</div><div class="right">${escapeHtml(pedido.entrega_pin)}</div></div>` : ''}
      </div>

      ${mensajeTicket ? `<div class="footer">${escapeHtml(mensajeTicket)}</div>` : ''}

      ${
        showQr && pedido.id
          ? `
        <div class="qr-wrap">
          <div class="qr-box">
            <div style="font-size:10px; font-weight:800; color:#64748b; margin-bottom:4px;">SEGUIMIENTO</div>
            <div style="width:80px; height:80px; background:#ddd; display:flex; align-items:center; justify-content:center; border-radius:8px; font-size:8px;">QR CODE</div>
          </div>
        </div>
      `
          : ''
      }
    </div>
  `;
}

function renderTicketHtml(data) {
  return renderDocumentHtml({
    title: `Ticket #${data.pedido.numero}`,
    styles: `${baseStyles({
      a6: true,
      marginMm: data.marginMm,
      fontScale: data.fontScale,
      compact: isEnabled(data.config, 'impresion_compacta'),
      fontType: data.config.impresion_tipo_letra,
      fontSize: data.config.impresion_tamano_fuente,
    })}`,
    bodyHtml: `${renderTicketBody(data)}<div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>`,
  });
}

function renderDeliveryTicketBody(data) {
  const { pedido, items, moneda, paymentLabel, config } = data;
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);

  return `
    <div class="sheet">
      ${renderHeader(data, false)}
      <div class="row">
        <div class="badge">Hoja de reparto</div>
        <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(pedido.creado_en)) : ''}</div>
      </div>

      <div class="section">
        <div class="box">
          <div class="row"><div><strong>Pedido</strong></div><div class="right">#${escapeHtml(pedido.numero)}</div></div>
          ${pedido.cliente_nombre ? `<div class="row" style="margin-top:4px;"><div><strong>Cliente</strong></div><div class="right">${escapeHtml(pedido.cliente_nombre)}</div></div>` : ''}
          ${pedido.cliente_telefono ? `<div class="row" style="margin-top:4px;"><div><strong>Teléfono</strong></div><div class="right">${escapeHtml(pedido.cliente_telefono)}</div></div>` : ''}
          ${pedido.cliente_direccion ? `<div class="row" style="margin-top:4px;"><div><strong>Dirección</strong></div><div class="right">${escapeHtml(pedido.cliente_direccion)}</div></div>` : ''}
          ${pedido.hora_entrega ? `<div class="row" style="margin-top:4px;"><div><strong>Hora entrega</strong></div><div class="right">${escapeHtml(pedido.hora_entrega)}</div></div>` : ''}
          ${pedido.delivery_zona ? `<div class="row" style="margin-top:4px;"><div><strong>Zona</strong></div><div class="right">${escapeHtml(pedido.delivery_zona)}</div></div>` : ''}
          ${pedido.entrega_pin ? `<div class="row" style="margin-top:4px;"><div><strong>PIN</strong></div><div class="right">${escapeHtml(pedido.entrega_pin)}</div></div>` : ''}
          <div class="row" style="margin-top:4px;"><div><strong>Pago</strong></div><div class="right">${escapeHtml(paymentLabel)}</div></div>
          <div class="row grand"><div><strong>Total</strong></div><div class="right">${escapeHtml(money(pedido.total, moneda))}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Pedido</div>
        <div class="items">${renderItems(items, moneda, false, showDetails)}</div>
      </div>

      ${pedido.notas ? `<div class="notes"><strong>Notas:</strong> ${escapeHtml(pedido.notas)}</div>` : ''}
    </div>
  `;
}

function renderDeliveryTicketHtml(data) {
  return renderDocumentHtml({
    title: `Reparto #${data.pedido.numero}`,
    styles: `${baseStyles({
      a6: true,
      marginMm: data.marginMm,
      fontScale: data.fontScale,
      compact: isEnabled(data.config, 'impresion_compacta'),
      fontType: data.config.impresion_tipo_letra,
      fontSize: data.config.impresion_tamano_fuente,
    })}`,
    bodyHtml: `${renderDeliveryTicketBody(data)}<div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>`,
  });
}

function renderPrintPackHtml(data) {
  const pages = [renderKitchenBody(data), renderTicketBody(data)];

  if (data.pedido.tipo_entrega === 'delivery') {
    pages.push(renderDeliveryTicketBody(data));
  }

  return renderDocumentHtml({
    title: `Impresion pedido #${data.pedido.numero}`,
    styles: `
      ${baseStyles({
        marginMm: data.marginMm,
        fontScale: data.fontScale,
        compact: isEnabled(data.config, 'impresion_compacta'),
        fontType: data.config.impresion_tipo_letra,
        fontSize: data.config.impresion_tamano_fuente,
      })}
      <style>
        .pack-page { page-break-after: always; break-after: page; padding-bottom: 8mm; }
        .pack-page:last-of-type { page-break-after: auto; break-after: auto; }
      </style>
    `,
    bodyHtml: `
      ${pages.map((page) => `<section class="pack-page">${page}</section>`).join('')}
      <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir</button></div>
    `,
  });
}

function renderMesaPrecuentaHtml(data) {
  const {
    mesa,
    pedidos,
    negocioNombre,
    negocioDireccion,
    negocioTelefono,
    moneda,
    totalMesa,
    config,
  } = data;
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);
  const showPrices = isEnabled(config, 'impresion_mostrar_precios_ticket', true);
  const showDetails = isEnabled(config, 'impresion_mostrar_detalles_items', true);

  const bloques = pedidos
    .map((pedido) => {
      const items = parseItems(pedido.items);
      return `
      <div class="section" style="border-top: 1px solid #eee; padding-top: 10px;">
        <div class="row">
          <div><strong>Pedido #${escapeHtml(pedido.numero)}</strong></div>
          <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(pedido.creado_en)) : ''}</div>
        </div>
        <div class="items">${renderItems(items, moneda, showPrices, showDetails)}</div>
        <div class="totals">
          <div class="row"><div>Subtotal</div><div class="right">${escapeHtml(money(pedido.subtotal, moneda))}</div></div>
          ${Number(pedido.descuento || 0) > 0 ? `<div class="row"><div>Descuento</div><div class="right">-${escapeHtml(money(pedido.descuento, moneda))}</div></div>` : ''}
          <div class="row"><div>Total pedido</div><div class="right"><strong>${escapeHtml(money(pedido.total, moneda))}</strong></div></div>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Precuenta Mesa ${escapeHtml(mesa)}</title>
        ${baseStyles({
          a6: true,
          marginMm: data.marginMm,
          fontScale: data.fontScale,
          compact: isEnabled(config, 'impresion_compacta'),
          fontType: config.impresion_tipo_letra,
          fontSize: config.impresion_tamano_fuente,
        })}
      </head>
      <body>
        <div class="sheet">
          ${renderHeader(data, true)}
          <div class="row">
            <div><strong>Precuenta mesa ${escapeHtml(mesa)}</strong></div>
            <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(new Date())) : ''}</div>
          </div>

          ${bloques}

          <div class="totals" style="margin-top: 15px;">
            <div class="row grand"><div>Total mesa</div><div class="right">${escapeHtml(money(totalMesa, moneda))}</div></div>
          </div>

          <div class="footer">Documento no fiscal - resumen de consumo de salón</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir Cierre</button></div>
        </div>
      </body>
    </html>
  `;
}

function buildPrintDocument(db, pedido, tipo) {
  const config = configMap(db);
  const items = loadPedidoItems(db, pedido);
  const paymentLabel = pedido.metodo_pago === 'mercadopago' ? 'MercadoPago' : pedido.metodo_pago;

  const data = {
    pedido,
    config,
    items,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    negocioDireccion: config.negocio_direccion || '',
    negocioTelefono: config.negocio_telefono || '',
    moneda: config.moneda_simbolo || '$',
    mensajeTicket: config.impresion_mensaje_ticket || 'Gracias por elegirnos',
    paymentLabel,
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
  };

  if (tipo === 'comanda_cocina') {
    return {
      tipo,
      area: 'cocina',
      payload: data,
      html: renderKitchenHtml(data),
    };
  }

  if (tipo === 'delivery_ticket') {
    return {
      tipo,
      area: 'delivery',
      payload: data,
      html: renderDeliveryTicketHtml(data),
    };
  }

  if (tipo === 'tpv_pack') {
    return {
      tipo,
      area: 'caja',
      payload: data,
      html: renderPrintPackHtml(data),
    };
  }

  return {
    tipo: 'ticket_cliente',
    area: 'caja',
    payload: data,
    html: renderTicketHtml(data),
  };
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
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
  };

  return {
    tipo: 'precuenta_mesa',
    area: 'caja',
    payload: data,
    html: renderMesaPrecuentaHtml(data),
  };
}

function buildPrintTestDocument(db) {
  const config = configMap(db);
  const data = {
    config,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
  };

  const html = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Prueba de Impresión</title>
        ${baseStyles({
          a6: true,
          marginMm: data.marginMm,
          fontScale: data.fontScale,
          compact: isEnabled(config, 'impresion_compacta'),
          fontType: config.impresion_tipo_letra,
          fontSize: config.impresion_tamano_fuente,
        })}
      </head>
      <body>
        <div class="sheet">
          ${renderHeader(data, true)}
          <div class="row">
            <div><strong>Prueba de configuración</strong></div>
            <div class="right muted">${escapeHtml(formatBusinessDateTime(new Date(), 'time'))}</div>
          </div>
          <div class="box" style="margin-top:10px;">
            <div class="row"><div><strong>Tipo de Letra</strong></div><div class="right">${escapeHtml(config.impresion_tipo_letra || 'mono')}</div></div>
            <div class="row" style="margin-top:4px;"><div><strong>Tamaño Base</strong></div><div class="right">${escapeHtml(config.impresion_tamano_fuente || '12px')}</div></div>
            <div class="row" style="margin-top:4px;"><div><strong>Margen</strong></div><div class="right">${escapeHtml(String(data.marginMm))} mm</div></div>
            <div class="row" style="margin-top:4px;"><div><strong>Escala</strong></div><div class="right">${escapeHtml(String(data.fontScale))}x</div></div>
          </div>
          <div class="section">
            <div class="section-label">Muestra de Items</div>
            <div class="items">
              ${renderItems(
                [
                  {
                    cantidad: 1,
                    nombre: 'Pizza de Prueba',
                    descripcion: 'Con todos los extras habilitados',
                  },
                  { cantidad: 2, nombre: 'Gaseosa Fría', descripcion: '' },
                ],
                '$',
                true,
                isEnabled(config, 'impresion_mostrar_detalles_items', true)
              )}
            </div>
          </div>
          <div class="notes">Si el texto es muy grande o el margen muy pequeño, ajústalo en el panel.</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir prueba</button></div>
        </div>
      </body>
    </html>
  `;

  return {
    tipo: 'prueba_impresion',
    area: 'configuracion',
    payload: data,
    html,
  };
}

function renderCajaCierreHtml(data) {
  const { activa, resumen, negocioNombre, moneda, config } = data;
  const diferencia =
    Number(activa.monto_final_declarado || 0) - Number(activa.efectivo_esperado || 0);
  const showDate = isEnabled(config, 'impresion_mostrar_fecha', true);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Cierre de Caja #${activa.id}</title>
        ${baseStyles({
          a6: true,
          marginMm: data.marginMm,
          fontScale: data.fontScale,
          compact: isEnabled(config, 'impresion_compacta'),
          fontType: config.impresion_tipo_letra,
          fontSize: config.impresion_tamano_fuente,
        })}
      </head>
      <body>
        <div class="sheet">
          ${renderHeader(data, true)}
          
          <div class="row">
            <div><strong>Turno #${escapeHtml(String(activa.id))}</strong></div>
            <div class="right muted">${showDate ? escapeHtml(formatBusinessDateTime(new Date())) : ''}</div>
          </div>

          <div class="section">
            <div class="box">
              <div class="row"><div>Fondo Inicial</div><div class="right">${escapeHtml(money(activa.monto_inicial, moneda))}</div></div>
              <div class="row" style="margin-top:4px;"><div>Ventas Efectivo</div><div class="right">${escapeHtml(money(resumen.efectivoVentas, moneda))}</div></div>
              <div class="row" style="margin-top:4px;"><div>Ingresos Manuales</div><div class="right">${escapeHtml(money(resumen.totalIngresosManuales, moneda))}</div></div>
              <div class="row" style="margin-top:4px; color:#e11d48;"><div>Gastos / Egresos</div><div class="right">-${escapeHtml(money(resumen.totalEgresosManuales, moneda))}</div></div>
              <div class="row grand"><div>Efectivo Esperado</div><div class="right">${escapeHtml(money(activa.efectivo_esperado, moneda))}</div></div>
              <div class="row" style="margin-top:6px;"><div>Efectivo Contado</div><div class="right"><strong>${escapeHtml(money(activa.monto_final_declarado, moneda))}</strong></div></div>
              <div class="row" style="border-top:1px solid #000; margin-top:6px; padding-top:4px;">
                <div>Diferencia</div>
                <div class="right" style="color: ${diferencia < 0 ? '#e11d48' : '#059669'}">
                  ${diferencia > 0 ? '+' : ''}${escapeHtml(money(diferencia, moneda))}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-label">Ventas por método</div>
            ${(resumen.porMetodo || [])
              .map(
                (m) => `
              <div class="row" style="font-size:11px; margin-bottom:2px;">
                <div style="text-transform:capitalize;">${escapeHtml(m.metodo_pago)}</div>
                <div class="right">${escapeHtml(money(m.total, moneda))}</div>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="section">
            <div class="section-label">Estadísticas</div>
            <div class="row"><div>Pedidos totales</div><div class="right">${escapeHtml(String(resumen.pedidos))}</div></div>
            <div class="row"><div>Venta total bruta</div><div class="right">${escapeHtml(money(resumen.totalVentas, moneda))}</div></div>
          </div>

          <div class="footer">Cierre realizado por ${escapeHtml(activa.cerrada_por_nombre)}</div>
          <div class="actions"><button class="print-btn" onclick="window.print()">Imprimir Cierre</button></div>
        </div>
      </body>
    </html>
  `;
}

function buildCajaCierreDocument(db, activa, resumen) {
  const config = configMap(db);
  const data = {
    activa,
    resumen,
    config,
    negocioNombre: config.negocio_nombre || 'Modo Sabor',
    moneda: config.moneda_simbolo || '$',
    marginMm: Number(config.impresion_margen_mm || 8),
    fontScale: Number(config.impresion_escala_fuente || 1),
    logoUrl: config.negocio_logo || '',
    publicApiUrl: config.public_api_url || '',
  };

  return {
    tipo: 'cierre_caja',
    area: 'caja',
    payload: data,
    html: renderCajaCierreHtml(data),
  };
}

module.exports = {
  buildPrintDocument,
  buildMesaPrecuentaDocument,
  buildPrintTestDocument,
  buildCajaCierreDocument,
};

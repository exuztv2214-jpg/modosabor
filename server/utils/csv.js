function parseCsv(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter =
    (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim())) rows.push(row);
      row = [];
      value = '';
    } else {
      value += char;
    }
  }

  row.push(value);
  if (row.some((cell) => String(cell).trim())) rows.push(row);
  if (rows.length < 1) return [];

  const headers = rows[0].map((header) => String(header).trim().toLowerCase());
  return rows.slice(1).map((cells) =>
    headers.reduce((result, header, index) => {
      if (header) result[header] = String(cells[index] ?? '').trim();
      return result;
    }, {})
  );
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, rows) {
  const lines = [headers.join(';')];
  for (const row of rows) lines.push(headers.map((header) => escapeCsv(row[header])).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { parseCsv, toCsv };

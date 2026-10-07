const fs = require('fs');

const EXTENSION_POR_MIME = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
});

const MAX_TOTAL_BYTES = 256 * 1024 * 1024;

function extensionParaMime(mime) {
  return EXTENSION_POR_MIME[String(mime || '').toLowerCase()] || null;
}

function firmaCompatible(ruta, mime) {
  const fd = fs.openSync(ruta, 'r');
  const cabecera = Buffer.alloc(16);
  let leidos;
  try {
    leidos = fs.readSync(fd, cabecera, 0, cabecera.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  const bytes = cabecera.subarray(0, leidos);
  switch (String(mime || '').toLowerCase()) {
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png':
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/gif':
      return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
    case 'image/webp':
      return (
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case 'video/mp4':
    case 'video/quicktime':
      return bytes.subarray(4, 8).toString('ascii') === 'ftyp';
    default:
      return false;
  }
}

function borrarArchivos(files = []) {
  files.forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // Multer puede haber quitado el archivo antes al abortar la carga.
    }
  });
}

module.exports = { MAX_TOTAL_BYTES, borrarArchivos, extensionParaMime, firmaCompatible };

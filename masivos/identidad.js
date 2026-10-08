function usuarioPerfil(req, autenticado) {
  if (!autenticado) return 'local';
  const id = String(req.headers['x-masivos-user-id'] || '');
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    throw new Error('No se pudo identificar al usuario del panel.');
  return id;
}

function imagenIdentidad(data) {
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
    String(data || '')
  );
  if (!match || match[2].length > Math.ceil((2 * 1024 * 1024) / 3) * 4)
    throw new Error('Elegí una imagen PNG, JPG o WebP de hasta 2 MB.');
  const buffer = Buffer.from(match[2], 'base64');
  const ext = match[1];
  const valida =
    ext === 'png'
      ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : ext === 'jpeg'
        ? buffer.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
        : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!valida || buffer.length > 2 * 1024 * 1024)
    throw new Error('El archivo no contiene una imagen válida.');
  return { buffer, extension: ext === 'jpeg' ? 'jpg' : ext };
}
module.exports = { imagenIdentidad, usuarioPerfil };

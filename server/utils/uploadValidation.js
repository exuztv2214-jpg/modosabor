const path = require('path');
const multer = require('multer');

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PHOTO_EXTENSIONS = [...IMAGE_EXTENSIONS, '.heic', '.heif'];
const PHOTO_MIME_TYPES = [...IMAGE_MIME_TYPES, 'image/heic', 'image/heif'];
const ICON_EXTENSIONS = [...IMAGE_EXTENSIONS, '.ico'];
const ICON_MIME_TYPES = [...IMAGE_MIME_TYPES, 'image/x-icon', 'image/vnd.microsoft.icon'];
const SQLITE_EXTENSIONS = ['.sqlite'];

function createUploadValidationError(message) {
  const error = new Error(message || 'Archivo no permitido');
  error.code = 'UPLOAD_VALIDATION_ERROR';
  return error;
}

function createFileFilter({
  allowedExtensions = [],
  allowedMimeTypes = [],
  message = 'Archivo no permitido',
} = {}) {
  const extensionSet = new Set(
    allowedExtensions.map((extension) => String(extension || '').toLowerCase())
  );
  const mimeSet = new Set(allowedMimeTypes.map((mime) => String(mime || '').toLowerCase()));

  return (_req, file, cb) => {
    const extension = path.extname(String(file?.originalname || '')).toLowerCase();
    const mimeType = String(file?.mimetype || '').toLowerCase();
    const extensionAllowed = extensionSet.size === 0 || extensionSet.has(extension);
    const mimeAllowed = mimeSet.size === 0 || mimeSet.has(mimeType);

    if (extensionAllowed && mimeAllowed) {
      return cb(null, true);
    }

    return cb(createUploadValidationError(message));
  };
}

function isUploadValidationError(error) {
  return error instanceof multer.MulterError || error?.code === 'UPLOAD_VALIDATION_ERROR';
}

function formatUploadValidationError(error) {
  if (!error) return 'No se pudo procesar el archivo';

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return 'El archivo supera el tamaño permitido';
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return 'El archivo recibido no es válido para este formulario';
    }
  }

  return error.message || 'No se pudo procesar el archivo';
}

module.exports = {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  PHOTO_EXTENSIONS,
  PHOTO_MIME_TYPES,
  ICON_EXTENSIONS,
  ICON_MIME_TYPES,
  SQLITE_EXTENSIONS,
  createFileFilter,
  createUploadValidationError,
  isUploadValidationError,
  formatUploadValidationError,
};

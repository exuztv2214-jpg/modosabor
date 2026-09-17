function permisoWhatsapp(method, path) {
  const lectura = method === 'GET' && /^\/conversaciones(?:\/\d+\/mensajes)?\/?$/.test(path);
  const control = method === 'PUT' && /^\/conversaciones\/\d+\/control\/?$/.test(path);
  const respuesta = method === 'POST' && /^\/responder\/?$/.test(path);
  return lectura || control || respuesta ? 'whatsapp.attend' : 'marketing.edit';
}
module.exports = { permisoWhatsapp };

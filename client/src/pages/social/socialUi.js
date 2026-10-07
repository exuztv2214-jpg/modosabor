export const STATUS_STYLES = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Borrador' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Programada' },
  queued: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'En cola' },
  processing: { bg: 'bg-indigo-50', text: 'text-indigo-700', label: 'Procesando' },
  published: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Publicada' },
  requires_approval: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Revisión' },
  ambiguous: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Ambigua' },
  skipped_rule: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Regla del grupo' },
  skipped_duplicate: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Repetida' },
  failed: { bg: 'bg-rose-50', text: 'text-rose-700', label: 'Fallida' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelada' },
};

export const socialApiError = (error) =>
  error?.error || error?.message || 'No se pudo completar la operación';

const VIA_STATES = {
  sin_configurar: { etiqueta: 'Sin configurar', tono: 'pendiente', accion: 'Configurar' },
  sin_conectar: { etiqueta: 'Sin conectar', tono: 'pendiente', accion: 'Conectar' },
  comprobando: { etiqueta: 'Comprobando', tono: 'espera', accion: 'Comprobar' },
  lista: { etiqueta: 'Lista', tono: 'lista', accion: null },
  requiere_atencion: { etiqueta: 'Requiere atención', tono: 'alerta', accion: 'Revisar' },
  en_pausa: { etiqueta: 'En pausa', tono: 'espera', accion: 'Ver pausa' },
};

export const estadoVisualDeVia = (via = {}) => VIA_STATES[via.estado] || VIA_STATES.sin_configurar;

const DESTINATION_STATES = {
  no_detectado: 'No apareció en la última sincronización',
};

export const estadoLegibleDeDestino = (estado = '') => DESTINATION_STATES[estado] || '';

export function resumenDeDestinos(destinos = []) {
  const lista = Array.isArray(destinos) ? destinos : [];
  return {
    detectados: lista.length,
    activos: lista.filter((destino) => destino.habilitada).length,
    gruposAptos: lista.filter((destino) => destino.habilitada && destino.tipo === 'facebook_group')
      .length,
  };
}

export function hayCampanasProgramadasEnPeriodo(campanas = [], inicio, dias = 7) {
  const desde = new Date(inicio);
  if (Number.isNaN(desde.getTime())) return false;
  const hasta = new Date(desde);
  hasta.setDate(hasta.getDate() + dias);

  return campanas.some((campana) => {
    if (!campana.programada_para) return false;
    const cuando = new Date(String(campana.programada_para).replace(' ', 'T'));
    return !Number.isNaN(cuando.getTime()) && cuando >= desde && cuando < hasta;
  });
}

export const formatSocialDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
        new Date(value)
      )
    : '—';

export const formatSocialDate = (value) =>
  value
    ? new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' }).format(new Date(value))
    : '—';

/* Conserva el orden en que se eligieron los adjuntos: el primero es la portada. */
export function mediaSeleccionada(media = [], ids = []) {
  const porId = new Map(media.map((item) => [Number(item.id), item]));
  return [...new Set(ids.map(Number).filter(Boolean))].map((id) => porId.get(id)).filter(Boolean);
}

export function resumenDeRevision(borrador = {}, destinos = [], media = []) {
  const idsDestino = new Set(borrador.destinoIds || []);
  const elegidos = destinos
    .filter((destino) => idsDestino.has(destino.id))
    .map((destino) => destino.nombre);
  const adjuntos = mediaSeleccionada(media, borrador.mediaIds).map((item) => item.nombre);
  const texto = String(
    borrador.texto ||
      Object.values(borrador.personalizaciones?.textos_por_red || {}).find((item) =>
        String(item || '').trim()
      ) ||
      ''
  ).trim();
  const alertas = [];
  let momento = 'Ahora';

  if (!texto && !adjuntos.length) alertas.push('Falta contenido.');
  if (!elegidos.length) alertas.push('Falta elegir al menos un destino.');

  if (borrador.programadaPara) {
    const fecha = new Date(borrador.programadaPara);
    if (Number.isNaN(fecha.getTime())) {
      momento = 'Fecha inválida';
      alertas.push('La fecha programada no es válida.');
    } else {
      momento = formatSocialDateTime(fecha);
    }
  }

  return {
    texto,
    destinos: [...new Set(elegidos)],
    adjuntos: [...new Set(adjuntos)],
    momento,
    alertas,
    puedePublicar: alertas.length === 0,
  };
}

export const planDeGuardado = (accion, programadaPara = '') => ({
  programadaPara: accion === 'programar' ? programadaPara : '',
  autoPublicar: accion !== 'borrador',
  encolar: accion === 'publicar',
});

export const formatearPorcentajeMetrica = (valor) =>
  valor === null || valor === undefined || !Number.isFinite(Number(valor))
    ? 'Sin datos'
    : `${Number(valor)} %`;

export const tieneAlcanceReal = (alcance) => alcance?.disponible === true;

export const nombreCampanaVisible = (nombre = '') =>
  String(nombre)
    .replace(/\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?$/i, '')
    .trim() || String(nombre || 'Sin nombre');

export function rutasDuplicadasDeGrupos(destinos = [], destinoIds = []) {
  const elegidos = new Set(destinoIds.map(Number));
  const vistos = new Map();
  const repetidos = new Set();
  for (const destino of destinos) {
    if (!elegidos.has(Number(destino.id))) continue;
    if (destino.tipo !== 'facebook_group' || !destino.identificador_externo) continue;
    const clave = `${destino.provider}|${destino.tipo}|${destino.identificador_externo}`;
    const anterior = vistos.get(clave);
    if (anterior && Number(anterior.cuenta_id) !== Number(destino.cuenta_id)) {
      repetidos.add(destino.nombre || anterior.nombre || 'Este grupo');
    }
    vistos.set(clave, destino);
  }
  return [...repetidos];
}

export function destinoPrincipalDeCuenta(destinos = [], cuenta = {}) {
  const propios = destinos.filter(
    (destino) =>
      Number(destino.cuenta_id) === Number(cuenta.cuentaId) &&
      (cuenta.red === 'instagram'
        ? String(destino.tipo || '').startsWith('instagram_')
        : String(destino.tipo || '').startsWith('facebook_'))
  );
  const tiposPreferidos =
    cuenta.red === 'instagram'
      ? ['instagram_feed']
      : cuenta.tipos?.includes('facebook_page')
        ? ['facebook_page']
        : ['facebook_profile'];

  return (
    propios.find(
      (destino) => tiposPreferidos.includes(destino.tipo) && destino.habilitada !== false
    ) ||
    propios.find((destino) => tiposPreferidos.includes(destino.tipo)) ||
    propios.find((destino) => destino.habilitada !== false) ||
    propios[0] ||
    null
  );
}

export function destinoIdsParaIdentidad(destinos = [], destinoIds = [], cuenta = {}) {
  const propios = new Set(
    destinos
      .filter(
        (destino) =>
          Number(destino.cuenta_id) === Number(cuenta.cuentaId) &&
          (cuenta.red === 'instagram'
            ? String(destino.tipo || '').startsWith('instagram_')
            : String(destino.tipo || '').startsWith('facebook_'))
      )
      .map((destino) => Number(destino.id))
  );
  const principal = destinoPrincipalDeCuenta(destinos, cuenta);
  const deEstaIdentidad = destinoIds.map(Number).filter((id) => propios.has(id));
  return [...new Set(principal ? [Number(principal.id), ...deEstaIdentidad] : deEstaIdentidad)];
}

export function destinosSeleccionadosDeCuenta(destinos = [], destinoIds = [], cuenta = {}) {
  const elegidos = new Set(destinoIds.map(Number));
  return destinos.filter(
    (destino) =>
      elegidos.has(Number(destino.id)) &&
      Number(destino.cuenta_id) === Number(cuenta.cuentaId) &&
      (cuenta.red === 'instagram'
        ? String(destino.tipo || '').startsWith('instagram_')
        : String(destino.tipo || '').startsWith('facebook_'))
  );
}

export function hayGruposElegidos(destinos = [], destinoIds = [], cuenta = {}) {
  const elegidos = new Set(destinoIds.map(Number));
  return destinos.some(
    (destino) =>
      elegidos.has(Number(destino.id)) &&
      Number(destino.cuenta_id) === Number(cuenta.cuentaId) &&
      destino.tipo === 'facebook_group'
  );
}

export const esDiagnosticoDePrueba = (log = {}) => {
  if (log.nivel === 'error') return false;
  const codigo = String(log.codigo || '');
  return codigo.startsWith('PRUEBA_') || ['health_check', 'sync_facebook_groups'].includes(codigo);
};

export function actividadParaOperador(log = {}) {
  const codigo = String(log.codigo || '');
  const traducidos = {
    PRUEBA_ACTIVE: 'Conexión comprobada.',
    PRUEBA_TOKEN_VENCIDO: 'La conexión venció y necesita revisarse.',
    PRUEBA_SIN_CONFIGURAR: 'La conexión todavía no está configurada.',
    PUBLICATION_AMBIGUOUS: 'No se pudo confirmar si la publicación salió.',
  };
  const tecnico =
    esDiagnosticoDePrueba(log) || /connectOverCDP|browserType\.connect/i.test(log.mensaje || '');
  return {
    mensaje: traducidos[codigo] || log.mensaje || 'Actividad sin detalle.',
    detalle: tecnico ? log.mensaje || '' : '',
    codigo: tecnico ? codigo : '',
  };
}

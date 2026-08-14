import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  SkipForward,
  Trash2,
  Zap,
} from 'lucide-react';

import api from '../../lib/api.js';
import { resolveAssetUrl } from '../../lib/assets.js';
import { BRAND, STROKE } from '../../lib/theme.js';
import ActionDialog from '../ActionDialog.jsx';
import { Card, Empty, CONTROL, SELECT } from '../../pages/Clientes/clientesUi.jsx';

const emptyDestino = {
  nombre: '',
  url: '',
  tipo: 'grupo_facebook',
  activo: true,
  orden: 0,
  notas: '',
};
const emptyPublicacion = { titulo: '', mensaje: '', link_url: '', estado: 'borrador' };

const TIPOS_DESTINO = {
  grupo_facebook: 'Grupo',
  pagina_facebook: 'Página',
  perfil_facebook: 'Perfil',
};

const TONOS = {
  publicado: { bg: '#E7F5EF', fg: '#0F6E56', label: 'Publicado' },
  listo: { bg: '#E9F1FA', fg: '#1F5FA0', label: 'Lista' },
  borrador: { bg: '#F1F5F9', fg: '#475569', label: 'Borrador' },
  abierto: { bg: '#E9F1FA', fg: '#1F5FA0', label: 'Abierto' },
  omitido: { bg: '#FDF3D3', fg: '#95661A', label: 'Omitido' },
  error: { bg: '#FEF2F2', fg: '#9E141E', label: 'Error' },
  pendiente: { bg: '#F1F5F9', fg: '#64748B', label: 'Pendiente' },
};

function tono(estado) {
  return TONOS[String(estado || '').toLowerCase()] || TONOS.pendiente;
}

function Pill({ estado, children }) {
  const t = tono(estado);
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: t.bg, color: t.fg }}
    >
      {children ?? t.label}
    </span>
  );
}

/**
 * El interceptor de axios rechaza con un objeto que tiene `.error`, no
 * `.message`. Este archivo leía `error.message` en trece lugares distintos,
 * así que ningún mensaje real del servidor llegaba nunca a la pantalla:
 * siempre se veía el texto genérico de respaldo.
 */
function errorMsg(error, fallback) {
  return error?.error || fallback;
}

async function copyText(value, ok = 'Copiado') {
  // `navigator.clipboard` no existe fuera de contextos seguros (http en LAN,
  // que es justo como se usa el sistema desde el celular del local).
  if (!navigator?.clipboard?.writeText) {
    toast.error('El navegador no permite copiar acá');
    return;
  }
  try {
    await navigator.clipboard.writeText(String(value || ''));
    toast.success(ok);
  } catch {
    toast.error('No se pudo copiar');
  }
}

/** Los adjuntos viven en `/uploads/...`; `resolveAssetUrl` es el helper del sistema. */
function MediaPreview({ path, mime, alt = 'Adjunto', className = '' }) {
  const url = resolveAssetUrl(path);
  if (!url) return null;
  const tipo = String(mime || '').toLowerCase();

  if (tipo.startsWith('image/')) {
    return <img src={url} alt={alt} className={`w-full rounded-xl object-cover ${className}`} />;
  }
  if (tipo.startsWith('video/')) {
    return (
      <video src={url} controls className={`w-full rounded-xl bg-gray-900 ${className}`}>
        <track kind="captions" src="" label="Sin subtítulos" />
      </video>
    );
  }
  if (tipo.startsWith('audio/')) {
    return (
      <audio src={url} controls className="w-full">
        <track kind="captions" src="" label="Sin subtítulos" />
      </audio>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
    >
      <ExternalLink size={13} strokeWidth={STROKE} />
      Abrir adjunto
    </a>
  );
}

/**
 * Vista previa del archivo que todavía no se subió.
 *
 * Antes se llamaba `URL.createObjectURL(file)` directo en el JSX: se creaba
 * una URL nueva en cada render y ninguna se liberaba nunca. Con un video de
 * unos megas y un formulario que re-renderiza en cada tecla, el navegador se
 * va llenando de blobs.
 */
function ArchivoPreview({ file }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    if (!file) return setUrl('');
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!file || !url) return null;
  const tipo = file.type || '';

  return (
    <div className="rounded-xl bg-white p-3">
      <p className="mb-2 truncate text-[11px] text-gray-500">{file.name}</p>
      {tipo.startsWith('image/') ? (
        <img src={url} alt={file.name} className="h-36 w-full rounded-lg object-cover" />
      ) : tipo.startsWith('video/') ? (
        <video src={url} controls className="h-40 w-full rounded-lg bg-gray-900">
          <track kind="captions" src="" label="Sin subtítulos" />
        </video>
      ) : tipo.startsWith('audio/') ? (
        <audio src={url} controls className="w-full">
          <track kind="captions" src="" label="Sin subtítulos" />
        </audio>
      ) : (
        <p className="text-[12px] text-gray-600">Archivo listo para subir</p>
      )}
    </div>
  );
}

const LABEL = 'mb-1.5 block text-[12px] font-medium text-gray-600';

export default function PublicadorFacebookPanel() {
  const [loading, setLoading] = useState(true);
  const [savingDestino, setSavingDestino] = useState(false);
  const [savingPublicacion, setSavingPublicacion] = useState(false);
  const [destinos, setDestinos] = useState([]);
  const [publicaciones, setPublicaciones] = useState([]);
  const [destinoForm, setDestinoForm] = useState(emptyDestino);
  const [publicacionForm, setPublicacionForm] = useState(emptyPublicacion);
  const [publicacionFile, setPublicacionFile] = useState(null);
  const [editDestinoId, setEditDestinoId] = useState(null);
  const [editPublicacionId, setEditPublicacionId] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [queue, setQueue] = useState({ publicacion: null, items: [] });
  // Se usaba `window.confirm`, que es el único del sistema: el resto de los
  // borrados pasa por `ActionDialog`.
  const [borrar, setBorrar] = useState(null);

  const selectedPost = useMemo(
    () => publicaciones.find((item) => item.id === selectedPostId) || null,
    [publicaciones, selectedPostId]
  );

  const destinosActivos = useMemo(() => destinos.filter((d) => d.activo).length, [destinos]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [destinosData, publicacionesData] = await Promise.all([
        api.get('/marketing/publicador/destinos'),
        api.get('/marketing/publicador/publicaciones'),
      ]);
      setDestinos(Array.isArray(destinosData) ? destinosData : []);
      setPublicaciones(Array.isArray(publicacionesData) ? publicacionesData : []);
      if (selectedPostId) {
        try {
          const queueData = await api.get(
            `/marketing/publicador/publicaciones/${selectedPostId}/cola`
          );
          setQueue(queueData);
        } catch {
          setQueue({ publicacion: null, items: [] });
        }
      }
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo cargar el publicador'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetDestino = () => {
    setDestinoForm(emptyDestino);
    setEditDestinoId(null);
  };

  const resetPublicacion = () => {
    setPublicacionForm(emptyPublicacion);
    setPublicacionFile(null);
    setEditPublicacionId(null);
  };

  const saveDestino = async (event) => {
    event.preventDefault();
    if (!destinoForm.nombre.trim() || !destinoForm.url.trim()) {
      return toast.error('El destino necesita nombre y URL');
    }
    setSavingDestino(true);
    try {
      if (editDestinoId) {
        await api.put(`/marketing/publicador/destinos/${editDestinoId}`, destinoForm);
      } else {
        await api.post('/marketing/publicador/destinos', destinoForm);
      }
      toast.success('Destino guardado');
      resetDestino();
      await loadAll();
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo guardar el destino'));
    } finally {
      setSavingDestino(false);
    }
  };

  const savePublicacion = async (event) => {
    event.preventDefault();
    if (!publicacionForm.mensaje.trim()) {
      return toast.error('Escribí el texto de la publicación');
    }
    setSavingPublicacion(true);
    try {
      const form = new FormData();
      form.append('titulo', publicacionForm.titulo || '');
      form.append('mensaje', publicacionForm.mensaje || '');
      form.append('link_url', publicacionForm.link_url || '');
      form.append('estado', publicacionForm.estado || 'borrador');
      if (publicacionFile) form.append('media', publicacionFile);

      if (editPublicacionId) {
        await api.put(`/marketing/publicador/publicaciones/${editPublicacionId}`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/marketing/publicador/publicaciones', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      toast.success('Publicación guardada');
      resetPublicacion();
      await loadAll();
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo guardar la publicación'));
    } finally {
      setSavingPublicacion(false);
    }
  };

  const loadQueue = async (postId) => {
    setSelectedPostId(postId);
    try {
      const queueData = await api.get(`/marketing/publicador/publicaciones/${postId}/cola`);
      setQueue(queueData);
    } catch (error) {
      setQueue({ publicacion: null, items: [] });
      toast.error(errorMsg(error, 'Todavía no preparaste la cola'));
    }
  };

  const prepareQueue = async (postId) => {
    const activeIds = destinos.filter((item) => item.activo).map((item) => item.id);
    // Preparaba la cola con cero destinos sin decir nada y quedaba vacía.
    if (activeIds.length === 0) {
      return toast.error('No hay destinos activos para publicar');
    }
    try {
      const queueData = await api.post(
        `/marketing/publicador/publicaciones/${postId}/preparar-cola`,
        { destino_ids: activeIds }
      );
      setSelectedPostId(postId);
      setQueue(queueData);
      toast.success(`Cola preparada con ${activeIds.length} destinos`);
      await loadAll();
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo preparar la cola'));
    }
  };

  const markQueueItem = async (itemId, estado) => {
    try {
      const queueData = await api.post(`/marketing/publicador/envios/${itemId}/estado`, { estado });
      setQueue(queueData);
      await loadAll();
      toast.success(estado === 'publicado' ? 'Marcado como publicado' : 'Actualizado');
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo actualizar el envío'));
    }
  };

  const autoPublishQueueItem = async (itemId) => {
    try {
      const queueData = await api.post(`/marketing/publicador/envios/${itemId}/autopublicar`);
      setQueue(queueData);
      await loadAll();
      toast.success('Publicado automáticamente');
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo autopublicar'));
    }
  };

  const autoPublishWholeQueue = async () => {
    if (!queue?.publicacion?.id) return toast.error('Primero cargá una cola');
    try {
      const response = await api.post(
        `/marketing/publicador/publicaciones/${queue.publicacion.id}/autopublicar-cola`
      );
      setQueue(response.queue);
      await loadAll();
      const resultados = response.results || [];
      const oks = resultados.filter((item) => item.ok).length;
      const fails = resultados.filter((item) => !item.ok).length;
      if (fails > 0) toast.error(`${oks} publicadas, ${fails} con error`);
      else toast.success(`Cola autopublicada (${oks})`);
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo autopublicar la cola'));
    }
  };

  const capturePreview = async (destinoId) => {
    try {
      await api.post(`/marketing/publicador/destinos/${destinoId}/capturar-preview`);
      toast.success('Vista previa actualizada');
      await loadAll();
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo capturar la vista previa'));
    }
  };

  const loginFacebookChrome = async () => {
    try {
      await api.post('/marketing/publicador/facebook/login');
      toast.success('Sesión de Facebook lista en Chrome');
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo iniciar sesión en Chrome'));
    }
  };

  const editDestino = (item) => {
    setEditDestinoId(item.id);
    setDestinoForm({
      nombre: item.nombre || '',
      url: item.url || '',
      tipo: item.tipo || 'grupo_facebook',
      activo: Boolean(item.activo),
      orden: item.orden || 0,
      notas: item.notas || '',
    });
  };

  const editPublicacion = (item) => {
    setEditPublicacionId(item.id);
    setPublicacionForm({
      titulo: item.titulo || '',
      mensaje: item.mensaje || '',
      link_url: item.link_url || '',
      estado: item.estado || 'borrador',
    });
    setPublicacionFile(null);
  };

  const confirmarBorrado = async () => {
    if (!borrar) return;
    const { tipo, item } = borrar;
    try {
      if (tipo === 'destino') {
        await api.delete(`/marketing/publicador/destinos/${item.id}`);
        if (editDestinoId === item.id) resetDestino();
        toast.success('Destino eliminado');
      } else {
        await api.delete(`/marketing/publicador/publicaciones/${item.id}`);
        if (editPublicacionId === item.id) resetPublicacion();
        if (selectedPostId === item.id) {
          setSelectedPostId(null);
          setQueue({ publicacion: null, items: [] });
        }
        toast.success('Publicación eliminada');
      }
      setBorrar(null);
      await loadAll();
    } catch (error) {
      toast.error(errorMsg(error, 'No se pudo eliminar'));
    }
  };

  const openDestination = async (item) => {
    window.open(item.open_url || item.destino_url, '_blank', 'noopener,noreferrer');
    await markQueueItem(item.id, 'abierto');
  };

  const previewMedia = queue.publicacion?.media_path || selectedPost?.media_path || '';

  return (
    <div className="space-y-4">
      <Card
        title="Publicador de Facebook"
        helper="Escribís el mensaje una vez y lo publicás en todos tus grupos sin rearmarlo"
        action={
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={loginFacebookChrome}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gray-100 px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
            >
              <Zap size={13} strokeWidth={STROKE} />
              Conectar Chrome
            </button>
            <button
              type="button"
              onClick={loadAll}
              title="Actualizar"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-600 transition hover:bg-gray-200"
            >
              <RefreshCw size={14} strokeWidth={STROKE} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
      >
        <p className="text-[12px] leading-4 text-gray-500">
          El autopublicado usa la sesión de Facebook abierta en Chrome. Si nunca la iniciaste, tocá{' '}
          <span className="font-medium text-gray-700">Conectar Chrome</span> primero.
        </p>
      </Card>

      {loading ? (
        <Card>
          <p className="py-8 text-center text-[13px] text-gray-400">Cargando publicador…</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card
              title={editPublicacionId ? 'Editar publicación' : 'Nueva publicación'}
              helper="El texto que después se pega en cada grupo"
            >
              <form onSubmit={savePublicacion} className="space-y-3">
                <label className="block">
                  <span className={LABEL}>Título interno</span>
                  <input
                    value={publicacionForm.titulo}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, titulo: e.target.value }))
                    }
                    className={CONTROL}
                    placeholder="Para reconocerla en la lista"
                  />
                </label>

                <label className="block">
                  <span className={LABEL}>Texto de la publicación</span>
                  <textarea
                    value={publicacionForm.mensaje}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, mensaje: e.target.value }))
                    }
                    className={`${CONTROL} min-h-[130px] resize-y py-2.5`}
                    placeholder="Lo que va a leer la gente"
                  />
                </label>

                <label className="block">
                  <span className={LABEL}>Link (opcional)</span>
                  <input
                    value={publicacionForm.link_url}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, link_url: e.target.value }))
                    }
                    placeholder="https://…"
                    className={CONTROL}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Estado</span>
                    <select
                      value={publicacionForm.estado}
                      onChange={(e) =>
                        setPublicacionForm((prev) => ({ ...prev, estado: e.target.value }))
                      }
                      className={SELECT}
                    >
                      <option value="borrador">Borrador</option>
                      <option value="listo">Lista para publicar</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className={LABEL}>Foto, video o archivo</span>
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf"
                      onChange={(e) => setPublicacionFile(e.target.files?.[0] || null)}
                      className="block h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[12px] text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-gray-700"
                    />
                  </label>
                </div>

                <ArchivoPreview file={publicacionFile} />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingPublicacion}
                    style={{ background: BRAND }}
                    className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
                  >
                    {editPublicacionId ? (
                      <Save size={14} strokeWidth={STROKE} />
                    ) : (
                      <Plus size={14} strokeWidth={STROKE} />
                    )}
                    {savingPublicacion
                      ? 'Guardando…'
                      : editPublicacionId
                        ? 'Guardar cambios'
                        : 'Agregar publicación'}
                  </button>
                  {editPublicacionId || publicacionForm.titulo || publicacionForm.mensaje ? (
                    <button
                      type="button"
                      onClick={resetPublicacion}
                      className="h-11 rounded-xl bg-gray-100 px-4 text-[13px] font-semibold text-gray-700 transition hover:bg-gray-200"
                    >
                      Limpiar
                    </button>
                  ) : null}
                </div>
              </form>
            </Card>

            <Card
              title={editDestinoId ? 'Editar destino' : 'Destinos'}
              helper="Los grupos, páginas o perfiles donde publicás"
              action={
                <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  {destinosActivos} activos
                </span>
              }
            >
              <form onSubmit={saveDestino} className="space-y-3 rounded-xl bg-gray-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Nombre</span>
                    <input
                      value={destinoForm.nombre}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                      className={CONTROL}
                      placeholder="Ej: Compra y venta Monteros"
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Tipo</span>
                    <select
                      value={destinoForm.tipo}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, tipo: e.target.value }))
                      }
                      className={SELECT}
                    >
                      <option value="grupo_facebook">Grupo de Facebook</option>
                      <option value="pagina_facebook">Página de Facebook</option>
                      <option value="perfil_facebook">Perfil personal</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className={LABEL}>URL</span>
                  <input
                    value={destinoForm.url}
                    onChange={(e) => setDestinoForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://www.facebook.com/groups/…"
                    className={CONTROL}
                  />
                </label>

                <div className="grid gap-3 md:grid-cols-[120px,1fr]">
                  <label className="block">
                    <span className={LABEL}>Orden</span>
                    <input
                      type="number"
                      value={destinoForm.orden}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, orden: Number(e.target.value) || 0 }))
                      }
                      className={CONTROL}
                    />
                  </label>
                  <label className="block">
                    <span className={LABEL}>Notas</span>
                    <input
                      value={destinoForm.notas}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, notas: e.target.value }))
                      }
                      className={CONTROL}
                      placeholder="Ej: sólo permite un posteo por día"
                    />
                  </label>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2.5 text-[13px] text-gray-700">
                  <input
                    type="checkbox"
                    checked={Boolean(destinoForm.activo)}
                    onChange={(e) =>
                      setDestinoForm((prev) => ({ ...prev, activo: e.target.checked }))
                    }
                    className="h-4 w-4 rounded"
                  />
                  Incluir en las colas nuevas
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingDestino}
                    className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 text-[12px] font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40"
                  >
                    {editDestinoId ? (
                      <Save size={13} strokeWidth={STROKE} />
                    ) : (
                      <Plus size={13} strokeWidth={STROKE} />
                    )}
                    {editDestinoId ? 'Guardar' : 'Agregar destino'}
                  </button>
                  {editDestinoId || destinoForm.nombre || destinoForm.url ? (
                    <button
                      type="button"
                      onClick={resetDestino}
                      className="h-10 rounded-xl bg-white px-3.5 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="mt-3 space-y-1.5">
                {destinos.length === 0 ? (
                  <Empty
                    title="Sin destinos cargados"
                    description="Agregá los grupos donde solés publicar para no pegar la URL cada vez."
                  />
                ) : (
                  destinos.map((item) => (
                    <div key={item.id} className="group rounded-xl bg-gray-50 p-3">
                      <div className="flex items-start gap-3">
                        {item.preview_path ? (
                          <img
                            src={resolveAssetUrl(item.preview_path)}
                            alt={item.nombre}
                            className="h-12 w-16 shrink-0 rounded-lg object-cover"
                          />
                        ) : null}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="truncate text-[13px] font-medium text-gray-900">
                              {item.nombre}
                            </p>
                            {!item.activo ? <Pill estado="omitido">Pausado</Pill> : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">
                            {TIPOS_DESTINO[item.tipo] || item.tipo} · orden {item.orden} ·{' '}
                            {item.url}
                          </p>
                          {item.notas ? (
                            <p className="mt-0.5 truncate text-[11px] text-gray-400">
                              {item.notas}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            onClick={() => capturePreview(item.id)}
                            title="Capturar vista previa"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
                          >
                            <ImagePlus size={14} strokeWidth={STROKE} />
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                            title="Abrir en Facebook"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
                          >
                            <ExternalLink size={14} strokeWidth={STROKE} />
                          </button>
                          <button
                            type="button"
                            onClick={() => editDestino(item)}
                            title="Editar"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-white hover:text-gray-700"
                          >
                            <Pencil size={14} strokeWidth={STROKE} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setBorrar({ tipo: 'destino', item })}
                            title="Eliminar"
                            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} strokeWidth={STROKE} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <Card title="Publicaciones guardadas" helper="Elegí una y preparate la cola de destinos">
            {publicaciones.length === 0 ? (
              <Empty
                title="Sin publicaciones"
                description="Escribí una arriba: después la reutilizás en todos los grupos."
              />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {publicaciones.map((item) => {
                  const elegida = selectedPostId === item.id;
                  const pendientes = Number(item.destinos_pendientes || 0);
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl bg-gray-50 p-3.5 transition"
                      style={elegida ? { boxShadow: `inset 0 0 0 1.5px ${BRAND}` } : undefined}
                    >
                      {item.media_path ? (
                        <MediaPreview
                          path={item.media_path}
                          mime={item.media_mime}
                          alt={item.titulo}
                          className="mb-2.5 h-32"
                        />
                      ) : null}

                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-gray-900">
                            {item.titulo || 'Sin título'}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-gray-600">
                            {item.mensaje || 'Sin mensaje cargado'}
                          </p>
                        </div>
                        <Pill estado={item.estado} />
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                        <span>{item.destinos_total || 0} destinos</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-emerald-700">
                          {item.destinos_publicados || 0} publicados
                        </span>
                        {pendientes > 0 ? (
                          <>
                            <span className="text-gray-300">·</span>
                            <span style={{ color: BRAND }}>{pendientes} pendientes</span>
                          </>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => prepareQueue(item.id)}
                          style={{ background: BRAND }}
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white transition hover:brightness-110"
                        >
                          <Send size={13} strokeWidth={STROKE} />
                          Preparar cola
                        </button>
                        <button
                          type="button"
                          onClick={() => loadQueue(item.id)}
                          className="h-9 rounded-xl bg-white px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                        >
                          Ver cola
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyText(
                              [item.mensaje, item.link_url].filter(Boolean).join('\n\n'),
                              'Texto copiado'
                            )
                          }
                          title="Copiar texto"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-800"
                        >
                          <Copy size={13} strokeWidth={STROKE} />
                        </button>
                        <button
                          type="button"
                          onClick={() => editPublicacion(item)}
                          title="Editar"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-800"
                        >
                          <Pencil size={13} strokeWidth={STROKE} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setBorrar({ tipo: 'publicacion', item })}
                          title="Eliminar"
                          className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={13} strokeWidth={STROKE} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card
            title="Cola de publicación"
            helper="Abrís el grupo, pegás el texto y marcás lo hecho"
            action={
              queue?.publicacion ? (
                <button
                  type="button"
                  onClick={autoPublishWholeQueue}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-3 text-[12px] font-semibold text-white transition hover:bg-gray-800"
                >
                  <Zap size={13} strokeWidth={STROKE} />
                  Autopublicar todo
                </button>
              ) : null
            }
          >
            {!queue?.publicacion ? (
              <Empty
                title="No hay ninguna cola cargada"
                description='Elegí una publicación de arriba y tocá "Preparar cola".'
              />
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl bg-gray-50 p-4">
                  <p className="text-[13px] font-medium text-gray-900">
                    {queue.publicacion.titulo || 'Sin título'}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-gray-700">
                    {[queue.publicacion.mensaje, queue.publicacion.link_url]
                      .filter(Boolean)
                      .join('\n\n')}
                  </p>
                  {previewMedia ? (
                    <div className="mt-3">
                      <MediaPreview
                        path={previewMedia}
                        mime={queue.publicacion.media_mime}
                        alt={queue.publicacion.titulo}
                        className="max-h-56"
                      />
                    </div>
                  ) : null}
                </div>

                {queue.items.length === 0 ? (
                  <Empty
                    title="La cola quedó vacía"
                    description="No había destinos activos cuando la preparaste."
                  />
                ) : (
                  <div className="space-y-1.5">
                    {queue.items.map((item) => {
                      const hecho = item.estado === 'publicado';
                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl bg-gray-50 p-3.5 ${hecho ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-gray-900">
                                {item.orden}. {item.destino_nombre}
                              </p>
                              <p className="mt-0.5 truncate text-[11px] text-gray-500">
                                {item.destino_url}
                              </p>
                            </div>
                            <Pill estado={item.estado} />
                          </div>

                          {item.notas ? (
                            <p className="mt-1.5 text-[11px]" style={{ color: '#9E141E' }}>
                              {item.notas}
                            </p>
                          ) : null}

                          {!hecho ? (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              <button
                                type="button"
                                onClick={() => openDestination(item)}
                                style={{ background: BRAND }}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold text-white transition hover:brightness-110"
                              >
                                <ExternalLink size={13} strokeWidth={STROKE} />
                                Abrir y publicar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(item.texto_preparado || '', 'Listo para pegar')
                                }
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-semibold text-gray-700 transition hover:bg-gray-200"
                              >
                                <Copy size={13} strokeWidth={STROKE} />
                                Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => markQueueItem(item.id, 'publicado')}
                                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-[12px] font-semibold text-emerald-700 transition hover:bg-emerald-50"
                              >
                                <CheckCircle2 size={13} strokeWidth={STROKE} />
                                Ya publiqué
                              </button>
                              <button
                                type="button"
                                onClick={() => autoPublishQueueItem(item.id)}
                                title="Publicar automáticamente con Chrome"
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-900"
                              >
                                <Zap size={13} strokeWidth={STROKE} />
                              </button>
                              <button
                                type="button"
                                onClick={() => markQueueItem(item.id, 'omitido')}
                                title="Saltear este destino"
                                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-500 transition hover:text-gray-900"
                              >
                                <SkipForward size={13} strokeWidth={STROKE} />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </>
      )}

      <ActionDialog
        open={Boolean(borrar)}
        title={
          borrar?.tipo === 'destino'
            ? `¿Eliminar ${borrar?.item?.nombre}?`
            : `¿Eliminar ${borrar?.item?.titulo || 'esta publicación'}?`
        }
        description={
          borrar?.tipo === 'destino'
            ? 'Se borra de la lista de destinos. Las colas ya preparadas no se modifican.'
            : 'Se borra la publicación y su cola de destinos.'
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        onConfirm={confirmarBorrado}
        onClose={() => setBorrar(null)}
      />
    </div>
  );
}

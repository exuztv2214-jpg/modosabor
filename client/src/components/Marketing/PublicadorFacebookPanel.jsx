import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  ImagePlus,
  Plus,
  RefreshCw,
  Save,
  Send,
  Share2,
  Trash2,
} from 'lucide-react';

import api from '../../lib/api.js';
import { UPLOADS_BASE_URL } from '../../lib/runtime.js';

const emptyDestino = {
  nombre: '',
  url: '',
  tipo: 'grupo_facebook',
  activo: true,
  orden: 0,
  notas: '',
};
const emptyPublicacion = { titulo: '', mensaje: '', link_url: '', estado: 'borrador' };

function uploadUrl(publicPath = '') {
  if (!publicPath) return '';
  return `${UPLOADS_BASE_URL}${publicPath}`;
}

function Badge({ tone = 'slate', children }) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    blue: 'bg-primary-100 text-blue-700',
    green: 'bg-success-100 text-success-700',
    amber: 'bg-warning-100 text-warning-700',
    rose: 'bg-danger-100 text-danger-700',
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${styles[tone] || styles.slate}`}
    >
      {children}
    </span>
  );
}

function copyText(value, ok = 'Copiado') {
  return navigator.clipboard
    .writeText(String(value || ''))
    .then(() => toast.success(ok))
    .catch(() => toast.error('No se pudo copiar'));
}

function renderMediaPreview(publicPath, mimeType, alt = 'Adjunto') {
  const url = uploadUrl(publicPath);
  if (!url) return null;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) {
    return (
      <img
        src={url}
        alt={alt}
        className="h-32 w-full rounded-2xl object-cover ring-1 ring-slate-200"
      />
    );
  }
  if (mime.startsWith('video/')) {
    return (
      <video
        src={url}
        controls
        className="h-40 w-full rounded-2xl bg-slate-950 object-cover ring-1 ring-slate-200"
      >
        <track kind="captions" src="" label="Sin subtítulos" />
      </video>
    );
  }
  if (mime.startsWith('audio/')) {
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
      className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
    >
      <ExternalLink size={14} />
      Abrir adjunto
    </a>
  );
}

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

  const selectedPost = useMemo(
    () => publicaciones.find((item) => item.id === selectedPostId) || null,
    [publicaciones, selectedPostId]
  );

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
      toast.error(error.message || 'No se pudo cargar el publicador');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
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
      toast.error(error.message || 'No se pudo guardar el destino');
    } finally {
      setSavingDestino(false);
    }
  };

  const savePublicacion = async (event) => {
    event.preventDefault();
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
      toast.success('Publicacion guardada');
      resetPublicacion();
      await loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar la publicacion');
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
      toast.error(error.message || 'Todavia no preparaste la cola');
    }
  };

  const prepareQueue = async (postId) => {
    try {
      const activeIds = destinos.filter((item) => item.activo).map((item) => item.id);
      const queueData = await api.post(
        `/marketing/publicador/publicaciones/${postId}/preparar-cola`,
        { destino_ids: activeIds }
      );
      setSelectedPostId(postId);
      setQueue(queueData);
      toast.success('Cola preparada');
      await loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo preparar la cola');
    }
  };

  const markQueueItem = async (itemId, estado) => {
    try {
      const queueData = await api.post(`/marketing/publicador/envios/${itemId}/estado`, { estado });
      setQueue(queueData);
      await loadAll();
      toast.success(estado === 'publicado' ? 'Marcado como publicado' : 'Actualizado');
    } catch (error) {
      toast.error(error.message || 'No se pudo actualizar el envio');
    }
  };

  const autoPublishQueueItem = async (itemId) => {
    try {
      const queueData = await api.post(`/marketing/publicador/envios/${itemId}/autopublicar`);
      setQueue(queueData);
      await loadAll();
      toast.success('Publicado automaticamente');
    } catch (error) {
      toast.error(error.message || 'No se pudo autopublicar');
    }
  };

  const autoPublishWholeQueue = async () => {
    if (!queue?.publicacion?.id) {
      toast.error('Primero carga una cola');
      return;
    }
    try {
      const response = await api.post(
        `/marketing/publicador/publicaciones/${queue.publicacion.id}/autopublicar-cola`
      );
      setQueue(response.queue);
      await loadAll();
      const oks = (response.results || []).filter((item) => item.ok).length;
      const fails = (response.results || []).filter((item) => !item.ok).length;
      if (fails > 0)
        toast.error(`Cola terminada con ${fails} errores y ${oks} publicaciones hechas`);
      else toast.success(`Cola autopublicada (${oks})`);
    } catch (error) {
      toast.error(error.message || 'No se pudo autopublicar la cola');
    }
  };

  const capturePreview = async (destinoId) => {
    try {
      await api.post(`/marketing/publicador/destinos/${destinoId}/capturar-preview`);
      toast.success('Vista previa actualizada');
      await loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo capturar la vista previa');
    }
  };

  const loginFacebookChrome = async () => {
    try {
      await api.post('/marketing/publicador/facebook/login');
      toast.success('Sesion de Facebook en Chrome lista');
    } catch (error) {
      toast.error(error.message || 'No se pudo iniciar sesion en Chrome');
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

  const deleteDestino = async (item) => {
    if (!window.confirm(`Eliminar ${item.nombre}?`)) return;
    try {
      await api.delete(`/marketing/publicador/destinos/${item.id}`);
      toast.success('Destino eliminado');
      if (editDestinoId === item.id) resetDestino();
      await loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar');
    }
  };

  const deletePublicacion = async (item) => {
    if (!window.confirm(`Eliminar ${item.titulo}?`)) return;
    try {
      await api.delete(`/marketing/publicador/publicaciones/${item.id}`);
      toast.success('Publicacion eliminada');
      if (editPublicacionId === item.id) resetPublicacion();
      if (selectedPostId === item.id) {
        setSelectedPostId(null);
        setQueue({ publicacion: null, items: [] });
      }
      await loadAll();
    } catch (error) {
      toast.error(error.message || 'No se pudo eliminar');
    }
  };

  const openDestination = async (item) => {
    window.open(item.open_url || item.destino_url, '_blank', 'noopener,noreferrer');
    await markQueueItem(item.id, 'abierto');
  };

  const previewMedia = queue.publicacion?.media_path || selectedPost?.media_path || '';

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900">Publicador Facebook y Grupos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Preparas una sola publicacion, eliges tus grupos o destinos y despues vas publicando
              uno por uno con texto, foto, video o link ya listos.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loginFacebookChrome}
              className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white"
            >
              <Send size={16} />
              Iniciar sesion en Chrome
            </button>
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700"
            >
              <RefreshCw size={16} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          Cargando publicador...
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <ImagePlus size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Nueva publicacion</h3>
                  <p className="text-sm text-slate-500">
                    Escribes una vez y despues la reutilizas en todos los grupos.
                  </p>
                </div>
              </div>

              <form onSubmit={savePublicacion} className="space-y-3 rounded-3xl bg-slate-50 p-4">
                <label className="space-y-1">
                  <span className="text-sm font-bold text-slate-700">Titulo interno</span>
                  <input
                    value={publicacionForm.titulo}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, titulo: e.target.value }))
                    }
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-bold text-slate-700">Texto de la publicacion</span>
                  <textarea
                    value={publicacionForm.mensaje}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, mensaje: e.target.value }))
                    }
                    className="min-h-[130px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-bold text-slate-700">Link opcional</span>
                  <input
                    value={publicacionForm.link_url}
                    onChange={(e) =>
                      setPublicacionForm((prev) => ({ ...prev, link_url: e.target.value }))
                    }
                    placeholder="https://..."
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Estado</span>
                    <select
                      value={publicacionForm.estado}
                      onChange={(e) =>
                        setPublicacionForm((prev) => ({ ...prev, estado: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value="borrador">Borrador</option>
                      <option value="listo">Lista</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Adjunto</span>
                    <input
                      type="file"
                      accept="image/*,video/*,audio/*,.pdf"
                      onChange={(e) => setPublicacionFile(e.target.files?.[0] || null)}
                      className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm"
                    />
                  </label>
                </div>
                {publicacionFile ? (
                  <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <p className="mb-2 text-xs text-slate-500">
                      Vista previa del adjunto nuevo: {publicacionFile.name}
                    </p>
                    {publicacionFile.type?.startsWith('image/') ? (
                      <img
                        src={URL.createObjectURL(publicacionFile)}
                        alt={publicacionFile.name}
                        className="h-36 w-full rounded-2xl object-cover"
                      />
                    ) : publicacionFile.type?.startsWith('video/') ? (
                      <video
                        src={URL.createObjectURL(publicacionFile)}
                        controls
                        className="h-44 w-full rounded-2xl bg-slate-950 object-cover"
                      >
                        <track kind="captions" src="" label="Sin subtítulos" />
                      </video>
                    ) : publicacionFile.type?.startsWith('audio/') ? (
                      <audio src={URL.createObjectURL(publicacionFile)} controls className="w-full">
                        <track kind="captions" src="" label="Sin subtítulos" />
                      </audio>
                    ) : (
                      <p className="text-xs font-bold text-slate-700">Archivo listo para subir</p>
                    )}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingPublicacion}
                    className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white"
                  >
                    {editPublicacionId ? <Save size={16} /> : <Plus size={16} />}
                    {editPublicacionId ? 'Guardar publicacion' : 'Agregar publicacion'}
                  </button>
                  {(editPublicacionId || publicacionForm.titulo || publicacionForm.mensaje) && (
                    <button
                      type="button"
                      onClick={resetPublicacion}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </form>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-blue-700">
                  <Share2 size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Destinos guardados</h3>
                  <p className="text-sm text-slate-500">
                    Aqui guardas tus grupos, pagina o perfil para no escribirlos de nuevo.
                  </p>
                </div>
              </div>

              <form onSubmit={saveDestino} className="space-y-3 rounded-3xl bg-slate-50 p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Nombre</span>
                    <input
                      value={destinoForm.nombre}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, nombre: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Tipo</span>
                    <select
                      value={destinoForm.tipo}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, tipo: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    >
                      <option value="grupo_facebook">Grupo de Facebook</option>
                      <option value="pagina_facebook">Pagina de Facebook</option>
                      <option value="perfil_facebook">Perfil personal</option>
                    </select>
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-sm font-bold text-slate-700">URL del destino</span>
                  <input
                    value={destinoForm.url}
                    onChange={(e) => setDestinoForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://www.facebook.com/groups/..."
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                  />
                </label>
                <div className="grid gap-3 md:grid-cols-[160px,1fr]">
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Orden</span>
                    <input
                      type="number"
                      value={destinoForm.orden}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, orden: Number(e.target.value) || 0 }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-bold text-slate-700">Notas</span>
                    <input
                      value={destinoForm.notas}
                      onChange={(e) =>
                        setDestinoForm((prev) => ({ ...prev, notas: e.target.value }))
                      }
                      className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
                    />
                  </label>
                </div>
                <label className="inline-flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                  <input
                    type="checkbox"
                    checked={Boolean(destinoForm.activo)}
                    onChange={(e) =>
                      setDestinoForm((prev) => ({ ...prev, activo: e.target.checked }))
                    }
                  />
                  Destino activo
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={savingDestino}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white"
                  >
                    {editDestinoId ? <Save size={16} /> : <Plus size={16} />}
                    {editDestinoId ? 'Guardar destino' : 'Agregar destino'}
                  </button>
                  {(editDestinoId || destinoForm.nombre || destinoForm.url) && (
                    <button
                      type="button"
                      onClick={resetDestino}
                      className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700 ring-1 ring-slate-200"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {destinos.length === 0 ? (
                  <p className="text-sm text-slate-500">Todavia no cargaste grupos o destinos.</p>
                ) : (
                  destinos.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      {item.preview_path ? (
                        <div className="mb-3">
                          <img
                            src={uploadUrl(item.preview_path)}
                            alt={item.nombre}
                            className="h-28 w-full rounded-2xl object-cover ring-1 ring-slate-200"
                          />
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">{item.nombre}</p>
                          <p className="mt-1 text-xs text-slate-500">{item.url}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.activo ? 'green' : 'slate'}>
                            {item.activo ? 'Activo' : 'Pausado'}
                          </Badge>
                          <Badge tone="blue">{item.tipo}</Badge>
                          <Badge tone="slate">Orden {item.orden}</Badge>
                          <button
                            type="button"
                            onClick={() => capturePreview(item.id)}
                            className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                          >
                            Capturar vista
                          </button>
                          <button
                            type="button"
                            onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')}
                            className="rounded-2xl bg-slate-100 p-2.5 text-slate-700"
                          >
                            <ExternalLink size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => editDestino(item)}
                            className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDestino(item)}
                            className="rounded-2xl bg-danger-50 px-3 py-2 text-xs font-bold text-danger-600"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Publicaciones guardadas</h3>
                <p className="text-sm text-slate-500">
                  Desde aqui preparas la cola y publicas sin volver a armar el mensaje.
                </p>
              </div>
              <Badge tone="blue">{publicaciones.length}</Badge>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {publicaciones.length === 0 ? (
                <p className="text-sm text-slate-500">Todavia no cargaste publicaciones.</p>
              ) : (
                publicaciones.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-3xl border p-4 shadow-sm ${selectedPostId === item.id ? 'border-blue-500 bg-primary-50/40' : 'border-slate-200 bg-white'}`}
                  >
                    {item.media_path ? (
                      <div className="mb-3">
                        {renderMediaPreview(item.media_path, item.media_mime, item.titulo)}
                      </div>
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-900">{item.titulo}</p>
                        <p className="mt-1 line-clamp-3 text-sm text-slate-600">
                          {item.mensaje || 'Sin mensaje cargado'}
                        </p>
                      </div>
                      <Badge
                        tone={
                          item.estado === 'publicado'
                            ? 'green'
                            : item.estado === 'listo'
                              ? 'blue'
                              : 'amber'
                        }
                      >
                        {item.estado}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <Badge tone="slate">Destinos: {item.destinos_total || 0}</Badge>
                      <Badge tone="green">Publicados: {item.destinos_publicados || 0}</Badge>
                      <Badge tone="amber">Pendientes: {item.destinos_pendientes || 0}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => loadQueue(item.id)}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        Ver cola
                      </button>
                      <button
                        type="button"
                        onClick={() => prepareQueue(item.id)}
                        className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        <Send size={14} /> Preparar cola
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          copyText(
                            [item.mensaje, item.link_url].filter(Boolean).join('\n\n'),
                            'Texto copiado'
                          )
                        }
                        className="rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                      >
                        <Copy size={14} className="inline-block mr-1" /> Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => editPublicacion(item)}
                        className="rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePublicacion(item)}
                        className="rounded-2xl bg-danger-50 px-3 py-2 text-xs font-bold text-danger-600"
                      >
                        <Trash2 size={14} className="inline-block mr-1" /> Eliminar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-slate-900">Cola asistida de publicacion</h3>
                <p className="text-sm text-slate-500">
                  Abres el grupo, pegas el texto y marcas lo publicado. Asi no pierdes tiempo y no
                  andas grupo por grupo armando todo de cero.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedPost ? <Badge tone="blue">{selectedPost.titulo}</Badge> : null}
                {queue?.publicacion ? (
                  <button
                    type="button"
                    onClick={autoPublishWholeQueue}
                    className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-3 py-2 text-xs font-bold text-white"
                  >
                    <Send size={14} />
                    Auto publicar toda la cola
                  </button>
                ) : null}
              </div>
            </div>

            {!queue?.publicacion ? (
              <p className="text-sm text-slate-500">
                Elige una publicacion y toca "Preparar cola" para empezar.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-black text-slate-800">{queue.publicacion.titulo}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {[queue.publicacion.mensaje, queue.publicacion.link_url]
                      .filter(Boolean)
                      .join('\n\n')}
                  </p>
                  {previewMedia ? (
                    <div className="mt-3 space-y-3">
                      {renderMediaPreview(
                        previewMedia,
                        queue.publicacion.media_mime,
                        queue.publicacion.titulo
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={uploadUrl(previewMedia)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700 ring-1 ring-slate-200"
                        >
                          <ExternalLink size={14} />
                          Abrir adjunto
                        </a>
                        <span className="text-xs text-slate-500">
                          {queue.publicacion.media_nombre || 'Adjunto cargado'}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-3">
                  {queue.items.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Esta publicacion todavia no tiene destinos preparados.
                    </p>
                  ) : (
                    queue.items.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-black text-slate-900">
                              {item.orden}. {item.destino_nombre}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">{item.destino_url}</p>
                          </div>
                          <Badge
                            tone={
                              item.estado === 'publicado'
                                ? 'green'
                                : item.estado === 'abierto'
                                  ? 'blue'
                                  : item.estado === 'omitido'
                                    ? 'amber'
                                    : item.estado === 'error'
                                      ? 'rose'
                                      : 'slate'
                            }
                          >
                            {item.estado}
                          </Badge>
                        </div>
                        {item.notas ? (
                          <p className="mt-2 text-xs font-medium text-danger-700">{item.notas}</p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              copyText(item.texto_preparado || '', 'Texto listo para pegar')
                            }
                            className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            <Copy size={14} />
                            Copiar texto
                          </button>
                          <button
                            type="button"
                            onClick={() => autoPublishQueueItem(item.id)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            <Send size={14} />
                            Auto publicar
                          </button>
                          <button
                            type="button"
                            onClick={() => openDestination(item)}
                            className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            <ExternalLink size={14} />
                            Abrir destino
                          </button>
                          <button
                            type="button"
                            onClick={() => markQueueItem(item.id, 'publicado')}
                            className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            <CheckCircle2 size={14} />
                            Marcar publicado
                          </button>
                          <button
                            type="button"
                            onClick={() => markQueueItem(item.id, 'omitido')}
                            className="rounded-2xl bg-warning-100 px-3 py-2 text-xs font-bold text-warning-700"
                          >
                            Omitir
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

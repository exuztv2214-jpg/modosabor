import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Megaphone,
  Pause,
  Play,
  QrCode,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

import api from '../lib/api.js';
import { BRAND } from '../lib/theme.js';

const estadoTexto = (estado) =>
  ({ conectado: 'Conectado', qr: 'Esperando QR', conectando: 'Conectando' })[estado] ||
  estado ||
  'Sin conectar';

export default function WhatsAppMasivo() {
  const [estado, setEstado] = useState(null);
  const [destinatarios, setDestinatarios] = useState([]);
  const [campanas, setCampanas] = useState([]);
  const [excluidos, setExcluidos] = useState([]);
  const [respuestas, setRespuestas] = useState([]);
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({
    nombre: '',
    mensaje: '',
    imagen: '',
    segmento: 'todos',
    simulacro: true,
  });
  const [preview, setPreview] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [e, d, c, x, r, cfg] = await Promise.all([
        api.get('/whatsapp/estado'),
        api.get(`/whatsapp/destinatarios?segmento=${encodeURIComponent(form.segmento)}`),
        api.get('/whatsapp/campanas?limite=20'),
        api.get('/whatsapp/excluidos'),
        api.get('/whatsapp/respuestas?limite=12'),
        api.get('/whatsapp/config'),
      ]);
      setEstado(e);
      setDestinatarios(d?.items || []);
      setCampanas(c || []);
      setExcluidos(x || []);
      setRespuestas(r || []);
      setConfig(cfg || {});
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar WhatsApp masivo');
    }
  }, [form.segmento]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const preparar = async () => {
    if (!form.mensaje.trim()) return toast.error('Escribí el mensaje antes de preparar');
    setCargando(true);
    try {
      const resultado = await api.post('/whatsapp/preparar', form);
      setPreview(resultado);
      await cargar();
      toast.success(`${resultado.total} destinatarios listos para revisar`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo preparar la campaña');
    } finally {
      setCargando(false);
    }
  };

  const enviar = async () => {
    if (!preview?.campanaId) return;
    const texto = preview.simulacro
      ? 'La simulación no manda mensajes. ¿Querés ejecutarla?'
      : `Vas a enviar esta campaña a ${preview.total} clientes. ¿Confirmás el envío?`;
    if (!window.confirm(texto)) return;
    setCargando(true);
    try {
      await api.post('/whatsapp/enviar', { campanaId: preview.campanaId });
      toast.success(preview.simulacro ? 'Simulación iniciada' : 'Campaña iniciada');
      setPreview(null);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo iniciar la campaña');
    } finally {
      setCargando(false);
    }
  };

  const motor = async (accion) => {
    try {
      await api.post(`/whatsapp/${accion}`);
      await cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo actualizar el envío');
    }
  };

  const conectar = async () => {
    setCargando(true);
    try {
      await api.post('/whatsapp/conectar');
      await cargar();
      toast.success('Se solicitó el código de vinculación');
    } catch (error) {
      toast.error(error?.error || 'No se pudo iniciar la conexión');
    } finally {
      setCargando(false);
    }
  };

  const subirAdjunto = async (archivo) => {
    if (!archivo) return;
    if (archivo.size > 16 * 1024 * 1024) return toast.error('El archivo no puede superar 16 MB');
    setCargando(true);
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      const resultado = await api.post('/whatsapp/media', datos);
      setForm((prev) => ({ ...prev, imagen: resultado.path }));
      toast.success(`Adjunto cargado: ${resultado.nombre}`);
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el adjunto');
    } finally {
      setCargando(false);
    }
  };

  const guardarConfig = async (campo, valor) => {
    const siguiente = { ...config, [campo]: valor };
    setConfig(siguiente);
    try {
      await api.put('/whatsapp/config', { [campo]: valor });
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la configuración');
    }
  };

  const motorActivo = Boolean(estado?.motor?.corriendo);
  const whatsapp = estado?.whatsapp || {};
  const conectado = whatsapp.estado === 'conectado';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <div>
          <div
            className="mb-2 flex items-center gap-2 text-sm font-semibold"
            style={{ color: BRAND }}
          >
            <Megaphone size={17} /> WhatsApp masivo
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Campañas con control humano</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-500">
            Prepará, revisá y confirmá cada envío. Este módulo no manda nada al abrirse.
          </p>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="inline-flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          <RefreshCw size={15} /> Actualizar
        </button>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          [
            estadoTexto(estado?.whatsapp?.estado),
            estado?.whatsapp?.detalle || 'Sesión única del sistema',
          ],
          [`${destinatarios.length}`, 'Destinatarios habilitados'],
          [`${excluidos.length}`, 'Bajas y excluidos'],
          [
            motorActivo ? 'Enviando' : 'En espera',
            motorActivo ? `${estado?.motor?.stats?.ok || 0} enviados` : 'No hay envío activo',
          ],
        ].map(([valor, detalle]) => (
          <div key={detalle} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-lg font-bold text-gray-900">{valor}</p>
            <p className="mt-1 text-xs text-gray-500">{detalle}</p>
          </div>
        ))}
      </div>

      <section
        className={`rounded-3xl border p-5 ${conectado ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${conectado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
            >
              {conectado ? <CheckCircle2 size={21} /> : <QrCode size={21} />}
            </span>
            <div>
              <h2 className="font-bold text-gray-900">WhatsApp del local</h2>
              <p className="mt-1 text-sm text-gray-700">
                {conectado
                  ? `Conectado${whatsapp.numero ? ` · +${whatsapp.numero}` : ''}`
                  : whatsapp.detalle || 'Todavía no está vinculado al sistema.'}
              </p>
              {!conectado && !whatsapp.qrImagen ? (
                <p className="mt-1 text-xs text-gray-500">
                  Generá el código y escanealo desde WhatsApp → Dispositivos vinculados.
                </p>
              ) : null}
            </div>
          </div>
          {!conectado && !whatsapp.qrImagen ? (
            <button
              type="button"
              onClick={conectar}
              disabled={cargando || whatsapp.estado === 'conectando'}
              style={{ background: BRAND }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              <QrCode size={16} /> Generar QR
            </button>
          ) : null}
        </div>
        {!conectado && whatsapp.qrImagen ? (
          <div className="mt-5 flex flex-col items-center rounded-2xl bg-white p-5 text-center">
            <img
              src={whatsapp.qrImagen}
              alt="Código QR para vincular WhatsApp"
              className="h-[260px] w-[260px] rounded-xl"
            />
            <p className="mt-3 text-xs text-gray-500">
              Escaneá este código desde el teléfono del local. Se vence solo y nunca se comparte con
              servicios externos.
            </p>
            <button
              type="button"
              onClick={cargar}
              className="mt-3 text-sm font-semibold"
              style={{ color: BRAND }}
            >
              Ya escaneé · actualizar estado
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900">Nueva campaña</h2>
          <label className="mt-4 block text-xs font-semibold text-gray-600">
            Nombre interno
            <input
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              placeholder="Menú del día"
            />
          </label>
          <label className="mt-4 block text-xs font-semibold text-gray-600">
            Segmento
            <select
              value={form.segmento}
              onChange={(e) => setForm({ ...form, segmento: e.target.value })}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
            >
              <option value="todos">Todos los habilitados</option>
              <option value="frecuentes">Frecuentes · 5 o más pedidos</option>
              <option value="nuevos">Nuevos · hasta 1 pedido</option>
              <option value="inactivos">Inactivos · sin compra hace 30 días</option>
            </select>
          </label>
          <label className="mt-4 block text-xs font-semibold text-gray-600">
            Mensaje
            <textarea
              value={form.mensaje}
              onChange={(e) => setForm({ ...form, mensaje: e.target.value })}
              rows={7}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
              placeholder="Usá {NOMBRE} si querés personalizar el saludo."
            />
          </label>
          <label className="mt-4 block text-xs font-semibold text-gray-600">
            Imagen o PDF opcional
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              disabled={cargando}
              onChange={(e) => subirAdjunto(e.target.files?.[0])}
              className="mt-1 block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:font-semibold"
            />
          </label>
          {form.imagen ? (
            <p className="mt-2 text-xs text-emerald-700">
              Adjunto listo para esta campaña.{' '}
              <button
                type="button"
                onClick={() => setForm({ ...form, imagen: '' })}
                className="font-semibold underline"
              >
                Quitar
              </button>
            </p>
          ) : null}
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.simulacro}
              onChange={(e) => setForm({ ...form, simulacro: e.target.checked })}
            />{' '}
            Simulacro sin envío real
          </label>
          <button
            type="button"
            disabled={cargando}
            onClick={preparar}
            style={{ background: BRAND }}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            <Users size={16} /> Preparar y revisar
          </button>
        </div>
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-gray-900">Protecciones activas</h2>
          <ul className="mt-4 space-y-3 text-sm text-gray-600">
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-emerald-600" /> Sólo clientes con
              teléfono válido; se respetan bajas.
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-emerald-600" /> No se repite el envío en
              el mismo día.
            </li>
            <li className="flex gap-2">
              <ShieldCheck size={16} className="mt-0.5 text-emerald-600" /> Límites y pausas se
              aplican desde la base, incluso tras reiniciar.
            </li>
          </ul>
          <div className="mt-6 border-t pt-4">
            <p className="text-xs font-semibold text-gray-600">Cupo por ventana</p>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                min="1"
                value={config?.maxPorVentana ?? 60}
                onChange={(e) => guardarConfig('maxPorVentana', Number(e.target.value))}
                className="w-24 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              />
              <span className="self-center text-xs text-gray-500">mensajes cada</span>
              <input
                type="number"
                min="1"
                value={config?.ventanaMinutos ?? 60}
                onChange={(e) => guardarConfig('ventanaMinutos', Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
              />
              <span className="self-center text-xs text-gray-500">min.</span>
            </div>
          </div>
        </div>
      </section>

      {preview ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-bold text-amber-950">Revisión obligatoria</h2>
          <p className="mt-1 text-sm text-amber-900">
            {preview.simulacro ? 'Simulacro:' : 'Envío real:'} {preview.total} destinatarios ·{' '}
            {preview.dejadosAfuera} quedan para otra tanda.
          </p>
          <div className="mt-3 max-h-36 overflow-auto rounded-xl bg-white p-3 text-xs text-gray-600">
            {(preview.muestra || []).map((p) => (
              <p key={p.telefono}>
                {p.nombre || 'Sin nombre'} · {p.telefono}
              </p>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={cargando}
              onClick={enviar}
              style={{ background: BRAND }}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
            >
              <Send size={15} /> Confirmar {preview.simulacro ? 'simulacro' : 'envío'}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-700"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Control del envío</h2>
            <p className="text-xs text-gray-500">
              Pausa o cancela la campaña activa sin cerrar WhatsApp.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => motor('pausar')}
              disabled={!motorActivo}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800 disabled:opacity-40"
            >
              <Pause size={14} /> Pausar
            </button>
            <button
              type="button"
              onClick={() => motor('reanudar')}
              disabled={!motorActivo}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-40"
            >
              <Play size={14} /> Reanudar
            </button>
            <button
              type="button"
              onClick={() => motor('detener')}
              disabled={!motorActivo}
              className="inline-flex items-center gap-2 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
            >
              <Square size={14} /> Detener
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Últimas campañas</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500">
              <tr>
                <th className="p-2">Campaña</th>
                <th className="p-2">Estado</th>
                <th className="p-2">Total</th>
                <th className="p-2">Enviados</th>
                <th className="p-2">Fallidos</th>
              </tr>
            </thead>
            <tbody>
              {campanas.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="p-2 font-medium text-gray-800">
                    {c.nombre || `Campaña #${c.id}`}
                    {Number(c.simulacro) ? ' · simulacro' : ''}
                  </td>
                  <td className="p-2 text-gray-600">{c.estado}</td>
                  <td className="p-2">{c.total}</td>
                  <td className="p-2 text-emerald-700">{c.enviados}</td>
                  <td className="p-2 text-red-600">{c.fallidos}</td>
                </tr>
              ))}
              {!campanas.length ? (
                <tr>
                  <td colSpan="5" className="p-4 text-center text-gray-400">
                    Todavía no hay campañas.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-gray-900">Respuestas recientes</h2>
        <p className="mt-1 text-xs text-gray-500">
          Las solicitudes de baja se excluyen automáticamente de próximas campañas.
        </p>
        <div className="mt-3 space-y-2">
          {respuestas.map((r) => (
            <div key={r.id} className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-xs font-semibold text-gray-700">
                {r.telefonoLegible || r.telefono}
                {Number(r.es_baja) ? ' · pidió la baja' : ''}
              </p>
              <p className="mt-1 truncate text-sm text-gray-600">{r.texto || 'Sin texto'}</p>
            </div>
          ))}
          {!respuestas.length ? (
            <p className="py-3 text-sm text-gray-400">Todavía no entraron respuestas a campañas.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

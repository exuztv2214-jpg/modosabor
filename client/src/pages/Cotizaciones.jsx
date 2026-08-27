import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';

import api from '../lib/api.js';
import { resolveAssetUrl } from '../lib/assets.js';
import { fmtMoney } from '../lib/formatters.js';
import { useAppConfig } from '../context/AppConfigContext.jsx';
import { APP_BG, BRAND, STROKE } from '../lib/theme.js';

const CONTROL =
  'h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-[14px] text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5';

const ESTADOS = {
  borrador: { label: 'Borrador', bg: '#F1F5F9', fg: '#475569' },
  enviada: { label: 'Enviada', bg: '#EFF6FF', fg: '#1D4ED8' },
  aceptada: { label: 'Aceptada', bg: '#ECFDF5', fg: '#047857' },
  rechazada: { label: 'Rechazada', bg: '#FEF2F2', fg: '#B91C1C' },
  vencida: { label: 'Vencida', bg: '#FFF7ED', fg: '#C2410C' },
};

function fechaHoy() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function nuevoFormulario() {
  return {
    id: null,
    numero: '',
    cliente_empresa: '',
    cliente_contacto: '',
    cliente_cuit: '',
    cliente_telefono: '',
    cliente_email: '',
    cliente_direccion: '',
    fecha_emision: fechaHoy(),
    fecha_servicio: '',
    validez_dias: 7,
    estado: 'borrador',
    condiciones_pago: 'Forma y fecha de pago a coordinar.',
    observaciones: '',
    descuento: 0,
    items: [
      {
        descripcion: 'Menú del día completo',
        detalle: 'Plato principal, bebida y postre por persona.',
        cantidad: 30,
        precio_unitario: 8000,
      },
    ],
  };
}

function numero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function escaparHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textoConSaltos(value) {
  return escaparHtml(value).replace(/\n/g, '<br>');
}

function fechaLegible(value) {
  if (!value) return 'A coordinar';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function urlAbsoluta(value) {
  const resolved = resolveAssetUrl(value || '');
  if (!resolved) return '';
  try {
    return new URL(resolved, window.location.origin).href;
  } catch {
    return '';
  }
}

function htmlCotizacion(cotizacion, negocio) {
  const items = Array.isArray(cotizacion.items) ? cotizacion.items : [];
  const subtotal = items.reduce(
    (sum, item) => sum + numero(item.cantidad) * numero(item.precio_unitario),
    0
  );
  const descuento = numero(cotizacion.descuento);
  const total = numero(cotizacion.total || subtotal - descuento);
  const logo = urlAbsoluta(negocio.negocio_logo);
  const datosEmisor = [
    negocio.negocio_direccion,
    negocio.negocio_telefono,
    negocio.negocio_email,
    negocio.negocio_cuit ? `CUIT ${negocio.negocio_cuit}` : '',
  ].filter(Boolean);
  const datosCliente = [
    cotizacion.cliente_contacto,
    cotizacion.cliente_cuit ? `CUIT ${cotizacion.cliente_cuit}` : '',
    cotizacion.cliente_telefono,
    cotizacion.cliente_email,
    cotizacion.cliente_direccion,
  ].filter(Boolean);

  const filas = items
    .map(
      (item) => `
        <tr>
          <td>
            <strong>${escaparHtml(item.descripcion)}</strong>
            ${item.detalle ? `<div class="detail">${textoConSaltos(item.detalle)}</div>` : ''}
          </td>
          <td class="number">${numero(item.cantidad).toLocaleString('es-AR')}</td>
          <td class="number">${escaparHtml(fmtMoney(item.precio_unitario))}</td>
          <td class="number strong">${escaparHtml(
            fmtMoney(numero(item.cantidad) * numero(item.precio_unitario))
          )}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escaparHtml(cotizacion.numero || 'Cotización')} · ${escaparHtml(
        negocio.negocio_nombre || 'Modo Sabor'
      )}</title>
      <style>
        * { box-sizing: border-box; }
        body { margin: 0; color: #172033; font-family: Arial, Helvetica, sans-serif; background: #eef1f5; }
        .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; padding: 17mm 16mm 15mm; background: #fff; }
        .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 3px solid #dc1f2d; }
        .brand { display: flex; align-items: center; gap: 14px; }
        .logo { width: 68px; height: 68px; object-fit: contain; border-radius: 14px; }
        .brand h1 { margin: 0; font-size: 24px; color: #111827; }
        .brand p, .issuer p { margin: 4px 0 0; color: #667085; font-size: 12px; line-height: 1.45; }
        .issuer { text-align: right; max-width: 260px; }
        .doc-title { display: flex; justify-content: space-between; align-items: flex-end; margin: 28px 0 18px; }
        .doc-title h2 { margin: 0; font-size: 30px; letter-spacing: -.5px; }
        .doc-title .number { color: #dc1f2d; font-size: 15px; font-weight: 700; }
        .meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 18px; }
        .meta div, .client { border: 1px solid #e4e7ec; border-radius: 10px; padding: 11px 13px; }
        .label { display: block; margin-bottom: 4px; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
        .meta strong, .client strong { font-size: 13px; }
        .client { margin-bottom: 22px; background: #fafafa; }
        .client h3 { margin: 0 0 7px; font-size: 17px; }
        .client p { margin: 3px 0; color: #475467; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th { padding: 10px; background: #111827; color: #fff; font-size: 11px; text-align: left; }
        th:first-child { border-radius: 8px 0 0 8px; }
        th:last-child { border-radius: 0 8px 8px 0; }
        td { padding: 13px 10px; border-bottom: 1px solid #e4e7ec; vertical-align: top; font-size: 12px; }
        .detail { margin-top: 5px; color: #667085; line-height: 1.45; }
        .number { text-align: right; white-space: nowrap; }
        .strong { font-weight: 700; }
        .totals { width: 310px; margin: 18px 0 24px auto; }
        .totals div { display: flex; justify-content: space-between; padding: 6px 2px; font-size: 13px; }
        .totals .grand { margin-top: 5px; padding: 12px 13px; border-radius: 9px; background: #fff1f2; color: #9f1239; font-size: 20px; font-weight: 700; }
        .notes { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .note { min-height: 90px; padding: 13px; border: 1px solid #e4e7ec; border-radius: 10px; }
        .note h4 { margin: 0 0 7px; font-size: 12px; }
        .note p { margin: 0; color: #475467; font-size: 11px; line-height: 1.55; }
        .acceptance { display: flex; gap: 45px; margin-top: 46px; color: #667085; font-size: 10px; }
        .signature { flex: 1; padding-top: 7px; border-top: 1px solid #98a2b3; text-align: center; }
        .footer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #e4e7ec; color: #667085; font-size: 10px; text-align: center; }
        .actions { position: fixed; right: 20px; top: 20px; display: flex; gap: 8px; }
        .actions button { border: 0; border-radius: 9px; padding: 11px 15px; cursor: pointer; font-weight: 700; }
        .print { background: #dc1f2d; color: #fff; }
        .close { background: #fff; color: #344054; box-shadow: 0 1px 5px #0002; }
        @media print {
          body { background: #fff; }
          .sheet { width: auto; min-height: auto; margin: 0; padding: 10mm 12mm; }
          .actions { display: none; }
          @page { size: A4; margin: 0; }
        }
      </style>
    </head>
    <body>
      <div class="actions"><button class="close" onclick="window.close()">Cerrar</button><button class="print" onclick="window.print()">Imprimir</button></div>
      <main class="sheet">
        <header class="header">
          <div class="brand">
            ${logo ? `<img class="logo" src="${escaparHtml(logo)}" alt="Logo">` : ''}
            <div><h1>${escaparHtml(
              negocio.negocio_nombre || 'Modo Sabor'
            )}</h1><p>Servicio gastronómico</p></div>
          </div>
          <div class="issuer">${datosEmisor
            .map((dato) => `<p>${escaparHtml(dato)}</p>`)
            .join('')}</div>
        </header>

        <section class="doc-title">
          <h2>Cotización</h2>
          <div class="number">${escaparHtml(cotizacion.numero || 'BORRADOR')}</div>
        </section>

        <section class="meta">
          <div><span class="label">Fecha de emisión</span><strong>${escaparHtml(
            fechaLegible(cotizacion.fecha_emision)
          )}</strong></div>
          <div><span class="label">Servicio</span><strong>${escaparHtml(
            fechaLegible(cotizacion.fecha_servicio)
          )}</strong></div>
          <div><span class="label">Validez</span><strong>${numero(
            cotizacion.validez_dias
          )} días</strong></div>
        </section>

        <section class="client">
          <span class="label">Cotización preparada para</span>
          <h3>${escaparHtml(cotizacion.cliente_empresa)}</h3>
          ${datosCliente.map((dato) => `<p>${escaparHtml(dato)}</p>`).join('')}
        </section>

        <table>
          <thead><tr><th>Descripción</th><th class="number">Personas / un.</th><th class="number">Precio unitario</th><th class="number">Importe</th></tr></thead>
          <tbody>${filas}</tbody>
        </table>

        <section class="totals">
          <div><span>Subtotal</span><strong>${escaparHtml(fmtMoney(subtotal))}</strong></div>
          ${
            descuento
              ? `<div><span>Descuento</span><strong>− ${escaparHtml(
                  fmtMoney(descuento)
                )}</strong></div>`
              : ''
          }
          <div class="grand"><span>Total</span><span>${escaparHtml(fmtMoney(total))}</span></div>
        </section>

        <section class="notes">
          <div class="note"><h4>Condiciones comerciales</h4><p>${textoConSaltos(
            cotizacion.condiciones_pago || 'Forma y fecha de pago a coordinar.'
          )}</p></div>
          <div class="note"><h4>Observaciones</h4><p>${textoConSaltos(
            cotizacion.observaciones ||
              'Importes expresados en pesos argentinos. Coordinación sujeta a disponibilidad para la fecha solicitada.'
          )}</p></div>
        </section>

        <section class="acceptance"><div class="signature">Firma y aclaración del cliente</div><div class="signature">Fecha de aceptación</div></section>
        <footer class="footer">Gracias por elegir ${escaparHtml(
          negocio.negocio_nombre || 'Modo Sabor'
        )}.</footer>
      </main>
    </body>
  </html>`;
}

function imprimirCotizacion(cotizacion, negocio) {
  const popup = window.open('', '_blank', 'width=980,height=850');
  if (!popup) {
    toast.error('El navegador bloqueó la vista de impresión. Permití las ventanas emergentes.');
    return;
  }
  popup.document.open();
  popup.document.write(htmlCotizacion(cotizacion, negocio));
  popup.document.close();
  popup.focus();
}

function Campo({ label, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-[12px] font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export default function Cotizaciones() {
  const { config } = useAppConfig();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [form, setForm] = useState(nuevoFormulario);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const subtotal = useMemo(
    () =>
      form.items.reduce(
        (sum, item) => sum + numero(item.cantidad) * numero(item.precio_unitario),
        0
      ),
    [form.items]
  );
  const total = Math.max(0, subtotal - numero(form.descuento));

  const cargarLista = async () => {
    try {
      setLoading(true);
      const data = await api.get('/cotizaciones');
      setCotizaciones(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error?.error || 'No se pudieron cargar las cotizaciones');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarLista();
  }, []);

  const listaFiltrada = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cotizaciones;
    return cotizaciones.filter((item) =>
      [item.numero, item.cliente_empresa, item.cliente_contacto].join(' ').toLowerCase().includes(q)
    );
  }, [cotizaciones, search]);

  const setCampo = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const setItem = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const agregarItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { descripcion: '', detalle: '', cantidad: 1, precio_unitario: 0 }],
    }));
  };

  const quitarItem = (index) => {
    if (form.items.length === 1) return toast.error('Debe quedar al menos un renglón');
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const abrirCotizacion = async (id) => {
    try {
      const data = await api.get(`/cotizaciones/${id}`);
      setForm({ ...nuevoFormulario(), ...data, items: data.items || [] });
    } catch (error) {
      toast.error(error?.error || 'No se pudo abrir la cotización');
    }
  };

  const guardar = async ({ imprimir = false } = {}) => {
    if (!form.cliente_empresa.trim()) return toast.error('Ingresá la empresa o cliente');
    if (form.items.some((item) => !String(item.descripcion || '').trim())) {
      return toast.error('Todos los renglones necesitan una descripción');
    }
    try {
      setSaving(true);
      // Los inputs HTML entregan texto. La API convierte a centavos solamente
      // los números; normalizarlos acá evita que un precio editado de 8000 se
      // guarde como 8000 centavos ($80) mientras el valor inicial sí queda bien.
      const payload = {
        ...form,
        validez_dias: numero(form.validez_dias),
        descuento: numero(form.descuento),
        subtotal,
        total,
        items: form.items.map((item) => ({
          ...item,
          cantidad: numero(item.cantidad),
          precio_unitario: numero(item.precio_unitario),
        })),
      };
      const saved = form.id
        ? await api.put(`/cotizaciones/${form.id}`, payload)
        : await api.post('/cotizaciones', payload);
      setForm({ ...nuevoFormulario(), ...saved, items: saved.items || [] });
      await cargarLista();
      toast.success(form.id ? 'Cotización actualizada' : `Cotización ${saved.numero} creada`);
      if (imprimir) imprimirCotizacion(saved, config || {});
      return saved;
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar la cotización');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-5 lg:px-6" style={{ background: APP_BG }}>
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={25} strokeWidth={STROKE} style={{ color: BRAND }} />
              <h1 className="text-[24px] font-semibold tracking-tight text-gray-950">
                Cotizaciones
              </h1>
            </div>
            <p className="mt-1 text-[13px] text-gray-500">
              Presupuestos comerciales con historial y hoja A4 lista para imprimir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm(nuevoFormulario())}
            className="flex h-11 items-center gap-2 rounded-xl px-4 text-[13px] font-semibold text-white"
            style={{ background: BRAND }}
          >
            <Plus size={18} strokeWidth={STROKE} /> Nueva cotización
          </button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-gray-900">Historial</h2>
                <p className="text-[11px] text-gray-400">{cotizaciones.length} cotizaciones</p>
              </div>
              <button
                type="button"
                onClick={cargarLista}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Actualizar historial"
              >
                <RefreshCw size={17} strokeWidth={STROKE} />
              </button>
            </div>
            <div className="relative mb-3">
              <Search
                className="absolute left-3 top-3 text-gray-400"
                size={17}
                strokeWidth={STROKE}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${CONTROL} pl-9`}
                placeholder="Número, empresa o contacto"
              />
            </div>
            <div className="max-h-[720px] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <p className="py-10 text-center text-[13px] text-gray-400">Cargando…</p>
              ) : listaFiltrada.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-[13px] text-gray-400">
                  Todavía no hay cotizaciones guardadas.
                </div>
              ) : (
                listaFiltrada.map((item) => {
                  const tono = ESTADOS[item.estado] || ESTADOS.borrador;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => abrirCotizacion(item.id)}
                      className={`w-full rounded-xl border p-3 text-left transition hover:border-gray-300 hover:bg-gray-50 ${
                        form.id === item.id ? 'border-red-200 bg-red-50/50' : 'border-gray-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-gray-900">
                            {item.cliente_empresa}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-400">
                            {item.numero} · {fechaLegible(item.fecha_emision)}
                          </p>
                        </div>
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-semibold"
                          style={{ background: tono.bg, color: tono.fg }}
                        >
                          {tono.label}
                        </span>
                      </div>
                      <p className="mt-3 text-[17px] font-bold tabular-nums text-gray-950">
                        {fmtMoney(item.total)}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          <main className="space-y-4">
            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Building2 size={19} strokeWidth={STROKE} style={{ color: BRAND }} />
                  <div>
                    <h2 className="text-[15px] font-semibold text-gray-900">Cliente y servicio</h2>
                    <p className="text-[11px] text-gray-400">
                      {form.numero || 'Nueva cotización sin guardar'}
                    </p>
                  </div>
                </div>
                <select
                  value={form.estado}
                  onChange={(event) => setCampo('estado', event.target.value)}
                  className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none"
                >
                  {Object.entries(ESTADOS).map(([value, item]) => (
                    <option key={value} value={value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Campo label="Empresa o cliente *">
                  <input
                    className={CONTROL}
                    value={form.cliente_empresa}
                    onChange={(e) => setCampo('cliente_empresa', e.target.value)}
                    placeholder="Nombre de la empresa"
                  />
                </Campo>
                <Campo label="Persona de contacto">
                  <input
                    className={CONTROL}
                    value={form.cliente_contacto}
                    onChange={(e) => setCampo('cliente_contacto', e.target.value)}
                    placeholder="Nombre y apellido"
                  />
                </Campo>
                <Campo label="CUIT del cliente">
                  <input
                    className={CONTROL}
                    value={form.cliente_cuit}
                    onChange={(e) => setCampo('cliente_cuit', e.target.value)}
                    placeholder="Opcional"
                  />
                </Campo>
                <Campo label="Teléfono">
                  <input
                    className={CONTROL}
                    value={form.cliente_telefono}
                    onChange={(e) => setCampo('cliente_telefono', e.target.value)}
                  />
                </Campo>
                <Campo label="Email">
                  <input
                    type="email"
                    className={CONTROL}
                    value={form.cliente_email}
                    onChange={(e) => setCampo('cliente_email', e.target.value)}
                  />
                </Campo>
                <Campo label="Dirección">
                  <input
                    className={CONTROL}
                    value={form.cliente_direccion}
                    onChange={(e) => setCampo('cliente_direccion', e.target.value)}
                  />
                </Campo>
                <Campo label="Fecha de emisión">
                  <input
                    type="date"
                    className={CONTROL}
                    value={form.fecha_emision}
                    onChange={(e) => setCampo('fecha_emision', e.target.value)}
                  />
                </Campo>
                <Campo label="Fecha del servicio">
                  <input
                    type="date"
                    className={CONTROL}
                    value={form.fecha_servicio || ''}
                    onChange={(e) => setCampo('fecha_servicio', e.target.value)}
                  />
                </Campo>
                <Campo label="Validez (días)">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    className={CONTROL}
                    value={form.validez_dias}
                    onChange={(e) => setCampo('validez_dias', e.target.value)}
                  />
                </Campo>
              </div>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays size={19} strokeWidth={STROKE} style={{ color: BRAND }} />
                  <div>
                    <h2 className="text-[15px] font-semibold text-gray-900">Propuesta</h2>
                    <p className="text-[11px] text-gray-400">
                      El ejemplo está preparado para 30 personas a $8.000.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={agregarItem}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Plus size={16} strokeWidth={STROKE} /> Agregar renglón
                </button>
              </div>
              <div className="space-y-3">
                {form.items.map((item, index) => (
                  <div
                    key={`${index}-${item.id || 'nuevo'}`}
                    className="grid gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 md:grid-cols-[minmax(0,1.7fr)_110px_150px_44px]"
                  >
                    <div className="space-y-2">
                      <input
                        className={CONTROL}
                        value={item.descripcion}
                        onChange={(e) => setItem(index, 'descripcion', e.target.value)}
                        placeholder="Descripción"
                      />
                      <textarea
                        className="min-h-20 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-gray-400"
                        value={item.detalle || ''}
                        onChange={(e) => setItem(index, 'detalle', e.target.value)}
                        placeholder="Qué incluye"
                      />
                    </div>
                    <Campo label="Personas / un.">
                      <input
                        type="number"
                        min="1"
                        className={CONTROL}
                        value={item.cantidad}
                        onChange={(e) => setItem(index, 'cantidad', e.target.value)}
                      />
                    </Campo>
                    <Campo label="Precio por persona">
                      <input
                        type="number"
                        min="0"
                        className={CONTROL}
                        value={item.precio_unitario}
                        onChange={(e) => setItem(index, 'precio_unitario', e.target.value)}
                      />
                      <p className="mt-2 text-right text-[12px] font-semibold text-gray-700">
                        {fmtMoney(numero(item.cantidad) * numero(item.precio_unitario))}
                      </p>
                    </Campo>
                    <button
                      type="button"
                      onClick={() => quitarItem(index)}
                      className="mt-5 flex h-11 items-center justify-center rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Quitar renglón"
                    >
                      <Trash2 size={17} strokeWidth={STROKE} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_330px]">
                <div className="grid gap-3 md:grid-cols-2">
                  <Campo label="Condiciones de pago">
                    <textarea
                      className="min-h-24 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-gray-400"
                      value={form.condiciones_pago}
                      onChange={(e) => setCampo('condiciones_pago', e.target.value)}
                    />
                  </Campo>
                  <Campo label="Observaciones">
                    <textarea
                      className="min-h-24 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-gray-400"
                      value={form.observaciones}
                      onChange={(e) => setCampo('observaciones', e.target.value)}
                      placeholder="Entrega, horarios u otras aclaraciones"
                    />
                  </Campo>
                </div>
                <div className="rounded-xl bg-gray-950 p-4 text-white">
                  <div className="flex justify-between text-[12px] text-gray-300">
                    <span>Subtotal</span>
                    <strong>{fmtMoney(subtotal)}</strong>
                  </div>
                  <label className="mt-3 flex items-center justify-between gap-4 text-[12px] text-gray-300">
                    <span>Descuento</span>
                    <input
                      type="number"
                      min="0"
                      max={subtotal}
                      className="h-9 w-32 rounded-lg border border-white/15 bg-white/10 px-2 text-right text-white outline-none"
                      value={form.descuento || 0}
                      onChange={(e) => setCampo('descuento', e.target.value)}
                    />
                  </label>
                  <div className="mt-4 flex items-end justify-between border-t border-white/15 pt-4">
                    <span className="text-[13px]">Total</span>
                    <strong className="text-[26px] tabular-nums">{fmtMoney(total)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-3 pb-8">
              {form.id ? (
                <button
                  type="button"
                  onClick={() => imprimirCotizacion({ ...form, subtotal, total }, config || {})}
                  className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-800 hover:bg-gray-50"
                >
                  <Printer size={18} strokeWidth={STROKE} /> Vista previa / imprimir
                </button>
              ) : null}
              <button
                type="button"
                disabled={saving}
                onClick={() => guardar()}
                className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                <Save size={18} strokeWidth={STROKE} /> {saving ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => guardar({ imprimir: true })}
                className="flex h-11 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white disabled:opacity-50"
                style={{ background: BRAND }}
              >
                <FileCheck2 size={18} strokeWidth={STROKE} /> Guardar e imprimir
              </button>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

import {
  Save,
  Search,
  Phone,
  User,
  Mail,
  Calendar,
  MapPin,
  Home,
  AlertTriangle,
  CheckCircle2,
  Building2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { hoyArgentina } from '../../lib/fechaNegocio.js';

const FIELD_CLASS =
  'w-full rounded-2xl border border-gray-200/60 bg-white/70 px-4 py-3.5 text-sm font-bold text-gray-900 outline-none transition focus:bg-white backdrop-blur-sm';

function fieldFocusHandlers(colorPrimario) {
  return {
    onFocus: (e) => {
      e.target.style.borderColor = colorPrimario;
      e.target.style.boxShadow = `0 0 0 3px ${colorPrimario}1a`;
    },
    onBlur: (e) => {
      e.target.style.borderColor = '';
      e.target.style.boxShadow = '';
    },
  };
}

const FIELD_LABELS = {
  nombre: 'nombre',
  telefono: 'teléfono',
  direccion: 'dirección',
  fecha_nacimiento: 'cumpleaños',
  email: 'email',
};

export default function FormularioCliente({
  form,
  setForm,
  onSubmit,
  onLookup,
  saving,
  lookuping,
  payload,
  colorPrimario,
}) {
  const missingFields = payload?.cliente?.missing_fields || [];
  const profileComplete = Boolean(payload?.cliente?.perfil_completo);
  const missingFieldsText =
    missingFields.length > 0 ? missingFields.map((f) => FIELD_LABELS[f] || f).join(', ') : null;
  const focusProps = fieldFocusHandlers(colorPrimario);

  return (
    <div className="w-full">
      <div className="mb-8 text-center">
        <p
          className="text-[11px] font-black uppercase tracking-[0.22em]"
          style={{ color: colorPrimario }}
        >
          Ficha del Club
        </p>
        <h2 className="mt-2 text-3xl font-black text-gray-900">Completá o actualizá tus datos</h2>
        <p className="mt-2 text-sm font-medium text-gray-500">
          Si ya pediste por WhatsApp o en el local, te vinculamos a tu cliente existente.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="rounded-[32px] border border-gray-200/80 bg-white p-6 shadow-lg sm:p-8"
      >
        {payload?.cliente && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-gray-200/80 bg-gray-50 p-4">
            {profileComplete ? (
              <CheckCircle2 size={20} className="text-emerald-500" />
            ) : (
              <AlertTriangle size={20} className="text-amber-500" />
            )}
            <div>
              <p className="text-sm font-bold text-gray-700">
                Cliente vinculado:{' '}
                <span className="font-black text-gray-900">{payload.cliente.codigo_tarjeta}</span>
              </p>
              {missingFieldsText && (
                <p className="mt-1 text-xs font-medium text-amber-600">
                  Faltan completar: {missingFieldsText}
                </p>
              )}
              {profileComplete && (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  ¡Ficha completa! Tu tarjeta está activa.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <User size={14} />
              Nombre y apellido
            </span>
            <input
              className={FIELD_CLASS}
              value={form.nombre}
              onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
              placeholder="Ej: Juan Pérez"
              required
              {...focusProps}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Phone size={14} />
              WhatsApp / Teléfono
            </span>
            <div className="relative">
              <input
                className={`${FIELD_CLASS} pr-28`}
                value={form.telefono}
                onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
                placeholder="381 2345678"
                required
                {...focusProps}
              />
              <button
                type="button"
                onClick={onLookup}
                disabled={lookuping}
                className="absolute right-1.5 top-1.5 inline-flex h-[calc(100%-12px)] items-center gap-1.5 rounded-xl border border-gray-200/80 bg-white px-4 text-xs font-bold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-50"
              >
                <Search size={14} />
                {lookuping ? 'Buscando' : 'Buscar'}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Mail size={14} />
              Email
            </span>
            <input
              className={FIELD_CLASS}
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="juan@email.com (opcional)"
              type="email"
              {...focusProps}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Calendar size={14} />
              Fecha de nacimiento
            </span>
            <input
              type="date"
              max={hoyArgentina()}
              className={`${FIELD_CLASS} [color-scheme:light]`}
              value={form.fecha_nacimiento}
              onChange={(e) => setForm((p) => ({ ...p, fecha_nacimiento: e.target.value }))}
              {...focusProps}
            />
          </label>

          <label className="block md:col-span-2">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <MapPin size={14} />
              Dirección principal
            </span>
            <input
              className={FIELD_CLASS}
              value={form.direccion}
              onChange={(e) => setForm((p) => ({ ...p, direccion: e.target.value }))}
              placeholder="Calle, número, piso, depto (opcional)"
              {...focusProps}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Building2 size={14} />
              Barrio / zona
            </span>
            <input
              className={FIELD_CLASS}
              value={form.barrio}
              onChange={(e) => setForm((p) => ({ ...p, barrio: e.target.value }))}
              placeholder="Ej: Eucaliptus, Centro (opcional)"
              {...focusProps}
            />
          </label>

          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
              <Home size={14} />
              Referencia del domicilio
            </span>
            <input
              className={FIELD_CLASS}
              value={form.referencia}
              onChange={(e) => setForm((p) => ({ ...p, referencia: e.target.value }))}
              placeholder="Portón negro, timbre roto, etc."
              {...focusProps}
            />
          </label>
        </div>

        {/* Checkbox de bases y condiciones (obligatorio para nuevos clientes;
            si ya existia en la base, se pre-marca en ClubFidelidad.jsx). */}
        <label
          className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200/80 bg-white/70 p-4 transition hover:bg-white"
          style={!form.acepto_terminos ? { borderColor: `${colorPrimario}55` } : {}}
        >
          <input
            type="checkbox"
            checked={Boolean(form.acepto_terminos)}
            onChange={(e) => setForm((p) => ({ ...p, acepto_terminos: e.target.checked }))}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-current"
            style={{ accentColor: colorPrimario }}
          />
          <span className="text-xs font-semibold leading-relaxed text-gray-700">
            Acepto las{' '}
            <Link
              to="/club/terminos"
              target="_blank"
              rel="noreferrer"
              className="font-black underline underline-offset-2"
              style={{ color: colorPrimario }}
            >
              bases y condiciones
            </Link>{' '}
            del Club de Fidelidad y autorizo a que se me envíen mensajes con novedades y promociones
            al teléfono cargado.
          </span>
        </label>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="submit"
            disabled={saving || !form.acepto_terminos}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-40 hover:brightness-105 hover:scale-[1.01] active:scale-[0.98]"
            style={{ backgroundColor: colorPrimario, boxShadow: `0 8px 24px ${colorPrimario}30` }}
          >
            <Save size={16} />
            {saving ? 'Guardando...' : 'Guardar mi ficha'}
          </button>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl border border-gray-200/80 bg-white px-6 py-4 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            Volver al menú
          </Link>
        </div>
      </form>
    </div>
  );
}

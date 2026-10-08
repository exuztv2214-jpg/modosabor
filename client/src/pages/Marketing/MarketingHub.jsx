import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Library,
  Megaphone,
  MessageCircle,
} from 'lucide-react';

import { BRAND, STROKE } from '../../lib/theme.js';

/**
 * Portada de Marketing.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * Cuatro pestañas de trece píxeles arriba de una tabla. El problema no era el
 * tamaño: era que las pestañas no dicen nada hasta que las apretás. Para
 * saber si había algo atrasado en la agenda había que entrar a la agenda.
 *
 * Acá cada cuadro trae su propio número. "Agenda · 2 atrasadas" se lee de
 * lejos y decide sola adónde entrar. Un cuadro que no tiene nada urgente
 * muestra el dato de contexto y se queda callado.
 *
 * ── Por qué el orden es este ───────────────────────────────────────────────
 *
 * WhatsApp va arriba junto a Resumen porque es lo único que se hace todos los
 * días. Biblioteca va última porque es material que se carga una vez.
 */

const TONOS = {
  ok: { punto: '#10B981', texto: '#065F46', fondo: '#ECFDF5' },
  aviso: { punto: '#F59E0B', texto: '#92400E', fondo: '#FEF6E7' },
  malo: { punto: BRAND, texto: '#9E141E', fondo: '#FEF2F2' },
  neutro: { punto: '#94A3B8', texto: '#475569', fondo: '#F1F5F9' },
};

function Pastilla({ tono = 'neutro', children }) {
  const t = TONOS[tono] || TONOS.neutro;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: t.fondo, color: t.texto }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.punto }} />
      {children}
    </span>
  );
}

/**
 * Un cuadro grande.
 *
 * `destacado` levanta el número principal a 32px. Se usa sólo cuando el
 * número es la razón de entrar —plata atribuida, mensajes de hoy—; si todos
 * los cuadros gritan, no grita ninguno.
 */
function Cuadro({ icon: Icon, titulo, bajada, valor, unidad, pastilla, pie, onClick, destacado }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col rounded-[20px] bg-white p-5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(15,23,42,0.10)]"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: '#FEF2F2', color: BRAND }}
        >
          <Icon size={20} strokeWidth={STROKE} />
        </span>
        {pastilla ? <Pastilla tono={pastilla.tono}>{pastilla.texto}</Pastilla> : null}
      </div>

      <p className="text-[15px] font-semibold text-gray-900">{titulo}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-gray-500">{bajada}</p>

      <div className="mt-auto flex items-end justify-between gap-3 pt-5">
        <div>
          <span
            className={`font-semibold tabular-nums tracking-tight text-gray-900 ${destacado ? 'text-[32px]' : 'text-[24px]'} leading-none`}
          >
            {valor}
          </span>
          {unidad ? <span className="ml-1.5 text-[13px] text-gray-400">{unidad}</span> : null}
          {pie ? <p className="mt-1.5 text-[12px] text-gray-400">{pie}</p> : null}
        </div>
        <span
          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 transition-colors group-hover:bg-gray-900 group-hover:text-white"
          aria-hidden="true"
        >
          <ArrowRight size={15} strokeWidth={STROKE} />
        </span>
      </div>
    </button>
  );
}

const fmtPlata = (n) => `$${Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;

export default function MarketingHub({
  dashboard,
  campanas = [],
  contenidos = [],
  promos = [],
  calendario = [],
  onIr,
}) {
  const campanasVivas = campanas.filter((c) => c.estado === 'activa' || c.estado === 'activo');
  const atribuido = Number(dashboard?.resumen?.ingresos_atribuidos || dashboard?.ingresos || 0);

  // Una publicación con fecha pasada que nunca salió es la única cosa
  // realmente urgente de este módulo: ya se perdió el momento.
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const atrasadas = calendario.filter(
    (c) => c.estado === 'pendiente' && c.fecha && new Date(c.fecha).getTime() < inicioHoy.getTime()
  ).length;
  const proximas = calendario.filter(
    (c) => c.estado === 'pendiente' && c.fecha && new Date(c.fecha).getTime() >= inicioHoy.getTime()
  ).length;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Cuadro
        icon={BarChart3}
        titulo="Resumen"
        bajada="Qué trajo cada peso que pusiste"
        valor={fmtPlata(atribuido)}
        pie="atribuido a campañas"
        onClick={() => onIr('resumen')}
        destacado
      />

      <Cuadro
        icon={MessageCircle}
        titulo="WhatsApp"
        bajada="Promos masivas: se manejan desde el panel Masivos"
        valor="Abrir"
        pie="panel de envíos masivos"
        onClick={() => window.location.assign('/masivos')}
        destacado
      />

      <Cuadro
        icon={CalendarDays}
        titulo="Agenda"
        bajada="Qué hay que publicar y cuándo"
        valor={atrasadas || proximas || 0}
        unidad={atrasadas ? (atrasadas === 1 ? 'atrasada' : 'atrasadas') : 'por publicar'}
        pastilla={
          atrasadas
            ? { tono: 'malo', texto: 'Se pasó la fecha' }
            : proximas
              ? { tono: 'ok', texto: 'Al día' }
              : null
        }
        onClick={() => onIr('agenda')}
        destacado={atrasadas > 0}
      />

      <Cuadro
        icon={Megaphone}
        titulo="Campañas"
        bajada="Cada una con su código de seguimiento"
        valor={campanasVivas.length}
        unidad={campanasVivas.length === 1 ? 'activa' : 'activas'}
        pie={campanas.length ? `${campanas.length} en total` : 'todavía no creaste ninguna'}
        onClick={() => onIr('campanas')}
      />

      <Cuadro
        icon={Library}
        titulo="Biblioteca"
        bajada="Promos y contenido listo para usar"
        valor={promos.length + contenidos.length}
        unidad="piezas"
        pie={`${promos.length} promos · ${contenidos.length} contenidos`}
        onClick={() => onIr('biblioteca')}
      />
    </div>
  );
}

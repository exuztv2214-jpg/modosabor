/**
 * Los íconos de marca, de verdad.
 *
 * ── Por qué no alcanzan los de la librería ─────────────────────────────────
 *
 * `lucide-react` trae un `Facebook` y un `Instagram` que son siluetas de un
 * solo color, pensadas para acompañar texto. Sirven en un menú.
 *
 * En el compositor no: ahí el ícono **es** la identificación de la cuenta. Un
 * contorno gris de Instagram al lado de uno gris de Facebook obliga a mirar
 * dos veces para saber cuál es cuál, y son la primera decisión de la pantalla.
 *
 * Estos son las marcas reales: el círculo azul de Facebook y el degradé de
 * Instagram, que se reconocen sin leer.
 *
 * ── Sobre los colores ──────────────────────────────────────────────────────
 *
 * Son los oficiales de cada marca. No se cambian ni se adaptan a la paleta del
 * sistema: un Facebook en rojo Modo Sabor deja de ser reconocible, que es todo
 * lo que un logo tiene que hacer.
 */

import { useEffect, useId, useState } from 'react';

export function MarcaFacebook({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        fill="#fff"
        d="M16.67 15.47l.53-3.47h-3.33V9.75c0-.95.47-1.88 1.96-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.74 0-4.53 1.66-4.53 4.66V12H7.08v3.47h3.05v8.39a12.1 12.1 0 003.74 0v-8.39h2.8z"
      />
    </svg>
  );
}

export function MarcaInstagram({ size = 24 }) {
  /*
    El degradé necesita un id único por instancia.

    Si dos SVG comparten el id del degradé, el segundo apunta al primero y —
    cuando el primero se desmonta — el segundo se queda sin relleno y aparece
    negro. Pasa siempre que hay más de un ícono en pantalla, que es el caso
    normal acá.
  */
  const id = `ig-${useId().replace(/:/g, '')}`;

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="0.3" cy="1.05" r="1.3">
          <stop offset="0" stopColor="#FDD35D" />
          <stop offset="0.25" stopColor="#F77737" />
          <stop offset="0.5" stopColor="#E1306C" />
          <stop offset="0.75" stopColor="#C13584" />
          <stop offset="1" stopColor="#833AB4" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill={`url(#${id})`} />
      <rect
        x="5.2"
        y="5.2"
        width="13.6"
        height="13.6"
        rx="4.4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3.4" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="16.6" cy="7.5" r="1.05" fill="#fff" />
    </svg>
  );
}

/** El ícono que le toca a una identidad, según qué sea. */
export function MarcaDeIdentidad({ tipo, size = 24 }) {
  if (tipo === 'instagram') return <MarcaInstagram size={size} />;
  return <MarcaFacebook size={size} />;
}

/**
 * La foto de perfil de una cuenta, con la marca de la red encima.
 *
 * ── Por qué las dos cosas juntas ───────────────────────────────────────────
 *
 * Sólo la foto no alcanza: la Fan Page y su Instagram usan **la misma foto**,
 * porque es el mismo negocio. Sin la marca abajo a la derecha son dos círculos
 * idénticos, y eso es peor que las iniciales.
 *
 * Sólo la marca tampoco: el Perfil y la Fan Page son los dos Facebook, y el
 * ícono azul es el mismo para ambos.
 *
 * La foto dice *quién* y la marca dice *dónde*. Hacen falta las dos, que es
 * exactamente cómo lo resuelven Metricool y Facebook.
 *
 * ── Por qué hay respaldo ───────────────────────────────────────────────────
 *
 * La foto puede no estar: la cuenta se conectó antes de que el sistema supiera
 * bajarlas, o Meta no la dio, o el token venció. En todos esos casos aparece
 * la inicial, que es lo que había antes — nunca un cuadrado roto.
 */
export function FotoDeCuenta({ foto, nombre, red, size = 40 }) {
  const [fotoDisponible, setFotoDisponible] = useState(Boolean(foto));
  useEffect(() => setFotoDisponible(Boolean(foto)), [foto]);
  const inicial = String(nombre || 'MS')
    .replace(/^@/, '')
    .slice(0, 2)
    .toUpperCase();

  /* La marca ocupa poco más de un tercio: se reconoce y no tapa la cara. */
  const marca = Math.max(14, Math.round(size * 0.42));

  return (
    <span className="social-foto-cuenta" style={{ width: size, height: size }} title={nombre}>
      {fotoDisponible ? (
        <img
          src={foto}
          alt=""
          width={size}
          height={size}
          onError={() => setFotoDisponible(false)}
        />
      ) : (
        <em style={{ fontSize: Math.round(size * 0.34) }}>{inicial}</em>
      )}
      <i className="social-foto-cuenta-marca">
        <MarcaDeIdentidad tipo={red} size={marca} />
      </i>
    </span>
  );
}

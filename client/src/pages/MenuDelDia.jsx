import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Beef,
  ChefHat,
  ChevronDown,
  ChevronUp,
  GripVertical,
  IceCream,
  Loader2,
  Plus,
  RefreshCw,
  Salad,
  Save,
  Settings2,
  Soup,
  Star,
  UtensilsCrossed,
  X,
} from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';
import { formatAmountForInput, parseLocalizedAmount } from '../lib/amountInput.js';
import ConfigMenuDiaModal from './Operacion/ConfigMenuDiaModal.jsx';
import NuevoPlatoModal from './Operacion/NuevoPlatoModal.jsx';

/**
 * Menú del día — tres columnas, se arrastra entre ellas.
 *
 * ── Cómo funciona ──────────────────────────────────────────────────────────
 *
 * A la izquierda está el repertorio: todos los platos que alguna vez fueron
 * menú del día. Se arrastra uno a "Económicos" o a "Ejecutivos" y sale a la
 * venta en esa porción, con su precio.
 *
 * **Un plato puede estar en las dos columnas al mismo tiempo.** La suprema a
 * $5.000 la chica y a $7.000 la grande, el mismo día, sin cargarla dos veces.
 * Arrastrarla a la segunda columna no la saca de la primera.
 *
 * Eso importa: obligar a elegir una sola porción es lo que llevó a cargar el
 * mismo plato duplicado, y de ahí salen los pares que hay hoy en la carta
 * —"Canelón" y "Canelones", "Suprema a la napolitana" y "Suprema napolitana"—.
 *
 * Dentro de cada columna se arrastra para ordenar, y ese orden es el que usan
 * la web pública y la IA cuando listan el menú. Lo que está arriba se vende
 * más.
 *
 * ── Por qué las columnas no se guardan en la base ──────────────────────────
 *
 * Que un plato esté en "Económicos" es exactamente lo mismo que decir que hoy
 * tiene precio económico. No hace falta un campo aparte que pueda quedar
 * desincronizado con el precio: la columna se deriva del precio.
 *
 * `en_economico` y `en_ejecutivo` viven sólo en esta pantalla, para poder
 * tener un plato puesto en una columna mientras todavía se escribe su precio.
 * Al guardar se traducen a precios, que es lo único que la base sabe.
 *
 * ── Las decisiones de diseño ───────────────────────────────────────────────
 *
 * **El precio manda.** Es el dato que se mira cien veces por día, así que va
 * en 24px, en rojo, y sin caja de formulario alrededor. Se escribe encima
 * directamente. Antes era un campito de 30px de alto perdido entre chips y no
 * se leía de un vistazo.
 *
 * **Las guarniciones son texto, no botones.** Una grilla de quince chips grises
 * pesa más en la pantalla que el precio, que es lo importante. Van en una
 * línea corrida: las elegidas en negro, las demás en gris. Se siguen clickeando
 * igual.
 *
 * **Las columnas no se distinguen por color.** El rojo está reservado —según
 * las reglas de lib/theme.js— para la plata y la acción principal. Pintar una
 * columna de un color y otra de otro haría que el precio deje de saltar. Se
 * distinguen por lugar, título y ancho: el repertorio es más angosto y más
 * apagado porque es la estantería, no la venta.
 */

/*
  Cada columna tiene su color y su ícono.

  Las clases van escritas enteras y no armadas con plantillas: Tailwind lee el
  código como texto para decidir qué CSS generar, así que un `bg-${color}-50`
  no existiría en la hoja de estilos final y la columna saldría transparente.

  El rojo de marca no aparece acá a propósito: queda para el precio y para
  Guardar. Si las columnas también fueran rojas, el precio dejaría de saltar.
*/
const COLUMNAS = [
  {
    id: 'repertorio',
    titulo: 'Repertorio',
    meta: 'lo que sabés cocinar',
    icono: ChefHat,
    tinta: 'text-slate-500',
    fondo: 'bg-slate-100',
    chip: 'bg-slate-100 text-slate-600',
    soltando: 'border-slate-300 bg-slate-50',
  },
  {
    id: 'economico',
    titulo: 'Económicos',
    meta: 'porción chica',
    icono: Soup,
    tinta: 'text-emerald-600',
    fondo: 'bg-emerald-50',
    chip: 'bg-emerald-50 text-emerald-700',
    soltando: 'border-emerald-300 bg-emerald-50/60',
  },
  {
    id: 'ejecutivo',
    titulo: 'Ejecutivos',
    meta: 'porción grande',
    icono: Beef,
    tinta: 'text-indigo-600',
    fondo: 'bg-indigo-50',
    chip: 'bg-indigo-50 text-indigo-700',
    soltando: 'border-indigo-300 bg-indigo-50/60',
  },
];

const CAMPO_PRECIO = { economico: 'precio_economico_hoy', ejecutivo: 'precio_ejecutivo_hoy' };
const CAMPO_FLAG = { economico: 'en_economico', ejecutivo: 'en_ejecutivo' };
const OTRA_COLUMNA = { economico: 'ejecutivo', ejecutivo: 'economico' };

function fmt(valor) {
  return `$${formatAmountForInput(valor || 0)}`;
}

export default function MenuDelDia() {
  const [datos, setDatos] = useState(null);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [arrastrando, setArrastrando] = useState(null);
  const [columnaEncima, setColumnaEncima] = useState(null);
  /*
    Dónde está el dedo o el mouse mientras se arrastra, para dibujar el fantasma
    que sigue al puntero. Sin eso, en un celular no se ve que algo se esté
    moviendo y parece que la pantalla se colgó.
  */
  const [posicionPuntero, setPosicionPuntero] = useState(null);
  const arrastreRef = useRef(null);
  const [configAbierta, setConfigAbierta] = useState(false);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const data = await api.get('/operacion/menu-dia');
      setDatos(data);
      setItems(
        (data.items || []).map((item, indice) => {
          const economico = parseLocalizedAmount(item.precio_economico_hoy, 0);
          const ejecutivo = parseLocalizedAmount(item.precio_ejecutivo_hoy, 0);
          const sale = Number(item.disponible_hoy) === 1;
          return {
            ...item,
            orden_hoy: Number.isFinite(Number(item.orden_hoy)) ? Number(item.orden_hoy) : indice,
            /*
              Si el plato sale hoy pero no tiene ninguno de los dos precios, es
              de antes de que existieran los dos tamaños: tenía un `precio_hoy`
              solo. Va a Económicos, que es donde estaba en la práctica, en vez
              de esconderse en el repertorio y parecer que se borró.
            */
            en_economico: sale && (economico > 0 || (!economico && !ejecutivo)),
            en_ejecutivo: sale && ejecutivo > 0,
          };
        })
      );
    } catch (error) {
      toast.error(error?.error || 'No se pudo cargar el menú del día');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiar = (id, campo, valor) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item)));

  const guarnicionesDisponibles = datos?.guarnicionesLista || [];

  const toggleGuarnicion = (id, nombre) =>
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const actuales = item.guarniciones_hoy || [];
        return {
          ...item,
          guarniciones_hoy: actuales.includes(nombre)
            ? actuales.filter((g) => g !== nombre)
            : [...actuales, nombre],
        };
      })
    );

  const porColumna = useMemo(() => {
    const porOrden = (a, b) => Number(a.orden_hoy) - Number(b.orden_hoy);
    return {
      repertorio: items.filter((i) => !i.en_economico && !i.en_ejecutivo).sort(porOrden),
      economico: items.filter((i) => i.en_economico).sort(porOrden),
      ejecutivo: items.filter((i) => i.en_ejecutivo).sort(porOrden),
    };
  }, [items]);

  /*
    Poner un plato en una columna.

    Clave: NO lo saca de la otra. Arrastrar la suprema a Ejecutivos cuando ya
    está en Económicos la deja en las dos, que es todo el punto.

    Se le pone el precio sugerido de esa porción para no dejarlo en cero y
    tener que acordarse. Si ya tenía un precio escrito, se respeta: ese lo puso
    una persona.
  */
  const ponerEn = (itemId, columna) => {
    if (columna === 'repertorio') return sacarDe(itemId, null);
    const campoPrecio = CAMPO_PRECIO[columna];
    const sugerido =
      columna === 'economico' ? datos?.precioSugeridoEconomico : datos?.precioSugeridoEjecutivo;

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const yaTiene = parseLocalizedAmount(item[campoPrecio], 0);
        return {
          ...item,
          [CAMPO_FLAG[columna]]: true,
          [campoPrecio]: yaTiene
            ? item[campoPrecio]
            : sugerido
              ? formatAmountForInput(sugerido)
              : '',
        };
      })
    );
  };

  /*
    Sacarlo de una columna. Con `columna` en null vuelve al repertorio, o sea
    sale de las dos.

    El precio de esa porción se borra: si mañana vuelve a salir, se vuelve a
    poner. Dejarlo escondido haría que un plato que a la vista está "sin
    precio" se venda con el de la semana pasada.
  */
  const sacarDe = (itemId, columna) =>
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        if (!columna) {
          return {
            ...item,
            en_economico: false,
            en_ejecutivo: false,
            precio_economico_hoy: '',
            precio_ejecutivo_hoy: '',
          };
        }
        return { ...item, [CAMPO_FLAG[columna]]: false, [CAMPO_PRECIO[columna]]: '' };
      })
    );

  /*
    Reordenar adentro de una columna.

    Sin librerías: son diez o quince platos y el arrastre nativo del navegador
    alcanza. Sumar una dependencia entera sería pagar peso de carga en el
    celular del local a cambio de nada.

    Sólo se renumeran los platos de esa columna, reusando los números de orden
    que ya tenían. Así mover algo en Económicos no desacomoda Ejecutivos, aun
    cuando hay platos que están en las dos.
  */
  const reordenarEn = (columna, destinoId) => {
    if (!arrastrando || arrastrando === destinoId) return;
    setItems((prev) => {
      const lista = prev
        .filter((i) => i[CAMPO_FLAG[columna]])
        .sort((a, b) => Number(a.orden_hoy) - Number(b.orden_hoy));
      const desde = lista.findIndex((i) => i.id === arrastrando);
      const hasta = lista.findIndex((i) => i.id === destinoId);
      if (desde < 0 || hasta < 0) return prev;

      const numeros = lista.map((i) => Number(i.orden_hoy)).sort((a, b) => a - b);
      const movido = lista.splice(desde, 1)[0];
      lista.splice(hasta, 0, movido);

      const nuevoOrden = new Map(lista.map((item, indice) => [item.id, numeros[indice]]));
      return prev.map((item) =>
        nuevoOrden.has(item.id) ? { ...item, orden_hoy: nuevoOrden.get(item.id) } : item
      );
    });
    setArrastrando(null);
  };

  /*
    Alternativa táctil al arrastre. HTML5 Drag and Drop no funciona con el
    dedo en la mayoría de los navegadores móviles, por eso cada tarjeta tiene
    controles explícitos para subir, bajar y pasarla a otra columna.
  */
  const moverEn = (columna, itemId, direccion) => {
    setItems((prev) => {
      const lista = prev
        .filter((item) => item[CAMPO_FLAG[columna]])
        .sort((a, b) => Number(a.orden_hoy) - Number(b.orden_hoy));
      const desde = lista.findIndex((item) => item.id === itemId);
      const hasta = desde + direccion;
      if (desde < 0 || hasta < 0 || hasta >= lista.length) return prev;

      const numeros = lista.map((item) => Number(item.orden_hoy)).sort((a, b) => a - b);
      [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];
      const nuevoOrden = new Map(lista.map((item, indice) => [item.id, numeros[indice]]));

      return prev.map((item) =>
        nuevoOrden.has(item.id) ? { ...item, orden_hoy: nuevoOrden.get(item.id) } : item
      );
    });
  };

  /*
    ── El arrastre ────────────────────────────────────────────────────────────

    Con eventos de puntero y no con el drag nativo de HTML5.

    El motivo es concreto: **el arrastre de HTML5 no existe en pantallas
    táctiles.** No hay `dragstart` con el dedo. Si el menú del día se carga
    desde un celular parado en el local —que es lo normal— la pantalla
    simplemente no funcionaba, y no había forma de darse cuenta leyendo el
    código: compila igual.

    `pointerdown`, `pointermove` y `pointerup` son los mismos eventos para
    mouse, dedo y lápiz. Un solo camino, sin ramas por dispositivo.

    Cómo se sabe qué hay debajo: `document.elementFromPoint()` sobre la
    posición del puntero, y de ahí se leen los `data-columna` y `data-item` que
    las tarjetas y las columnas llevan puestos. Es lo que el navegador hacía
    solo con el drag nativo.
  */
  const PIXELES_PARA_ARRASTRAR = 6;

  const zonaBajoPuntero = (x, y) => {
    const elemento = document.elementFromPoint(x, y);
    if (!elemento) return { columna: null, itemId: null };
    const enColumna = elemento.closest('[data-columna]');
    const enItem = elemento.closest('[data-item]');
    return {
      columna: enColumna ? enColumna.getAttribute('data-columna') : null,
      itemId: enItem ? Number(enItem.getAttribute('data-item')) : null,
    };
  };

  const alBajarPuntero = (evento, itemId, columnaOrigen) => {
    // Sólo el botón principal. Un clic derecho no arrastra.
    if (evento.button !== undefined && evento.button !== 0) return;
    evento.preventDefault();
    arrastreRef.current = {
      itemId,
      columnaOrigen,
      desdeX: evento.clientX,
      desdeY: evento.clientY,
      activo: false,
    };
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
  };

  const alMoverPuntero = (evento) => {
    const arrastre = arrastreRef.current;
    if (!arrastre) return;

    /*
      No se arranca a arrastrar hasta moverse unos píxeles. Sin este umbral, un
      toque para apretar la estrella o la × se interpretaría como arrastre y la
      tarjeta se movería sola.
    */
    if (!arrastre.activo) {
      const distancia =
        Math.abs(evento.clientX - arrastre.desdeX) + Math.abs(evento.clientY - arrastre.desdeY);
      if (distancia < PIXELES_PARA_ARRASTRAR) return;
      arrastre.activo = true;
      setArrastrando(arrastre.itemId);
    }

    evento.preventDefault();
    setPosicionPuntero({ x: evento.clientX, y: evento.clientY });
    const zona = zonaBajoPuntero(evento.clientX, evento.clientY);
    setColumnaEncima(zona.columna);
  };

  const alSoltarPuntero = (evento) => {
    const arrastre = arrastreRef.current;
    arrastreRef.current = null;
    setPosicionPuntero(null);
    setColumnaEncima(null);

    if (!arrastre || !arrastre.activo) {
      setArrastrando(null);
      return;
    }

    const zona = zonaBajoPuntero(evento.clientX, evento.clientY);
    if (!zona.columna) {
      // Se soltó fuera de todo: no pasa nada, la tarjeta vuelve a su lugar.
      setArrastrando(null);
      return;
    }

    if (zona.columna === arrastre.columnaOrigen && zona.itemId && zona.itemId !== arrastre.itemId) {
      // Cayó sobre otra tarjeta de la misma columna: es reordenar.
      reordenarEn(zona.columna, zona.itemId);
      return;
    }

    if (zona.columna !== arrastre.columnaOrigen) {
      ponerEn(arrastre.itemId, zona.columna);
    }
    setArrastrando(null);
  };

  const itemArrastrado = useMemo(
    () => (arrastrando ? items.find((item) => item.id === arrastrando) : null),
    [arrastrando, items]
  );

  const guardar = async () => {
    // Un plato puesto en una columna sin precio no se puede vender: la web lo
    // mostraría en cero y la IA no sabría qué cobrar.
    const sinPrecio = [];
    for (const item of items) {
      if (item.en_economico && !parseLocalizedAmount(item.precio_economico_hoy, 0)) {
        sinPrecio.push(`${item.nombre} (económico)`);
      }
      if (item.en_ejecutivo && !parseLocalizedAmount(item.precio_ejecutivo_hoy, 0)) {
        sinPrecio.push(`${item.nombre} (ejecutivo)`);
      }
    }
    if (sinPrecio.length > 0) {
      toast.error(`Falta el precio de: ${sinPrecio.join(', ')}`);
      return;
    }

    setGuardando(true);
    try {
      /*
        POST, no PUT. El backend expone `POST /operacion/menu-dia` y no tiene
        ningún PUT: con PUT esta pantalla nunca pudo guardar, tiraba 404 en cada
        intento y el error salía como "No se pudo guardar el menú del día".
      */
      await api.post('/operacion/menu-dia', {
        items: items.map((item) => {
          const sale = item.en_economico || item.en_ejecutivo;
          const economico = parseLocalizedAmount(item.precio_economico_hoy, 0);
          const ejecutivo = parseLocalizedAmount(item.precio_ejecutivo_hoy, 0);
          return {
            ...item,
            disponible_hoy: sale ? 1 : 0,
            /*
              `tipo_hoy` guarda una sola porción y se sigue mandando por
              compatibilidad con lo que ya lee ese campo. Cuando el plato está
              en las dos columnas, la verdad completa está en los dos precios.
            */
            tipo_hoy: item.en_ejecutivo && !item.en_economico ? 'ejecutivo' : 'economico',
            /*
              `precio_hoy` no es un campo más: el backend lo escribe en
              `productos.precio`, que es el precio base del plato en el TPV y
              en la web.

              Esta pantalla no tiene un campo "precio_hoy" —tiene los dos
              tamaños— así que mandaba cero y cada guardado le borraba el
              precio al plato. Se manda el precio de la porción chica, que es
              la que hace de precio de lista; si hoy sólo se vende la grande,
              esa. Y si el plato no sale hoy, se deja el que ya tenía.
            */
            precio_hoy: sale ? economico || ejecutivo : parseLocalizedAmount(item.precio_hoy, 0),
            precio_economico_hoy: item.en_economico ? economico : 0,
            precio_ejecutivo_hoy: item.en_ejecutivo ? ejecutivo : 0,
          };
        }),
      });
      toast.success('Menú del día guardado');
      cargar();
    } catch (error) {
      toast.error(error?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-[13px] text-gray-500">
        <Loader2 size={16} className="animate-spin" />
        Cargando el menú de hoy…
      </div>
    );
  }

  const Tarjeta = ({ item, columna }) => {
    const enColumna = columna !== 'repertorio';
    const enLasDos = item.en_economico && item.en_ejecutivo;
    const seArrastra = arrastrando === item.id;
    const destacado = Number(item.destacado_hoy) === 1;
    const config = COLUMNAS.find((c) => c.id === columna);
    const listaColumna = porColumna[columna] || [];
    const posicion = listaColumna.findIndex((producto) => producto.id === item.id);
    const otraColumna = enColumna ? OTRA_COLUMNA[columna] : null;
    const yaEstaEnOtra = otraColumna ? item[CAMPO_FLAG[otraColumna]] : false;

    return (
      <div
        /*
          `listitem` y no un botón: adentro tiene campos y botones propios.
          Envolverla en algo clickeable les robaría los clics al precio y a las
          guarniciones.

          `data-item` es lo que lee `document.elementFromPoint()` para saber
          sobre qué tarjeta se soltó el dedo.
        */
        role="listitem"
        data-item={item.id}
        className={`group rounded-xl border bg-white transition ${
          seArrastra ? 'border-gray-300 opacity-40' : 'border-gray-200/90 hover:border-gray-300'
        } ${enColumna ? 'px-2.5 py-2' : 'px-2 py-1.5'}`}
      >
        <div className="flex items-start gap-1.5">
          {/*
            El agarre, y sólo el agarre, arrastra. Si arrastrara la tarjeta
            entera, tocar el precio para escribirlo movería el plato de columna.

            `touch-none` es obligatorio: sin eso, en un celular el navegador
            interpreta el gesto como scroll y se lleva la página en vez de la
            tarjeta.
          */}
          <span
            onPointerDown={(evento) => alBajarPuntero(evento, item.id, columna)}
            onPointerMove={alMoverPuntero}
            onPointerUp={alSoltarPuntero}
            onPointerCancel={alSoltarPuntero}
            role="button"
            tabIndex={-1}
            aria-label={`Arrastrar ${item.nombre}`}
            className="-m-1 mt-px shrink-0 cursor-grab touch-none p-1 text-gray-300 transition group-hover:text-gray-400 active:cursor-grabbing"
            title="Arrastrar"
          >
            <GripVertical size={14} strokeWidth={STROKE} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                {/* El ícono de la columna repetido chico: de un vistazo se ve
                    en qué porción está cada plato, aun con la vista scrolleada. */}
                <config.icono
                  size={13}
                  strokeWidth={STROKE}
                  className={`${config.tinta} shrink-0`}
                  aria-hidden="true"
                />
                <p
                  className={`truncate leading-snug text-gray-900 ${
                    enColumna ? 'text-[13px] font-medium' : 'text-[13px]'
                  }`}
                >
                  {item.nombre}
                </p>
                {/*
                  Un puntito del color de la otra columna: dice "este plato
                  también sale en la otra porción" sin gastar un renglón.
                */}
                {enLasDos && enColumna ? (
                  <span
                    title={`También sale como ${OTRA_COLUMNA[columna]}`}
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      COLUMNAS.find((c) => c.id === OTRA_COLUMNA[columna]).fondo
                    } ring-1 ring-inset ring-black/10`}
                  />
                ) : null}
              </div>

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => cambiar(item.id, 'destacado_hoy', destacado ? 0 : 1)}
                  title="Destacado en la web"
                  className={`rounded-lg p-1 transition ${
                    destacado
                      ? 'text-amber-500'
                      : 'text-transparent group-hover:text-gray-300 hover:!text-gray-500'
                  }`}
                >
                  <Star size={15} strokeWidth={STROKE} fill={destacado ? 'currentColor' : 'none'} />
                </button>
                {enColumna ? (
                  <button
                    type="button"
                    onClick={() => sacarDe(item.id, columna)}
                    title="Sacar de esta columna"
                    className="rounded-lg p-1 text-transparent transition group-hover:text-gray-300 hover:!text-gray-600"
                  >
                    <X size={15} strokeWidth={STROKE} />
                  </button>
                ) : null}
              </div>
            </div>

            {enColumna ? (
              <>
                {/*
                  El precio, sin caja. Es un input de verdad, pero se ve como el
                  número grande que es: se escribe encima. El subrayado aparece
                  al enfocarlo, que es cuando hace falta saber dónde estás
                  escribiendo.
                */}
                <div className="mt-1.5 flex items-baseline gap-0.5">
                  <span
                    className="text-[15px] font-bold leading-none"
                    style={{ color: BRAND }}
                    aria-hidden="true"
                  >
                    $
                  </span>
                  <input
                    value={item[CAMPO_PRECIO[columna]] || ''}
                    onChange={(evento) =>
                      cambiar(item.id, CAMPO_PRECIO[columna], evento.target.value)
                    }
                    placeholder="0"
                    inputMode="decimal"
                    aria-label={`Precio ${columna} de ${item.nombre}`}
                    style={{ color: BRAND }}
                    className="w-full border-0 border-b border-transparent bg-transparent p-0 text-[19px] font-bold leading-none tracking-tight tabular-nums outline-none transition placeholder:text-gray-300 focus:border-gray-300"
                  />
                </div>

                {(guarnicionesDisponibles.length > 0 ||
                  datos?.extraPostrePrecio ||
                  datos?.extraBebidaPostrePrecio) && (
                  <div className="mt-2 space-y-1 border-t border-gray-100 pt-1.5">
                    {/*
                      Las guarniciones como texto corrido y no como grilla de
                      chips: quince botones grises pesan más que el precio.
                      Las elegidas van en negro, las demás en gris.
                    */}
                    {guarnicionesDisponibles.length > 0 ? (
                      <p className="text-[11px] leading-relaxed">
                        <Salad
                          size={11}
                          strokeWidth={STROKE}
                          className="mr-1 inline-block -translate-y-px text-emerald-500"
                          aria-hidden="true"
                        />
                        {guarnicionesDisponibles.map((guarnicion, indice) => {
                          const elegida = (item.guarniciones_hoy || []).includes(guarnicion);
                          return (
                            <Fragment key={guarnicion}>
                              {indice > 0 ? <span className="text-gray-300"> · </span> : null}
                              <button
                                type="button"
                                onClick={() => toggleGuarnicion(item.id, guarnicion)}
                                className={`transition ${
                                  elegida
                                    ? 'font-medium text-gray-900'
                                    : 'text-gray-400 hover:text-gray-600'
                                }`}
                              >
                                {guarnicion}
                              </button>
                            </Fragment>
                          );
                        })}
                      </p>
                    ) : null}

                    <p className="text-[11px] leading-relaxed">
                      <IceCream
                        size={11}
                        strokeWidth={STROKE}
                        className="mr-1 inline-block -translate-y-px text-pink-400"
                        aria-hidden="true"
                      />
                      {[
                        ['ofrece_postre_hoy', 'Postre', datos?.extraPostrePrecio],
                        [
                          'ofrece_bebida_postre_hoy',
                          'Postre + bebida',
                          datos?.extraBebidaPostrePrecio,
                        ],
                      ].map(([campo, etiqueta, precio], indice) => {
                        const puesto = Number(item[campo]) === 1;
                        return (
                          <Fragment key={campo}>
                            {indice > 0 ? <span className="text-gray-300"> · </span> : null}
                            <button
                              type="button"
                              onClick={() => cambiar(item.id, campo, puesto ? 0 : 1)}
                              className={`transition ${
                                puesto
                                  ? 'font-medium text-gray-900'
                                  : 'text-gray-400 hover:text-gray-600'
                              }`}
                            >
                              {etiqueta}
                              {precio ? (
                                <span className="font-normal text-gray-400"> {fmt(precio)}</span>
                              ) : null}
                              {/*
                                Si el precio del extra está en cero se regala.
                                Vale más avisarlo acá que descubrirlo en la caja.
                              */}
                              {puesto && !precio ? (
                                <span className="text-amber-600"> · sin precio</span>
                              ) : null}
                            </button>
                          </Fragment>
                        );
                      })}
                    </p>
                  </div>
                )}
              </>
            ) : null}

            {enColumna ? (
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-1.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={posicion <= 0}
                    onClick={() => moverEn(columna, item.id, -1)}
                    aria-label={`Subir ${item.nombre} en ${config.titulo}`}
                    title="Subir"
                    className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <ChevronUp size={15} strokeWidth={STROKE} />
                  </button>
                  <button
                    type="button"
                    disabled={posicion < 0 || posicion >= listaColumna.length - 1}
                    onClick={() => moverEn(columna, item.id, 1)}
                    aria-label={`Bajar ${item.nombre} en ${config.titulo}`}
                    title="Bajar"
                    className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-25"
                  >
                    <ChevronDown size={15} strokeWidth={STROKE} />
                  </button>
                </div>
                {!yaEstaEnOtra ? (
                  <button
                    type="button"
                    onClick={() => ponerEn(item.id, otraColumna)}
                    className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600 transition hover:bg-gray-200"
                  >
                    También en {COLUMNAS.find((c) => c.id === otraColumna)?.titulo}
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => ponerEn(item.id, 'economico')}
                  className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                  + Económico
                </button>
                <button
                  type="button"
                  onClick={() => ponerEn(item.id, 'ejecutivo')}
                  className="rounded-lg bg-indigo-50 px-2 py-1.5 text-[10px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  + Ejecutivo
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const totalHoy = porColumna.economico.length + porColumna.ejecutivo.length;

  return (
    <div className="mx-auto max-w-6xl pb-16 pt-2">
      {/* ── Cabecera. Guardar vive acá, no en una barra que tape el pie. ── */}
      <div className="sticky top-0 z-10 -mx-2 mb-4 bg-gray-50/95 px-2 pb-3 pt-2 backdrop-blur">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[12px] text-gray-400">{datos?.fecha}</p>
            <h1 className="text-[22px] font-semibold tracking-tight text-gray-900">Menú del día</h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[22px] font-semibold leading-none tabular-nums text-gray-900">
                {totalHoy}
              </p>
              <p className="mt-1 text-[11px] text-gray-400">plato{totalHoy === 1 ? '' : 's'} hoy</p>
            </div>
            <button
              type="button"
              onClick={() => setNuevoAbierto(true)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              <Plus size={15} strokeWidth={STROKE} />
              Nuevo plato
            </button>
            <button
              type="button"
              onClick={() => setConfigAbierta(true)}
              title="Precios base, extras y guarniciones"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition hover:text-gray-600"
            >
              <Settings2 size={15} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              onClick={cargar}
              title="Recargar"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 transition hover:text-gray-600"
            >
              <RefreshCw size={15} strokeWidth={STROKE} />
            </button>
            <button
              type="button"
              disabled={guardando}
              onClick={guardar}
              className="inline-flex h-10 items-center gap-2 rounded-xl px-5 text-[13px] font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
              style={{ backgroundColor: BRAND }}
            >
              {guardando ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Save size={15} strokeWidth={STROKE} />
              )}
              Guardar
            </button>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-200/90 bg-white px-6 py-16 text-center">
          <UtensilsCrossed size={30} className="mx-auto text-gray-300" strokeWidth={1.6} />
          <p className="mt-3 text-[15px] font-semibold text-gray-900">
            Todavía no hay platos en el repertorio
          </p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-gray-500">
            Creá el primer plato y después elegí en qué tamaño sale hoy.
          </p>
          <button
            type="button"
            onClick={() => setNuevoAbierto(true)}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-[12px] font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            <Plus size={15} strokeWidth={STROKE} />
            Crear plato
          </button>
        </div>
      ) : (
        <div className="grid items-start gap-3 md:grid-cols-[0.85fr_1fr_1fr]">
          {COLUMNAS.map((columna) => {
            const lista = porColumna[columna.id];
            const encima = columnaEncima === columna.id && arrastrando;
            const esRepertorio = columna.id === 'repertorio';

            return (
              <section
                key={columna.id}
                role="list"
                /*
                  `data-columna` es lo que lee `document.elementFromPoint()` al
                  soltar. El área de soltar es la columna entera, no sólo las
                  tarjetas: con el dedo, apuntar a un hueco de 20 píxeles entre
                  dos tarjetas es imposible.

                  `min-h` para que una columna vacía siga siendo un blanco
                  grande donde soltar.
                */
                data-columna={columna.id}
                className={`min-h-[120px] rounded-2xl border border-dashed p-1.5 transition ${
                  encima ? columna.soltando : 'border-transparent'
                }`}
              >
                <header className="flex items-center justify-between gap-2 px-1 pb-2 pt-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${columna.fondo} ${columna.tinta}`}
                    >
                      <columna.icono size={15} strokeWidth={STROKE} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2
                        className={`text-[13px] font-semibold leading-tight ${
                          esRepertorio ? 'text-gray-600' : 'text-gray-900'
                        }`}
                      >
                        {columna.titulo}
                      </h2>
                      <p className="text-[10px] leading-tight text-gray-400">{columna.meta}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${columna.chip}`}
                  >
                    {lista.length}
                  </span>
                </header>

                <div className="space-y-2" role="list">
                  {lista.map((item) => (
                    <Tarjeta key={`${columna.id}-${item.id}`} item={item} columna={columna.id} />
                  ))}
                  {lista.length === 0 ? (
                    <div
                      className={`flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-3 py-7 text-center text-[11px] transition ${
                        encima
                          ? `${columna.soltando} ${columna.tinta}`
                          : 'border-gray-200 text-gray-400'
                      }`}
                    >
                      <columna.icono size={18} strokeWidth={1.6} aria-hidden="true" />
                      {esRepertorio ? 'Todo está a la venta hoy' : 'Soltá un plato acá'}
                    </div>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/*
        ── El fantasma ────────────────────────────────────────────────────────

        La etiqueta que sigue al dedo mientras se arrastra.

        Con mouse el navegador dibujaba solo una miniatura translúcida; con
        eventos de puntero eso no existe y hay que hacerlo. No es decoración:
        sin nada que se mueva, en un celular parece que la pantalla se colgó y
        uno suelta el dedo.

        `pointer-events-none` para que no se tape a sí mismo cuando
        `elementFromPoint` pregunta qué hay debajo.
      */}
      {posicionPuntero && itemArrastrado ? (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-[13px] font-medium text-gray-900 shadow-lg"
          style={{ left: posicionPuntero.x, top: posicionPuntero.y }}
        >
          {itemArrastrado.nombre}
        </div>
      ) : null}

      {configAbierta ? (
        <ConfigMenuDiaModal
          config={{
            precioEconomico: datos?.precioSugeridoEconomico ?? 5000,
            precioEjecutivo: datos?.precioSugeridoEjecutivo ?? 7000,
            extraPostrePrecio: datos?.extraPostrePrecio ?? 1000,
            extraBebidaPostrePrecio: datos?.extraBebidaPostrePrecio ?? 1000,
            guarnicionesLista: datos?.guarnicionesLista || [],
          }}
          onClose={() => setConfigAbierta(false)}
          onSaved={cargar}
        />
      ) : null}

      {nuevoAbierto ? (
        <NuevoPlatoModal
          menuDia={datos || {}}
          onClose={() => setNuevoAbierto(false)}
          onCreado={cargar}
        />
      ) : null}
    </div>
  );
}

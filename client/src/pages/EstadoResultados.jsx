import { useCallback, useEffect, useState } from 'react';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import { AlertTriangle, Loader2, TrendingDown, TrendingUp } from 'lucide-react';

import api from '../lib/api.js';
import { BRAND, STROKE } from '../lib/theme.js';

/**
 * Estado de resultados: si el negocio gana plata.
 *
 * ── Lo que esta pantalla NO hace ───────────────────────────────────────────
 *
 * No muestra un resultado lindo cuando no puede calcularlo.
 *
 * Vender no es ganar: la cuenta es ventas menos costos menos gastos. Si los
 * productos no tienen costo cargado, el costo da cero y el reporte diría que se
 * gana el 100% de lo que se vende. Ese número le puede hacer bajar un precio a
 * alguien creyendo que hay margen de sobra.
 *
 * Por eso lo primero que se ve, cuando la cobertura es baja, es el aviso —y la
 * lista de qué cargar para que el reporte empiece a servir—. El resultado queda
 * abajo y atenuado.
 *
 * Es preferible una pantalla que dice "todavía no puedo saberlo" a una que
 * miente con seguridad.
 */

const fmt = (n) => `$${Number(n || 0).toLocaleString('es-AR')}`;

function Linea({ etiqueta, valor, resta = false, ayuda = '' }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-[13px] text-gray-700">{etiqueta}</p>
        {ayuda ? <p className="text-[11px] leading-tight text-gray-400">{ayuda}</p> : null}
      </div>
      <p
        className={`shrink-0 text-[15px] font-semibold tabular-nums ${
          resta ? 'text-gray-500' : 'text-gray-900'
        }`}
      >
        {resta ? '−' : ''}
        {fmt(valor)}
      </p>
    </div>
  );
}

export default function EstadoResultados() {
  const hoy = new Date();
  const [desde, setDesde] = useState(format(subDays(hoy, 29), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(hoy, 'yyyy-MM-dd'));
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await api.get(`/reportes/resultados?desde=${desde}&hasta=${hasta}`));
    } catch (error) {
      toast.error(error?.error || 'No se pudo calcular el resultado');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cobertura = data?.cobertura;
  const confiable = cobertura?.confiable === true;
  const gana = Number(data?.resultado || 0) >= 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16 pt-2">
      <div className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
        <h1 className="text-[19px] font-semibold tracking-tight text-gray-900">
          Estado de resultados
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
          Vender no es ganar. Acá se descuenta lo que costó lo que vendiste, los gastos y lo que se
          tiró.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="date"
            value={desde}
            onChange={(evento) => setDesde(evento.target.value)}
            className="h-10 rounded-xl border border-gray-200 px-3 text-[13px] outline-none focus:border-gray-400"
          />
          <input
            type="date"
            value={hasta}
            onChange={(evento) => setHasta(evento.target.value)}
            className="h-10 rounded-xl border border-gray-200 px-3 text-[13px] outline-none focus:border-gray-400"
          />
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-gray-500">
          <Loader2 size={16} className="animate-spin" />
          Calculando…
        </div>
      ) : (
        <>
          {/*
            El aviso va PRIMERO cuando el dato no es confiable. Si estuviera
            abajo, el ojo iría al número grande y el aviso sería decoración.
          */}
          {!confiable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900">
                    Este resultado todavía no es confiable
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-gray-700">
                    Sólo el <span className="font-semibold">{cobertura?.porcentaje || 0}%</span> de
                    lo que vendiste tiene el costo cargado. Lo demás figura con costo cero, así que
                    la ganancia que ves de abajo está inflada en{' '}
                    <span className="font-semibold">{fmt(cobertura?.ventas_sin_cubrir)}</span> como
                    mínimo.
                  </p>

                  {cobertura?.productos_sin_costo?.length ? (
                    <>
                      <p className="mt-3 text-[12px] font-medium text-gray-600">
                        Cargales el costo a estos y el reporte empieza a servir:
                      </p>
                      <div className="mt-1.5 space-y-1">
                        {cobertura.productos_sin_costo.map((p) => (
                          <div
                            key={p.nombre}
                            className="flex items-baseline justify-between gap-3 rounded-lg bg-white/70 px-2.5 py-1.5"
                          >
                            <span className="truncate text-[12px] text-gray-800">{p.nombre}</span>
                            <span className="shrink-0 text-[12px] tabular-nums text-gray-500">
                              vendió {fmt(p.venta)}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                        Están ordenados por cuánto venden: el de arriba es el que más cambia el
                        número.
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-gray-200/80 bg-white p-5 sm:p-6">
            <Linea
              etiqueta="Ventas"
              valor={data?.ventas}
              ayuda={`${data?.pedidos || 0} pedidos · sin contar propinas`}
            />
            <div className="border-t border-gray-100">
              <Linea
                etiqueta="Costo de lo vendido"
                valor={data?.costo_vendido}
                resta
                ayuda={
                  confiable
                    ? undefined
                    : `Sólo cubre el ${cobertura?.porcentaje || 0}% de las ventas`
                }
              />
              <Linea etiqueta="Gastos" valor={data?.gastos} resta ayuda="Egresos de caja" />
              <Linea
                etiqueta="Mermas"
                valor={data?.mermas}
                resta
                ayuda="Lo que se tiró, a precio de costo"
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-4 border-t-2 border-gray-900 pt-3">
              <div>
                <p className="text-[15px] font-semibold text-gray-900">Resultado</p>
                <p className="text-[11px] text-gray-400">
                  {data?.margen_porcentaje}% de lo vendido
                </p>
              </div>
              <p
                className={`flex items-center gap-1.5 text-[26px] font-bold tabular-nums ${
                  confiable ? '' : 'opacity-40'
                }`}
                style={{ color: gana ? '#047857' : BRAND }}
              >
                {gana ? (
                  <TrendingUp size={20} strokeWidth={STROKE} />
                ) : (
                  <TrendingDown size={20} strokeWidth={STROKE} />
                )}
                {fmt(data?.resultado)}
              </p>
            </div>

            {!confiable ? (
              <p className="mt-2 text-right text-[11px] text-gray-400">
                Atenuado porque el dato está incompleto
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

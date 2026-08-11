# Auditoría del módulo de Empleados

7 de agosto de 2026 · `server/routes/personal.js` (2.696 líneas),
`server/services/personalService.js` (736), `client/src/pages/Personal/` (25
archivos), 11 tablas.

Cada hallazgo está reproducido, no deducido. Lo que no pude probar lo digo.

---

## Lo primero: lo que está bien

Vale decirlo porque acota dónde mirar.

**La liquidación —el camino que mueve plata de verdad— está sana.** Revisé
`createLiquidacion` línea por línea: el monto base, el bruto, los pendientes
que se descuentan y el neto trabajan todos en centavos, sin mezclas. Los
movimientos se aplican en orden de antigüedad, el saldo restante se recalcula
bien, y todo va adentro de una transacción con `ROLLBACK`. Si algo falla a
mitad de camino no queda una liquidación a medias.

**La fecha operativa de la asistencia también.** `getOperationalShiftContext`
usa `America/Argentina/Buenos_Aires` de verdad, y contempla el turno que cruza
la medianoche: si son las 00:30 y el turno noche todavía está abierto, la
marca se guarda en el día anterior. Eso está bien pensado.

**Los campos de plata de las liquidaciones y los movimientos** —`monto_base`,
`monto_bruto`, `total_adelantos`, `total_descuentos`, `total_consumos`,
`monto_neto`, `saldo_pendiente`, `neto_sugerido_base`— los reconoce todos el
conversor. Varios se agregaron a mano en sesiones anteriores y quedaron bien.

---

## 1. Las fechas por defecto salen en UTC · **te pasa todas las noches**

`personal.js` es el único módulo operativo que nunca adoptó `fechaLocal`. Cero
usos. En cambio tiene 15 `toISOString()`, y cinco de ellos son valores por
defecto de fecha:

| Línea | Dónde                                                  |
| ----- | ------------------------------------------------------ |
| 1542  | `/asistencia/analitica` — desde y hasta                |
| 1555  | `/asistencia/planilla-semanal` — arranque de la semana |
| 1928  | fecha de inicio de un objetivo                         |
| 2203  | fecha de ingreso al dar de alta a alguien              |
| 517   | próximo cumpleaños                                     |

`toISOString()` devuelve el día **en UTC**. El servidor corre en UTC en
Railway. Tucumán es UTC−3. Reproducido:

```
Hora real en el local : 06/08 21:30
Día del negocio       : 2026-08-06
isoDate() de personal : 2026-08-07   <- un día adelantado
```

Todas las noches, **de las 21:00 en adelante**, la planilla semanal arranca en
el día equivocado y la analítica de asistencia te muestra el día siguiente —
que está vacío. Justo el horario en el que estás mirando quién fichó.

Es exactamente el mismo error que ya se corrigió en los reportes de ventas.
Este módulo quedó afuera de aquella pasada.

**Arreglo:** cambiar `isoDate()` por la fecha de negocio, que ya existe y ya
está bien resuelta en `getBusinessDateParts`.

---

## 2. Un ascenso divide el sueldo por 100 · **está roto, pero nadie lo usa hoy**

`POST /api/personal/:id/ascenso` está vivo y con permiso. El servicio hace:

```js
UPDATE personal SET categoria_id = ?, monto_base = ?   // ← data.sueldo_nuevo
```

`monto_base` es una columna en centavos. Pero `sueldo_nuevo` no es un nombre
que el conversor reconozca como plata, así que el valor entra **sin
convertir**, en pesos. Reproducido con el módulo real:

```
── Camino A: editar el sueldo desde la ficha (funciona) ──
  el panel manda  monto_base: 450000  (=$450.000)
  llega a la base : 45000000 centavos
  se lee de vuelta: 450000 → $450.000  OK

── Camino B: POST /:id/ascenso (roto) ──
  se manda    sueldo_nuevo: 450000  (=$450.000)
  llega como  sueldo_nuevo: 450000   <- sin convertir
  se lee de vuelta: 4500 → $4.500  ROTO
```

Un ascenso le deja el sueldo en la centésima parte.

**Por qué no te está pasando:** ninguna pantalla llama a ese endpoint. La
pestaña Trayectoria sólo muestra el historial. Busqué en todo el cliente y no
hay un solo `fetch` al ascenso. La ruta existe, funciona y está mal.

Peor detalle del mismo lugar: en la misma fila del historial, `sueldo_anterior`
se guarda en centavos (viene de `personal.monto_base`) y `sueldo_nuevo` en
pesos. Dos unidades distintas en dos columnas contiguas de la misma tabla.

---

## 3. Un contador que se muestra como plata

`total_liquidaciones` se incrementa de a uno:

```js
UPDATE personal SET total_liquidaciones = total_liquidaciones + 1
```

Es la cantidad de liquidaciones que se le hicieron a alguien. Pero el nombre
contiene "total", y el conversor toma "total" como señal de plata:

```
lo que sale del SQL : {"total_liquidaciones":3}
lo que ve la pantalla: {"total_liquidaciones":0.03}
```

Alguien con 3 liquidaciones sale como 0,03. Hoy no se ve porque ninguna
pantalla lo muestra, pero la API ya miente.

**Arreglo:** meterlo en `EXCLUDED_KEYS`, donde ya están `total_pedidos` y
`total_clientes` por la misma razón.

---

## 4. Cuatro columnas que la migración llama plata y el conversor no

`migrations.js` tiene una lista de columnas de plata para pasar a centavos.
Cuatro de ellas son de este módulo:

- `personal_categorias.sueldo_base_minimo`
- `personal_carrera_historial.sueldo_anterior`
- `personal_carrera_historial.sueldo_nuevo`
- `personal_reconocimientos_config.recompensa_canje_pesos`

Ninguna de las cuatro la reconoce `isMoneyKey`. Están declaradas como plata en
un lado y tratadas como número común en el otro.

Hoy eso no rompe nada por casualidad: como tampoco se convierten al entrar,
entran y salen en pesos, y quedan consistentes consigo mismas. El problema es
que son las únicas cuatro columnas de plata del sistema que viven en pesos, y
cualquier cuenta que las mezcle con una columna en centavos —comparar el
sueldo de alguien contra el mínimo de su categoría, por ejemplo— da 100 veces
mal. El bug del punto 2 es justamente eso pasando.

**Nota importante:** la migración las multiplica por 100 **sólo si la columna
es REAL**. En el esquema actual son INTEGER, así que en una base nueva no se
ejecuta. En la base de producción, que es más vieja, **no pude verificar qué
pasó** — la base local del repo está vacía. Antes de tocar esto conviene mirar
un valor real de `personal_reconocimientos_config`: si dice `5000` es pesos, si
dice `500000` es centavos.

---

## 5. Todo el módulo está detrás de un solo permiso

Las 35 rutas usan `config.manage`. No existe ningún permiso `personal.*` en el
catálogo.

Consecuencia práctica: **no podés darle la planilla de asistencia a un
encargado sin darle también los sueldos**, las liquidaciones, los adelantos y
la configuración entera del sistema. Y al revés: quien tenga que tocar
cualquier configuración ve lo que cobra cada uno.

No es un agujero —está autenticado y con permiso— pero es la clase de cosa que
termina en que alguien comparte una contraseña.

---

## 6. El reloj de fichaje: PIN de 4 dígitos sin freno propio

`GET /clock/board` y `POST /clock/mark` no tienen `auth`, y está bien: es un
kiosco, tiene que funcionar sin sesión.

Pero el PIN son 4 dígitos (`1000 + random * 9000`), o sea 9.000 combinaciones,
y el único freno es el limitador general de 180 requests por minuto. Probarlas
todas lleva menos de una hora.

El daño posible es chico: marcar entrada o salida en nombre de otro. Igual
conviene un límite propio por empleado —cinco intentos fallidos y espera— que
es barato de hacer.

Un detalle a favor: si viene `token`, no se pide PIN, y el token son 12 bytes
al azar. El link personal es seguro; el PIN es el eslabón flojo.

---

## Qué haría, en orden

1. **Las fechas** (punto 1). Es lo único que te está molestando hoy, todas las
   noches, y el arreglo es mecánico: la función correcta ya existe.
2. **`total_liquidaciones` a `EXCLUDED_KEYS`** (punto 3). Dos líneas.
3. **El ascenso** (punto 2). O se arregla la unidad, o se borra la ruta: lleva
   un año sin pantalla que la llame.
4. **Mirar el dato real de las cuatro columnas** (punto 4) antes de decidir
   nada. Acá ya me equivoqué una vez este mes: inventé una migración de
   `extras` a centavos razonando desde el código, y los datos reales decían lo
   contrario. No repito el error.
5. **Un permiso `personal.view`** separado de `config.manage` (punto 5), cuando
   haya tiempo.
6. **Límite de intentos en el PIN** (punto 6).

Los puntos 1, 2 y 3 los puedo hacer ahora con un test que los cubra. Decime.

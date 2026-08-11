# Prompt para Claude CLI — cuándo se cobra cada pedido

> Un commit. **Cambia lo que ves durante el servicio**: leé la nota del final
> antes de deployar.
>
> **Atención:** en el repo hay además cambios sin commitear de otra tanda —la
> auditoría de Empleados: `server/routes/personal.js`, `server/utils/fechaLocal.js`,
> `server/utils/moneyConversion.js`, `server/tests/utils/camposDePlata.test.js`,
> `server/tests/utils/personal.test.js`. **Esos no van en este commit.** Por eso
> abajo se nombra archivo por archivo y no se usa `git add -A`.

Copiá desde acá abajo.

---

Trabajás en `D:\Proyectos\modosabor1`, el sistema de un restaurante en
producción. Si un paso falla, **pará y contame** con el error completo.

## Qué se hizo

### El problema

En la app del repartidor, un pedido en viaje se veía así: **"Efectivo ·
Cobrado"**, con el cartel verde de "Ya cobrado $8.000", y ningún botón para
corregirlo. Pero nadie había cobrado nada: el pedido todavía estaba a mitad de
camino.

La causa era una sola regla: _"si el pedido lo cargó alguien del local, ya está
cobrado"_. Se probó y daba esto:

```
tpv + efectivo       -> pagado
tpv + transferencia  -> pagado
```

Elijas lo que elijas, salía cobrado. Esa regla está pensada para el mostrador
—cobrás y entregás— y nadie la revisó para los otros casos.

Consecuencias:

- **El cierre de caja repartía mal.** Reparte efectivo contra digital según el
  método de cada pedido cobrado. Si el cliente terminaba pagando distinto de lo
  que se supuso al cargar, el reparto salía mal. El efectivo que se le pide
  rendir al repartidor sale de esa misma cuenta.

- **El repartidor no podía corregirlo.** El selector de forma de pago de la app
  aparece cuando el cobro figura pendiente. Como nunca lo estaba, sólo se le
  abría una ventana de cinco minutos después de marcar entregado.

- **Las mesas contaban plata que no había entrado.** El pedido se marcaba
  cobrado al mandarlo a cocina. La precuenta que imprime este mismo sistema es
  la prueba de que todavía no pagaron.

### Cómo lo resuelven los sistemas del rubro

Se buscó documentación real antes de decidir.

[Toast](https://support.toasttab.com/en/article/Check-Status-and-Sorting-Checks)
define la comanda abierta como _"check activo, sin pagos aplicados, con saldo
pendiente"_: un pedido puede estar hecho, servido y comido sin tener un peso
encima. No existe el "nace cobrado" para servicio de mesa.

[Fudo](https://soporte.fu.do/es/articles/12608407-mostrador-express), que es
argentino, separa los dos modos: **cuentas abiertas por mesa** para el salón, y
**Mostrador Express** para "tomar pedidos y cobrar sin necesidad de usar
mesas".

O sea: el corte no es entre "lo cargó el local" y "lo cargó el cliente", sino
entre **el pedido que se despacha antes de cobrar** y el que no.

### El cambio

**`delivery` y `mesa` nacen pendientes de cobro. `retiro` —que en Modo Sabor es
el mostrador— sigue naciendo cobrado.**

De ahí se desprende el resto:

1. **El repartidor ve el selector durante todo el viaje**, no cinco minutos
   después de entregar. Al marcar entregado se salda solo, con el método que él
   haya dejado puesto. Esa lógica ya existía; no hubo que agregarla.

2. **La pantalla de Mesas tiene botón de cobrar.** Antes tenía precuenta y nada
   más. Sin este botón el cambio era peor que el problema: habría que ir hasta
   Pedidos a cerrar cada mesa a mano en pleno servicio. El botón abre un
   selector de medio de pago —un toque, sin confirmar— porque **cobrar y decir
   con qué se cobró son el mismo gesto**. Si ya está cobrada queda el cartel
   verde sin botón. Si el usuario no tiene `pedidos.edit` ve "Sin cobrar $X" en
   vez del botón, para que avise a quien sí puede en vez de comerse un error.

3. **`PUT /pedidos/:id/pago` acepta el método además del estado.** Antes sólo
   el estado, así que una mesa se cobraba arrastrando lo que se había supuesto
   al cargar el pedido. El campo es opcional: las llamadas viejas siguen
   andando igual.

4. **Cerrar una mesa ya no la da por cobrada.** Este era el agujero grande. El
   botón "Cerrar" pone el pedido en entregado, y eso disparaba el saldado
   automático: el mozo cerraba la mesa y el sistema la daba por cobrada con el
   método adivinado. El mismo error entrando por la puerta de atrás. Para el
   delivery el saldado automático está bien —el repartidor tiene la plata en la
   mano—; para una mesa, cerrar es liberar el lugar, no cobrar.

### Cómo se verificó

Los dos tests nuevos se validaron **reintroduciendo cada error de a uno**. Los
agarran a todos:

```
Cobro de delivery
  1. Vuelve la regla vieja                          AGARRADO
  2. Las mesas vuelven a nacer cobradas             AGARRADO
  3. El mostrador se cuela como cobro diferido      AGARRADO
  4. No se salda al entregar                        AGARRADO
  5. La mesa vuelve a saldarse al cerrarse          AGARRADO
  6. El dato no llega a los pedidos viejos          AGARRADO
  7. El alta deja de pasar el tipo de entrega       AGARRADO

Cobro de mesa
  1. La ruta deja de leer el método del cuerpo      AGARRADO
  2. La ruta deja de guardar el método corregido    AGARRADO
  3. La ruta deja de pasar el tipo de entrega       AGARRADO
```

`cobrarMesa.test.js` además lee `routes/pedidos.js` y verifica que la ruta real
siga aceptando y guardando el método. Sin eso, alguien podía sacar el manejo
del método y el test seguía en verde.

**Lo que NO se probó:** nadie ejecutó el botón de cobrar contra la base. Lint y
build pasan, y eso sólo dice que compila.

## PARTE 1 — Verificación

1. ```
   npm run lint
   npm --prefix server test
   cd client && npm run build && cd ..
   ```

   Esperado: **0 errores** de lint, todos los tests pasando —incluidos
   `cobroDelivery` (16 casos) y `cobrarMesa` (6), los dos nuevos— y build
   limpio.

2. Arranque:
   ```
   cd server
   node -e "require('./index.js')"
   ```
   Cortalo a los pocos segundos. `EADDRINUSE` está bien.

## PARTE 2 — Commits

3. Mirá qué hay dando vueltas antes de tocar nada:

   ```
   git log --oneline -2
   git status --short
   ```

   El último commit tiene que ser `limpieza: sacar codigo muerto...` — esa
   tanda ya entró, no la rehagas. Y en el status van a aparecer, además de los
   archivos de cobros, los de la auditoría de Empleados. **Esos quedan afuera.**

4. **Los cobros** (nombrando cada archivo, para no llevarte lo ajeno):

   ```
   git add server/utils/paymentStatus.js server/services/pedidoService.js server/services/asistenteAcciones.js server/routes/pedidos.js client/src/pages/Mesas.jsx server/tests/utils/cobroDelivery.test.js server/tests/utils/cobrarMesa.test.js
   git commit -F - <<'EOF'
   cobros: un pedido se marca cobrado cuando entra la plata, no al cargarlo

   En la app del repartidor un pedido en viaje decia "Efectivo · Cobrado"
   con el cartel verde de "Ya cobrado", y ningun boton para corregirlo.
   Nadie habia cobrado: el pedido estaba a mitad de camino.

   La regla era "si lo cargo alguien del local, ya esta cobrado". Se probo
   con las dos opciones y daba pagado en las dos, asi que el medio que se
   elegia en el TPV solo cambiaba la etiqueta. Esa regla sirve para el
   mostrador, donde se cobra y despues se entrega, y nadie la reviso para
   los otros casos.

   Rompia tres cosas. El cierre de caja repartia efectivo contra digital
   con un metodo supuesto, y de esa cuenta sale el efectivo que se le pide
   rendir al repartidor. El selector de forma de pago de la app aparece
   cuando el cobro figura pendiente, asi que al repartidor solo se le abria
   una ventana de cinco minutos despues de entregar. Y las mesas contaban
   la plata al mandar el pedido a cocina, cuando la precuenta que imprime
   este mismo sistema es la prueba de que todavia no pagaron.

   Se miro como lo resuelve el rubro antes de decidir. Toast define la
   comanda abierta como "check activo, sin pagos aplicados, con saldo
   pendiente". Fudo separa cuentas abiertas por mesa de Mostrador Express,
   que cobra en el momento. El corte no es quien cargo el pedido: es si se
   despacha antes de cobrar.

   Ahora delivery y mesa nacen pendientes; retiro, que aca es el mostrador,
   sigue naciendo cobrado. El repartidor ve el selector todo el viaje y al
   entregar se salda con el metodo que dejo puesto. La pantalla de Mesas
   tiene boton de cobrar con selector de medio —antes solo precuenta, y sin
   el boton habria que ir hasta Pedidos a cerrar cada mesa a mano en pleno
   servicio—. PUT /pedidos/:id/pago acepta el metodo ademas del estado, en
   un campo opcional que no rompe las llamadas viejas.

   Y cerrar una mesa dejo de darla por cobrada. Ese era el agujero grande:
   el boton Cerrar disparaba el saldado automatico, asi que el mozo cerraba
   la mesa y el sistema la cobraba con el metodo adivinado. Para el
   delivery el saldado automatico esta bien porque el repartidor tiene la
   plata en la mano; para una mesa, cerrar es liberar el lugar.

   Los dos tests se validaron reintroduciendo cada error de a uno: los
   agarran a los diez. cobrarMesa ademas lee routes/pedidos.js y verifica
   que la ruta real siga guardando el metodo, porque sin eso alguien podia
   sacarlo y el test quedaba en verde.

   Verificado: lint 0 errores, build limpio, tests en verde. El boton de
   cobrar no se ejecuto contra la base.
   EOF
   ```

5. ```
   git show --stat HEAD
   git status --short
   ```

   `git show --stat HEAD` tiene que listar **exactamente siete** archivos:
   `paymentStatus.js`, `pedidoService.js`, `asistenteAcciones.js`,
   `pedidos.js`, `Mesas.jsx`, `cobroDelivery.test.js` y `cobrarMesa.test.js`.

   **Si aparece `personal.js`, `moneyConversion.js`, `fechaLocal.js`,
   `camposDePlata.test.js` o `personal.test.js`, se coló trabajo ajeno: pará y
   contame.** Se arregla con `git reset --soft HEAD~1` y volviendo a agregar
   sólo los siete.

   Y en el status tienen que seguir sin commitear los de Empleados. Si es así:

   ```
   git push origin main
   ```

6. ```
   railway status
   curl -s --ssl-no-revoke -o NUL -w "%{http_code}" https://modosabor-api-production.up.railway.app/api/health
   ```

## Lo que NO tenés que hacer

- **No uses `git add -A` ni `git add .`**
- **No borres** `diagnostico-asistente.js` ni `aufitoria kilo`
- **No toques** `server/db/modosabor.db` ni los respaldos de `.tmp/`
- **No corras** `upsertMenuDelDia.js` ni `seedMenuManana.js`
- **No conectes** WhatsApp ni escanees el QR
- **No reescribas** el historial de git

## Al terminar

Contame lint, tests, build y arranque, qué quedó sin commitear, y si el push y
el deploy quedaron verdes.

---

## Nota para hernan, antes de deployar

**Vas a ver cosas distintas durante el servicio, y están bien:**

- Los **delivery en viaje** aparecen como pendientes en la caja hasta que el
  repartidor los entrega. Esa plata todavía no entró.
- Las **mesas ocupadas** aparecen como pendientes hasta que alguien toque
  "Cobrar". Ahí elegís efectivo o transferencia.
- El cierre te va a avisar: _"Hay $X en pedidos sin cobrar. No entran en el
  efectivo"_. Ese cartel ya existía.
- El **mostrador (retiro)** no cambia en nada.

**Lo primero que conviene probar**, en este orden:

1. Cargá un delivery en el TPV y abrí ese pedido en la app del repartidor.
   Tiene que decir **"Medio que usará el cliente"** con los botones, en vez de
   "Ya cobrado".
2. Cambiá el medio desde la app, marcá entregado, y fijate que en la caja caiga
   en la columna que elegiste.
3. Abrí una mesa, cargá algo, y tocá **Cobrar** en la pantalla de Mesas.
4. Cerrá una mesa **sin** cobrarla: tiene que quedar como pendiente en la caja,
   no como cobrada.

El paso 4 es el que más me importa, porque es el agujero que casi se me pasa.

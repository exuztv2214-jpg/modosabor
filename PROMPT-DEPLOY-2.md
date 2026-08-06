Trabajo en Modo Sabor (D:\Proyectos\modosabor1), el sistema del restaurante en Monteros.
Express + better-sqlite3 en /server, React + Vite en /client. Se despliega en Railway
con `git push origin main` (repo exuztv-modosabor/modosabor, proyecto celebrated-smile,
servicio modosabor-api).

Hay una tanda de cambios sin commitear. Ayudame a verificarla y subirla.

## QUÉ SE HIZO (para que entiendas qué estás por subir)

**1. Agujero de seguridad en los precios — es lo más importante de esta tanda.**
El servidor creaba los pedidos públicos con el `precio_unitario` que mandaba el
navegador, sin contrastarlo contra la base. Cualquiera podía editar la petición en
las herramientas del navegador y llevarse la comida por $1. Ahora el precio se arma
en el servidor desde la base (producto + variantes + adicionales) y se validan las
opciones. El TPV queda afuera a propósito, porque está autenticado y necesita cargar
precios a mano. Archivos: server/services/preciosServidor.js (nuevo),
server/services/pedidoService.js. Hay 11 tests en
server/tests/utils/preciosServidor.test.js.

**2. Seguimiento del pedido para el cliente.**
El servidor ya guardaba cada posición del repartidor en `repartidor_ubicaciones_log`
y nadie la mostraba. Ahora el mapa dibuja el camino recorrido, y la línea hasta la
casa sigue las calles en vez de cruzar manzanas. Si el servicio de ruteo no responde,
vuelve solo a la línea recta. Archivos: client/src/lib/rutaCalles.js (nuevo, con 10
tests en rutaCalles.test.mjs), client/src/components/LiveTrackingMap.jsx,
client/src/pages/SeguimientoPedido.jsx, y el endpoint /pedidos/:id/recorrido en
server/routes/pedidos.js.

**3. App del rider.**

- Las horas se mostraban 3 horas adelantadas (mismo bug de UTC de la tanda anterior).
- El rider ahora puede corregir la forma de pago hasta unos minutos DESPUÉS de
  entregar. Antes se bloqueaba al marcar entregado, que es justo cuando el cliente
  dice "te pago por transferencia". Queda auditado quién lo cambió.
- Se corrigió que al cambiar el pago no se actualizaba el historial de la sesión, que
  es de donde sale el efectivo a rendir en el cierre de turno.
- Tipografía: 79 lugares con letra de 9 a 11px subidos a 12-13px.
- El mapa del rider pedía la ruta sin tiempo límite: si el servicio quedaba colgado,
  se quedaba sin ruta y sin línea de respaldo. Ahora usa el helper con timeout.

**4. Peso de la web pública: de 213 KB a 145 KB.**
Layout del panel y los modales de la carta ahora se cargan aparte, y se sacó
framer-motion de la carga inicial. Ojo: al entrar al panel ahora hay un instante de
spinner que antes no estaba — es esperado.

## TAREAS

1. Si aparece un `.git\index.lock` huérfano (de un proceso cortado), verificá que no
   haya git corriendo y borralo.

2. `git add -A` y revisá que no se cuele nada sensible:
   git diff --cached --name-only | Select-String "\.env$|secret|\.pem$|\.key$"
   Si aparece algo, PARÁ y avisame.

3. Corré y mostrame:
   - npm run lint (esperado: 0 errores)
   - npm run build (tiene que compilar limpio)
   - npm --prefix server test
   - node client/src/lib/rutaCalles.test.mjs
     En los tests del servidor esperá 6 pasados y 1 fallado: el que falla es
     `sanitize`, un test desactualizado que ya venía roto. No lo arregles.

4. Commit con este mensaje:

Valida precios en el servidor, mejora el seguimiento y la app del rider

- Seguridad: el pedido publico usaba el precio que mandaba el navegador. Ahora
  se recalcula en el servidor desde la base y se validan variantes y extras.
  El TPV autenticado sigue pudiendo cargar precios a mano.
- Seguimiento: se muestra el recorrido real del repartidor (ya se guardaba en
  la base y no se usaba) y la ruta hasta el domicilio sigue las calles.
- Rider: puede corregir la forma de pago despues de entregar, dentro de la
  ventana de gracia, con auditoria. Se arregla que el cambio no impactaba en
  el efectivo a rendir del cierre de turno.
- Rider: las horas se mostraban 3 horas adelantadas.
- Rider: el mapa pedia la ruta sin tiempo limite y podia quedarse sin ninguna
  linea si el servicio no respondia.
- Web publica: la primera carga baja de 213 KB a 145 KB.

5. PARÁ ACÁ. No hagas push. Levantá `npm run dev` y decime que verifique a mano:
   a) Hacer un pedido desde la web y confirmar que llega bien al panel
   b) En el rider: entregar un pedido y probar cambiar la forma de pago DESPUÉS
   de marcarlo entregado (tiene que dejar, dentro de los 5 minutos)
   c) Cerrar turno y verificar que el efectivo a rendir refleje ese cambio
   d) Abrir el seguimiento de un pedido en camino y ver el recorrido en el mapa
   e) Entrar al panel: va a aparecer un spinner breve al cargar, es normal

6. Cuando te dé el OK: `git push origin main`. Después mostrame los logs del build
   con `railway logs --build`.

## REGLAS

- No hagas push sin mi confirmación.
- No corras `railway up` ni `railway redeploy`: el deploy sale solo con el push.
- No arregles los warnings de lint ni el test de sanitize. No es el objetivo y suma
  riesgo.
- Si algo no coincide con lo que te describí, pará y decímelo en vez de improvisar.

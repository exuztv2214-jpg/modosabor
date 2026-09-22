# Las seis cosas que hay que arreglar — para Codex

Seis problemas reales, ordenados por lo que pasa si no se arreglan. **No es una
lista de deseos: cada uno tiene consecuencia.**

Van en este orden y **con freno entre cada uno**. Pegá el resultado y esperá.

---

## Reglas que valen para todo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Archivo por archivo.
  Si ves un `.sqlite` en verde, **pará y avisá**: en la raíz hay bases de n8n
  con credenciales.
- **No escribas API keys, contraseñas ni certificados en ningún archivo del repo.**
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- **No cambies una aserción para que un test pase.** Si falla por un bug real,
  pará y avisá.
- **No inventes datos.** Si falta un dato, preguntá.

---

## 1. La fuga de datos del agente de WhatsApp · _lo más urgente_

**Qué pasa hoy:** `/api/agente/cliente` acepta cualquier número de teléfono.
Si el modelo se confunde o alguien lo induce, devuelve la ficha de otro
cliente: nombre, teléfono, dirección e historial de pedidos.

**Por qué importa:** es el único problema de seguridad real de todas las
auditorías. No es una molestia de uso, es dato personal de terceros saliendo
por WhatsApp.

**Qué hacer:** el teléfono tiene que salir **del contexto de la conversación**,
nunca de lo que elige el modelo. La herramienta no debería recibir el teléfono
como parámetro en absoluto: debe tomarlo de quién está escribiendo.

1. Buscá la ruta en `server/routes/` y mirá de dónde sale hoy el teléfono.
2. Cambiala para que use el de la conversación en curso.
3. Si por alguna razón hay que aceptarlo como parámetro, **verificá que
   coincida** con el de la conversación y rechazá si no.
4. **Escribí un test** que pruebe que pedir la ficha de otro número falla.
   Después rompé el arreglo a propósito y confirmá que el test se pone en rojo.

**Pegame el diff y el test. Frená.**

---

## 2. Los tests corren contra la base de producción

**Qué pasa hoy:** `npm test` abre `server/data/modosabor.db` — la base real de
la máquina de trabajo. Los tests que insertan están escribiendo datos de
verdad.

**Ya está escrito el plan completo en `PROMPT-CODEX-TESTS.md`.** Seguilo tal
cual: base temporal en `tests/run.js`, fixtures en `tests/fixtures.js`, y los
nueve tests acoplados a datos reales arreglados de a uno.

**No lo rehagas ni lo resumas. Está diagnosticado y medido.**

Cuando termines, **pegame la salida de `npm test` y frená.**

---

## 3. Dejar el CI en verde

Depende del anterior. Cuando los tests corran aislados:

```
git push origin main
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
```

Ya se arreglaron dos causas: las variables del bootstrap y Node 20 → 22.
Si queda algo en rojo, **pegame el principio del log**, no el final:

```
gh run view <run-id> --log-failed | head -80
```

**Frená ahí.**

---

## 4. No hay costos cargados

**Qué pasa hoy:** el estado de resultados informa **0% de cobertura** porque
casi ningún producto tiene costo. Sin costo no hay margen, y sin margen el
número que ves no dice si ganás o perdés — dice cuánto facturaste, que es otra
cosa.

`GET /reportes/resultados` ya devuelve `cobertura: { porcentaje, confiable,
productos_sin_costo }`. La cañería está. Falta cargar los datos.

**Qué hacer — una pantalla para cargar costos rápido:**

1. Una tabla con todos los productos activos, ordenados **por cuánto se
   vendieron en los últimos 30 días**. Cargar el costo de la pizza que vende
   200 por mes vale 200 veces más que el del plato que vende una.
2. Una sola columna editable: el costo. Que se pueda tabular de fila en fila
   sin tocar el mouse.
3. Al lado, calculado en vivo: **el margen en pesos y en porcentaje**. Si el
   margen da negativo, que se vea en rojo — es un plato que se vende a pérdida.
4. Arriba, cuántos faltan: "127 de 145 productos sin costo".

**Los costos los carga Hernán, no vos. Vos hacés la herramienta.**
No inventes ningún costo, ni siquiera de ejemplo.

**Pegame una captura de la pantalla y frená.**

---

## 5. Sin internet el sistema no vende

**Qué pasa hoy — verificado, no supuesto:**

- `client/public/sw-admin.js` (cerca de la línea 32) **excluye `/api`** del
  service worker, así que ninguna llamada al servidor se cachea ni se encola.
- `client/src/lib/api.js` **rechaza inmediatamente** cuando `!navigator.onLine`.

O sea: se corta internet y el mostrador deja de facturar hasta que vuelva.

**Qué hacer — por partes, y en este orden:**

1. **Que se pueda leer.** Cachear la carta, los precios y las categorías, para
   que la pantalla de venta cargue sin conexión. Esto solo ya sirve.
2. **Que se pueda vender.** Los pedidos que se crean sin conexión se guardan en
   una cola local con una **clave de idempotencia** y se mandan cuando vuelve.
   La clave es lo que evita que al reconectar se dupliquen: si el pedido ya
   entró, el servidor lo reconoce y no lo crea de nuevo.
3. **Que se note.** Un cartel visible mientras está sin conexión, diciendo
   cuántos pedidos hay esperando para subir. Sin ese cartel, alguien va a
   cerrar el navegador con pedidos sin mandar.

**Lo que NO hay que hacer:** cobrar con tarjeta sin conexión. Eso no se puede
encolar — la autorización la da el posnet, no nosotros.

**Frená después del punto 1 y mostrame que la carta abre sin internet.**

---

## 6. Facturación ARCA · _bloqueado, y tiene fecha_

La especificación completa está en `ESPEC-FACTURACION-ARCA.md`.

**Está trabado esperando cuatro datos que sólo tiene Hernán:**

1. El **CUIT** del negocio
2. La **condición frente al IVA** (responsable inscripto, monotributo…)
3. El **punto de venta** habilitado para facturación electrónica
4. El **certificado digital** y su clave privada

**Nada de eso va al repositorio.** El certificado y la clave se cargan como
variables de entorno en Railway, y las carga él.

**Qué podés hacer sin esos datos:**

- Dejar armado el módulo con la lógica de armado del comprobante y el manejo de
  errores, **contra el entorno de homologación** de ARCA, que es de prueba.
- Dejar la pantalla de configuración donde después se pegan esos datos.

**Qué NO podés hacer:** poner un CUIT de ejemplo, ni un certificado de prueba
que después alguien confunda con el real.

**Antes de arrancar con esto, preguntale a Hernán si ya tiene los cuatro datos.**
Si no los tiene, saltealo y decímelo.

---

## Al final

Cuando estén las seis (o las que se hayan podido), pegame:

- `npm test` completo
- El estado de los checks del CI
- La lista de commits, uno por problema

Los commits van separados por tema. Nada de un commit gigante que diga
"varios arreglos": si algo sale mal en producción, hay que poder volver atrás
sólo eso.

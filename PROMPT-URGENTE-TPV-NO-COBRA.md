# URGENTE — el TPV no puede crear pedidos

> El local está abierto y no puede cobrar. Esto es lo primero y lo único hasta
> que vuelva a andar.

Copiá desde acá abajo.

---

Trabajás en `D:\Proyectos\modosabor1`, el sistema de un restaurante que **en
este momento no puede cobrar**. Priorizá restaurar el servicio sobre la
prolijidad. Si algo falla, **pará y contá el error completo**.

## El síntoma

Al crear un pedido en el TPV aparece:

> Ya existe un registro con ese valor. Probá con otro.

Pasa en los tres tipos de entrega (retiro, delivery, mesa). Ningún pedido se
puede crear. El mismo cartel aparece también en otras pantallas, porque es el
manejador genérico de "valor duplicado" de `server/index.js`.

## La causa (hipótesis fuerte, hay que confirmarla)

`pedidos.numero` es `INTEGER UNIQUE` (`server/db/schema.sql:207`). El número no
sale de un autoincremento sino de un contador guardado aparte, en la tabla
`configuracion` (`server/services/pedidoService.js:69`):

```js
function getNextNumero() {
  const config = db
    .prepare("SELECT valor FROM configuracion WHERE clave = 'numero_pedido_actual'")
    .get();
  const num = parseInt(config?.valor || '1', 10);
  db.prepare(
    "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', ?)"
  ).run(String(num + 1));
  return num;
}
```

Si ese contador quedó **por debajo** del número más alto que ya existe en
`pedidos` —por una restauración de respaldo, una importación de catálogo, un
borrado de pedidos, o cualquier desincronización— el sistema intenta insertar
un número que ya está tomado. La inserción falla, el contador igual avanza de a
uno, y hasta que no supere el máximo real **todos los pedidos siguen fallando**.

Dos detalles que refuerzan la hipótesis:

- El contador arranca en `1` si la clave no existe, así que si esa fila se
  perdió, el sistema volvió a numerar desde cero contra una tabla con cientos
  de pedidos.
- El sistema tiene una importación de catálogo que corre una vez por deploy
  (`server/index.js`, cerca del final) y hace un respaldo previo. Vale la pena
  descartar que haya tocado la tabla.

**Confirmala antes de arreglar.** No es lo mismo que el contador esté atrasado
a que el problema sea otra columna única.

## PARTE 1 — Confirmar (1 minuto)

1. Averiguá el error exacto. Se registra completo aunque en pantalla se oculte:

   ```
   railway logs --tail 80
   ```

   Buscá `Error no manejado` y la línea `UNIQUE constraint failed: ...`.

   - Si dice **`pedidos.numero`** → es la hipótesis de arriba, seguí al paso 2.
   - Si dice **otra tabla o columna** → **pará y contame cuál.** Todo lo de
     abajo no aplica.

2. Compará el contador con la realidad. **Ojo:** `railway run` ejecuta en la
   máquina local, no en el servidor, y abre una base vacía —ya nos pasó y nos
   dio un diagnóstico falso—. Usá la terminal del servicio en railway.app
   (Deployments → el activo → Shell / Terminal), o `railway ssh` si funciona:

   ```
   node -e "const db=require('./server/db');console.log('pedidos en la base:',db.prepare('SELECT COUNT(*) n FROM pedidos').get().n);console.log('numero mas alto:',db.prepare('SELECT COALESCE(MAX(numero),0) n FROM pedidos').get().n);console.log('contador guardado:',JSON.stringify(db.prepare(\"SELECT valor FROM configuracion WHERE clave='numero_pedido_actual'\").get()));"
   ```

   **Si `pedidos en la base` da 0, estás en la base equivocada: pará.**

   Si el contador es menor o igual al número más alto, está confirmado.

## PARTE 2 — Destrabar ahora (el local está esperando)

3. En la misma terminal del servidor:

   ```
   node -e "const db=require('./server/db');const max=db.prepare('SELECT COALESCE(MAX(numero),0) n FROM pedidos').get().n;db.prepare(\"INSERT OR REPLACE INTO configuracion (clave,valor) VALUES ('numero_pedido_actual',?)\").run(String(max+1));console.log('contador reparado. proximo pedido:',max+1);"
   ```

4. **Avisá que ya puede probar a cargar un pedido.** No sigas con la Parte 3
   hasta que confirme que el TPV cobra.

## PARTE 3 — Que no vuelva a pasar

Destrabar el contador a mano arregla hoy. El problema real es que **el número
de pedido depende de un contador que puede desincronizarse**, y cuando se
desincroniza el local deja de facturar.

5. En `server/services/pedidoService.js`, hacé que `getNextNumero` no pueda
   entregar un número ya usado. La forma más simple y robusta es que el
   contador se calcule contra la tabla en vez de confiar en la clave de
   configuración:

   ```js
   function getNextNumero() {
     const fila = db
       .prepare(
         `SELECT MAX(n) AS siguiente FROM (
            SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM pedidos
            UNION ALL
            SELECT CAST(COALESCE(
              (SELECT valor FROM configuracion WHERE clave = 'numero_pedido_actual'),
              '1'
            ) AS INTEGER) AS n
          )`
       )
       .get();
     const numero = Number(fila?.siguiente) || 1;
     db.prepare(
       "INSERT OR REPLACE INTO configuracion (clave, valor) VALUES ('numero_pedido_actual', ?)"
     ).run(String(numero + 1));
     return numero;
   }
   ```

   Se toma el mayor entre "el que sigue al último pedido" y "el que dice el
   contador". Así el contador puede adelantarse —los saltos de numeración no
   molestan a nadie— pero **nunca puede quedar atrás y bloquear la caja**.

   Escribí el comentario explicando _por qué_: que se rompió un domingo con el
   local abierto y nadie pudo cobrar.

6. Cubrilo con un test en `server/tests/utils/`, siguiendo el estilo del
   repositorio (español, explicando el porqué). Tiene que fallar si alguien
   vuelve a confiar sólo en el contador. Casos mínimos:
   - contador atrasado respecto de `MAX(numero)` → devuelve `MAX+1`
   - contador adelantado → respeta el contador
   - contador ausente y tabla con pedidos → devuelve `MAX+1`
   - base vacía → devuelve 1

   **Verificalo rompiendo el arreglo a propósito** y confirmá que el test lo
   agarra. Un test que pasa con el código roto no sirve.

7. Verificación completa antes de commitear:

   ```
   npm run lint
   npm --prefix server test
   cd client && npm run build && cd ..
   cd server && node -e "require('./index.js')"
   ```

   Lint en 0 errores. `EADDRINUSE` al arrancar está bien.

8. Commit sólo de los archivos que tocaste (nombrálos uno por uno, **nunca
   `git add -A`**), con un mensaje que cuente el problema real y no el cambio.
   Después `git push origin main` y verificá el deploy.

## Contexto que te ahorra tiempo

- En el repositorio hay cambios sin commitear de otras tandas (`server/index.js`
  con un traductor de errores de base, `server/utils/erroresDeBase.js` nuevo).
  **Dejalos afuera de este commit.** Si `server/index.js` te aparece modificado,
  no lo agregues salvo que lo hayas tocado vos.
- Hay archivos sueltos que no van nunca: `aufitoria kilo`,
  `diagnostico-asistente.js`, los `PROMPT-*.md`, `AUDITORIA-*.md`.

## Lo que NO tenés que hacer

- **No borres pedidos** para "arreglar" la numeración
- **No uses `git add -A` ni `git add .`**
- **No corras** `upsertMenuDelDia.js` ni `seedMenuManana.js`
- **No conectes** WhatsApp ni escanees el QR
- **No reescribas** el historial de git
- **No toques** los respaldos de `.tmp/`

## Al terminar

Contá: qué decía el error real en los logs, si la hipótesis del contador era
correcta, si el TPV volvió a cobrar, y el resultado de lint, tests, build y
deploy.

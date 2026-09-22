# Dejar `Test Backend` en verde — para Codex

Estado: `main` está en `617b5a51`. **Build Frontend: success.** **Test Backend:
failure.** Este documento resuelve lo segundo.

El diagnóstico ya está hecho. **No lo rehagas**, arrancá de acá.

---

## Reglas que valen para todo este trabajo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Archivo por archivo.
  Si ves algún `.sqlite` en verde, **pará y avisá**.
- **No escribas API keys ni contraseñas reales en ningún archivo.**
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- No agregues `server/uploads/whatsapp-carta/Carta Modo Sabor.pdf`.
- **No cambies una aserción para que pase.** Si un test falla por un bug real,
  pará y avisá. El objetivo es que el CI diga la verdad, no que esté verde.

---

## El problema, ya diagnosticado

`npm test` corre `node tests/run.js`, que hace `require()` de los 72 archivos de
test **en el mismo proceso**. Ese proceso abre `server/data/modosabor.db` — **la
base real de la máquina de trabajo**.

Consecuencias, las dos malas:

1. **En el CI el checkout es limpio**, la base nace vacía, y todo test que
   dependa de datos existentes falla. Por eso `Test Backend` nunca estuvo verde.
2. **En local, `npm test` escribe en la base de producción de Hernán.** Los
   tests que insertan están tocando datos de verdad.

Números medidos sobre el repo:

```
72 tests en total
 5 se crean su propia base temporal (spawnSync/mkdtempSync)  → sanos, no tocar
16 cargan la base COMPARTIDA al requerirse
   de esos, 7 crean los datos que usan
   de esos, 9 LEEN datos que no crearon  ← estos son los que rompen el CI
```

Los 9 acoplados a la base real:

```
agentQuoteOrderItem.test.js      conversacionesAgente.test.js
auditoriaIa.test.js              motorAgente.test.js
inventoryRecipeAccents.test.js   preciosServidor.test.js
registroHerramientas.test.js     whatsappGateway.test.js
whatsappGatewayRules.test.js
```

Ejemplo concreto de por qué fallan — `agentQuoteOrderItem.test.js` espera:

```js
const quote = quoteProduct(db, 'pizza común con huevo entera muzza');
assert.strictEqual(quote.status, 'ok');
assert.strictEqual(quote.order_item.producto_id, 2);
assert.strictEqual(quote.order_item.variantes.Presentación.nombre, 'Entera Muzza');
assert.strictEqual(defaultPizza.price_total, 800000);
```

Da `not_found !== ok` porque en una base nueva no existe ningún producto con
id 2. Y ojo: **`npm run seed:menu` tampoco alcanza** — `seedMenuModoSabor.js`
siembra la pizza Común a **$6.000**, y el test espera **$8.000** con variante
"Entera Muzza". El test está escrito contra la producción de hoy, que ya se
movió más allá del script de semilla.

Lo que ya está arreglado y **no hay que volver a tocar** (commit `617b5a51`):

- `tests/run.js` define `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`, así el
  seed no corta con la base vacía. En el log ya se ve
  `Usuario admin inicial creado: test@example.invalid`.
- El CI subió de Node 20 a Node 22, porque `clienteDesdeElTpv.test.js` usa
  `node:sqlite`, que no existe en 20.

---

## Paso 1 — Aislar la base de los tests

En `server/tests/run.js`, **antes de cargar cualquier test**, apuntá la base a un
directorio temporal que se borre solo:

```js
const os = require('os');

const dirTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'modosabor-tests-'));
process.env.DATA_DIR = dirTemporal;
process.env.DB_FILE = path.join(dirTemporal, 'tests.sqlite');

process.on('exit', () => fs.rmSync(dirTemporal, { recursive: true, force: true }));
```

Tiene que quedar **arriba de todo**, junto a las tres líneas de `process.env` que
ya están, porque `db/index.js` resuelve la ruta en el momento del `require`.

Esto solo ya arregla que `npm test` escriba en la base real. Es la mitad más
importante del trabajo.

**Corré `npm test` y pegame la salida completa.** Van a fallar los 9 de arriba y
posiblemente algunos de los 7 que insertan. **Frená ahí, no arregles todavía.**

---

## Paso 2 — Un fixture compartido

Creá `server/tests/fixtures.js`: una función que siembra el mínimo de catálogo
que los tests necesitan, sobre la base que ya esté abierta.

```js
/**
 * Datos mínimos para que los tests del agente tengan qué cotizar.
 *
 * Antes esto salía de la base real de la máquina de trabajo, lo que tenía dos
 * problemas: el CI no podía correrlos, y correrlos en local escribía sobre
 * datos de producción. Ahora cada corrida siembra lo suyo.
 *
 * Los precios van en centavos, igual que en toda la base: 800000 son $8.000.
 */
function sembrarCatalogoBase(db) { /* ... */ }

module.exports = { sembrarCatalogoBase };
```

Tiene que dejar, como mínimo:

| Qué                  | Detalle                                                          |
| -------------------- | ---------------------------------------------------------------- |
| Categoría `Pizzas`   | activa                                                           |
| Producto id `2`      | nombre `Común`, en Pizzas, activo                                |
| Grupo `Presentación` | obligatorio, con `Entera Cremoso` (por defecto) y `Entera Muzza` |
| Precio resultante    | `Entera Cremoso` → **800000**                                    |
| Un producto NO pizza | activo, con un grupo de opciones de **más de una** opción        |

Ese último es para la parte del test que busca "un producto no pizza con
opciones" y espera `needs_clarification`.

**Sembrá el id 2 explícitamente** (`INSERT INTO productos (id, ...) VALUES (2, ...)`),
no confiando en el autoincremento.

---

## Paso 3 — Enganchar el fixture

En `tests/run.js`, después de definir el entorno y **antes** del bucle que
carga los tests, sembrá una vez:

```js
const db = require('../db');
require('./fixtures').sembrarCatalogoBase(db);
```

Si algún test necesita datos propios además de estos, que se los cree él, dentro
de su `SAVEPOINT` como ya hace `agentQuoteOrderItem.test.js`.

**Corré `npm test` de nuevo y pegame la salida. Frená.**

---

## Paso 4 — Los que sigan fallando, de a uno

Para cada test que quede en rojo, decidí cuál de las dos cosas es y **decímelo
antes de tocarlo**:

- **Le falta un dato** → agregalo al fixture, o hacé que el test se lo cree.
- **Encontró un bug real** → **pará y avisá.** No toques la aserción.

La diferencia importa: el segundo caso es justamente para lo que sirve tener CI.

---

## Paso 5 — Verificar que los tests prueban algo

Esto no es opcional. Un test que pasa siempre no sirve, y en este repo ya pasó:
había siete tests que se cargaban sin ejecutar sus comprobaciones y contaban
como pasados —está documentado en el comentario de `tests/run.js`—.

Para cada test que arregles, **rompé a propósito el código que prueba y
confirmá que el test se pone en rojo.** Después devolvé el código a como estaba.

Si al romperlo sigue pasando, el test no prueba nada: decímelo.

---

## Paso 6 — Commit y push

Archivo por archivo, sin `git add -A`:

```
git add server/tests/run.js server/tests/fixtures.js
git add <cada test que hayas tocado, uno por uno>
git commit -m "Tests: base temporal propia en vez de la base real

npm test corria contra server/data/modosabor.db, la base de trabajo. Eso
hacia que el CI no pudiera pasar nunca con un checkout limpio, y que correr
los tests en local escribiera sobre datos de produccion.

Ahora cada corrida usa una base temporal que se borra sola, y los datos de
catalogo que los tests necesitan se siembran en tests/fixtures.js."
git push origin main
```

Y traeme el resultado:

```
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
```

---

## Lo que NO hacés vos

- Cambiar una aserción para que un test pase.
- Rotar credenciales o tocar variables de entorno en Railway.
- Conectar WhatsApp o escanear el QR.
- Reescribir la historia de git.

# Arreglar el CI — para Codex

Contexto: se pushearon 9 commits (`17a0acff..d42130e1`) y **los dos jobs del CI
fallaron**. Ya hay dos commits locales sin pushear que arreglan una de las dos
caídas. Falta pushearlos y diagnosticar la otra.

---

## Reglas que valen para todo este trabajo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Los archivos se
  agregan uno por uno. En la raíz hay bases de n8n con credenciales adentro; ya
  están en `.gitignore`, pero si ves algún `.sqlite` en verde, **pará y avisá**.
- **No escribas API keys ni contraseñas en ningún archivo del repo**, ni
  siquiera en un `.md` de ejemplo.
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No generes un keystore nuevo de Android.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- No agregues `server/uploads/whatsapp-carta/Carta Modo Sabor.pdf` (11 MB, se
  decide aparte).
- **No inventes datos.** Si algo falta, preguntá.

---

## Qué pasó, para que no lo diagnostiques de nuevo

Se commitearon `client/src/App.jsx` y `server/index.js`, que hacen referencia a
**cinco archivos que quedaron sin commitear**. El build local pasaba porque los
archivos están en disco; el CI clona limpio y no los tiene.

Eran dos roturas, no una:

| Dónde                        | Qué                                                    | Gravedad                       |
| ---------------------------- | ------------------------------------------------------ | ------------------------------ |
| `client/src/App.jsx`         | importa 3 páginas que no estaban en git                | falla `Build Frontend`         |
| `server/index.js`            | `require('./routes/intercambioDatos')` que no está     | **el server no arranca**       |

La segunda es la grave: no es un build que falla, es Railway levantando un
proceso que se muere en el `require`.

Ya está arreglado en dos commits locales:

```
c9206003  Intercambio de datos: la ruta que index.js ya requeria
2cbd23cf  Las tres paginas que App.jsx ya importaba
```

Los cinco archivos: `server/routes/intercambioDatos.js`, `server/utils/csv.js`,
`client/src/pages/EstadoPedidosPublico.jsx`, `client/src/pages/IntercambioDatos.jsx`,
`client/src/pages/WhatsAppMasivo.jsx`.

Verificado sobre un `git archive HEAD` (checkout limpio de verdad, no el disco):
470 archivos, 0 imports rotos.

---

## 1. Pushear los dos commits

```
git log --oneline -3
git push origin main
```

Esperá a que arranque el CI y pegame el resultado de:

```
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
```

**Frená ahí y pegame la salida antes de seguir.**

---

## 2. Diagnosticar `Test Backend` — el paso que falta

En el run anterior dijiste que eran "18 tests caídos por `better-sqlite3`
compilado para Linux". **Eso no puede ser.** El CI corre `npm ci` en
`ubuntu-latest`, así que ahí `better-sqlite3` se compila para Linux. Esa
explicación vale en una máquina Windows, no en el runner.

El job `Test Backend` tiene **cuatro pasos** que pueden fallar:

```yaml
- run: npm ci
- run: npm test              # node tests/run.js
- run: npm run verify:backup # node scripts/verify-backup-restore.js
- run: npm run lint          # eslint .
```

El pedazo de log que pegaste mostraba:

> `No hay usuarios creados y faltan INITIAL_ADMIN_EMAIL / INITIAL_ADMIN_PASSWORD para el bootstrap inicial`

Ese `throw` está en `server/db/seed.js:184`. Pero **todos** los tests que
levantan la base ya setean esas variables (verificado uno por uno). Así que ese
error sale de otro paso — muy probablemente `verify:backup`, que también abre
una base.

Necesito el **principio** del log, no el final. `tail` cortó justo la parte que
dice qué paso murió:

```
gh run list --limit 5
gh run view <run-id> --log-failed | head -80
```

Y después, el nombre del paso y el primer test que rompe:

```
gh run view <run-id> --log-failed | grep -nE "^Test Backend\s+(Run tests|Verify|Run linter)" | head
```

**Pegame las dos salidas y frená.** No arregles nada todavía: quiero ver qué
paso es antes de que toques `seed.js` o los tests.

---

## 3. Si el paso que falla resulta ser `verify:backup`

Mirá `server/scripts/verify-backup-restore.js`. Si abre la base sin setear
`INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`, el arreglo es setearlas en ese
script igual que hacen los tests, con valores de prueba obvios:

```js
process.env.INITIAL_ADMIN_EMAIL = 'test@example.invalid';
process.env.INITIAL_ADMIN_PASSWORD = 'test-only-password';
```

**Esos valores son de prueba y van sólo en un script de verificación.** No los
uses en ningún otro lado y no inventes una contraseña que parezca real.

Si en cambio el que falla es `npm test` o `npm run lint`, pegame el error y
frená — eso lo miramos juntos.

---

## 4. Después de que el CI quede verde

Verificá que Railway haya desplegado el commit nuevo y que **el server arranque**:

```
gh api repos/{owner}/{repo}/deployments --jq '.[0] | {id, environment, created_at}'
```

Y confirmá en el log de Railway que no muera en un `require`. Esa era la falla
grave y es la que hay que ver resuelta de verdad.

---

## 5. Antes de dar por cerrado: correr las migraciones una vez en local

Hay **cinco tablas nuevas** (`listas_precios`, `producto_precios`,
`cliente_cuenta_movimientos`, y las que vengan) y columnas agregadas en cuatro
tablas existentes. Todas se crean solas con `ensureColumn`, pero es mejor verlas
correr en local que descubrir un problema en producción.

Levantá el server local una vez y mirá que las migraciones pasen limpias.
Pegame la salida.

**Ojo**: la base está en modo WAL. Si copiás el archivo para inspeccionarlo,
copiá también `modosabor.db-wal` y `modosabor.db-shm`, o vas a leer una foto
vieja y vas a reportar que falló algo que en realidad funcionó.

---

## Lo que NO hacés vos

- Rotar credenciales o tocar variables de entorno en Railway. Eso lo hace Hernán.
- Conectar WhatsApp o escanear el QR.
- Decidir qué pasa con el PDF de la carta.
- Reescribir la historia de git.

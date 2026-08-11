# Prompt para Claude CLI — cerrar la limpieza

> Todo está borrado y preparado (`git add` ya hecho). Falta el commit y el
> push. No hay cambios de comportamiento: es código que no importa nadie,
> documentos ya cumplidos y ruido de fin de línea.

Copiá desde acá abajo.

---

Trabajás en `D:\Proyectos\modosabor1`, el sistema de un restaurante en
producción. Si un paso falla, **pará y contame** con el error completo.

## Qué se limpió

**Siete archivos del cliente que no importa nadie**, 1.367 líneas. Tres ya
eran lápidas —empiezan con "OBSOLETO, se puede borrar"— que una sesión
anterior no pudo eliminar porque el entorno no dejaba borrar archivos.

- `components/ConfiguracionPlantillas.jsx` (1.070 líneas), reemplazado por
  `components/Configuracion/SeccionImpresion.jsx`
- `components/Sidebar.jsx`, la primera versión del menú: `Layout.jsx` importa
  `SidebarModern.jsx` desde hace rato
- `components/TPV/TpvCheckout.jsx`, ahora es `TpvPaymentModal.jsx`
- `lib/printing.js`, escrito "para evitar duplicación" y nunca adoptado: los
  tres lugares que imprimen tienen cada uno su propia copia de
  `imprimirEnIframe`
- `lib/puestoLocal.js`, sin uso desde que el envío de WhatsApp pasó a vivir
  adentro del sistema
- `pages/Clientes/ClientesTable.jsx` y `pages/Inventario/Stat.jsx`

**Once documentos cumplidos**: ocho auditorías y planes ya ejecutados o
superados por los siguientes, y tres prompts de deploy que ya corrieron.
Quedan en el historial de git.

**El ruido de fin de línea**: veinticinco archivos aparecían como modificados
en `git status` sin tener un solo cambio real —`.gitignore`, `ci.yml`,
`render.yaml`, el schema, los iconos— porque alguna herramienta de Windows los
reescribió con CRLF. Eso es lo que más molestaba: tapaba los cambios de
verdad, que es justo donde se cuelan los commits accidentales. Se revirtieron
y se agregó un `.gitattributes` que fija LF, salvo `.bat`/`.cmd`/`.ps1`, que
Windows necesita con CRLF.

**El `.gitignore`** no atajaba la base local (está en `server/db/`, no en
`server/`) ni los `-journal`, así que `modosabor.db` aparecía suelto en cada
status.

Basura borrada que no estaba en git: `__pycache__/`, `.codex-logs/`,
`.tmp-previews/`, `.tmp-uala-logo/`, dos carpetas nacidas de una ruta mal
escrita, `server.log`, `logs-arranque.txt`, y los logs sueltos de `.tmp/`.
**Los respaldos de `.tmp/` (`backup-completo.tar.gz`, los `.sqlite`) NO se
tocaron.**

## PARTE 1 — Verificación

1. ```
   npm run lint
   npm --prefix server test
   cd client && npm run build && cd ..
   ```

   Esperado: **0 errores** de lint (297 warnings preexistentes está bien),
   todos los tests pasando, build limpio.

   Si el build del cliente falla por un import que apunta a alguno de los
   siete archivos borrados, **pará y contame cuál**: significa que el barrido
   se comió algo vivo y hay que reponerlo con
   `git checkout HEAD -- <archivo>`.

## PARTE 2 — Commit

2. Mirá qué quedó preparado (ya está el `git add`, no agregues nada más):

   ```
   git status --short
   ```

   Tienen que ser 19 entradas: `.gitattributes` nuevo, `.gitignore`
   modificado, y 17 borrados.

3. ```
   git commit -F - <<'EOF'
   limpieza: sacar codigo muerto, docs cumplidos y el ruido de fin de linea

   Siete archivos del cliente que no importa nadie, 1.367 lineas. Tres ya
   eran lapidas —"OBSOLETO, se puede borrar"— que una sesion anterior no
   pudo eliminar porque el entorno no dejaba. ConfiguracionPlantillas.jsx
   son 1.070 lineas reemplazadas por Configuracion/SeccionImpresion.jsx.
   printing.js se habia escrito "para evitar duplicacion" y nunca lo adopto
   nadie: los tres lugares que imprimen tienen cada uno su propia copia de
   imprimirEnIframe. puestoLocal.js quedo sin uso cuando el envio de
   WhatsApp paso a vivir adentro del sistema.

   Once documentos cumplidos: ocho auditorias y planes que ya se ejecutaron
   o quedaron superados por los siguientes, y tres prompts de deploy que ya
   corrieron. Siguen en el historial si hacen falta.

   Y el ruido: veinticinco archivos aparecian como modificados en git
   status sin tener un solo cambio real —.gitignore, ci.yml, render.yaml,
   el schema, los iconos— porque alguna herramienta de Windows los
   reescribio con CRLF. Eso es lo que mas molestaba: tapaba los cambios de
   verdad, que es exactamente donde se cuelan los commits accidentales. El
   .gitattributes fija LF salvo para los .bat/.ps1, que Windows necesita
   con CRLF.

   El .gitignore no atajaba la base local (esta en server/db/, no en
   server/) ni los -journal, asi que modosabor.db aparecia suelto en cada
   status.

   Verificado: lint 0 errores, build del cliente limpio.
   EOF
   ```

4. ```
   git show --stat HEAD
   git status --short
   git push origin main
   ```

   Después del push, `git status --short` tiene que quedar en tres líneas
   sueltas nada más: `auditoria-kimi-2026-08-07.md`, `aufitoria kilo` y
   `diagnostico-asistente.js`. Esos tres se dejan a propósito.

5. ```
   railway status
   curl -s --ssl-no-revoke -o NUL -w "%{http_code}" https://modosabor-api-production.up.railway.app/api/health
   ```

## Lo que NO tenés que hacer

- **No uses `git add -A` ni `git add .`** — ya está todo preparado
- **No borres** `diagnostico-asistente.js` ni `aufitoria kilo`
- **No toques** `server/db/modosabor.db` ni los respaldos de `.tmp/`
- **No corras** `upsertMenuDelDia.js` ni `seedMenuManana.js`
- **No conectes** WhatsApp ni escanees el QR
- **No reescribas** el historial de git

## Al terminar

Contame el resultado de lint, tests y build, y si el push y el deploy quedaron
verdes.

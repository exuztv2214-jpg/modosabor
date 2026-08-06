# Verificar y desplegar — 6 de agosto de 2026

Todo está listo en el código. Falta que lo verifiques vos y lo subas.

---

## ⚠️ Lo primero: hay 29 archivos que nunca se subieron a git

Esto es lo más importante de todo el documento.

Módulos enteros —**Operación, Pedidos, Marketing, TPV, Direcciones**— están en tu
computadora pero **nunca entraron al repositorio**. Por eso nada de ese trabajo
llegó nunca a producción.

Si hacés commit sin ellos, el build de Railway **falla**, porque el código que sí
está subido los importa y no los va a encontrar.

El `git add -A` del paso 1 los incluye. No lo saltees.

> Nota: intenté hacer el commit desde acá y no pude. Quedó un `.git/index.lock`
> huérfano de un comando que se pasó de tiempo, y el sandbox no tiene permiso
> para borrarlo. Si al hacer `git add` te dice _"Unable to create index.lock"_,
> cerrá VS Code, borrá el archivo `.git\index.lock` a mano y reintentá.

---

## Paso 1 — Preparar el commit

Abrí PowerShell en `D:\Proyectos\modosabor1`:

```powershell
# Si quedó el lock huérfano:
Remove-Item .git\index.lock -ErrorAction SilentlyContinue

git add -A
git status --short | Measure-Object -Line   # deberían ser ~250 archivos
```

Revisá rápido que no se cuele nada raro:

```powershell
git diff --cached --name-only | Select-String -Pattern "\.env$|secret|\.pem$|\.key$"
```

Si no devuelve nada, estás bien. (Ya lo verifiqué acá y está limpio, pero
revisalo vos antes de subir algo a un repo.)

---

## Paso 2 — Verificar en local ANTES de subir

Levantá el sistema:

```powershell
npm run dev
```

### 2.1 Cocina (KDS) — el arreglo más importante

1. Entrá a **KDS**.
2. Cargá un pedido de prueba desde el TPV y confirmalo.
3. Mirá el cronómetro de la tarjeta.

| Antes                                    | Ahora                                                 |
| ---------------------------------------- | ----------------------------------------------------- |
| Decía `0m` siempre, en todos los pedidos | Tiene que arrancar en `0m` y **subir de a un minuto** |

Si sigue clavado en `0m`, avisame: el arreglo no tomó.

### 2.2 Reportes — acá está la plata

Este es el cambio que te va a mover los números.

1. Andá a **Reportes** y mirá un día que te acuerdes de memoria.
2. Compará con lo que sabés que se facturó ese día.

**Lo que cambió:** antes, todo lo vendido después de las 21:00 se contaba en el
día siguiente. Un jueves que facturó $65.000 te mostraba $12.000, y esos
$53.000 aparecían el viernes.

> ⚠️ **Los números van a cambiar respecto a lo que venías viendo.** Eso es lo
> esperado. Si un día que sabés que fue bueno ahora muestra más plata, el
> arreglo funcionó. Verificá contra lo que cerraste en caja, no contra el
> reporte viejo.

### 2.3 Delivery

- Los riders que están transmitiendo tienen que decir **"GPS fresco"** (verde),
  no "GPS atrasado". Antes decían atrasado siempre, aunque anduvieran bien.
- La hora de cada pedido tiene que mostrarse. Antes salía `--:--`.

### 2.4 Alerta de pedido nuevo

Con el panel abierto, cargá un pedido desde la web pública.
**Tiene que sonar.** Antes no sonaba nunca.

### 2.5 Web pública

Abrila **en el celular**, no en la computadora:

- Los platos tienen que verse **sin hacer scroll**. Antes había que bajar una
  pantalla entera de banner.
- Arriba de todo: el menú de hoy con la fecha, y botón "Agregar" en cada plato.
- Las letras tienen que leerse sin achinar los ojos.

### 2.6 Un par de modales

Abrí cualquier modal (un producto, una compra) y apretá **Escape**. Tiene que
cerrarse. Antes no se podía cerrar con el teclado.

---

## Paso 3 — Commit y deploy

Sólo cuando lo de arriba te cierre:

```powershell
git commit -m "Arreglo de zona horaria en reportes y cronometros, rediseno de web publica

- Reportes: DATE(creado_en) usaba UTC, asi que lo vendido despues de las 21:00
  se contaba al dia siguiente. Centralizado en server/utils/fechaLocal.js.
- KDS, Mesas, Delivery, Caja: los cronometros daban siempre 0 por el mismo
  desfase de 3 horas. Centralizado en client/src/lib/fechas.js.
- Alerta sonora de pedido nuevo: la ventana de 2 minutos nunca se cumplia.
- Delivery: todos los riders figuraban con GPS atrasado.
- Web publica: hero de 620px a 280px, menu del dia en portada, tipografia legible.
- Modales: cierre con Escape.
- Se agregan modulos que nunca se habian subido (Operacion, Pedidos, Marketing, TPV)."

git push origin main
```

El push a `main` dispara el deploy solo. Railway está configurado con
`watchPatterns` sobre `server/**`, `client/**`, `Dockerfile` y `package.json`,
así que estos cambios lo activan.

---

## Paso 4 — Mirar el deploy

- Panel: proyecto **celebrated-smile**, servicio **modosabor-api**
- URL: https://modosabor-api-production.up.railway.app

Mirá los logs del build. **Si el build falla, la versión vieja sigue viva** —
no se rompe nada. El punto donde puede fallar es el `npm --prefix client run
build` del Dockerfile.

Acá el build de cliente pasa limpio (1669 módulos, sin errores) y el lint está
en 0 errores, así que debería salir derecho.

---

## Lo que NO está verificado

Te lo digo claro para que sepas dónde mirar si algo sale mal:

- **Nada de esto se probó en un navegador.** Compila y pasa el lint, que no es
  lo mismo que funcionar.
- **No pude levantar el servidor acá** para probar contra la API real:
  `better-sqlite3` está compilado para Windows y este entorno no tiene salida a
  internet para recompilarlo. Verifiqué la lógica de fechas con SQLite real y
  con 10 casos de prueba, pero no contra tu base.
- **Los 2 tests que fallan ya venían fallando** antes de que tocara nada: uno es
  un test desactualizado de `sanitize`, el otro es el binario de Windows en este
  entorno. No son míos.
- **El bundle de 740 KB de la web pública sigue igual.** Es el arreglo grande que
  queda pendiente.

---

## Si algo sale mal

Volver atrás es un comando:

```powershell
git revert HEAD
git push origin main
```

O desde el panel de Railway, botón **Rollback** en el deploy anterior.

# Cerrar el círculo — para Claude CLI

Modo Sabor, restaurante en Monteros (Tucumán). Repo `D:\Proyectos\modosabor1`,
producción en Railway. El dueño no programa.

Hay dos arreglos ya commiteados esperando subir, un archivo roto que ensucia
todo, y dos comprobaciones dentro de Railway. **Van en este orden, con freno
entre cada paso.**

---

## Reglas que valen para todo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Archivo por archivo.
  Hay 36 archivos sin commitear que son trabajo en curso de otro: **no los
  subas**. En la raíz hay bases `.sqlite` de n8n con credenciales: si ves alguna
  en verde, **pará y avisá**.
- **No escribas API keys, contraseñas ni certificados en ningún archivo.**
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- **No cambies una aserción para que un test pase.** Si falla por un bug real,
  pará y avisá.
- **No reescribas la historia de git.**

---

## 1. Subir lo que ya está arreglado

Hay dos commits locales que arreglan los dos fallos del CI que encontraste:

```
2cabbf5e  Test del carrito: sin producto inventado, la clave foranea fallaba
5a513d3a  Panel: avisar cuando se corta internet
```

El primero pone `producto_id` en nulo —la columna lo permite y el test no
necesita un producto real—. El segundo commitea el `Layout.jsx` que
`offlineAdmin.test.js` estaba esperando desde main.

```
git log --oneline -4
git push origin main
```

Después confirmá:

```
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
```

**Si queda algo en rojo, pegame `gh run view <run-id> --log-failed | head -60` y frená.**

---

## 2. El archivo roto

`server/services/socialService.js` tiene un error de sintaxis:

```
server/services/socialService.js:195
}) {
^
SyntaxError: Unexpected token '}'
```

Está **sin commitear**, así que no rompe el CI —pero sí rompe `npm test` en la
máquina del dueño, y por eso en local fallan más tests que en el CI. Mientras
siga así, no se puede confiar en una corrida local.

Mirá qué se estaba haciendo ahí:

```
git diff server/services/socialService.js | head -60
```

Después decidí y **avisá antes de tocarlo**:

- Si es un cambio a medio escribir y se puede terminar sin inventar nada,
  terminalo.
- Si no se entiende qué buscaba, **no lo adivines**: proponé descartarlo con
  `git checkout -- server/services/socialService.js` y esperá el OK.

**No lo commitees roto ni lo borres sin permiso.**

---

## 3. Dentro de Railway: la regla del turno

Cuando el CI esté verde y Railway haya desplegado:

```
railway ssh
```

Ya adentro, primero mirar y después aplicar:

```
node server/scripts/actualizarReglasTurno.js
```

Eso no cambia nada: muestra el antes y el después. La regla nueva es que a la
mañana **se ofrece el menú del día, y la carta sólo si el cliente la pide** —
hoy dice que se ofrecen las dos, y eso empuja a un plato más caro y más lento
justo cuando la cocina está puesta para el menú.

**Pegame la salida y esperá el OK antes de correrlo con `--aplicar`.**

Ojo: correrlo desde la carpeta del proyecto en Windows toca la base local, no
la del bot. Tiene que ser adentro de Railway.

---

## 4. Dentro de Railway: cuánta memoria hay

Aprovechando la misma sesión:

```
free -m
node -e "console.log(process.env.WHISPER_MODEL || 'small')"
```

Esto cierra un problema abierto. Los audios de WhatsApp fallan con:

```
Audio no transcripto: Whisper terminó con código null
```

Código nulo significa que al proceso lo mataron, no que falló. Ya se cambió el
mensaje para que distinga si lo cortamos nosotros por tiempo o si lo mató el
sistema, pero falta el dato de cuánta memoria hay. El modelo `small` de
faster-whisper necesita alrededor de 1 GB para cargarse.

**Pegame la salida de `free -m` y frená.** Con eso el dueño decide entre subir
la memoria del contenedor o pasar la transcripción a una API. No decidas vos.

El audio no es un detalle: en seis meses de historial hay **1.554 audios en 182
chats**, o sea que más de un tercio de los clientes pide hablando.

---

## Al terminar

Pegá, en este orden:

1. El estado de los dos checks del CI
2. Qué pasó con `socialService.js`
3. La salida de `actualizarReglasTurno.js` sin aplicar
4. La salida de `free -m`

Y **nada más**. No arranques ningún otro trabajo: hay tres frentes abiertos
—ARCA, costos y offline— y se atienden de a uno.

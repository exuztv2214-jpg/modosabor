# El deploy está fallando — para Claude CLI

Modo Sabor, restaurante en Monteros (Tucumán). Repositorio `D:\Proyectos\modosabor1`,
producción en Railway. **El deploy está dando error y hay que encontrar por qué.**

---

## Reglas que valen para todo este trabajo

- **No uses `git add -A`, `git add .` ni `git commit -a`.** Archivo por archivo.
  En la raíz hay bases `.sqlite` de n8n con credenciales adentro: si ves alguna
  en verde, **pará y avisá**.
- **No escribas API keys, contraseñas ni certificados en ningún archivo del repo.**
- No toques `client/src/pages/Delivery.jsx`, la app del repartidor ni `mozo-app/`.
- No corras "recalcular niveles", `upsertMenuDelDia.js` ni `seedMenuManana.js`.
- No borres `diagnostico-asistente.js` ni `aufitoria kilo`.
- **No cambies una aserción para que un test pase.** Si falla por un bug real,
  pará y avisá.
- **No reescribas la historia de git.**

---

## Qué pasó antes de que fallara

Los últimos cambios tocaron el agente de WhatsApp. En orden:

| Commit | Qué cambió |
| --- | --- |
| `d7f08f0a` | `server/utils/systemClient.js` — `getProductOptionsDetail` devuelve precio final por opción en vez del adicional en centavos |
| `ccc3f82d` | `server/utils/systemClient.js` — `getMenuOverview` informa cuántos productos tiene cada categoría y si la lista viene recortada |
| `8372e9a8` | `server/services/agenteWhatsapp.js` — se inyecta el carrito en el contexto; nuevo test `carritoEnContexto.test.js` |
| `9ce37c83` | `client/src/pages/WhatsAppMasivo.jsx` — muestra el último error del gateway |
| `fac599e3` | `server/services/whatsappAudioTranscription.js` — distingue quién mató a Whisper |
| `4d262a7e` | `server/utils/systemClient.js` — alias de categoría (Hamburguesas, Sandwichs, Bebidas, Pastas, Menu del Dia) |
| `d9296089` | `server/db/seed.js` y `server/scripts/actualizarReglasTurno.js` — regla del turno mañana |

**Sospechas, en orden de probabilidad:**

1. **El test nuevo `carritoEnContexto.test.js`** falla en el CI y frena el
   deploy. Inserta en `whatsapp_pedidos_borrador` y
   `whatsapp_pedidos_borrador_items`; si esas tablas tienen columnas
   obligatorias que el test no completa, revienta.
2. **`agenteWhatsapp.js` importa `crearCarritoWhatsapp` desde
   `./carritoWhatsapp`**, y ese archivo importa `systemClient`. Verificá que no
   se haya formado un ciclo de requires.
3. **`formatMoney`**: `agenteWhatsapp.js` ahora lo importa de
   `../utils/systemClient`. Confirmá que esté realmente exportado.
4. Algo de la build del cliente por el cambio en `WhatsAppMasivo.jsx`.

---

## 1. Traer el error de verdad

No adivines. Primero el mensaje exacto:

```
gh run list --limit 5
gh run view <run-id> --log-failed | head -80
```

Y el log del deploy de Railway, que es otro y puede fallar por otra cosa:

```
railway logs --deployment
```

**Pegame las dos salidas y frená.** No arregles nada todavía.

---

## 2. Reproducir en local antes de tocar

```
cd server
npm test
```

Ojo con esto: `npm test` corre contra `server/data/modosabor.db`, **la base
real de esta máquina**. Está diagnosticado y sin arreglar; el plan completo
está en `PROMPT-CODEX-TESTS.md`. Para este trabajo alcanza con saberlo y no
sorprenderse si algún test toca datos.

Y la build del cliente:

```
cd client
npm run build
```

**Pegame el resultado de las dos y frená.**

---

## 3. Arreglar lo que falle

Con el error a la vista, arreglá **la causa**, no el síntoma. Dos cosas que no
se hacen:

- No borres ni saltees el test nuevo para que pase el deploy. Ese test cubre un
  error real: el agente cerró una conversación con un pedido a medio armar y
  se perdió.
- No revertas los commits del agente. Los tres arreglan errores que ya se
  vieron con clientes: precios cien veces más caros, productos existentes
  declarados inexistentes, y pedidos perdidos al despedirse.

Si algo hay que revertir de verdad, **avisá antes con el motivo.**

---

## 4. Verificar antes de subir

```
cd server && npm test && npm run lint
cd ../client && npm run build
```

Y si tocaste algo del agente, **rompelo a propósito y confirmá que el test se
pone en rojo**. Un test que pasa siempre no prueba nada — en este repo ya pasó
que siete tests se cargaban sin ejecutar sus comprobaciones.

---

## 5. Subir y confirmar

Archivo por archivo, un commit por tema:

```
git add <cada archivo>
git commit -m "..."
git push origin main
gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/check-runs \
  --jq '.check_runs[] | {name, status, conclusion}'
```

Después confirmá que Railway levantó de verdad:

```
railway logs | tail -40
```

El server tiene que arrancar sin morir en ningún `require`.

---

## 6. Dos cosas para correr dentro de Railway cuando esté verde

```
railway ssh
```

Ya adentro:

```
node server/scripts/actualizarReglasTurno.js
free -m
```

El primero muestra —sin cambiar nada— cómo quedaría la regla del turno mañana.
El segundo dice cuánta memoria tiene el contenedor: hace falta para saber si el
modelo `small` de Whisper entra. Hoy los audios fallan con "el sistema mató a
Whisper", que casi siempre es falta de memoria.

**Pegame las dos salidas. No apliques nada todavía.**

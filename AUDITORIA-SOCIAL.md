# Auditoría de Modo Sabor Social

21 de agosto de 2026. Auditoría del módulo completo, incluyendo lo que
construí en las últimas sesiones.

---

## RESUMEN

Encontré **tres cosas rotas de verdad**, y las tres son mías. Dos ya están
arregladas; la tercera necesita una decisión tuya.

La más grave es que **el descanso de 24 horas por grupo nunca funcionó en
producción**, y los tests decían que sí.

---

## A. LO QUE ESTABA ROTO

### 1. El descanso por grupo no se aplicaba nunca — **CRÍTICO, arreglado**

```js
esGrupo: destino.destino_tipo === 'grupo',   // ← nunca es verdad
```

Los grupos se guardan con `tipo = 'facebook_group'`. La comparación era contra
`'grupo'`, un tipo que **no existe en el sistema**. O sea que `esGrupo` daba
`false` para todos los grupos reales, y la regla que impide publicar dos veces
en el mismo grupo el mismo día —la protección más importante de todo el
módulo, la que evita que un administrador te eche— estaba muerta.

**Por qué los tests no lo vieron:** porque los fixtures creaban destinos con
`tipo: 'grupo'`. Los tests probaban un mundo que no existe. Un fixture que no
se parece al dato real no prueba nada; sólo da tranquilidad, que es peor que
no tener test.

Arreglado, y arreglé también los fixtures. Lo verifiqué reintroduciendo el bug:
ahora **3 tests se caen**. Antes ninguno.

### 2. Conectar el token de Meta no hacía nada — **GRAVE, arreglado**

`createDestination` nunca escribía la columna `execution_class`, así que todos
los destinos quedaban en `'browser'` por omisión, incluidos la Fan Page e
Instagram.

Consecuencia: podías cargar el token, probar la conexión, ver "Anda bien"… y el
destino seguía yendo al Worker, que para la Fan Page por API no tiene camino.
El despachador del servidor no lo miraba nunca porque filtra por esa columna.

**Toda la capa de API estaba construida y desconectada de la puerta de
entrada.** Es el tipo de bug que no rompe nada visiblemente: simplemente no
pasa lo que tenía que pasar.

Arreglado en dos partes: el alta ahora le pregunta al registro de providers por
dónde sale cada destino, y una migración corrige las filas que ya están mal
guardadas.

### 3. Instagram no lo publica nadie — **abierto, necesita decisión tuya**

Un destino `instagram_feed` hoy queda en tierra de nadie:

- El **Worker** lo rechaza: sólo sabe `facebook_group` y `facebook_page`
  (`social-worker/index.js:260`).
- El **servidor** ahora sí lo va a tomar, pero necesita el token de Meta
  aprobado por App Review.

Antes del arreglo del punto 2, un destino de Instagram lo reclamaba el Worker y
lo fallaba con "Destino no disponible aún" hasta agotar los reintentos. Ahora
espera al servidor, que es lo correcto — pero **no va a publicar hasta que
Meta apruebe los permisos**.

No lo arreglo por mi cuenta porque la decisión es tuya: o esperás la App
Review, o sacás Instagram de la lista de destinos hasta entonces para que no
quede nada colgado en la cola.

---

## B. CÓDIGO MUERTO

Dos funciones que escribí y nunca conecté. Aparentan funcionalidad que no
existe, que es la peor clase de código muerto:

| Qué | Dónde | Estado |
| --- | --- | --- |
| `alcanceDePosteo()` | `services/social/metaApi.js` | Nadie la llama |
| `listarProviders()` | `services/social/providers.js` | Nadie la llama |

`alcanceDePosteo` es la que trae las métricas reales de alcance de un posteo.
Está escrita y probada, pero no hay nada que la invoque: hoy el dashboard sólo
muestra métricas de ejecución. Conectarla es media hora de trabajo y depende
del mismo token que el punto 3.

**No las borro** porque son correctas y van a hacer falta. Pero quedan
anotadas: hoy no hacen nada.

---

## C. LO QUE ESTÁ BIEN

No todo son malas noticias, y conviene saber qué se puede dar por firme.

### Seguridad

- **Las rutas del panel están protegidas.** `router.use(auth)` y
  `requirePermission('marketing.view')` sobre todo el módulo.
- **El Worker se autentica con su propia clave**, comparada con
  `timingSafeEqual`, y su router **no toca la cookie del panel**. No puede leer
  clientes, pedidos ni sesiones.
- **El token de Meta se guarda cifrado** con AES-256-GCM y no vuelve nunca al
  navegador. Una auditoría propia encontró que sí estaba viajando cifrado en
  `listIdentities`; ya no.
- **Los mensajes de error de Meta se limpian** antes de guardarse: tienen tres
  reglas que tapan el token, cada una con su test.
- Se respeta lo pedido en el punto 43: sesión manual, sin evasión de controles,
  sin exportar cookies.

### La cola

- Un solo módulo de política (`politicaEnvio.js`), consultado igual por los dos
  motores. No hay dos criterios de cupo sobre la misma identidad.
- Los comandos no pasan por el freno: se puede diagnosticar aunque la cola esté
  esperando.
- El excedente se programa para mañana en vez de fallar.
- Los estados neutros no ensucian el resumen de la campaña.

### Cobertura

86 tests contra la base, todos verificados rompiendo el código a propósito.

---

## D. LO QUE DEPENDE DE VOS

Nada de esto lo puedo hacer yo:

1. **App Review de Meta** para `pages_manage_posts`,
   `instagram_content_publish` y `read_insights`. Sin eso la Fan Page e
   Instagram no publican por API.
2. **`PUBLIC_URL` en Railway.** Meta baja las imágenes él mismo desde internet;
   sin esa variable, publicar con foto falla.
3. **`DATA_DIR` en Railway Variables**, para que la base sobreviva a los
   deploys. Sigue sin verificarse.
4. **La prueba crítica**: Worker andando, Chrome en el 9222, sesión de Facebook
   iniciada a mano. Sin eso puedo seguir construyendo, pero no puedo validar
   que se publique de verdad.
5. **Decidir qué hacer con Instagram** mientras tanto (punto A.3).

---

## E. LO QUE APRENDÍ DE ESTA AUDITORÍA

El bug del punto 1 estuvo tapado detrás de veintipico de tests en verde. La
causa no fue no testear: fue **testear con datos inventados**.

Cada vez que un fixture usa un valor que el sistema real nunca produce, el test
deja de proteger y pasa a dar una falsa sensación de seguridad. Es más
peligroso que no tener test, porque nadie vuelve a mirar lo que ya está en
verde.

De acá en adelante, los fixtures de este módulo usan los tipos reales.

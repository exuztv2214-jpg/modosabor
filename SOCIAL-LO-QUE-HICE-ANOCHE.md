# Social — lo que quedó hecho

*22 de agosto de 2026*

---

## Lo primero: lo que te toca a vos

Son dos doble-clics y un login. Sin esto, los grupos siguen en cero.

1. **`social-worker\abrir-chrome-social.cmd`** — abre un Chrome aparte, con perfil propio.
2. **Iniciá sesión en Facebook en ESE Chrome.** Es un perfil separado del tuyo de todos los días: la sesión no se hereda. Yo no puedo hacer esto porque implica poner tu contraseña.
3. **`social-worker\iniciar-worker.cmd`**

Después de eso, "Sincronizar esta identidad" en Destinos trae los grupos. Las dos identidades, no una.

**Y reiniciá el servidor** para que tome la variable nueva del `.env`.

---

## Lo que se puede hacer ahora y antes no

| | Fan Page | Instagram | Perfil | Grupos |
|---|---|---|---|---|
| Publicación | API | API | Worker | Worker |
| **Reel** | **API** | **API** | — | — |
| **Historia** | **API** | **API** | — | — |
| **Carrusel** | — | **API** | — | — |

Lo que dice **API** sale del servidor: sin navegador y sin que la PC del local esté prendida.

---

## Los formatos

En **Crear** ahora elegís arriba de todo: Publicación, Reel, Historia o Carrusel.

El formato que no se puede usar con los destinos que elegiste **se muestra apagado, no escondido**, y al pasar el mouse dice por qué. Si lo escondiéramos, ibas a estar buscando el reel sin enterarte nunca de que el problema es el grupo que tenés tildado.

Cada formato muestra sus requisitos de Meta a la vista, porque son la causa de casi todos los rechazos:

- **Reel** — vertical 9:16, mínimo 540×960, entre 3 y 90 segundos, hasta 30 por día
- **Historia** — vertical, el video no pasa de 60 segundos, y la foto **no puede haberse usado antes en otra publicación** (ese es de Meta y sorprende a todo el mundo)
- **Carrusel** — entre 2 y 10 piezas, todas se recortan con la forma de la primera

---

## Los grupos de la Fan Page

Antes esto fallaba a propósito, con este mensaje:

> *"todavía no se puede sincronizar los grupos de la Fan Page. Falta implementar el cambio de identidad."*

Ya está implementado. El Worker entra al menú de perfil de Facebook, cambia a la página, **verifica que el cambio haya pasado de verdad**, lee los grupos, y **vuelve a la identidad de antes**.

Las dos verificaciones no son paranoia:

- **Si no verificara el cambio**, el día que Facebook mueva el menú traeríamos los grupos del Perfil y los guardaríamos como si fueran de la Page. La lista quedaría llena, con nombres creíbles, y el error aparecería semanas después: publicaciones que fallan en grupos donde la Page nunca estuvo.
- **Si no volviera**, el próximo comando —una publicación del Perfil— saldría publicada por la Page sin que nadie lo pida. El regreso está en un `finally`, así que pasa incluso cuando algo se rompe.

---

## Dos bugs que aparecieron en el camino

**1. La vuelta de Facebook te tiraba al puerto equivocado.** El callback hacía un salto relativo, que se resuelve contra el servidor de la API — el 3001, no el 5173. Terminabas en un "Cannot GET /social" **con la conexión ya hecha y guardada**. En producción no se habría notado; en tu PC, siempre.

Le puse variable propia (`FACEBOOK_PANEL_URL`) en vez de usar `PUBLIC_APP_URL`: esa última es la que va en los links de WhatsApp y en los tickets, así que apuntarla a localhost te dejaba a los clientes con un link muerto.

**2. Volvías al Dashboard, pero el selector de páginas vive en Destinos.** Ese componente ni se montaba, así que no aparecía nada.

---

## Cómo está verificado

**55 tests nuevos** y **18 mutaciones**: rompí cada arreglo a propósito y confirmé que los tests lo agarran. Un test que sigue verde con el bug puesto no sirve para nada.

Algunas de las cosas que rompí para comprobar:

- Que la historia de foto saliera **también** al feed (dos publicaciones donde se pidió una)
- Que el reel quedara en borrador en vez de publicarse
- Unificar los topes de reel e historia — son 90 y 60, y es fácil confundirlos
- Que a los reels de Instagram se les exigiera JPEG, siendo puro video
- Que el carrusel mandara las fotos al revés
- Que el token del video se pasara a la URL, donde queda en los logs
- Que los grupos aceptaran reels

Las 18 fallaron como corresponde.

---

## Lo que sigue sin poder hacerse, y no es nuestra culpa

**Publicar en grupos por API.** Meta eliminó la Groups API completa en **abril de 2024**. Buffer, Hootsuite, Meta Business Suite y Metricool también perdieron los grupos. Lo que ves en tutoriales de Metricool sobre grupos es de antes de esa fecha.

Por eso existe el Worker. No es un atajo: es el único camino que queda.

**Publicar en el perfil personal por API.** Meta sólo permite Páginas.

**Instagram puede pedir App Review.** La conexión está hecha, pero Instagram es más estricto que Facebook. Si rechaza, Facebook va a andar igual.

---

## Lo que no probé

**Ninguna de estas funciones habló con Facebook todavía.** Están escritas contra la documentación de v25.0 y probadas contra respuestas simuladas, pero el primer posteo real lo tenemos que hacer juntos — no lo hago solo porque sale público en tu página.

También falta: subir un video desde el compositor todavía no calcula la duración. Sin ese dato el reel se sube igual y decide Meta, pero avisar antes es mejor que subir 40 MB para que te lo rechacen.

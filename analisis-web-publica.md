# Web pública de Modo Sabor — análisis competitivo

**Fecha:** 6 de agosto de 2026
**Comparada contra:** Pedix, Fudo, OlaClick, MiRestoApp, Mi Carta Online, y el estándar de UX de pedidos online 2026.

---

## Resumen en una línea

La web tiene **más funcionalidad que casi toda la competencia** (carrito real, variantes, cupones, seguimiento en vivo, club de fidelidad). Lo que la hace ver menos profesional no es que le falte: es que **tarda en cargar y esconde la comida detrás de un banner gigante**.

---

## 1. El problema más caro: pesa demasiado

Medido sobre el build real de hoy:

| Qué carga un cliente al abrir la carta  | Peso                           |
| --------------------------------------- | ------------------------------ |
| JavaScript + CSS de la primera pantalla | **740 KB** (214 KB comprimido) |
| De eso, React y librerías               | 323 KB                         |

**Por qué importa acá específicamente.** El estándar de 2026 es cargar en menos de 3 segundos, e idealmente menos de 2 en celular. Google midió que pasar de 1 a 5 segundos de carga aumenta un 90% la probabilidad de que la persona se vaya. Otro estudio: la conversión cae de 40% (1 segundo) a 29% (3 segundos).

Con 4G saturado de Monteros a la hora del almuerzo —que es justo cuando la gente pide— 214 KB tardan alrededor de 1 segundo sólo en bajar, más el tiempo de que el celular lo procese. Un teléfono de gama baja suma 1 a 2 segundos más. **Estamos en el límite o pasados.**

**La causa concreta.** En `App.jsx`, todas las pantallas del panel se cargan con `lazy()` —bien— pero `WebPublica` se importa de forma directa (línea 25). Eso la mete en el bundle principal junto con todo lo que arrastra: framer-motion para las animaciones, el sistema de carrito completo, los modales.

**Qué haría:**

1. Que la web pública sea su propio bundle, independiente del panel.
2. Sacar `framer-motion` de la web pública. Las animaciones de entrada del hero se hacen con CSS puro y ahorran ~40 KB.
3. Cargar `CartDrawer`, `ProductDetailModal` y `VariantModal` recién cuando el cliente toca algo. Hoy los tres viajan en la carga inicial aunque el 60% de las visitas sólo mira la carta y se va.

Objetivo realista: **bajar de 214 KB a menos de 90 KB.** Eso solo ya cambia la percepción de "profesional".

---

## 2. El hero tapa la comida

Hoy el hero mide **620px de alto en celular** (720px en desktop). La pantalla de un celular común son ~650px útiles. O sea: **el cliente abre la carta y no ve un solo plato hasta que hace scroll.**

El dato que lo contradice: **45% de los visitantes de una web de restaurante busca fotos de comida primero.** Y la recomendación de 2026 es tener el botón de pedido visible sin hacer scroll.

Mirá cómo lo resuelven los que viven de esto:

- **OlaClick** (la rotisería que revisé): logo chico, cartel de "Abierto", botón "Pedir aquí", dirección. Cero banner. Vas directo al menú.
- **Pedix**: logo, categorías, listo. La primera pantalla ya son las categorías clickeables.

Ninguno usa un hero de pantalla completa. No es que no sepan diseñar: es que **saben que el banner no vende comida, la comida vende comida**.

**Qué haría:** bajar el hero a ~280px en celular, con lo único que la gente necesita saber al llegar: si están abiertos, cuánto tarda, que el envío es gratis, y el botón de pedir. Debajo, inmediatamente, los platos.

Aparte: el hero tiene **cuatro capas de degradado superpuestas** más `backdrop-blur` en varias cajas. En un celular de gama baja eso se nota como tirones al hacer scroll.

---

## 3. Las fichas de producto tienen letra de 9 y 10 píxeles

En `ProductoCard.jsx` hay texto en `text-[9px]` y `text-[10px]`, en mayúsculas y con letter-spacing. Es el mismo patrón que ya sacamos del panel de administración, pero acá es más grave: **el panel lo usa tu equipo, esto lo usa un cliente que decide si te compra.**

El mínimo recomendado para celular es 16px en el texto corriente, sin necesidad de hacer zoom.

También noté que el precio compite visualmente con las etiquetas de promo, cuando debería ser lo segundo más visible después de la foto.

**Qué haría:** foto grande, nombre en 16px, precio grande y claro, una sola etiqueta si hace falta, y botón de agregar bien grande para el dedo pulgar.

---

## 4. Lo que ya tenés y la competencia no

Esto vale remarcarlo, porque conviene explotarlo en vez de rehacerlo:

| Función                                 | Modo Sabor | Pedix  | OlaClick | Fudo |
| --------------------------------------- | ---------- | ------ | -------- | ---- |
| Carrito con variantes y guarniciones    | ✅         | básico | básico   | ✅   |
| Seguimiento del pedido en vivo con mapa | ✅         | ❌     | ❌       | ❌   |
| Club de fidelidad con QR                | ✅         | ❌     | ❌       | ❌   |
| Cupones propios                         | ✅         | ❌     | ❌       | ✅   |
| Menú del día como sección propia        | ✅         | ❌     | ❌       | ❌   |
| Envío gratis a todo Monteros            | ✅         | —      | —        | —    |
| Sin comisiones por pedido               | ✅         | ✅     | ✅       | ✅   |

**El seguimiento en vivo es tu mejor activo y hoy está escondido.** Ninguna plataforma de la competencia te muestra el repartidor en un mapa. Eso es lo que hace PedidosYa, y es la razón por la que la gente les tiene confianza. Vos lo tenés y no lo estás mostrando en ningún lado de la web.

---

## 5. El menú del día merece ser la portada

Tu negocio real es el menú del día: canelones, milanesas, el ejecutivo. Eso cambia todos los días y es lo que la gente quiere saber al mediodía.

Hoy es una categoría más dentro de la carta. **Debería ser lo primero que se ve al entrar**, con la fecha visible ("Hoy, jueves 6") y los platos de hoy en tarjetas grandes. Es la diferencia entre "una web de restaurante" y "la web donde miro qué hay hoy".

Mi Carta Online arma su producto entero alrededor de esta idea para rotiserías, justamente porque funciona.

---

## 6. Lo que falta según el estándar 2026

De las 8 expectativas que releva el estudio de Beyond Menu, cumplís 5. Las que faltan:

- **Confirmación con tiempo estimado.** Tras confirmar, el cliente debería ver "Listo en 35 minutos aprox." No sólo que se recibió.
- **Repetir el último pedido con un toque.** Tenés el historial del cliente en el sistema. Un botón "Pedir lo mismo de la última vez" es de lo que más levanta la recompra.
- **Reseñas visibles.** No hay ninguna señal social en la web. Si tenés reseñas de Google, mostrarlas arriba pesa mucho en la confianza de alguien que entra por primera vez.

---

## Prioridad sugerida

| #   | Qué                                                    | Impacto | Trabajo |
| --- | ------------------------------------------------------ | ------- | ------- |
| 1   | Achicar el hero y subir los platos                     | Alto    | Bajo    |
| 2   | Menú del día como portada                              | Alto    | Bajo    |
| 3   | Agrandar letras y precios en las fichas                | Alto    | Bajo    |
| 4   | Separar el bundle de la web pública                    | Alto    | Medio   |
| 5   | Sacar framer-motion y diferir los modales              | Medio   | Medio   |
| 6   | Mostrar el seguimiento en vivo como argumento de venta | Medio   | Bajo    |
| 7   | Repetir último pedido                                  | Medio   | Medio   |
| 8   | Tiempo estimado en la confirmación                     | Medio   | Bajo    |

Los primeros tres son media jornada de trabajo y son los que más se notan.

---

## Fuentes

- [Beyond Menu — What Diners Expect When Ordering Online in 2026](https://get.beyondmenu.com/blog/restaurant-online-ordering-ux/)
- [Pedix — Tienda online para vender por WhatsApp](https://info.pedix.app/)
- [Pedix — ejemplo de carta real](https://pedix.app/tiempodesaboresmenu)
- [Fudo — Software para restaurantes](https://fu.do/es/)
- [OlaClick — ejemplo de rotisería](https://rotiseria-argentina.ola.click/)
- [MiRestoApp — sistema para rotiserías](https://mirestoapp.com.ar/)
- [Mi Carta Online — carta digital para rotisería](https://micartaonline.ar/blog/carta-digital-rotiseria/)
- [DoorDash — Restaurant Website Guide 2026](https://merchants.doordash.com/en-ca/blog/building-restaurant-website)
- [Chowly — 7 elementos de una web de restaurante que convierte](https://chowly.com/resources/blogs/restaurant-website-design-7-elements-of-a-high-converting-restaurant-website/)

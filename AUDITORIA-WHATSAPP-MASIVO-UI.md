# WhatsApp Masivo: qué le falta a la pantalla

Auditoría de lo que tenemos contra tres referencias concretas, mirando el código
de cada una y no las capturas de marketing.

**Lo que se auditó**

| Fuente | Qué es | Dónde |
| --- | --- | --- |
| El script de Kimi | El que usás hoy para mandar. 1.996 líneas de HTML, 37 KB de CSS | `Documents/kimi/Workspaces/masivos` |
| BulkPro | Panel open source de envío masivo, React + Tailwind + Framer Motion | GitHub, `kunaldevelopers/whatsapp-bulk-sender-dashboard` |
| Wati / respond.io / AiSensy | Las plataformas comerciales que dominan el mercado | Comparativo de respond.io, enero 2026 |
| **Lo nuestro** | `client/src/pages/WhatsAppMasivo.jsx` | 2.600 líneas |

---

## 1. El resumen en una tabla

| | Kimi | Nosotros |
| --- | --- | --- |
| Contactos en tarjetas | **Sí**, `cardHtml()` | No, sólo tabla |
| Contactos en tabla | Sí, `filaHtml()` | Sí |
| Poder elegir entre las dos | **Sí** | No |
| Buscador | Nombre, teléfono **y zona** | Nombre y teléfono |
| Filtros | **Cuatro** desplegables | Uno |
| Contadores en vivo arriba | **Cuatro chips** | Ninguno |
| Foto del contacto | Sí, con inicial de respaldo **de color** | Sí, con inicial gris |
| Panel de detalle | **Sí**, cajón lateral con historial y notas | No |
| Seleccionar varios | **Sí**, casilla en cada tarjeta | No |
| Etiquetar con un click | **Sí**, tres botones en la tarjeta | Hay etiquetas, pero no en la lista |
| Confirmar antes de algo grave | 9 confirmaciones | **1** |
| Avisos | Nativos del navegador | Toast propio (33 usos) |

Traducido: **en avisos estamos mejor que Kimi; en la pantalla de contactos
estamos bastante peor.**

---

## 2. Lo que pediste, punto por punto

### a) Los contactos como tarjetas

Kimi arma cada contacto así:

- **Foto** arriba a la izquierda. Si no hay, la inicial del nombre sobre un
  color — y el color sale de un hash del nombre, así que a cada persona le toca
  siempre el mismo. Ana siempre es violeta, Diego siempre es verde. Se reconoce
  de reojo, sin leer.
- **Nombre y teléfono** formateado.
- **Chips de contexto**: la zona, si es de otro país, si ya se le envió hoy, a
  qué segmentos pertenece.
- **Los números del contacto**: cuántos envíos, cuántas respuestas, cuántos
  pedidos, y la fecha del último.
- **Tres botones de etiqueta** —Frecuente, Ejecutivo, Económico— que se marcan
  con un click sin salir de la lista.
- **Una casilla** para excluirlo del envío.
- Si está excluido o pausado, la tarjeta entera se apaga.

Y hay un detalle que se nota que sufrió: **sólo muestra dos chips y un "+2"** con
el resto en el título. El comentario del código lo dice —con cuatro segmentos la
tarjeta se desarmaba y los chips se montaban unos sobre otros—. Eso es un
problema que ya alguien resolvió y que nosotros vamos a tener igual.

**Nosotros hoy:** una fila de tabla con foto, nombre, teléfono, score, estado y
fecha. Nada más.

### b) Búsqueda

Kimi busca por **nombre, teléfono o zona**. Nosotros por nombre y teléfono.

Falta poco, pero falta.

### c) Filtros

Kimi tiene **cuatro** desplegables, y cada uno responde a una pregunta real:

1. **Tipo** — Argentina / otros países / sin número / empresas / sin analizar
2. **Segmento** — se llena solo con los segmentos que existen
3. **Zona** — se llena sola con las áreas detectadas
4. **Etiqueta** — Frecuente / Ejecutivo / Económico / sin etiqueta

Nosotros tenemos **uno**: todos / habilitados / excluidos / con score.

El de "otros países" no es un capricho: mandarle a un número que no existe o de
otro país es de las cosas que más rápido hacen que marquen el tuyo.

### d) Modales de alerta

**Kimi no tiene.** Usa `confirm()` y `alert()` del navegador, que son esas cajas
grises feas del sistema operativo.

**Nosotros estamos mejor:** hay un toast propio, usado en 33 lugares.

Lo que sí falta de nuestro lado son los **carteles fijos en la pantalla** para lo
que no es un aviso pasajero. Un toast dura tres segundos; que el número esté
desconectado, o que haya cuatro mensajes fallados, tiene que quedar a la vista
hasta que se resuelva.

### e) Modales de confirmación

Acá estamos mal los dos, pero nosotros peor.

**Kimi confirma 9 acciones.** Nosotros **una sola**: el envío de la campaña. Y usa
`window.confirm`, la caja gris del navegador.

Lo que hoy pasa sin preguntar nada:

- **Detener una campaña a mitad de camino.** Los que faltan no se recuperan.
- **Pausar el motor.**
- **Sacar a alguien de la lista de bajas.** Volvés a escribirle a quien pidió que
  no lo hagas — la forma más rápida de que te reporten.
- **Desconectar WhatsApp**, que obliga a escanear el QR de nuevo.
- **Bajar las fotos de toda la agenda**, que tarda varios minutos y ocupa el
  número.

Kimi confirma la de las fotos con un texto que explica el costo: *"Tarda varios
minutos. Los perfiles con privacidad quedan sin foto."* Eso es lo que hay que
copiar: **la confirmación no es un "¿estás seguro?", es contar qué va a pasar.**

---

## 3. Lo que falta y no nombraste

### El panel lateral del contacto

Kimi tiene un cajón que se abre desde el costado con:

- Los números de esa persona: enviados, respuestas, pedidos
- **Historial reciente** de la conversación
- **Notas y seguimiento**
- **Respuestas rápidas**

Nosotros abrimos las notas y etiquetas en una tarjeta al costado, sin historial
ni respuestas rápidas.

### Elegir varios a la vez

En Kimi cada tarjeta tiene su casilla y se puede armar una campaña con los que
elegís a mano. Nosotros no tenemos selección múltiple en ninguna lista.

### Contadores arriba de la lista

Kimi muestra cuatro chips en vivo: Total, Excluidos, Enviados hoy, Analizados.
Se ve el tamaño de lo que estás mirando sin bajar hasta el final.

### Vista previa del mensaje mientras escribís

BulkPro lo destaca como una de sus siete funciones principales: *"Live WhatsApp
Preview: real-time visualization of how your message will look on a recipient's
phone."*

Nosotros lo agregamos hoy en el compositor. **Ya está.**

### Lo que sólo tienen las comerciales

- **Armador visual de automatizaciones** — respond.io, Wati
- **Secuencias** — mandar uno hoy y otro a los tres días si no contestó
- **App de celular** — todas
- **Detectar la intención escribiéndola** en vez de listar palabras clave

---

## 4. Qué haría, en orden

**Primero — la pantalla de Contactos, que es la que señalaste**

1. Tarjeta con foto, chips de contexto, números del contacto y etiquetas de un
   click. Con el tope de dos chips y "+N", que en Kimi ya costó aprender.
2. Inicial de color derivado del nombre, no gris.
3. Botón para pasar de tarjetas a tabla y volver.
4. Los cuatro filtros, no uno.
5. Buscar también por zona.
6. Contadores en vivo arriba.
7. Casillas para elegir varios y armar una campaña con ellos.

**Segundo — las confirmaciones que faltan**

Un diálogo propio, con el estilo del sistema, que **explique la consecuencia** en
vez de preguntar si estás seguro. Para detener, pausar, quitar una baja,
desconectar y bajar fotos.

**Tercero — el cajón del contacto**

Historial de la conversación, notas y respuestas rápidas en un panel lateral.

**Cuarto — carteles fijos**

Para lo que no puede desaparecer en tres segundos: desconectado, mensajes
fallados, reclamos sin responder.

---

## 5. Una cosa que conviene decir

Casi todo lo que falta es **de pantalla, no de motor**. El servidor ya sabe
etiquetar, ya guarda notas, ya tiene el historial, ya calcula los segmentos.

Es el mismo patrón que venimos encontrando todo el día: programar campañas ya
funcionaba, importar contactos ya funcionaba, mandar fotos y PDF ya funcionaba
—y ninguna de las tres se podía tocar desde la pantalla—.

Lo que falta no es construir el sistema. Es **mostrarlo.**

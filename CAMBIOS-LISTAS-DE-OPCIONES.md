# Listas de opciones compartidas — qué se hizo

Sesión del 9 de agosto de 2026. Nada de esto está commiteado todavía.

---

## El problema

La carta no podía expresarse sin repetir trabajo. Los cuatro agregados de
hamburguesa —queso extra, medallón, papas, huevo— estaban cargados **idénticos
en dieciséis platos**. Subirle $200 al queso eran dieciséis ediciones, y
alcanzaba con saltearse una para vender el mismo agregado a dos precios.

Lo mismo con las guarniciones, las salsas y los gustos: cada plato guardaba su
copia adentro de un campo de texto.

**Lo que sí funcionaba y no se tocó:** las pizzas ya tienen sus cuatro
combinaciones en un solo grupo, las empanadas sus dos, las milanesas carne y
pollo, los sandwichs chico y grande. Eso ya estaba bien resuelto.

---

## La decisión de diseño

Las listas se guardan aparte, pero **se mezclan adentro de `variantes` y
`extras` al leer un producto**.

Eso significa que el TPV, la web pública, la app del rider, la comanda de
cocina y el descuento de stock siguen viendo el mismo JSON de siempre. Ninguno
tuvo que cambiar. Los pedidos ya cerrados también se siguen leyendo igual,
porque guardan el nombre de la opción como texto y no un id que haya que
resolver.

**Si se repiten, gana lo cargado a mano en el plato.** Es a propósito y en esa
dirección: mientras se van pasando los dieciséis platos a la lista compartida,
cada uno todavía tiene los suyos. El riesgo del otro orden es cobrar dos veces
el mismo agregado.

---

## Archivos nuevos

| Archivo                                            | Líneas | Qué hace                                           |
| -------------------------------------------------- | ------ | -------------------------------------------------- |
| `server/utils/opcionesCompartidas.js`              | 310    | Lee las listas de un plato y las mezcla en su JSON |
| `server/routes/opcionListas.js`                    | 306    | API: crear, editar, borrar, asignar                |
| `client/src/pages/ListasOpciones.jsx`              | 596    | La pantalla                                        |
| `client/src/lib/variantesObligatorias.js`          | 43     | Qué grupos hay que elegir sí o sí                  |
| `server/scripts/verificarListasOpciones.js`        | 434    | Verificación contra base real                      |
| `server/tests/utils/opcionesCompartidas.test.js`   | 247    | Tests                                              |
| `server/tests/utils/variantesObligatorias.test.js` | 179    | Tests                                              |

**Tres tablas nuevas** en `schema.sql`: `opcion_listas`, `opcion_items`,
`producto_opcion_listas`.

## Archivos modificados

`server/routes/productos.js` · `server/services/preciosServidor.js` ·
`server/routes/operacion.js` · `server/db/migrations.js` · `server/db/seed.js` ·
`server/tests/run.js` · `client/src/pages/TPV.jsx` ·
`client/src/components/TPV/TpvVariantModal.jsx` ·
`client/src/components/WebPublica/VariantModal.jsx` ·
`client/src/pages/Productos/` (formulario, hook y utils) · `App.jsx` ·
`SidebarModern.jsx` · `Layout.jsx`

---

## Lo que se puede hacer ahora

En **Catálogo → Listas de opciones**: cargar _Guarniciones_, _Salsas_,
_Agregados_ o _Postres_ una vez, con sus precios, eligiendo si se elige una
sola o se marcan varias.

En cada plato, una sección **Listas compartidas** donde sólo se tilda cuáles
lleva.

Y el botón que hace el trabajo de verdad: **asignar a una categoría entera**.
Se elige _Hamburguesas_ y la lista queda en los dieciséis platos de una.

---

## Los cinco errores que aparecieron

### 1. El corredor de tests no corría siete tests

`tests/run.js` hacía `require()` de cada archivo y contaba eso como aprobado.
Los tests escritos con `if (require.main === module) run()` —los siete de esta
sesión— se cargaban, no fallaban, y sumaban al contador **sin ejecutar una sola
comprobación**. `npm test` daba verde sin haber probado nada.

Se descubrió al romper el código a propósito y ver que el resultado no cambiaba.

### 2. Editar un plato le copiaba la lista adentro

El más silencioso, y estuvo a punto de irse a producción.

El formulario de productos carga `variantes` desde la API —que ahora vienen con
las listas mezcladas— y las vuelve a guardar. Sin protección, **abrir un plato y
apretar Guardar le escribía la lista compartida adentro de su propio JSON**. No
rompía nada visible: se veía igual y cobraba igual. A la semana cada plato tenía
otra vez su copia privada y todo esto no habría servido de nada.

Se resolvió marcando lo compartido con `lista_id` y filtrándolo en el editor.

### 3. El interruptor de "obligatoria" no hacía nada

Estaba en la pantalla, se guardaba en la base, viajaba hasta el TPV… y ahí nadie
lo miraba. El TPV y la web exigían elegir en **todos** los grupos, siempre.

Peor que no tenerlo: quien lo apagara creyendo que una salsa era opcional después
no podría cerrar el pedido.

La regla nueva es deliberadamente angosta: **un grupo es opcional sólo si viene
de una lista compartida y esa lista lo dice**. Todo lo cargado a mano adentro de
un plato sigue siendo obligatorio. Al revés, se podría vender una pizza sin
decir si es entera o mitad — y eso no da error en ningún lado, sale una comanda
incompleta y se discute en el mostrador.

### 4. Los precios del seed en pesos, leídos como centavos

De la misma familia que los otros errores de plata del proyecto.

```
seed.js:  menu_dia_precio_economico = '5000'    → se leía $50
la base:  500000                                → $5.000  ✅
```

La base del local está bien porque el seed sólo escribe las claves que faltan.
Pero **una instalación nueva arrancaba con el menú del día a cincuenta pesos y
el postre a diez**.

### 5. Al deduplicar ganaba la última forma escrita

Cargar _Papas_ y más abajo _PAPAS_ dejaba la lista con la versión a los gritos.
Ahora gana la primera forma en que se escribió.

---

## La unificación con el menú del día

Había **dos sistemas haciendo lo mismo**: el menú del día tenía su propia lista
maestra de guarniciones en `configuracion`, y al lado quedaron las listas
compartidas.

Ahora la fuente es una sola. Lo que se carga en Operación escribe en la lista
compartida _Guarniciones_, que es la misma que se le asigna a las milanesas.

- La migración corre sola en el primer arranque y copia las trece guarniciones.
- **No borra la clave vieja.** Queda como red: si algo falla, el menú del día
  vuelve a leer de ahí y no se queda sin guarniciones en pleno servicio.
- La pantalla de Operación no cambió: recibe la misma lista de nombres.

**Lo que no se unificó, y está bien así:** que la Costillita ofrezca siete
guarniciones y las Albóndigas seis. Eso no es una copia, es una decisión plato
por plato.

---

## Verificación

```
27 tests pasados · 3 fallados
16 comprobaciones contra una base real (SQLite de verdad, en memoria)
22 consultas de la API compiladas contra la estructura real
lint sin errores · build en 34s
```

Los 3 tests fallados son del entorno Linux donde se trabajó: la librería de base
está compilada para Windows. En la máquina del local pasan.

**Trece mutaciones**: cada arreglo se probó volviendo a romperlo a propósito y
confirmando que el test lo detecta. Una no la agarró al primer intento —comentar
la llamada a la migración dejaba el chequeo en verde, porque encontraba el texto
adentro del comentario—. Es la tercera vez que pasa lo mismo en este proyecto;
ahora el script saca los comentarios antes de buscar.

---

## Lo que falta

**Datos, y sólo los puede tocar el dueño:**

- El postre y el postre + bebida están en **$0** en Operación → Menú del día.
- La **Napolitana Especial media muzza está a $5.500 y debería estar a $6.000**,
  según la regla de la casa (mitad = entera ÷ 2 + $500). Es la única de
  diecisiete fuera de regla.

**Migrar los datos:** las tablas están vacías. Los dieciséis agregados de
hamburguesa siguen copiados uno por uno. Hay que crear la lista, asignarla, y
**después borrar los viejos de cada plato** — si no, quedan los dos.

**Sin hacer:** los ñoquis y fideos caseros con salsa no existen en la carta. Los
sandwichs siguen sin agregados. Y la traducción de errores de la base quedó a
medias, sin test.

**Y lo principal:** esto nunca se vio funcionando. Se verificó el SQL, las reglas
y el cableado, pero nadie abrió la pantalla. Las fallas de uso salen recién
cargando una guarnición y vendiendo una milanesa.

---

## Nota sobre el repo

Durante la sesión entró un commit —`feat: add native mozo ordering app`— que se
llevó adentro el cambio de `schema.sql` junto con lo suyo. No se perdió nada,
pero quedó mezclado con un commit que dice otra cosa.

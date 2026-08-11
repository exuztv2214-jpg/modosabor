# Productos y Categorías: FoodKing contra el nuestro

Leyendo las migraciones y las tablas de los dos, no los nombres.

---

## Cómo modela cada uno un plato

**FoodKing** parte el producto en cinco tablas:

```
items               el plato
item_categories     su categoría
item_attributes     los grupos de variante, definidos una vez
item_variations     las opciones de cada grupo, por plato
item_extras         los agregados, por plato
```

**Nosotros** metemos todo en una fila:

```sql
productos.variantes  TEXT DEFAULT '[]'    -- JSON
productos.extras     TEXT DEFAULT '[]'    -- JSON
```

Esa decisión nuestra tiene una consecuencia concreta y ya la pagamos: **los
recargos dentro de `extras` eran invisibles para el conversor de plata.** Un
número adentro de un texto no es un número, así que el extra de $1.200 se
guardaba en pesos mientras `productos.precio` —en la misma fila— se guardaba en
centavos. Dos verdades distintas en una sola fila, y en direcciones opuestas
según qué pantalla lo hubiera cargado.

Lo arreglamos con una excepción especial en el conversor. Con las variantes en
su propia tabla, ese problema no existe.

**No propongo migrar.** Pero si algún día se toca esa parte, esto es lo que hay
que saber.

---

## Lo que ellos tienen y nosotros no

### 1. Advertencias del plato (`caution`)

Un campo de texto libre en cada producto y en cada variante. Es donde va
"contiene maní", "picante", "puede contener trazas de gluten".

Nosotros no tenemos nada parecido —lo busqué en todo el esquema—. Hoy eso vive
en la descripción o en la cabeza del que atiende.

Para un local con menú del día que cambia todos los días, un campo de alérgenos
separado de la descripción es de las cosas más baratas y más serias que se
pueden agregar.

### 2. Los grupos de variante se definen una vez

`item_attributes` es una tabla propia: "Tamaño" existe como entidad, y después
cada plato dice qué opciones tiene de ese grupo.

En el nuestro, cada producto lleva sus grupos adentro de su JSON. Si tenés
veinte platos con "chico / mediano / grande", eso está cargado veinte veces, y
cambiarle el nombre a una opción es entrar a veinte fichas.

### 3. Orden manual de los platos dentro de la categoría

`items.order`, un número por plato.

Nosotros ordenamos así:

```sql
ORDER BY c.orden ASC, p.nombre ASC
```

Las categorías sí tienen orden manual; los platos van alfabéticos. O sea que en
la carta no podés poner primero lo que más te conviene vender. Para un negocio
gastronómico eso es plata: el primer plato de la lista se vende más.

### 4. Quién creó y quién editó cada cosa

Todas sus tablas llevan `creator_id` y `editor_id`.

Nosotros tenemos registro de auditoría en caja, pedidos, compras, personal,
configuración, repartidores y el asistente. **En productos y categorías, cero.**

Nadie sabe quién cambió un precio ni cuándo. En un local donde más de una
persona entra al panel, eso se nota el día que un plato amanece con otro precio.

### 5. Impuesto por plato (`tax_id`)

Cada producto apunta a un impuesto. Nosotros no modelamos impuestos.

### 6. Cosas menores

- **`slug`** para las direcciones web. La nuestra usa números.
- **`item_type`** (vegetariano / no vegetariano). Marginal acá.

---

## Lo que nosotros tenemos y ellos no

Y es más de lo que esperaba:

- **Turno por categoría** (`categorias.turno_id`). Carta de mediodía y carta de
  noche, separadas. Ellos no tienen nada equivalente — su carta es una sola.
- **Ícono y color por categoría.** La suya sólo tiene nombre y descripción.
- **`menu_dia_tipo`** en el producto: si es del menú económico o del ejecutivo.
  Eso es tu negocio y no existe en ningún sistema comprado.
- **Receta con insumos** (`inventario_recetas`), que descuenta stock al vender.
  Ellos no tienen inventario.
- **`costo`** por plato, para el margen. Ellos tampoco.
- **`precio_anterior`**, para mostrar el precio tachado.
- **`tiempo_preparacion`** — que hasta hoy no se usaba y ahora sí.
- **Stock por plato**, con modo directo o por receta.

---

## Qué agregaría, en orden

**1. Advertencias y alérgenos** · una tarde

Un campo de texto en el producto, que se muestre en la carta y salga en la
comanda. Es lo más barato de esta lista y lo único que puede evitar un
problema serio.

**2. Registrar quién toca los precios** · una tarde

`logAudit` ya existe y lo usan siete módulos. Agregarlo en productos y
categorías es repetir un patrón que ya está escrito.

**3. Orden manual de los platos** · una tarde

Una columna `orden` en productos y arrastrar para reordenar. Lo que ponés
primero se vende más.

**4. Grupos de variante reutilizables** · una semana

Es el más caro porque toca el formulario de productos y el JSON existente. Sólo
vale la pena si repetís mucho las mismas variantes entre platos.

---

## Una corrección de antes

Cuando comparé los dos sistemas dije que FoodKing tenía tiempo de preparación y
nosotros no. Lo teníamos —dos veces, el estimado y el real— y lo que faltaba
era usarlo. Ya está resuelto.

Y sobre la app: apunta a `demo.foodking.dev` y espera 49 endpoints con una forma
que no existe en nuestro sistema. Adaptarla es reescribir sus 15 capas de
comunicación y sus 25 modelos, unas 4.400 líneas. Además trae una clave de
Google Maps y un código de licencia escritos en el código, que son de ellos y
vienen iguales en todas las copias vendidas.

# Auditoría de Productos y Categorías

9 de agosto de 2026. `server/routes/productos.js` (401 líneas),
`server/routes/categorias.js` (170), `client/src/pages/Productos/` (7 archivos,
1.700 líneas), `client/src/pages/Categorias.jsx` (1.156).

Todo verificado contra el código y, donde se pudo, contra el servidor de
producción.

---

## 1. Borrar un producto se lleva puesta su receta y su historial

**Es lo más serio de esta auditoría.**

El borrado es real, no una baja:

```js
db.prepare('DELETE FROM productos WHERE id = ?').run(req.params.id);
```

Y hay dos tablas que se van con él en cascada:

```sql
inventario_recetas    producto_id ... ON DELETE CASCADE
menu_dia_historial    producto_id ... ON DELETE CASCADE
```

Las claves foráneas están activas (`PRAGMA foreign_keys = ON` en
`server/db/index.js`), así que esto ocurre de verdad.

Borrar un producto **destruye su receta** —qué insumos lleva y en qué
cantidad, que es trabajo de carga que nadie quiere repetir— y **lo saca del
historial del menú del día**, que es de donde salen los reportes de qué se
cocinó.

Lo que el usuario lee antes de confirmar:

> "El producto se quitará del sistema y dejará de estar disponible para venta."

No dice nada de la receta ni del historial. Alguien que quiere dejar de vender
un plato lee eso y aprieta tranquilo.

**Lo que sí se salva:** las ventas viejas. `pedido_items` guarda el nombre y el
precio del momento, y su `producto_id` queda en nulo en vez de borrarse. La
facturación histórica no se pierde — pero sí el vínculo, así que un reporte de
"lo más vendido" deja de contar ese plato.

**Cómo lo arreglaría:** que el botón de borrar dé de baja (`activo = 0`) en vez
de eliminar, igual que en Personal, y dejar el borrado real detrás de una
confirmación que diga qué se pierde. Un plato desactivado no se vende y no
molesta; borrarlo no aporta nada y cuesta la receta.

---

## 2. El catálogo entero es público, con costos y stock

`GET /api/productos` y `GET /api/productos/:id` no piden login. Está bien que
así sea —de ahí come la web pública— pero devuelven todas las columnas:

```js
'SELECT p.*, c.nombre as categoria_nombre ...';
```

Lo comprobé contra tu servidor, sin ninguna credencial:

```
GET https://modosabor-api-production.up.railway.app/api/productos
→ 82.778 caracteres de catálogo, sin autenticación
```

Y entre lo que devuelve:

```json
"costo": 0
"stock_directo": 16,  "stock_mode": "direct",  "stock": 16
```

**Hoy no filtra nada grave**, porque tenés todos los costos en cero. Pero el
día que los cargues —y deberías, para ver el margen— tu estructura de costos
queda a un click de cualquiera. El stock ya está expuesto ahora mismo:
cualquiera puede ver cuántas porciones te quedan de cada plato.

**Cómo lo arreglaría:** que la respuesta pública liste las columnas que le
hacen falta a la web —nombre, descripción, precio, imagen, categoría,
variantes, extras— en vez de mandar la fila entera. El panel, que sí está
detrás de login, sigue viendo todo.

---

## 3. Borrar una categoría deja los productos sin categoría, en silencio

```js
db.prepare('DELETE FROM categorias WHERE id = ?').run(req.params.id);
```

`productos.categoria_id` es `ON DELETE SET NULL`, así que los platos no se
pierden: quedan sin categoría. Pero nadie avisa cuántos van a quedar
huérfanos, y en la web pública una categoría vacía o un producto suelto se nota
enseguida.

**Cómo lo arreglaría:** contar los productos antes de borrar y decirlo —"esta
categoría tiene 12 platos, van a quedar sin clasificar"—. Es una consulta y una
línea de texto.

---

## 4. El tiempo de preparación se carga y no lo usa nadie

`productos.tiempo_preparacion` existe, se carga en el formulario, se valida, se
guarda y se muestra en el detalle del producto. Busqué quién lo lee para hacer
algo:

```
server/utils/*.js      → nada
server/services/*.js   → nada
```

**La estimación de entrega no lo usa.** Es un campo que le hacés completar a
alguien y no cambia nada.

Y hay una vuelta interesante: `pedidoTrazabilidad.js` **sí mide el tiempo real**
de preparación —los minutos entre "confirmado" y "listo"—. O sea que tenemos el
dato estimado y el dato real, y no los cruzamos nunca.

Acá me corrijo: cuando comparé con FoodKing te dije que ellos tenían tiempo de
preparación y nosotros no. Lo tenemos las dos veces. Lo que no tenemos es el
uso.

**Cómo lo arreglaría:** que la estimación de entrega sume el tiempo del plato
más lento del pedido, y que en la ficha del producto se vea "cargaste 15 min,
en promedio tarda 23". Eso convierte dos datos muertos en uno útil.

---

## 5. Lo que está bien y no hay que tocar

Lo reviso porque tres veces hoy estuve por recomendar algo que ya existía:

- **La plata que entra por el formulario está bien.** Productos sube imagen, o
  sea multipart, que es donde el conversor de pesos suele fallar — pero acá hay
  un `convertMultipartMoney` que corre después del archivo. Es exactamente el
  problema que Personal tenía sin resolver.
- **El stock tiene su test** (`productoStockSchema.test.js`), incluido el caso
  de stock negativo.
- **Variantes y extras** están, y sus recargos se convierten bien desde el
  arreglo de las columnas JSON.
- **`precio_anterior`** existe, así que se puede mostrar el precio tachado.
- **Las categorías tienen turno** (`turno_id`), o sea que se puede separar
  carta de mediodía y de noche.
- **Las imágenes se borran del disco** al borrar el producto o la categoría. No
  quedan archivos huérfanos.

---

## 6. Cosas menores

**`client/src/pages/Productos.jsx` es un archivo de una línea** que reexporta la
carpeta. Funciona, pero es la clase de cosa que confunde: hay dos rutas que
parecen la pantalla y una es un cascarón.

**`Categorias.jsx` tiene 1.156 líneas en un solo archivo**, contra Productos que
está partido en siete. No está roto, pero es el archivo que nadie quiere abrir.

---

## Qué haría, en orden

1. **Que borrar un producto no borre la receta** — es pérdida de datos
   silenciosa y hoy el cartel no avisa. Media tarde si es dar de baja; un día
   si querés las dos opciones.
2. **Sacar el costo y el stock de la respuesta pública** — una tarde. Hoy no
   duele porque no cargás costos; el día que lo hagas, ya está expuesto.
3. **Avisar cuántos productos quedan sin categoría** al borrar una — una hora.
4. **Usar el tiempo de preparación**, o sacarlo del formulario. Un campo que se
   completa y no hace nada es peor que no tenerlo.

Ninguna de las cuatro toca la plata ni los pedidos, así que se pueden hacer sin
riesgo para la operación.

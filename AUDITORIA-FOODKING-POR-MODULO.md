# FoodKing módulo por módulo — leyendo el código

Segunda pasada. La primera miré nombres de archivos y me equivoqué en varias
cosas. Acá abrí los servicios: 627 archivos PHP, 36.643 líneas de aplicación
propia (sin librerías), 289 pantallas Vue.

---

## Antes de nada: dos cosas que encontré y cambian todo

### 1. Cualquiera puede comprar por un peso

`OrderService::myOrderStore` —el endpoint que usa la app del cliente— guarda el
precio que le manda el celular, **sin consultar nunca cuánto vale el plato**:

```php
$requestItems = json_decode($request->items);
foreach ($requestItems as $item) {
    $itemsArray[$i] = [
        'item_id'     => $item->item_id,
        'price'       => $item->item_price,      // ← lo que dijo el cliente
        'total_price' => $item->total_price,     // ← lo que dijo el cliente
    ];
}
```

Lo único que busca en la base es el impuesto. El precio, el subtotal y el total
vienen del pedido HTTP y se guardan tal cual.

Fui a ver si lo atajaba la validación. `OrderRequest` sólo pide que `total` sea
un número. Y la regla `ValidJsonOrder`, que por el nombre promete revisar el
pedido, hace esto y nada más:

```php
if (count($requestItems) == 0) { return false; }
return true;
```

Verifica que la lista no esté vacía. Nada más.

**Cualquiera con el celular puede pedir doscientos mil pesos de comida y pagar
uno.** En un producto que le venden a cientos de restaurantes.

Es exactamente el agujero que nosotros cerramos hace unas semanas cuando
auditamos el camino del pedido desde la web. Nosotros recalculamos todo en el
servidor y usamos el precio de la base; el cliente sólo dice qué quiere y
cuánto.

### 2. Cómo numeran los pedidos — y esto es para hoy

```php
$order->order_serial_no = date('dmy') . $order->id;
```

Fecha del día pegada al id de la base. **No puede colisionar jamás**, porque el
id lo da la base y nunca se repite.

Nosotros usamos un contador guardado en la tabla de configuración, que se lee,
se usa y se vuelve a escribir. Es lo que **hoy tiene el TPV sin poder cobrar**:
el contador quedó atrás del último pedido real y cada intento choca contra la
restricción de único.

Su solución no necesita contador. La nuestra sí, y por eso se rompe.

---

## Módulo por módulo

### Pedidos

Tienen cuatro caminos de alta separados: `myOrderStore` (app del cliente),
`posOrderStore` (mostrador), `tableOrderStore` (mesa) y `FrontendOrderService`
(web). Nosotros tenemos `/interno` y `/publico`, que es más simple y menos
lugar donde equivocarse.

**Lo que sí vale la pena:**

- **`reason` al cancelar.** Nosotros cancelamos y no queda por qué.
- **`preparation_time` por pedido**, que sale de una configuración y se puede
  ajustar. Nosotros estimamos la llegada pero no guardamos lo que tardó.
- **`token`**, un número corto que se le canta al cliente, separado del número
  interno de pedido.

### Cocina (KDS)

Nosotros tenemos KDS. El de ellos hace una cosa que el nuestro no:

```php
->orWhere(function ($subQuery) {
    $subQuery->where('is_advance_order', Ask::YES)
             ->whereDate('order_datetime', Carbon::yesterday());
})
```

Los pedidos encargados con anticipación aparecen en la cocina **el día que hay
que cocinarlos**, no el día que se encargaron. Es un detalle de dos líneas que
hace que el pedido programado sirva de verdad.

### Pantalla de estado en el salón · **lo que más me gustó**

`OrderStatusScreenOrderService`: una pantalla para colgar en el local que
muestra los pedidos en preparación y los listos, por número.

```php
Order::whereNotNull('token')
     ->whereIn('status', [OrderStatus::PREPARING, OrderStatus::PREPARED])
```

Y en la misma pantalla, los nueve platos más pedidos como publicidad.

Para tu mostrador esto es directo: el cliente deja de preguntar "¿falta mucho?"
y el que atiende deja de contestar. Un televisor y una URL.

### Cupones

Validan tres cosas que nosotros no:

- **límite por persona** (`limit_per_user` contra los canjes de ese usuario)
- **vencimiento** con mensaje propio
- **compra mínima**

Nuestros cupones son más flojos. Si alguna vez los usás en serio, el límite por
persona es el que evita que uno solo se lleve la promo diez veces.

### Personal

Acá me equivoqué en la primera pasada: **sí tienen empleados**. No hay tabla
`employees` porque van en `users` con un rol, y hay servicios separados para
**Empleado, Chef, Mozo, Repartidor y Administrador**, cada uno con sus permisos.

Pero es una agenda de personas con permisos. **No hay sueldos, ni adelantos, ni
asistencia, ni liquidaciones.** Eso nuestro sigue siendo único.

### Inventario, caja y compras

Confirmado buscando en los 145 MB completos, no en nombres de tablas: **no
existen**. Las coincidencias que aparecían al buscar "inventory" eran de
librerías de Google que vienen con Laravel — publicidad, no depósitos.

FoodKing no sabe qué hay en la heladera ni cuánto quedó en el cajón.

### IA

Tienen cinco servicios: `AiService`, `AiAgentService`, `AiChatHistoryService`,
`AiUsageService` y una capa abstracta para cambiar de proveedor.

`AiUsageService` es el que me interesa: **llevan la cuenta del consumo**.
Nosotros tenemos el asistente andando y no medimos cuánto gasta. Algún día llega
la factura.

Lo demás de su IA parece un chat que responde; el nuestro ejecuta acciones
—carga pedidos, registra compras— que es otra cosa.

### Instalador y licencia

`InstallerService`, `LicenseService`, `InstallerRequirementsChecker`. Es un
producto para revender: valida licencia, chequea requisitos del servidor, guía
la instalación.

No aplica a vos hoy. Aplicaría el día que quieras vender Modo Sabor a otro
restaurante — y ahí este es el módulo a mirar.

---

## Qué agregaría, en orden

**1. Numerar como ellos** · una tarde · **hacelo apenas se destrabe el TPV**

`fecha + id` en vez de contador. Elimina de raíz la clase de error que hoy te
tiene sin cobrar. El número queda más largo pero nunca más se traba.

**2. Pantalla de estado para el salón** · dos o tres días

Un televisor mostrando qué pedidos están listos. Barato, se ve, y le saca
trabajo al que atiende.

**3. Motivo de cancelación** · una tarde

Una columna y un desplegable. En tres meses te dice dónde se te va la plata.

**4. Que los pedidos programados aparezcan en cocina el día correcto** · una tarde

Dos líneas en la consulta del KDS. Hoy si programás algo se te mezcla con lo de
este momento.

**5. Tiempo de preparación real** · dos o tres días

Ya tenés las marcas de estado. Falta guardar los minutos y promediar, para
prometer con fundamento.

**6. Medir el consumo de IA** · una tarde

Antes de que llegue una factura que no esperabas.

**7. Límite de cupón por persona** · una tarde, cuando uses cupones en serio

---

## Lo que NO les copiaría

El kiosco, el multi-idioma, el multi-moneda, el constructor de páginas, las
quince pasarelas de pago y el instalador con licencia. Todo eso existe porque
venden el producto al mundo. Vos tenés un local en Monteros.

Y sobre todo: **no les copies cómo reciben el pedido.** Ese es su peor código y
nosotros ya lo tenemos mejor.

---

## Lo que esta segunda pasada me corrigió

- Dije que no tenían empleados. **Sí tienen.**
- Dije que `time_slots` eran turnos de entrega. **Son horarios de apertura.**
- Dije que su código era "correcto, anónimo, sin memoria". **Correcto no es**:
  el camino principal del pedido tiene un agujero por el que se puede comprar
  por un peso.

La conclusión de fondo no cambió —ellos venden, nosotros operamos— pero llegué
a ella por el camino equivocado la primera vez.

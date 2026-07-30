# Impresion A6 y Comandas

## Objetivo

Cerrar el primer modulo de impresion realmente util para Modo Sabor sin depender todavia de hardware industrial.

La idea es resolver tres necesidades:

- imprimir una comanda clara para cocina
- imprimir un ticket simple A6 para caja o cliente
- permitir reimprimir desde el dashboard cuando haga falta

## Estado actual del sistema

Hoy el sistema:

- crea pedidos desde `TPV` y `WebPublica`
- muestra pedidos activos en `Pedidos`
- cambia estados en tiempo real por `socket.io`

Hoy no tiene:

- plantillas de impresion
- historial de impresiones
- boton de imprimir o reimprimir
- cola de impresion
- separacion por tipo de salida: cocina, caja, cliente

## Enfoque recomendado

### Fase 1: Rapida y realista

Implementar impresion por navegador con plantillas HTML/CSS optimizadas para A6.

Ventajas:

- no necesita comprar nada extra
- funciona con impresora comun hogarena
- nos deja validar formato, flujo y contenido real del negocio
- sirve tambien para exportar a PDF

### Fase 2: Operativa

Agregar historial de impresiones, reimpresion y control de tipo de documento.

### Fase 3: Profesional

Agregar servicio de autoimpresion local o ESC/POS para cocina/caja cuando el negocio escale.

## Documentos a imprimir

### 1. Comanda cocina

Uso:

- sale cuando entra un pedido nuevo o cuando pasa a `confirmado`
- sirve para cocina y armado

Debe mostrar:

- nombre del negocio
- tipo de pedido: delivery, retiro o mesa
- numero de pedido
- hora
- nombre del cliente
- telefono
- direccion o mesa
- items detallados
- variantes
- extras
- notas del pedido
- tiempo estimado si existe

Formato recomendado:

- sin precios, para que cocina vea solo produccion
- texto grande y limpio
- separacion fuerte entre productos
- una hoja por pedido

### 2. Ticket cliente A6

Uso:

- caja
- entrega al cliente
- respaldo de venta

Debe mostrar:

- logo o nombre del negocio
- direccion y telefono
- numero de pedido
- fecha y hora
- detalle resumido con cantidades
- subtotal
- envio
- descuento
- total
- metodo de pago
- mensaje final configurable

Formato recomendado:

- A6 vertical
- preparado para impresora comun o PDF

### 3. Reimpresion

Uso:

- si la hoja salio mal
- si cocina pide otra copia
- si el cliente la necesita de nuevo

Debe permitir:

- reimprimir comanda
- reimprimir ticket cliente
- guardar fecha e intentos

## Cambios en base de datos

Agregar una tabla nueva:

```sql
CREATE TABLE IF NOT EXISTS impresiones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  area TEXT DEFAULT '',
  estado TEXT DEFAULT 'pendiente',
  copias INTEGER DEFAULT 1,
  intentos INTEGER DEFAULT 0,
  error TEXT DEFAULT '',
  payload TEXT DEFAULT '{}',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  impreso_en DATETIME
);
```

### Significado de campos

- `tipo`: `comanda_cocina`, `ticket_cliente`, `precuenta`
- `area`: `cocina`, `caja`, `cliente`
- `estado`: `pendiente`, `impreso`, `error`, `cancelado`
- `payload`: snapshot del pedido al momento de imprimir

Esto nos da:

- historial
- reimpresion
- base para cola de impresion futura

## Backend necesario

### 1. Utilidad de armado de impresion

Crear utilitario, por ejemplo:

- `server/utils/printTemplates.js`

Funciones recomendadas:

- `buildKitchenPrintData(pedido, config)`
- `buildTicketPrintData(pedido, config)`
- `renderKitchenHtml(data)`
- `renderTicketHtml(data)`

### 2. Nuevas rutas

Agregar en `server/routes/pedidos.js` o crear `server/routes/impresiones.js`:

#### `GET /api/pedidos/:id/impresion/comanda`

Devuelve HTML o JSON listo para imprimir comanda.

#### `GET /api/pedidos/:id/impresion/ticket`

Devuelve HTML o JSON listo para imprimir ticket A6.

#### `POST /api/pedidos/:id/imprimir`

Body sugerido:

```json
{
  "tipo": "comanda_cocina",
  "copias": 1
}
```

Accion:

- arma snapshot
- registra en `impresiones`
- devuelve el documento listo

#### `GET /api/pedidos/:id/impresiones`

Devuelve historial de impresiones del pedido.

## Frontend necesario

### 1. Pagina `Pedidos`

Agregar en cada card:

- boton `Imprimir`
- boton `Reimprimir`

En detalle futuro:

- selector de tipo: comanda o ticket
- historial de impresiones

### 2. Pagina `TPV`

Agregar dos flujos:

- `Confirmar`
- `Confirmar e imprimir`

Comportamiento recomendado:

- si el pedido viene del TPV, mostrar al finalizar opcion inmediata de imprimir ticket y comanda

### 3. Web publica

No imprimir directo desde cliente final.

Lo correcto es:

- el pedido entra
- queda visible en admin
- desde admin o regla automatica sale comanda

## Trigger operativo recomendado

### Regla inicial simple

- pedido creado desde `TPV`: sugerir imprimir ticket y comanda
- pedido creado desde `WebPublica`: generar comanda automaticamente al quedar `nuevo`
- pedido pasa a `confirmado`: permitir reimprimir comanda

### Regla mas segura para cocina

Si queres evitar impresiones accidentales:

- no imprimir al crear
- imprimir solo cuando el operador confirma el pedido

Para Modo Sabor recomiendo empezar asi:

- `WebPublica`: comanda al pasar a `confirmado`
- `TPV`: boton `Confirmar e imprimir`

Eso reduce errores.

## Formato visual propuesto

### Comanda cocina

```text
================================
          MODO SABOR
================================
PEDIDO #45
14:32 - DELIVERY

CLIENTE: Juan Perez
TEL: 11-1234-5678
DIR: Av. Siempre Viva 742

--------------------------------
1x PIZZA ESPECIAL
   Tamano: Grande
   Mitades: Muzza / Napolitana
   Extra: Borde relleno

6x EMPANADAS
   2 Carne
   2 Pollo
   2 J y Q

NOTAS:
Sin aceitunas
--------------------------------
```

### Ticket A6

```text
================================
          MODO SABOR
================================
PEDIDO #45
21/03/2026 14:35

1  Pizza Especial      $ 4.300
6  Empanadas           $ 4.800

Subtotal               $ 9.100
Envio                  $   500
Descuento              $     0
--------------------------------
TOTAL                  $ 9.600

Pago: MercadoPago
Gracias por elegirnos
================================
```

## Configuracion que conviene agregar

En `Configuracion` deberian sumarse estas claves:

- `impresion_formato`: `a6`
- `impresion_auto_tpv`: `0/1`
- `impresion_auto_web`: `0/1`
- `impresion_mensaje_ticket`
- `impresion_copias_comanda`
- `impresion_copias_ticket`

Mas adelante:

- `impresora_cocina`
- `impresora_caja`
- `tamano_fuente_comanda`

## Implementacion por pasos

### Paso 1

Base tecnica:

- crear tabla `impresiones`
- crear utilitario de formateo
- crear endpoint para generar HTML de comanda y ticket

### Paso 2

Frontend:

- agregar boton `Imprimir` en `Pedidos`
- agregar boton `Confirmar e imprimir` en `TPV`
- abrir ventana de impresion con plantilla A6

### Paso 3

Historial:

- guardar registro en tabla `impresiones`
- mostrar reimpresion

### Paso 4

Calidad:

- separar claramente comanda de cocina y ticket cliente
- probar con pedidos reales de pizza, empanadas y milanesas

## Casos de negocio que hay que cubrir bien

### Pizzas

- pizza entera
- pizza por mitades
- tamano
- extras

### Empanadas

- media docena
- docena
- detalle de gustos por cantidad

### Milanesas

- tipo de mila
- guarnicion o variante
- extras o agregados

## Riesgos si no lo hacemos bien

- cocina recibe pedidos confusos
- se pierden notas importantes
- se imprime distinto segun modulo
- no se puede reimprimir cuando falla una hoja

## Resultado esperado de este modulo

Cuando esta fase quede terminada, Modo Sabor ya tendra:

- pedido operativo desde web y TPV
- impresion clara para cocina
- ticket A6 para cliente o caja
- reimpresion desde pedidos
- base lista para autoimpresion futura

## Siguiente modulo recomendado despues de esto

Una vez cerrado este bloque, el siguiente salto fuerte es:

1. tracking del pedido para cliente
2. tracking del delivery
3. pagos online reales

# Modo Sabor

## Vision

Modo Sabor sera un sistema integral para delivery, retiro en local y, mas adelante, atencion en mesas. El sistema tendra:

- web publica para pedidos
- dashboard admin
- TPV para venta rapida
- gestion de pedidos y delivery
- gestion de productos, categorias y clientes
- reportes y configuracion
- integraciones con pagos argentinos
- automatizacion por WhatsApp e IA en una fase posterior
- impresion de comandas y tickets A6

## Documentos de detalle

- [IMPRESION-A6-COMANDAS.md](C:\Users\Exe.verdent\verdent-projects\modosabor1\IMPRESION-A6-COMANDAS.md): especificacion aterrizada del modulo de impresion que conviene encarar primero

## Objetivo real del proyecto

Construir primero una base operativa fuerte para vender todos los dias sin romperse, y despues sumar automatizacion, tracking en vivo y funciones premium.

## Modulos del sistema

### 1. Web Publica

Funcion:

- mostrar menu en una sola pagina
- permitir pedir desde celular o PC
- soportar delivery y retiro
- permitir elegir variantes, extras y metodo de pago

Debe contener:

- logo, direccion, telefono y horarios
- categorias visibles
- productos con imagen, descripcion y precio
- variantes: pizza entera, mitades, tamanos, docena/media docena, extras
- carrito
- checkout
- confirmacion de pedido
- mas adelante: tracking en tiempo real

Estado actual:

- existe
- permite listar productos y generar pedido
- ya respeta mejor la visibilidad del `menu del dia` segun lo que realmente sale hoy
- falta cerrar variantes complejas reales, pagos integrados y tracking

### 2. Dashboard

Funcion:

- mostrar estado general del negocio

Debe contener:

- ventas del dia
- pedidos activos
- ultimos pedidos
- metodos de pago
- mas adelante: productos mas vendidos, clientes frecuentes, horas pico, alertas

Estado actual:

- existe
- tiene metricas basicas y grafico simple
- falta inteligencia comercial real

### 3. TPV

Funcion:

- cobrar rapido en local
- usarlo para retiro, delivery y luego mesas
- permitir preasignar repartidor cuando el pedido sale como delivery

Debe contener:

- buscador rapido
- categorias y productos
- carrito/ticket
- descuentos
- variantes
- tipo de entrega
- impresion
- mas adelante: mesas, dividir cuenta, pre-cuenta

Estado actual:

- existe
- ya puede participar mejor del flujo real de delivery
- puede dejar elegido el rider desde la toma del pedido
- suma seleccion rapida de rider desde la propia interfaz de cobro
- ahora resume mejor el contexto del pedido con modo, pago, total y datos operativos claves
- necesita seguir madurando para ser el centro operativo real

### 4. Pedidos

Funcion:

- administrar todo el flujo de pedido

Estados previstos:

- nuevo
- confirmado
- preparando
- listo
- en_camino
- entregado
- cancelado

Debe contener:

- vista por columnas o lista
- cambio de estado
- detalle
- reimpresion
- contacto con cliente
- filtros por fecha, estado, canal

Estado actual:

- existe y es funcional en base
- falta vista mas avanzada, seguimiento cliente y mejor integracion con impresion

### 5. Delivery

Funcion:

- gestionar repartidores y entregas

Debe contener:

- repartidores
- disponibilidad
- asignacion de pedido
- entregas activas
- historial de entregas
- autoasignacion cuando haya un solo rider disponible
- mas adelante: geolocalizacion, tracking en vivo y mapa operativo

Estado actual:

- existe
- ya permite gestionar repartidores, asignar, despachar y cerrar entregas con PIN
- ya puede autoasignar si solo hay un rider disponible
- ahora tiene una mesa de despacho mas clara para separar pendientes, listos y en viaje
- falta GPS avanzado, ETA mas fino, mapa operativo y experiencia rider mas pulida

### 6. Categorias

Funcion:

- organizar el menu

Debe contener:

- nombre
- color
- icono
- imagen
- orden
- subcategorias
- activacion/desactivacion

Estado actual:

- existe y ya tiene mejor UI
- soporta imagenes y subcategorias

### 7. Productos

Funcion:

- administrar menu real

Debe contener:

- nombre
- descripcion
- categoria
- precio
- costo
- imagen
- variantes
- extras
- destacado
- stock logico
- tiempo de preparacion

Casos reales de Modo Sabor:

- pizzas enteras
- pizzas por mitades
- empanadas por unidad, media docena y docena
- milanesas con variantes y agregados
- menu del dia cambiante, con base reutilizable y activacion diaria

Estado actual:

- existe
- ya soporta variantes y extras
- ya contempla mejor el caso `Menu del Dia` con biblioteca base, activacion diaria y copia del dia anterior
- falta pulir reglas de negocio, impresion detallada y uso total en TPV/web

### 8. Clientes

Funcion:

- centralizar historial y fidelizacion

Debe contener:

- nombre, telefono, direccion, email
- historial de pedidos
- total gastado
- frecuencia
- nivel
- puntos
- sellos
- premios pendientes
- notas

Estado actual:

- existe
- fidelizacion automatica ya encaminada desde pedidos entregados
- falta marketing automatico, cupones y segmentos avanzados

### 9. Reportes

Funcion:

- entender ventas y operacion

Debe contener:

- ventas por periodo
- ventas por producto
- ventas por categoria
- metodos de pago
- clientes mas frecuentes
- rentabilidad
- horarios de mayor venta

Estado actual:

- existe con version basica
- falta profundidad

## Prioridad operativa recomendada

El siguiente bloque a construir no deberia ser todavia IA ni tracking GPS. Lo mas rentable ahora es:

1. impresion A6 y comandas
2. seguimiento del pedido para cliente
3. seguimiento de delivery
4. pagos integrados reales

La impresion ya quedo detallada en `IMPRESION-A6-COMANDAS.md`.

### 10. Configuracion

Funcion:

- personalizar el sistema sin tocar codigo

Debe contener:

- nombre del negocio
- logo
- direccion
- telefono
- email
- horarios
- moneda
- color principal
- costo de envio
- tiempo de delivery
- tiempo de retiro
- medios de pago
- mensaje de confirmacion
- activacion y desactivacion de modulos operativos
- mas adelante: favicon, tema visual, impresoras, usuarios, impuestos, zonas

Estado actual:

- existe
- ya cubre buena parte del MVP
- ya permite activar o desactivar modulos reales del sistema
- ya tiene presets de operacion rapida para cambiar de modo segun la etapa del negocio
- permite operar sin `KDS` si se trabaja con comandas impresas
- la seccion de impresion volvio a incluir previsualizacion de ticket, comanda y hoja de delivery
- falta seguir puliendo capas premium de personalizacion

## Estado real del proyecto hoy

### Hecho o casi hecho

- login admin
- estructura general del dashboard
- categorias
- productos
- clientes
- pedidos basicos
- delivery basico
- configuracion base
- web publica base
- base de datos local SQLite
- subida de imagenes
- eventos en tiempo real por socket
- activacion y desactivacion real de modulos desde configuracion
- autoasignacion de delivery con un solo rider disponible
- asignacion de rider desde TPV
- tracking con token en links publicos

### Parcial

- TPV
- reportes
- fidelizacion
- integracion de productos/variantes entre todos los modulos
- flujo completo delivery
- mapa operativo de dispatch

### Faltante importante

- tracking de pedido para cliente
- tracking GPS de repartidor
- app rider o vista rider
- pagos reales con MercadoPago y otros
- webhook de pagos
- bot de WhatsApp
- IA conversacional
- impresion A6 real
- comandas cocina/caja
- facturacion
- mesas y reservas
- pantalla cocina
- roles y permisos reales
- analitica premium

## Fases del proyecto

### Fase 1. Base operativa

Objetivo:

- poder vender todos los dias con estabilidad

Incluye:

- dashboard funcional
- TPV funcional
- categorias y productos completos
- pedidos internos y web
- delivery basico
- clientes con fidelizacion automatica
- configuracion base

### Fase 2. Operacion profesional

Objetivo:

- cerrar todo lo necesario para operar mejor

Incluye:

- impresion A6
- comandas
- pagos integrados
- reportes mejores
- mejor flujo de estados
- seguimiento del pedido para cliente

### Fase 3. Automatizacion

Objetivo:

- bajar trabajo manual

Incluye:

- WhatsApp automatizado
- bot IA
- notificaciones automativas
- recuperacion de clientes
- cupones y acciones de fidelizacion

### Fase 4. Expansion

Objetivo:

- preparar Modo Sabor para crecer

Incluye:

- mesas
- reservas
- pantalla cocina
- multiusuario con permisos finos
- multi-sucursal

## Prioridades recomendadas

### Prioridad 1

- cerrar flujo pedido -> cobro -> estado -> entrega
- dejar TPV y pedidos realmente solidos
- cerrar impresion A6

### Prioridad 2

- seguimiento del pedido para cliente
- delivery con mapa y ETA
- integracion MercadoPago

### Prioridad 3

- WhatsApp automatizado
- IA para toma de pedidos
- CRM y fidelizacion avanzada

## Lo siguiente que recomiendo construir

Sprint recomendado:

1. Impresion A6 y comandas
2. Tracking del pedido del cliente
3. Integracion real de MercadoPago
4. Mejoras finales de TPV

## Stack actual y criterio

Stack actual del proyecto:

- frontend React + Vite
- backend Node + Express
- SQLite local
- socket.io
- uploads locales

Esto sirve perfecto para:

- arrancar
- validar el negocio
- vender
- probar flujos

Mas adelante puede migrarse a:

- PostgreSQL
- storage cloud
- servicios separados para pagos, tracking y bot

## Regla de trabajo para seguir

En cada sesion vamos a manejar esto asi:

1. elegir un modulo
2. definir exactamente que se cierra
3. implementarlo
4. probarlo
5. actualizar este documento

## Bitacora de continuidad

- 2026-03-21:
  - se dejo documentado el avance de Render y WhatsApp en `ESTADO-RENDER-WHATSAPP-2026-03-21.md`
- 2026-03-22:
  - se reviso de nuevo el proyecto completo
  - se confirmo que el error `131030` al enviar prueba de WhatsApp apunta a la lista permitida de Meta y no al backend
  - se detecto que el puerto local `3001` esta siendo usado por otro proceso Node ajeno a este repo, asi que las pruebas locales pueden confundirse
  - se mejoro el diagnostico de WhatsApp en backend y frontend para mostrar checks de produccion, destino de prueba y pasos concretos cuando Meta bloquea el envio
  - se corrigio la revalidacion de sesion del admin para despliegues con frontend y backend separados
  - se endurecio el arranque en produccion para exigir `JWT_SECRET` fuerte y bootstrap seguro de admin
  - se hizo configurable la persistencia de base, uploads y backups para Render
  - se dejo el estado actualizado en `ESTADO-ACTUAL-2026-03-22.md`
- 2026-03-24:
  - se hizo una revision profunda modulo por modulo del sistema completo
  - se confirmo que el proyecto ya cubre web publica, pedidos, TPV, caja, delivery, rider, KDS, mesas, inventario, clientes, reportes, configuracion, personal, usuarios, WhatsApp inbox y bot
  - se detectaron tres prioridades tecnicas fuertes:
    - endurecer tracking y sockets para evitar exposicion innecesaria de datos
    - corregir la coherencia entre reset operativo e inventario
    - partir modulos monoliticos como `server/routes/pedidos.js` y `client/src/pages/Configuracion.jsx`
  - se verifico que la build del frontend sigue pasando
  - se dejo una nueva bitacora de continuidad en `ESTADO-ACTUAL-2026-03-24.md`
  - se dejo el diagnostico completo en `ANALISIS-MODULO-POR-MODULO-2026-03-24.md`
  - se bajo a diseno operativo concreto el modulo de impresion A6
  - se definio que lo correcto para Modo Sabor hoy es usar 3 impresiones separadas:
    - comanda cocina
    - ticket cliente
    - hoja delivery
  - se dejo la especificacion detallada en `IMPRESION-A6-DISENO-OPERATIVO-2026-03-24.md`
  - se tomo `C:\Users\Exe\Downloads\menu_modo_sabor.pdf` como fuente del menu actual
  - se genero backup de seguridad antes del cambio de menu
  - se eliminaron los productos cargados previamente y se recargo el menu
  - se actualizo `server/scripts/seedMenuModoSabor.js` para que el seed futuro quede alineado con el menu real
  - el modelado final del menu quedo asi:
    - pizzas por sabor con variante `Mitad` / `Entera`
    - empanadas por sabor con variante `Media docena` / `Docena`
    - milanesas por preparacion con variante `Pollo` / `Ternera`
  - se ajusto el panel para que productos ya no se carguen mentalmente como `precio base + extra`, sino como precios finales por presentacion
  - en `Productos` ahora pizzas y empanadas muestran campos claros de precio final:
    - pizzas: `Precio mitad` y `Precio entera`
    - empanadas: `Precio media docena` y `Precio docena`
  - en TPV y web publica las opciones ahora muestran el precio final real de cada presentacion
  - se volvio a correr el seed y quedo insertada la pizza `Común` que faltaba
  - la build del cliente siguio pasando despues de estos cambios

- 2026-03-25:
  - se retomo la adaptacion del dashboard de `foodking`, trabajando solo sobre `C:\modosabor1`
  - se mantuvo el estilo actual de `modosabor1` y se uso `foodking` solo como referencia de estructura
  - el dashboard admin ahora incorpora bloques nuevos:
    - overview del negocio
    - resumen visual de pedidos
    - actividad de clientes por hora
    - destacados del menu
    - metodos de pago
  - se conservaron sobre la misma estetica actual:
    - metricas del dia
    - ventas semanales
    - estado de pedidos
    - mas vendidos
    - clientes VIP
    - pedidos recientes
  - se amplio `/reportes/dashboard` para soportar esos bloques
  - se verifico que `server/routes/reportes.js` carga OK y que `client` compila OK con `npm run build`

- 2026-04-02:
  - se corrigio la pantalla de `Configuracion` para trabajar con endpoints reales del backend
  - se agrego una seccion de `Modulos` con toggles operativos reales
  - ya puede deshabilitarse `KDS` cuando la cocina trabaje con comandas impresas
  - se agrego `delivery_autoasignar_activo` para asignar automaticamente el pedido si hay un solo rider disponible
  - el `TPV` ahora puede seleccionar rider al crear un pedido delivery
  - el `TPV` ahora tambien suma seleccion rapida por chips para reservar rider mas rapido
  - el `TPV` volvio a un layout visual mas estable tras retirar una simplificacion agresiva
  - en `TPV` quedaron activas mejoras funcionales seguras: estado real de caja, busqueda tolerante a acentos y descuento porcentual correcto
  - `Caja` se rehizo sobre una base mas estable: apertura con montos rapidos, arqueo asistido, movimientos con presets, auditoria visible e historial reimprimible
  - en backend de `Caja` se validan montos no negativos y motivo obligatorio para movimientos manuales
  - `Inventario` recupero impresion de faltantes, movimientos manuales operativos y guardado real del modo de stock por producto
  - `Personal` ya maneja frecuencia de pago, monto base, adelantos, descuentos, consumos de insumos y liquidaciones con descuento parcial de pendientes
  - los adelantos y liquidaciones de `Personal` pueden impactar `Caja`, y los consumos pueden impactar `Inventario`
  - se corrigio la logica de descuento porcentual en caja
  - el panel de `Delivery` ahora separa mejor asignacion, despacho y entrega con PIN
  - el panel de `Delivery` ahora muestra una mesa de despacho por columnas y sugiere mejor rider al asignar
  - se corrigio la caida del backend al cerrar una entrega con PIN valido
  - se restauro la previsualizacion de impresion dentro de `Configuracion`
  - se recupero el boton de prueba de impresion en la misma seccion
  - los links publicos de seguimiento ahora llevan `tracking_token`
  - el seguimiento publico devuelve datos completos cuando el token es valido
  - al entregar o cancelar un pedido se invalida el tracking token y se libera el rider
  - se agrego la ruta publica que faltaba para el retorno de MercadoPago en web publica
  - validacion ejecutada:
    - `client`: `npm run build` OK
    - `server`: `node --check` OK
    - `server`: `node scripts/smoke-test.js` OK
    - prueba API real de alta de pedido, autoasignacion, tracking y entrega con PIN OK

## Proximo paso sugerido

Seguir con:

- endurecimiento base antes de sumar mas alcance

Orden recomendado:

1. tracking seguro y sockets por rooms
2. coherencia de reset e inventario
3. modularizacion de `pedidos` y `configuracion`
4. smoke tests minimos
5. despues volver a impresion A6 y cocina

Porque hoy el proyecto ya tiene mucho alcance. Lo que mas valor agrega ahora es bajar riesgo operativo y tecnico para que todo lo que ya existe sea mas confiable.

- 2026-06-23:
  - se separo la instalacion PWA del sistema y la del rider con manifests distintos
  - el panel admin ahora puede instalarse como app de escritorio desde el header
  - la app rider ahora cambia su manifest al entrar, muestra ayuda de instalacion y avisa si el GPS quedo atrasado
  - se corrigio la carga del logo de rider para que pase por configuracion en vez de productos
  - se mejoro el service worker para cachear shell de admin y rider
  - se agregaron scripts nuevos para empaquetar y desplegar a DonWeb desde PowerShell
  - se limpio `.gitignore` para no ensuciar el repo con artefactos locales, logs launcher y bases locales
  - se dejo el detalle tecnico actualizado en `docs/ESTADO-ACTUAL-2026-06-23.md`

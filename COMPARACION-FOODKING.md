# FoodKing contra Modo Sabor

9 de agosto de 2026. Auditoría del paquete de `Desktop\foodking` y comparación
con el sistema propio.

---

## Qué es FoodKing

Un producto comercial de los que se compran hechos —de CodeCanyon o similar—,
armado para revenderse a muchos restaurantes distintos.

|                    |                                        |
| ------------------ | -------------------------------------- |
| Panel y API        | Laravel 12, PHP 8.2                    |
| App del cliente    | Flutter, 162 archivos                  |
| App del repartidor | Flutter, 64 archivos                   |
| Base               | 65 migraciones, 53 modelos             |
| Peso               | 210 MB                                 |
| Documentación      | una línea: `https://docs.foodking.dev` |

Modo Sabor, para tener la escala: 606 archivos versionados, ~107.000 líneas de
JavaScript propio, 56 tablas.

Son productos del mismo tamaño. La diferencia no está en el tamaño.

---

## Lo que FoodKing tiene y nosotros no

Esto es lo que vale la pena mirar, porque es plata que ya está gastada en
código que existe.

**Dos apps nativas de verdad, en Flutter.** Una para el cliente y una para el
repartidor, con proyecto de Android y de iOS, listas para publicar en las
tiendas. Nosotros tenemos una sola app —la del repartidor— y es una página web
empaquetada. **Este es el punto más fuerte de FoodKing y no está cerca.**

**Multi-sucursal** (`branches`, con zonas). El sistema entero está pensado para
que una marca tenga varios locales. Nosotros asumimos uno en todos lados. Si
alguna vez abrís un segundo Modo Sabor, esto no es una pantalla más: es
atravesar el sistema entero.

**Modo kiosco** (`kiosk_machines`): la pantalla táctil donde el cliente se
pide solo, sin cajero.

**Turnos de entrega** (`time_slots`): el cliente elige "entre 21 y 21:30". Para
un local con picos, esto reparte la cocina.

**Multi-idioma y multi-moneda**, con traducciones en base de datos.

**Constructor de páginas** (`menu_templates`, `menu_sections`, `sliders`,
`pages`): el dueño arma su web sin tocar código. Nuestra web pública es fija.

**Pasarelas de pago y de SMS configurables** desde el panel, con varias
opciones. Nosotros tenemos Mercado Pago y punto.

**Impuestos** (`taxes`, con `total_tax` en cada pedido y en cada renglón).
Nosotros no modelamos impuestos en ningún lado.

**Login social, suscriptores, notificaciones push, cupones y ofertas.**

Y algo que no esperaba: **tienen agente de IA** (`AiAgent`, `AiChatHistory`),
igual que nuestro asistente.

---

## Lo que nosotros tenemos y ellos no

Busqué una por una. **Ninguna de estas existe en FoodKing:**

```
inventario   stock       ingredientes   recetas      compras     proveedores
empleados    personal    sueldos        asistencia   turnos      caja
arqueo       gastos
```

Eso es un vacío enorme, y no es casualidad: **FoodKing es un sistema de
pedidos, no un sistema de gestión de restaurante.**

Concretamente, nosotros tenemos y ellos no:

- **Inventario con recetas.** Cada plato descuenta sus insumos. Compras con
  foto del remito.
- **Personal completo.** Fichas, asistencia con reloj de PIN, adelantos,
  consumos, liquidaciones, puntos y reconocimientos.
- **Caja de verdad.** Apertura, cierre, arqueo, movimientos, diferencia entre
  esperado y contado.
- **Menú del día**, que es el corazón de tu negocio y no existe como concepto
  en ningún sistema comprado.
- **WhatsApp masivo con reglas anti-bloqueo**, y copiloto de WhatsApp.
- **Fidelización con niveles** y beneficios por nivel.
- **Asistente que ejecuta acciones**, no sólo responde: carga pedidos, registra
  compras, explica el cierre de caja.

FoodKing te vende el mostrador. Vos tenés la cocina, el depósito y la oficina.

---

## La auditoría técnica

### Un punto donde ellos están mejor que nosotros

**La plata.** FoodKing usa `decimal(19,6)` en la base:

```php
$table->decimal('subtotal', 19, 6);
$table->decimal('total', 19, 6);
$table->decimal('price', 19, 6)->default(0);
```

Nosotros guardamos centavos en enteros y convertimos en la frontera de la API.
Las dos son decisiones válidas, pero mirá lo que costó la nuestra sólo en la
última semana:

- los renglones del ticket salían en centavos
- el margen del tablero se mostraba cien veces más grande
- los recargos dentro de `extras` no se convertían
- el socket mandaba centavos crudos
- las estadísticas del repartidor, cien veces mal
- y el módulo de Personal, que **todavía** guarda en pesos donde el resto
  espera centavos

Seis errores de la misma familia, todos por la misma causa: **la unidad no está
en el tipo de dato, está en un acuerdo que hay que recordar en cada línea.**
Con `decimal` esa clase de error no existe.

No estoy diciendo que haya que migrar —sería enorme y riesgoso—. Estoy diciendo
que si mañana empezás un sistema, esto es lo que hay que copiarles.

### Puntos donde nosotros estamos mejor

**Tests.** FoodKing trae **tres** archivos de prueba, y dos se llaman
`ExampleTest.php` — o sea, los que vienen vacíos con Laravel. **No tienen ni
una prueba escrita.** Nosotros tenemos 25 archivos de tests, varios validados
reintroduciendo el error a propósito para confirmar que lo agarran.

Para un producto que revenden a cientos de restaurantes, eso es llamativo.

**El código explica por qué.** Nuestros archivos cuentan qué se rompió y qué
decisión se tomó. El de ellos es código de catálogo: correcto, anónimo, sin
memoria de lo que pasó.

### Lo que hay que mirar antes de tocarlo

**El paquete trae el archivo `.env`.** No debería viajar nunca en un zip que se
distribuye. Lo revisé sin imprimir valores: tiene una `APP_KEY` y
configuración de ejemplo, no vi credenciales de producción. Pero es una mala
costumbre que en otro paquete sí filtra claves.

Si alguna vez lo instalás: **generá una `APP_KEY` nueva** antes de subirlo a
ningún lado. La que viene es la misma para todos los que compraron el producto,
y con ella se pueden falsificar sesiones.

**870 líneas de rutas de API en un solo archivo.** Funciona, pero es el tipo de
archivo que nadie quiere abrir.

---

## Mi lectura

**No son competidores, son mitades distintas.**

FoodKing resuelve _vender_: apps en las tiendas, kiosco, turnos de entrega,
varias sucursales, web armable. Modo Sabor resuelve _operar_: qué hay en el
depósito, cuánto cobra cada uno, cuánto quedó en la caja, qué se cocina hoy.

Comprar FoodKing y tirar Modo Sabor te dejaría sin inventario, sin personal y
sin caja. Es un retroceso, no un cambio.

**Lo que sí vale la pena de ellos, en orden:**

1. **Las apps nativas.** Es lo único donde te llevan una ventaja real y grande.
   Una app de cliente propia en Play Store cambia el negocio; la nuestra es una
   página empaquetada y ni siquiera existe para el cliente.
2. **Turnos de entrega.** Barato de hacer y ordena la cocina en los picos.
3. **Impuestos como concepto.** Hoy no existen en nuestro modelo. El día que
   los necesites, va a doler.
4. **Multi-sucursal.** Sólo si abrís otro local. No antes.

**Y lo que hay que aprender, no copiar:** que la plata tenga un tipo de dato que
la haga imposible de confundir. Eso nos costó seis errores en una semana, uno
de ellos todavía abierto.

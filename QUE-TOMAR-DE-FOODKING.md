# Qué se le puede robar a FoodKing

Sin instalarlo. Sólo mirando cómo resolvieron cosas que nosotros no tenemos, y
qué costaría hacerlas acá.

Antes de empezar, dos correcciones a lo que escribí en la comparación anterior:

- Dije que `time_slots` eran turnos de entrega. **No lo son**: son los horarios
  de apertura por día de la semana. Me apuré leyendo el nombre.
- Sí tienen pedido programado, pero está en otro lado: `is_advance_order` y
  `delivery_time` en la tabla de pedidos.

---

## Lo que vale la pena, en orden

### 1. Motivo de cancelación · **una tarde**

FoodKing guarda `reason` en cada pedido. Nosotros cancelamos y no queda rastro
de por qué.

Es de las cosas más baratas de agregar y de las que más dicen con el tiempo.
Tres meses de cancelaciones con motivo te contestan preguntas que hoy no podés
ni formular: cuántas fueron porque se cortó un plato, cuántas porque el cliente
no atendió el timbre, cuántas por demora. Eso es plata que se está yendo sin
que sepas por dónde.

**Qué hace falta:** una columna, un desplegable de motivos frecuentes al
cancelar, y una tabla en Reportes.

### 2. Vuelto y monto recibido · **una tarde**

Ellos tienen `pos_received_amount`: con cuánto pagó el cliente. Nosotros no lo
guardamos en ningún lado —el rider tiene su calculadora de vuelto, pero es una
cuenta que se hace y se pierde.

Guardarlo sirve para dos cosas: el arqueo puede explicar una diferencia
("faltan $2.000 y hubo tres pedidos donde el vuelto se redondeó"), y el ticket
puede imprimir "Recibí $20.000 / Vuelto $7.000", que es lo que la gente espera
ver.

### 3. Tiempo de preparación por pedido · **dos o tres tardes**

`preparation_time` en el pedido. Nosotros calculamos una estimación de llegada,
pero no guardamos cuánto tardó de verdad cada plato en salir de cocina.

Con eso podés decirle al cliente "40 minutos" **con fundamento**, en vez de con
un número fijo. Y podés ver qué plato es el que rompe los tiempos los sábados.

Ya tenemos las marcas de estado (`nuevo → confirmado → preparando → listo`), así
que la mitad del trabajo está hecho: falta guardar los minutos entre una y otra
y promediar.

### 4. Pedido programado · **una semana**

`is_advance_order` + `delivery_time`. El cliente pide a las 15 para las 21.

Nosotros tenemos `hora_entrega` y el TPV ya permite programar, pero es un campo
suelto: no hay una cola de "lo que hay que empezar a cocinar ahora", ni el
pedido aparece recién a la hora que corresponde. Hoy si programás algo se te
mezcla con lo de este momento.

Para un local con menú del día esto es más útil de lo que parece: la gente que
encarga a la mañana para el mediodía.

### 5. Impuestos como concepto · **una semana, pero cuando haga falta**

`taxes`, con `total_tax` en el pedido y en cada renglón. Nosotros no modelamos
impuestos en ninguna parte.

Hoy no te hace falta. El día que factures en serio, sí — y agregarlo con dos
años de pedidos encima es mucho peor que agregarlo ahora. Lo dejo anotado, no
recomendado todavía.

### 6. Multi-sucursal · **un mes largo**

`branches` atraviesa todo su sistema: pedidos, ítems, usuarios, kioscos.

**No lo hagas hasta que abras el segundo local.** Pero sabé que cuando pase, no
es una pantalla: es tocar cada consulta del sistema. Es la clase de cosa que
conviene tener en la cabeza al diseñar lo nuevo, aunque no se implemente.

---

## Lo que NO vale la pena copiarles

**El kiosco de autoservicio.** Existe (`kiosk_machines`) pero es una máquina
con usuario y contraseña propios. Para un local de tu tamaño, es una pantalla
táctil que hay que comprar, mantener y limpiar, para reemplazar a alguien que
ya está ahí atendiendo.

**Multi-idioma y multi-moneda.** Ellos lo necesitan porque venden el producto en
todo el mundo. Vos vendés en Monteros.

**El constructor de páginas.** Su web se arma con plantillas y secciones porque
cada comprador quiere la suya. Vos tenés una sola web y la controlás entera —
tu web pública ya está mejor terminada que lo que sale de un armador.

**Las pasarelas de pago configurables.** Tenés Mercado Pago, que es lo que se
usa acá. Una capa de abstracción para soportar quince pasarelas que no vas a
usar es trabajo puro.

---

## Lo más valioso, y no es una función

**Cómo guardan la plata.**

```php
$table->decimal('total', 19, 6);
```

Nosotros guardamos centavos en enteros y convertimos en la frontera de la API.
Esa decisión nos costó, sólo esta semana:

1. los renglones del ticket en centavos
2. el margen del tablero cien veces más grande
3. los recargos de `extras` sin convertir
4. el socket mandando centavos crudos
5. las estadísticas del repartidor cien veces mal
6. el módulo de Personal guardando pesos donde el resto espera centavos —
   **todavía sin arreglar**

Seis errores de la misma familia en siete días. La causa es siempre la misma:
**la unidad no vive en el tipo de dato, vive en un acuerdo que hay que recordar
en cada línea de código.** Un número entero no sabe si es pesos o centavos, y
cuando alguien se olvida, no falla nada: sale un número plausible y equivocado.

No propongo migrar todo a decimal. Sería enorme, tocaría cada tabla y cada
consulta, y el riesgo de romper la caja durante la migración es real.

Pero hay una versión chica y valiosa de la misma idea: **que la conversión no
dependa de adivinar por el nombre del campo.** Hoy el sistema decide si un
número es plata mirando si se llama `precio`, `total` o `monto`. Por eso
`margenBrutoHoy` se escapó, y `total_liquidaciones` —que es un contador— se
divide por cien.

---

## Si tuviera que elegir tres

1. **Motivo de cancelación** — una tarde, y en tres meses te dice dónde se va la
   plata.
2. **Monto recibido y vuelto en el ticket** — una tarde, y el arqueo empieza a
   poder explicarse.
3. **Tiempo de preparación real** — dos o tres tardes, y dejás de prometer
   cuarenta minutos porque sí.

Las tres son baratas, las tres se notan en la operación, y ninguna toca la parte
del sistema que hoy está delicada.

**Lo que NO haría ahora:** nada que toque la plata ni los pedidos, hasta que el
TPV vuelva a cobrar y el módulo de Personal esté arreglado.

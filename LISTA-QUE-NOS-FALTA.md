# Lo que FoodKing tiene y Modo Sabor no

La lista completa, verificada función por función contra nuestro código. No es
para copiar código —es PHP contra nuestro JavaScript— sino para saber qué
construir.

Al final de cada una: **cuánto cuesta** y **si la haría**.

---

## Vale la pena

### 1. Pantalla de pedidos para el salón

Un televisor colgado que muestra los pedidos en preparación y los listos, por
número. Ellos la resuelven con una consulta simple y una URL pública.

El cliente deja de preguntar "¿falta mucho?" y el que atiende deja de contestar.
En el mostrador de un lugar con menú del día, eso es tiempo real de alguien.

**Costo:** dos o tres días. **La haría:** sí, es de las que más se notan por lo
que cuestan.

### 2. Número corto para cantar al cliente

Ellos tienen dos números: el interno del pedido y un `token` corto que se le
canta a la gente. Nosotros usamos el mismo para las dos cosas, y cuando el
número llega a cuatro cifras deja de servir para gritarlo.

**Costo:** una tarde. **La haría:** sí, junto con la pantalla del salón — van de
la mano.

### 3. Motivo de cancelación

Guardan `reason` en el pedido. Nosotros cancelamos y no queda por qué.

Tres meses de motivos te contestan preguntas que hoy no podés ni formular:
cuántas se cayeron porque se cortó un plato, cuántas por demora, cuántas porque
el cliente no atendió.

**Costo:** una tarde. **La haría:** sí, es la más barata de todas.

### 4. Tiempo de preparación real

Guardan cuánto tarda cada pedido. Nosotros estimamos la llegada con un número
fijo pero no medimos lo que tardó de verdad.

Ya tenemos las marcas de estado (nuevo → preparando → listo): falta guardar los
minutos entre una y otra y promediar. Con eso prometés cuarenta minutos con
fundamento, y ves qué plato te rompe los sábados.

**Costo:** dos o tres días. **La haría:** sí.

### 5. Que los pedidos programados lleguen a cocina el día correcto

Su pantalla de cocina trae los pedidos de hoy **más** los que se encargaron
antes para hoy. Nosotros tenemos `hora_entrega` pero el pedido aparece desde que
se carga, mezclado con lo del momento.

**Costo:** una tarde en la consulta, más un par de días si querés que se vea
bien. **La haría:** sí, si la gente te encarga a la mañana para el mediodía.

### 6. Medir el consumo de IA

Tienen un servicio dedicado a llevar la cuenta de cuánta IA gasta cada quien.
Nosotros tenemos el asistente andando y no medimos nada.

**Costo:** una tarde. **La haría:** sí, antes de que llegue una factura que no
esperabas.

### 7. Impuestos como concepto

`taxes`, con el impuesto guardado en el pedido y en cada renglón. Nosotros no
los modelamos en ninguna parte.

**Costo:** una semana. **La haría:** no ahora, pero tenelo presente: agregarlo
con dos años de pedidos encima duele mucho más que agregarlo hoy.

---

## Sólo si el negocio cambia

### 8. App nativa para el cliente

Es su activo más grande: una app Flutter completa, con carrito, pagos, perfil,
seguimiento. Nosotros no tenemos ninguna para el cliente —sólo la web.

**Costo:** meses. **La haría:** sólo si el delivery propio se vuelve el canal
principal. Hoy la web pública anda y el WhatsApp trae pedidos.

### 9. Multi-sucursal

Atraviesa su sistema entero: pedidos, productos, usuarios, kioscos.

**Costo:** más de un mes. **La haría:** el día que abras el segundo local, ni un
día antes. Pero sabelo al diseñar lo nuevo.

### 10. Login con código por SMS y login con Google

Para que el cliente entre a la app sin contraseña.

**Costo:** una semana. **La haría:** sólo si hacés la app del cliente.

### 11. Suscriptores y notificaciones push al cliente

Tenemos push para el repartidor, no para el cliente.

**Costo:** una semana. **La haría:** sólo con app propia. Hoy WhatsApp masivo
hace ese trabajo y llega mejor.

---

## No lo haría

- **Kiosco de autoservicio.** Una pantalla táctil que hay que comprar, mantener
  y limpiar, para reemplazar a alguien que ya está atendiendo.
- **Multi-idioma y multi-moneda.** Ellos venden el producto al mundo. Vos vendés
  en Monteros.
- **Constructor de páginas, sliders, páginas de contenido.** Tu web ya está
  mejor terminada que lo que sale de un armador de plantillas.
- **Quince pasarelas de pago.** Tenés Mercado Pago, que es lo que se usa acá.
- **Instalador con licencia.** Sólo tendría sentido el día que quieras vender
  Modo Sabor a otro restaurante.

---

## Cosas que creí que nos faltaban y no

Las verifiqué antes de recomendarlas, y ya las tenemos:

- **Límite de cupón por persona** — está, `limite_por_cliente`
- **Horarios de apertura por día** — está, en la configuración del negocio
- **Reservas de mesa** — está
- **Registro de transacciones** — está
- **Notificaciones push** — están, para el repartidor
- **Variantes y extras por producto** — están
- **Múltiples direcciones por cliente** — están
- **Cocina en pantalla (KDS)** — está

---

## Si tuviera que elegir

**Esta semana:** motivo de cancelación y número corto para cantar. Las dos son
de una tarde y las dos se usan todos los días.

**Este mes:** la pantalla de pedidos para el salón. Es la que más se ve por lo
que cuesta.

**Y antes que cualquiera de estas:** el módulo de Personal, que sigue guardando
los sueldos en pesos donde el resto del sistema espera centavos. Eso ya está
roto y toca plata; lo demás son mejoras.

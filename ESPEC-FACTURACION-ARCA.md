# Facturación electrónica ARCA — especificación

Agosto 2026. **No se escribió código.** Esto es el diseño y la lista de lo que
hace falta antes de escribirlo.

Es el punto 1 del Top 20 y el único bloqueante legal para reemplazar a Fudo.

---

## 1. Lo que descubrí primero, y cambia la urgencia

**Desde el 1 de agosto de 2026 el CAE en tiempo real es obligatorio** para todos
los responsables inscriptos en IVA. Sale de la RG 5782, prorrogada por la RG
5852/2026, que corrió la fecha del 1 de junio al 1 de agosto.

O sea: **si Modo Sabor es responsable inscripto, esto ya está vencido.** No es
una mejora para el trimestre que viene.

Si es monotributista, el régimen es más liviano —factura C— pero la obligación
de emitir electrónico con CAE existe igual.

---

## 2. Lo que necesito de vos antes de escribir una línea

No puedo inventar nada de esto, y sin estos datos el módulo no se puede
construir ni probar.

| Dato                                                 | Por qué                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **CUIT del negocio**                                 | identifica al emisor en todos los llamados                                                                                  |
| **Condición frente al IVA**                          | monotributo → factura C · responsable inscripto → A y B                                                                     |
| **Punto de venta habilitado para webservice**        | se da de alta en ARCA, es un número. **El de "Comprobantes en línea" no sirve**: tiene que ser uno específico de webservice |
| **Certificado digital**                              | se genera desde ARCA con una clave privada. Hay uno de homologación y otro de producción, y **son distintos**               |
| **Razón social y domicilio fiscal**                  | van impresos en el comprobante                                                                                              |
| **Ingresos brutos y fecha de inicio de actividades** | van en el comprobante                                                                                                       |

**No me pases el certificado ni la clave privada por chat.** Van en variables de
entorno de Railway, que las cargás vos. Yo escribo el código que las lee.

---

## 3. La decisión que hay que tomar antes de diseñar

**Controlador fiscal o factura electrónica.** No es lo mismo y para un local con
mesas importa.

|                           | Controlador fiscal               | Factura electrónica                  |
| ------------------------- | -------------------------------- | ------------------------------------ |
| Qué es                    | una impresora homologada         | software que pide CAE por webservice |
| Velocidad en el mostrador | **rápido**, imprime y listo      | depende de la respuesta de ARCA      |
| Si se cae internet        | **sigue funcionando**            | **no podés facturar**                |
| Costo                     | hardware, entre cientos de miles | $0 de hardware                       |
| Para quién                | venta masiva a consumidor final  | facturación a empresas, venta online |

Para un local que vende sobre todo a consumidor final, el controlador fiscal es
más cómodo en el mostrador. Para uno que vende por WhatsApp y delivery, la
factura electrónica alcanza y sale gratis.

**Mi lectura para Modo Sabor: factura electrónica.** El grueso de las ventas
entra por WhatsApp, no por mostrador, y el costo del hardware no se justifica.
Pero es una decisión tuya y la tenés que hablar con tu contador, no conmigo.

**El punto que sí es técnico y hay que resolver sí o sí:** con factura
electrónica, **si se corta internet no se puede facturar.** Hace falta un plan
para eso, y está en la sección 7.

---

## 4. Cómo funciona, en criollo

Son dos servicios de ARCA, los dos SOAP.

**WSAA — el que te deja entrar.** Le mandás el certificado firmado y te devuelve
un _token_ y un _sign_ que valen **12 horas**. Se piden una vez y se guardan; no
se pide uno por factura.

**WSFEv1 — el que autoriza el comprobante.** Le mandás los datos de la venta y
te devuelve el **CAE** y su fecha de vencimiento. Sin CAE, el comprobante no
existe legalmente.

`wsfev1` es el que corresponde: emite comprobantes A, B, C y M **sin detalle de
ítems**, que es justo lo que necesita un restaurante — no hace falta declarar
cada milanesa, sólo los totales por alícuota.

> Manual oficial del desarrollador, v4.6:
> [manual-desarrollador-ARCA-COMPG.pdf](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)

**Los dos ambientes son mundos separados:** homologación tiene sus propios
servidores y sus propios certificados, que se sacan del servicio WSASS. Un
certificado de homologación no sirve en producción y viceversa. Todo el
desarrollo se hace contra homologación.

---

## 5. Qué habría que construir

### 5.1 — Tablas nuevas

```
facturacion_config
  cuit · razon_social · condicion_iva · punto_venta
  ingresos_brutos · inicio_actividades · ambiente (homologacion|produccion)

facturacion_tokens
  servicio · token · sign · generado_en · expira_en
  ← el token de 12 horas, para no pedir uno por factura

comprobantes
  id · pedido_id · tipo (A|B|C) · punto_venta · numero
  cuit_receptor · doc_tipo · doc_nro
  neto · iva · total · fecha
  cae · cae_vencimiento · estado (pendiente|autorizado|rechazado|error)
  respuesta_arca (el JSON completo, para auditar)
  intentos · ultimo_error · creado_en

comprobantes_cola
  ← los que no se pudieron autorizar y hay que reintentar
```

### 5.2 — Servicios

```
server/services/arca/wsaa.js       autenticación y caché del token
server/services/arca/wsfev1.js     solicitar CAE
server/services/arca/comprobantes.js  armar el comprobante desde un pedido
server/services/arca/cola.js       reintentos de los que fallaron
```

### 5.3 — Reglas que no se negocian

1. **La numeración la manda ARCA, no nosotros.** Antes de emitir se consulta
   `FECompUltimoAutorizado` y se usa el siguiente. Nunca se lleva un contador
   propio: si se desincroniza, ARCA rechaza todo lo que sigue.
2. **Un pedido, un comprobante.** Índice único en `comprobantes.pedido_id`. Si
   se pide dos veces, se devuelve el que ya existe.
3. **Nada se emite sin CAE.** Un comprobante sin CAE es un borrador, no una
   factura.
4. **La respuesta completa de ARCA se guarda.** Cuando algo se discuta, esa es
   la prueba.
5. **Todo en centavos**, como el resto del sistema.
6. **El certificado y la clave nunca en el repo.** Variables de entorno.

### 5.4 — Qué se le manda a ARCA

Para un restaurante con `wsfev1`, sin detalle de ítems:

```
Concepto        1 (productos)
DocTipo         99 (consumidor final) o 80 (CUIT)
DocNro          0 para consumidor final
ImpTotal        el total del pedido
ImpNeto         total sin IVA
ImpIVA          el IVA discriminado
Iva[]           alícuota 21% (5) con su base y su importe
CbteFch         fecha del comprobante
```

**Ojo con esto:** los precios del sistema hoy son **finales, con IVA adentro**.
Para facturar hay que separarlos: neto = total ÷ 1,21 e IVA = total − neto. Eso
hay que hacerlo bien o los números no cierran con el contador.

Y si sos monotributista, factura C: **no se discrimina IVA**, va todo como
`ImpTotal` con `ImpNeto` igual y el IVA en cero.

### 5.5 — Identificación del cliente

Novedad de 2026 que simplifica: **sólo hace falta identificar al consumidor
final cuando la operación es de $10.000.000 o más.** Se eliminaron los topes
distintos según medio de pago.

Para un restaurante, en la práctica: **consumidor final sin identificar en casi
todo.** Sólo se pide CUIT cuando el cliente pide factura A.

---

## 6. Cómo se conecta con lo que ya hay

**Punto de enganche:** cuando un pedido pasa a cobrado en `pedidos.js` o al
cerrar caja.

**No hay que tocar `createRealOrder()`.** La facturación va después del cobro y
como paso aparte: si ARCA no responde, el pedido igual se cobró y se entregó.
Atar las dos cosas haría que una caída de ARCA frene la venta, que es
exactamente lo que no queremos.

```
pedido cobrado
     ↓
encolar comprobante (estado: pendiente)
     ↓
pedir CAE  ──→ ok ──→ estado autorizado, se puede imprimir
     ↓
   falla
     ↓
queda en cola · reintentos con espera creciente · aviso en el panel
```

---

## 7. El problema serio: qué pasa si se corta internet

**Verifiqué esto hoy y es peor de lo que decía mi auditoría anterior.**

El service worker `sw-admin.js` cachea el cascarón de la aplicación —index.html,
JS, CSS, íconos— pero en la línea 32 dice:

```js
if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;
```

**Las llamadas a la API no se cachean ni se encolan.** Y el cliente HTTP corta
antes de intentar:

```js
if (!navigator.onLine) return Promise.reject({ error: 'Sin conexión a internet' });
```

O sea: **sin internet la app abre, se ve linda y no hace absolutamente nada.**
No se toma un pedido, no se cobra, no se consulta. El TPV guarda pedidos
"aparcados" en `localStorage`, pero eso son pedidos que ya volvieron del
servidor, no una cola de cosas por enviar.

**Corrijo mi auditoría anterior: donde puse "PWA/offline 🟡 parcial", va 🔴.**
Hay service worker, pero no hay funcionamiento offline.

Esto ya es un problema hoy, sin ARCA. Con ARCA se vuelve más grave, porque
facturar exige internet sí o sí.

**Lo que hay que resolver, en orden:**

1. **Que el corte no pierda la venta.** Una cola local de operaciones
   pendientes, que se vacíe al volver la conexión. Es trabajo aparte de ARCA y
   probablemente más urgente.
2. **CAEA para las caídas.** ARCA tiene un mecanismo —Código de Autorización
   Electrónico Anticipado— que permite emitir sin conexión y rendir después.
   `wsfev1` lo soporta **sólo para comprobantes A y B**, no para C. Hay que
   decidir si vale la pena según qué facture el local.

---

## 8. Plan por etapas

**Etapa 0 — datos y decisión.** Los seis datos de la sección 2, más la decisión
controlador fiscal / factura electrónica hablada con el contador. **Sin esto no
se arranca.**

**Etapa 1 — homologación.** Certificado de prueba, WSAA andando, token cacheado.
Criterio de éxito: pedir un token y que dure 12 horas sin volver a pedirlo.

**Etapa 2 — un comprobante de prueba.** Emitir una factura contra homologación y
recibir un CAE. Criterio: el CAE existe y coincide con lo consultado en
`FECompUltimoAutorizado`.

**Etapa 3 — armar el comprobante desde un pedido real**, con la separación de
neto e IVA bien hecha. Criterio: los totales cierran al centavo.

**Etapa 4 — cola y reintentos.** Criterio: si ARCA está caído, el pedido se
cobra igual y el comprobante queda pendiente.

**Etapa 5 — impresión** del comprobante con CAE, código de barras y vencimiento.

**Etapa 6 — producción.** Certificado real, punto de venta real, y **una factura
de prueba verificada con el contador** antes de dejarlo suelto.

---

## 9. Riesgos

| Riesgo                                      | Impacto                 | Qué hacer                                    |
| ------------------------------------------- | ----------------------- | -------------------------------------------- |
| **Ya está vencida la obligación** si sos RI | **legal**               | consultarlo con el contador esta semana      |
| Numeración desincronizada                   | ARCA rechaza todo       | consultar el último autorizado siempre       |
| Neto e IVA mal separados                    | los números no cierran  | probarlo con el contador antes de producción |
| ARCA caído                                  | no se puede facturar    | cola de reintentos + evaluar CAEA            |
| **Sin internet no se puede vender**         | **operativo**           | cola local, es previo a ARCA                 |
| Certificado vencido                         | se corta la facturación | avisar 30 días antes desde el panel          |

---

## 10. Lo que yo haría, en orden

1. **Hablar con el contador esta semana.** Averiguar la condición frente al IVA
   y si ya estás en falta con la RG 5782. Eso define todo lo demás.
2. **Arreglar el offline**, que es un problema de hoy y no depende de ARCA.
3. Recién después, las etapas 0 a 6.

No arranco a escribir el módulo hasta tener los seis datos de la sección 2. Con
plata y con impuestos no se inventa nada.

---

## Fuentes

- [Webservices de factura electrónica — ARCA](https://www.afip.gob.ar/ws/documentacion/ws-factura-electronica.asp) — catálogo oficial
- [Manual del desarrollador wsfev1 v4.6](https://www.afip.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf)
- [WSAA — autenticación](https://www.afip.gob.ar/ws/documentacion/wsaa.asp)
- [Certificados digitales](https://www.afip.gob.ar/ws/documentacion/certificados.asp)
- [Homologación externa](https://www.arca.gob.ar/fe/ayuda/homologacion_externa.asp)
- [Identificación del consumidor final 2026](https://contadoresenred.com/facturacion-a-partir-de-que-monto-se-debe-identificar-al-consumidor-final-en-2026/)

**Límite de esta especificación:** no soy contador y esto no es asesoramiento
fiscal. La parte técnica sale de la documentación oficial de ARCA; la decisión
de qué régimen te corresponde la tiene que confirmar tu contador.

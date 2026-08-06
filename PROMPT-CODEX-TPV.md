# Prompt para Codex — Cerrar el rediseño del TPV

Estás en `D:\Proyectos\modosabor1`. El módulo TPV se rediseñó por completo y
falta cerrarlo. **Lo más importante es la verificación**: el código se escribió
en un entorno sin sandbox, así que nunca corrió `lint` ni `build`.

---

## Contexto: qué cambió

### El cambio estructural

El cobro salió de la columna del pedido y pasó a un modal a pantalla completa
con teclado numérico (`TpvPaymentModal.jsx`). Eso permitió que la columna baje
de 620px a 380px. Antes los métodos de pago, el efectivo recibido y el vuelto
vivían dentro de la columna, y por eso necesitaba ser ancha.

### El sistema visual

- **Un solo acento: el rojo de marca `#DC1F2D`.** Se agregó la escala `brand`
  a `tailwind.config.js`. El azul `primary` ya no se usa en el TPV.
- **Se sacó `font-black` de todo.** Ahora: 600 títulos, 500 etiquetas, y
  negrita reservada para plata (precios y totales). También se sacaron las
  mayúsculas con `letter-spacing`.
- **Fondo gris `#F6F7F9` con tarjetas blancas.** La separación la hace el
  fondo, no los bordes. Dos radios: 12px controles, 16px tarjetas.
- **Un solo `strokeWidth` de lucide** (`STROKE = 1.9`), exportado de `tpvUi.jsx`.

### Archivos

**Nuevos** (en `client/src/components/TPV/`):

| Archivo                | Qué hace                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `tpvUi.jsx`            | `fmt`, `BRAND`, `TPV_BG`, `STROKE`, `Popover`, `UtilityButton`, `BlockedHint`, `SectionLabel` |
| `paymentBrands.jsx`    | Color, ícono y logo opcional por método de pago; `PaymentMark`, `PaymentButton`               |
| `TpvPaymentModal.jsx`  | Modal de cobro con teclado numérico, botón "Justo" y sugerencias de billetes                  |
| `TpvUtilityBar.jsx`    | 5 íconos con badge: espera, notas, descuento, horario, última venta                           |
| `TpvCustomerBlock.jsx` | Cliente, fidelidad, historial, barrios de Monteros, rider                                     |
| `TpvCartList.jsx`      | Items con miniatura                                                                           |

**Reescritos:** `TpvSidebar.jsx`, `TpvHeader.jsx`, `TpvCatalog.jsx`
**Modificados:** `client/src/pages/TPV.jsx`, `client/tailwind.config.js`
**Docs nuevos:** `client/public/pagos/LEEME.md`

---

## Tarea 1 — Verificar (prioritaria)

```bash
cd client
npm run lint
npm run build
```

Puntos donde es más probable que algo falle:

**1. Íconos de lucide.** El proyecto usa `lucide-react@^0.344.0` (marzo 2024).
Verificá que existan en esa versión y reemplazá por el equivalente más cercano
si alguno falta: `Delete`, `ShoppingBag`, `Keyboard`, `Percent`, `History`,
`Users`, `QrCode`, `Landmark`, `Smartphone`, `CreditCard`, `Layers`,
`Banknote`, `MoreHorizontal`, `Bike`, `Receipt`, `Bookmark`, `Clock`,
`MessageSquare`, `ClipboardPaste`, `Gift`, `Star`, `UserSearch`, `MapPin`,
`Trash2`, `Wallet`, `Minus`, `Plus`, `ListPlus`, `Search`, `UtensilsCrossed`,
`ShoppingCart`, `AlertTriangle`, `ArrowLeft`, `Maximize`, `Minimize2`,
`Armchair`, `Store`, `X`.

**2. Props que se dejaron de pasar** de `TPV.jsx` a `TpvSidebar`: `config`,
`preflightChecklist`, `onConfirmPrint`, `metodoPago`, `efectivoRecibido`,
`splitPayments`, `vuelto`, `pagos`, `loading`. Todas se mudaron a
`TpvPaymentModal`. Confirmá que nada quedó desconectado.

**3. Variables sin usar en `TPV.jsx`.** Se eliminó la barra de chips que
estaba bajo el header. Verificá que `formatEntregaLabel`, `formatTurnoLabel`,
`selectedRider` y `preflightBlockingCount` sigan teniendo uso real.

**4. `restarDesdeCatalogo`** está declarada antes que `cambiarCantidad` en
`TPV.jsx`. Funciona porque sólo se invoca en tiempo de evento, pero confirmalo.

**5. Popovers.** `Popover` usa `position: absolute`. El contenedor del catálogo
y la columna tiene `overflow-hidden`; revisá que ningún popover quede cortado,
sobre todo los de `TpvCustomerBlock` cuando la columna tiene poco alto.

---

## Tarea 2 — Apagar el bypass de caja

En `client/src/pages/TPV.jsx`, cerca de la línea 36:

```js
const BYPASS_CAJA_CERRADA = true;
```

Era temporal, para poder mirar el diseño sin abrir turno. **Ponelo en `false`.**
No borres la constante ni los dos lugares donde se usa (`refreshCajaState` y la
carga inicial): dejala apagada, sirve para desarrollo.

---

## Tarea 3 — Borrar el archivo muerto

`client/src/components/TPV/TpvCheckout.jsx` quedó obsoleto (lo reemplazó
`TpvPaymentModal.jsx`). Está vacío con una nota porque el entorno anterior no
podía eliminar archivos. **Borralo.** Nadie lo importa.

---

## Tarea 4 — Logos de las billeteras

Los métodos de pago usan íconos genéricos de lucide. Reemplazalos por los
logos oficiales de **Mercado Pago, MODO y Ualá**. Efectivo, transferencia y
pago mixto se quedan con ícono genérico: no son marcas, son conceptos.

1. Bajá los logos **de las páginas de marca de cada empresa** (todas publican
   brand guidelines o kit de prensa), no de un buscador de imágenes. SVG
   preferido; si sólo hay PNG, transparente y de 128px de alto mínimo.

2. Guardalos en `client/public/pagos/` como `mercadopago.svg`, `modo.svg`,
   `uala.svg`.

3. Completá el campo `logo` en `client/src/components/TPV/paymentBrands.jsx`:

   ```js
   mercadopago: {
     label: 'Mercado Pago',
     short: 'Mercado Pago',
     icon: QrCode,
     logo: '/pagos/mercadopago.svg',
     color: '#00A9E0',
     soft: '#E0F5FD',
   },
   ```

4. **Probá los dos estados.** `PaymentMark` aplica
   `filter: brightness(0) invert(1)` cuando el método está activo, para que el
   logo se vea blanco sobre el fondo de color. Anda bien con logos sólidos;
   con degradados puede quedar mal. Si pasa, agregá un campo
   `logoInvertible: false` y en ese caso usá fondo `soft` con borde grueso del
   color de marca y el logo en su color original.

5. Si no conseguís alguno, dejalo con `logo: null` y avisá cuál. No uses un
   logo de baja resolución sacado de cualquier lado.

Está todo explicado en `client/public/pagos/LEEME.md`.

---

## Restricciones

- No revertir cambios del linter.
- No commitear `modosabor-rider.jks` ni `google-services.json`.
- **No tocar la lógica de negocio.** Variantes, extras, notas por producto,
  pago mixto, pedidos en espera, fidelidad, barrios de Monteros y asignación de
  rider tienen que seguir funcionando igual. Esto es presentación y verificación.
- El panel admin se usa en PC; no hace falta optimizarlo para celular. La web
  pública sí sigue siendo mobile.

---

## Al terminar, contame

1. Si `lint` y `build` pasaron, y qué hubo que arreglar.
2. Qué logos conseguiste y de dónde; cuáles quedaron con ícono genérico.
3. Si algún logo necesitó el tratamiento del punto 4.
4. **Qué te parece mal resuelto del refactor.** Es código recién escrito, sin
   tests, y sobre el módulo que más se usa del sistema. Si ves algo frágil o
   una decisión que no cierra, decilo — vale más que una confirmación de que
   compila.

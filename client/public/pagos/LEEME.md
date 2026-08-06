# Logos de los métodos de pago

Acá van los logos oficiales de las billeteras, si los querés usar en lugar
de los íconos genéricos del TPV.

## Cómo poner un logo

1. Guardá el archivo en esta carpeta. Preferentemente `.svg`; si no,
   un `.png` con fondo transparente de al menos 128px de alto.

2. Abrí `client/src/components/TPV/paymentBrands.jsx` y completá el campo
   `logo` del método que corresponda:

   ```js
   mercadopago: {
     label: 'Mercado Pago',
     short: 'Mercado Pago',
     icon: QrCode,
     logo: '/pagos/mercadopago.svg',   // <- acá
     color: '#00A9E0',
     soft: '#E0F5FD',
   },
   ```

3. Listo. El botón, el grid de pago mixto y la tarjeta de última venta
   toman el logo automáticamente.

## Cómo se comporta el logo

Cuando el método está **seleccionado**, el botón se pinta del color de la
marca y el logo se convierte a blanco con un filtro CSS. Eso funciona bien
con logos de un solo color o con formas sólidas; si el logo tiene degradados
o varios colores, puede verse raro en ese estado.

Si te pasa eso, la solución más simple es guardar dos archivos y elegir el
color de fondo activo en `soft` en vez de `color`, o directamente usar una
versión monocromática del logo.

## Nota sobre marcas registradas

Los logos de Mercado Pago, MODO y Ualá son marcas registradas de sus
respectivas empresas. Usarlos dentro del TPV para identificar el medio de
cobro es un uso normal y aceptado, pero conviene:

- bajar los archivos de la página oficial de cada marca (todas publican un
  kit de prensa o brand guidelines), no de un buscador de imágenes;
- respetar las proporciones y no deformarlos ni recolorearlos;
- no usarlos en material publicitario de Modo Sabor sin autorización.

Por eso el sistema viene con íconos genéricos por defecto: funcionan sin
depender de archivos de terceros.

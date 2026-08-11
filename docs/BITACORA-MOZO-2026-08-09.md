# Bitácora - app nativa de Mozo - 2026-08-09

## Objetivo

Dejar operativa una aplicación Android independiente para que los mozos tomen
mesas y envíen comandas a cocina, sin dar acceso a caja, cobros ni pedidos de
otros usuarios.

## Entrega realizada

- Se creó la app nativa `Modo Sabor Mozo` (`com.modosabor.mozo`).
- Se incorporó el rol `mozo` con el permiso exclusivo `mozo.use`.
- Cada mesa se asigna a un único mozo antes de cargar una comanda.
- Las comandas se recalculan con precios del servidor y llevan clave de
  idempotencia para que un reintento no duplique pedidos.
- Los eventos de Socket.IO de Mozo quedan aislados de los pedidos globales.
- Se desplegó el backend en Railway y se verificó el acceso nativo contra
  producción.
- La versión de prueba actual de la app es `1.0.1`.

## Incidencia operativa resuelta

Al iniciar la prueba, la app mostraba:

> La caja abierta no corresponde al turno actual.

La caja abierta era la `#24`, correspondiente al turno mañana. El negocio ya
estaba dentro del turno noche. Se ejecutó el recambio operativo normal en
producción:

- Caja mañana `#24`: cerrada.
- Caja noche `#25`: abierta para la fecha operativa `2026-08-09`.
- Se validó con el usuario de prueba que una mesa libre puede tomarse, abrirse
  y liberarse correctamente.

## Incidencia de sesión Android resuelta

En algunos teléfonos Capacitor informaba que `MozoSecureStore` no estaba
implementado en Android. La app `1.0.1` detecta si el puente nativo no está
disponible y usa almacenamiento persistente de Capacitor como respaldo, de
modo que el ingreso no falla ni se pierde la sesión al cerrar la aplicación.

## Agenda de seguimiento

1. **Prueba real de salón:** instalar la APK `1.0.1` en un teléfono, abrir una
   mesa, agregar productos y confirmar que la comanda llegue al KDS/TPV.
2. **Firma de distribución:** recuperar o generar el keystore `.jks` para
   publicar un APK release actualizable. No distribuir la variante debug como
   versión definitiva.
3. **Recambio de caja:** comprobar en el próximo cambio mañana/noche que Caja
   realice el recambio automático antes de que el primer mozo entre a trabajar.
4. **Resiliencia móvil:** implementar cola offline real para comandas cuando
   se interrumpe la conexión y reenvío automático con la misma clave de
   idempotencia.
5. **Tiempo real:** reemplazar el refresco periódico de la app por actualizaciones
   de estado de mesa/comanda mediante Socket.IO.
6. **Control de encargado:** sumar una pantalla para transferir o liberar mesas
   asignadas cuando cambie el personal del salón.

## Criterio de operación

- El mozo solamente puede tomar una mesa libre o volver a abrir una mesa propia.
- Una mesa con consumo abierto no se libera desde la app de Mozo.
- Caja conserva el cobro y cierre de cuenta.
- Si el turno o la caja no están activos, la app debe bloquear comandas con un
  motivo visible; no debe crear ventas fuera de operación.

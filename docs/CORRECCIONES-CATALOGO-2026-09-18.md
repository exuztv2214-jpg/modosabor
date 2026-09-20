# Categorías y productos — correcciones del 18/09/2026

## Corregido

- Catálogo de administración separado (`GET /productos/administracion`, con permiso `productos.edit`): devuelve precios base, sin aplicar precios de canal o del menú diario. El catálogo de venta y la ficha individual aplican los mismos precios calculados.
- Publicar/ocultar productos envía únicamente el estado. No vuelve a guardar precios, variantes ni extras. El servidor también descarta opciones marcadas como compartidas si las envía un cliente antiguo.
- Precio anterior admitido en la validación, con posibilidad de limpiarlo. La orden de quitar la imagen deja de descartarse.
- Las listas asignadas tienen estados de carga/error. El editor bloquea Guardar hasta recuperarlas, ofrece Reintentar e ignora respuestas de un producto anterior. Duplicar carga las listas del producto origen.
- Categorías: validación de nombres vacíos/duplicados, orden entero no negativo y subcategorías válidas. Reordenamiento en una transacción, con normalización de posiciones repetidas.
- Visibilidad: API pública, TPV y web excluyen categorías ocultas y las de otro turno activo. La confirmación de pedidos vuelve a validar disponibilidad, sin alterar la posibilidad de precios manuales del TPV.
- Se conserva la política existente de consultar la carta completa cuando no hay turno activo; la apertura del negocio se valida al cargar el pedido.
- Subcategorías funcionales: asignación opcional a productos, visualización y filtros en administración, TPV y web. Nombres iguales en categorías distintas no se mezclan.
- No se permite quitar/renombrar una subcategoría asignada sin reasignar antes sus productos. Borrar una categoría conserva los productos y limpia la asociación de subcategoría.

## Datos y publicación

La migración añade `productos.subcategoria` como texto vacío por defecto. No borra ni reclasifica productos existentes. No se intentó reparar automáticamente opciones propias que pudieran haberse copiado antes: sin una revisión de datos no es seguro distinguirlas de decisiones legítimas del negocio.

Cambios locales, sin commit ni despliegue en este turno. La migración se aplicará al arrancar el servidor actualizado. La nueva API y el frontend deben publicarse juntos. No se modificaron credenciales ni datos productivos.

## Verificación

- Suite de servidor: 132 archivos aprobados, 0 fallidos.
- `verify:catalog`: HTTP con base ficticia para precios, imágenes, listas, visibilidad, subcategorías y reordenamiento. Incluido en CI.
- `verify:core`, `verify:operacion`, `verify:mozo`, `verify:whatsapp`: aprobados en instalaciones temporales.
- `verify-categories-ui.js`: visualización, categoría vacía, acceso a edición, cierre y móvil.
- `verify-products-ui.js`: fallo/reintento de listas, duplicación y rechazo de una respuesta tardía de otro producto. Navegador real con API ficticia.
- Compilación del frontend y lint verificados localmente.

Las pruebas simuladas no certifican impresión física, disponibilidad de proveedores externos ni una jornada completa de operación real.

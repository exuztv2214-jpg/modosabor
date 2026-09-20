# Extras de menú y fotografías de opciones

## Railway: aplicado a los datos

- 14 menús de $5.000: extra opcional Postre por $1.000.
- 31 menús de $7.000: extra opcional Bebida + Postre por $1.000.
- 4 menús de $9.000: sin extra cobrable de postre/bebida; descripción indica que están incluidos sin recargo.
- Parrillada de $12.000 y Porción de Costilla de $16.000 intactas.
- No se modificaron pedidos ni asignaciones de guarniciones/salsas.
- Verificados los 49 productos en la API pública.
- Respaldo dirigido del catálogo: volumen Railway, `catalog-option-backups/before-benefits-2026-09-18T14-00-19-793Z.json`.

## Implementado localmente, pendiente de publicación

- `opcion_items.imagen`, con migración aditiva.
- Listas de opciones: subir JPG/PNG/WEBP/GIF de hasta 5 MB, previsualizar y quitar imagen.
- Se reutiliza `/productos/upload`; el guardado de precios continúa siendo JSON en pesos, convertido a centavos por el middleware.
- Las imágenes se conservan al guardar desde clientes anteriores o desde la configuración de guarniciones de Operación.
- Fotos propagadas por las listas compartidas y mostradas en los selectores del TPV y la web.
- Aviso explícito de postre y bebida incluidos en los modales de los menús correspondientes.
- Regla de beneficios preservada cuando Operación vuelve a guardar platos a esos precios.

No se ejecutó commit ni deploy de código. Hay cambios locales anteriores de categorías/productos que deben revisarse al preparar la publicación. Las fotos y la protección al volver a guardar desde Operación no están todavía en el servidor publicado. La clasificación visual Premium continúa siendo un pendiente anterior separado.

## Verificación

- `npm --prefix server test`: 133 archivos aprobados.
- `npm run build`: aprobado.
- `npm run verify:operacion`: aprobado en base aislada.
- Desde `server`: `node scripts/verify-isolated.js scripts/verify-option-images.js`: subida real, rutas inválidas, conservación y borrado, moneda y propagación a productos aprobados.
- `node server/scripts/verify-option-images-ui.js`: Edge sin interfaz, vista previa/subida/guardado/reapertura/quitar foto aprobados con API simulada y frontend compilado.

La inclusión de postre/bebida de $9.000 se comunica en la descripción del plato; no se crea un segundo producto ni un extra opcional gratis. No se ha probado una comanda física.

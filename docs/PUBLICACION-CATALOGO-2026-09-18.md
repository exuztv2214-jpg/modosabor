# Publicación completada

Este cierre actualiza los estados pendientes de CORRECCIONES-CATALOGO, MENU-EXTRAS-FOTOS y CLIENTES-DUPLICADOS-TPV del mismo día.

- Código publicado: `cdd991d7428932e000b07e81306fdd2de9b16a5c`.
- Railway deployment: `7373c940-991e-4dfb-8ff9-f3bdbe2dd757`, SUCCESS.
- GitHub CI: `35401851018`, success.
- `/api/health`: ok.
- Verificación autenticada de `/api/opcion-listas`: HTTP 200, 17 guarniciones con campo imagen.
- Comprobados los archivos publicados: interfaz de fotos, ancho máximo de TPV de 960 px y protección CLIENTE_DUPLICADO.
- SQLite de producción: quick_check ok. Canelones $5.000, Canelones (Grandes) $7.000.

## Sincronización local

Se importaron desde Railway 11 categorías, 130 productos, 3 listas, 27 opciones y 55 asignaciones. Se preservaron pedidos, clientes y credenciales locales. Un producto local ausente de Railway quedó inactivo, sin borrar sus referencias históricas; por eso el total físico local es 131 y no 130.

Respaldo local: `server/data/backups/before-catalog-sync-1789770547532.sqlite`.
Respaldo de producción anterior al despliegue: `catalog-option-backups/predeploy-cdd991d-1789770655785.sqlite`, dentro del volumen persistente.

La sincronización es una copia puntual del catálogo, no una replicación automática. No se copiaron pedidos ni el historial diario del menú. No se fusionaron los 28 pares de clientes detectados. La clasificación visual Premium sigue pendiente como funcionalidad separada.

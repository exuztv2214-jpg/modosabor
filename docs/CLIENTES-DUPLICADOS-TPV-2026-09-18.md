# Revisión de clientes y modal TPV

## Datos verificados en Railway

- Canelones (Grandes), id 130: corregido a $7.000, tipo ejecutivo y extra opcional Bebida + Postre de $1.000. Precio y extra confirmados por API pública.
- Respaldo anterior: `catalog-option-backups/canelones-grandes-1789740362097.json` en el volumen persistente.
- Clientes: 322 fichas; 28 pares (56 fichas) comparten teléfono normalizado. Sin grupos repetidos por correo no vacío.
- Los teléfonos se compararon con el normalizador argentino existente (prefijos +54/549, 0 y 15). Son candidatos a consolidación, no personas confirmadas como idénticas.
- 13 grupos comparten nombre normalizado; no se usan como prueba de duplicación.
- No se borró ni fusionó ningún cliente. Todos los pares tienen pedidos asociados en al menos una ficha; antes de una consolidación deben revisarse identidad, direcciones, cuenta corriente, fidelización y referencias.

## Cambios locales, pendientes de publicación

- Alta de clientes: transacción inmediata que compara teléfono normalizado y correo sin diferencias de mayúsculas/espacios. Devuelve HTTP 409 y cliente_existente_id en lugar de insertar un duplicado.
- Edición: bloquea cambios hacia un teléfono/correo de otra ficha; permite ediciones no relacionadas en duplicados históricos.
- Personas homónimas pueden registrarse. Sin teléfono ni correo no se puede deduplicar de manera fiable; no se bloquea solamente por nombre.
- La protección corresponde a `/api/clientes`, usada por el alta del TPV. No es una restricción global para importadores/WhatsApp u otros escritores directos de la tabla.
- Direcciones pasan a transacciones componibles para que un alta con dirección no falle al anidar transacciones.
- Modal TPV ampliado de 460 a 960 px máximos, con altura adaptativa, fotos 4:3 y grilla de 2/3/4 columnas según pantalla.

## Prueba específica

Desde `server`: `node scripts/verify-isolated.js scripts/verify-client-duplicates.js`.
Verifica variantes del mismo teléfono, correo normalizado, alta sin duplicados, homónimos, colisión al editar, direcciones y dos altas simultáneas. No escribe la base real.

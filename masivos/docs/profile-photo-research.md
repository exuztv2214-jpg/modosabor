# Recuperación de fotos de perfil

## Hallazgo

Los 513 chats se sincronizan con identificadores `@lid`. La implementación instalada de `whatsapp-web.js` usa `WWebJS.getChat(contactId)` dentro de `getProfilePicUrl()`. En esta sesión ese camino devuelve errores internos `r: r` o no entrega la foto.

El issue oficial de `wwebjs/whatsapp-web.js` documenta el mismo problema y recomienda resolver el `Wid` y el chat con los módulos internos `WAWebWidFactory`, `WAWebFindChatAction.findOrCreateLatestChat()` y `WAWebContactProfilePicThumbBridge.requestProfilePicFromServer()`:

- https://github.com/wwebjs/whatsapp-web.js/issues/201860
- https://github.com/wwebjs/whatsapp-web.js/releases/tag/v1.34.7

## Solución aplicada

`server.js` ahora consulta directamente esos módulos dentro de `client.pupPage`, acepta tanto `result.chat` como `result`, y guarda la URL devuelta como JPG. Se mantiene el límite de una consulta secuencial por contacto para reducir ráfagas.

También se reutilizó la caché existente de Kimi: 355 archivos válidos fueron copiados al nuevo proyecto y 206 se enlazaron por identificador.

## Verificación real

- Chats: 513.
- Fotos enlazadas: 390.
- Fotos nuevas recuperadas por la API directa: 184.
- Sin foto visible: 123.
- No se enviaron mensajes.

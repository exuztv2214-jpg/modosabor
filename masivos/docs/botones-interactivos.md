# Botones interactivos reales — revisión del 8 de octubre de 2026

Estado: pendiente de conectar WhatsApp Business Platform. La sesión QR actual sigue usando `whatsapp-web.js`; el commit fijado por este proyecto marca el envío de botones y listas como no soportado/deprecado. No se agregó un botón de envío que prometa una función que esa conexión no puede ejecutar.

La alternativa oficial permite plantillas con botones de respuesta y acciones. Para promociones que inician una conversación o salen fuera de las 24 horas desde el último mensaje del cliente, Meta exige una plantilla aprobada. Por eso no alcanza con agregar botones al texto libre del editor actual.

Antes de implementar el segundo canal hay que identificar la cuenta Business Platform disponible, el número habilitado y las plantillas aprobadas. Las credenciales deben configurarse en el entorno del servidor, nunca enviarse por chat ni guardarse en archivos versionados. Se consultó al usuario si ya dispone de esta cuenta; aún no hay respuesta.

La integración deberá permitir seleccionar una plantilla y sus parámetros, mostrar los botones reales en la revisión, incluir plantilla/parámetros en la huella del plan y pasar por el bloqueo persistente por contacto y turno. También requiere recibir eventos de Meta para registrar respuestas, BAJA y estados de entrega. No se envió ninguna solicitud real de mensajería ni se modificó la cuenta de WhatsApp.

Fuentes primarias consultadas:

- [Funciones de whatsapp-web.js en el commit instalado](https://github.com/wwebjs/whatsapp-web.js/blob/1780711a1c86dfeca7c5ba6a66f950eac93dde28/README.md#supported-features).
- [Colección oficial de Meta: plantilla interactiva](https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive).
- [Política de mensajes de WhatsApp Business, sección 2](https://business.whatsapp.com/policy/preview?lang=es_LA).

# Atención por WhatsApp — Modo Sabor

Modo Sabor usa una sola sesión de WhatsApp para todos sus servicios. El QR se
genera únicamente desde **Configuración → WhatsApp** y la sesión persistente de
Baileys vive en `DATA_DIR/whatsapp-sesion`.

Desde esa pantalla se controlan por separado:

- **Pausa total**: detiene la IA e impide iniciar nuevas campañas.
- **Atención con IA**: recibe mensajes individuales, usa el motor canónico del backend y contesta.
- **WhatsApp masivo**: habilita la preparación y confirmación de campañas.

Si una persona responde desde el teléfono, el Gateway aparta la IA de esa
conversación para evitar que humano y asistente hablen a la vez.

## Componentes

- `politica-conversacional.md`: personalidad y reglas del agente.
- `n8n/`: archivo histórico del workflow anterior; no es el motor operativo.

El Gateway atiende con reglas, memoria y herramientas del backend. NVIDIA es
el proveedor principal y Gemini su respaldo. Ambos responden a través de la
misma sesión de WhatsApp.

## API interna del agente

Las rutas requieren `x-agent-key` con el valor de `AGENT_API_KEY`:

- `GET /api/agente/estado`: estado y turno del local.
- `GET /api/agente/menu?categoria=...`: catálogo disponible.
- `GET /api/agente/producto/:id`: producto, variantes y extras.
- `POST /api/agente/cotizar`: cotización contra precios reales.
- `POST /api/agente/envio`: zona y costo de entrega.
- `GET /api/agente/cliente/:telefono`: datos conocidos del cliente.
- `POST /api/agente/pedido`: crea el pedido confirmado.

El servidor recalcula productos, variantes y totales. La IA no puede fijar un
precio por su cuenta.

## Seguridad operativa

- El QR se dibuja dentro del backend y nunca se manda a un generador externo.
- La atención y las campañas arrancan desactivadas.
- Una campaña conserva simulación, vista previa y confirmación humana.
- Un mensaje manual desde el teléfono silencia la IA en esa conversación.
- Las notas de voz se transcriben primero con Gemini y usan Whisper `small`
  como respaldo. Si no se entiende un audio, se pide que lo escriban; nunca se
  inventa su contenido.

Los conectores locales de transición se retiraron: no hay otro proceso ni otra
sesión de WhatsApp compitiendo con el Gateway.

La siguiente fase es enriquecer la atención con instrucciones por turno,
productos disponibles por horario y ejemplos anonimizados de conversaciones
reales. Eso no cambia la conexión ni exige volver a escanear el QR.

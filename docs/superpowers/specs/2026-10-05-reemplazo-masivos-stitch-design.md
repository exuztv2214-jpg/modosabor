# Reemplazo del módulo `/masivos` por Modo Sabor Promo Pro Stitch

## Objetivo

Retirar de la navegación el módulo React de WhatsApp Masivo que nunca se usó y convertir el panel Stitch de `D:\ModoSaborPromoStitch` en la interfaz operativa única de `/masivos`.

## Decisión aprobada

- `/masivos` redirige al panel configurado por `VITE_MASIVOS_PANEL_URL`; en local usa `http://127.0.0.1:3867`.
- El lanzador principal inicia el servidor Stitch oculto si no está activo.
- Stitch queda como único dueño de la sesión local de WhatsApp.
- El arranque automático de la conexión WhatsApp Masivo del backend principal queda desactivado para evitar dos sesiones concurrentes.
- El módulo React viejo y sus rutas/API se conservan inicialmente como respaldo técnico; no se borran datos ni sesiones.
- Para Railway, Stitch debe publicarse como servicio separado y la variable debe apuntar a su URL pública; el servidor principal todavía no incluye `D:\ModoSaborPromoStitch` en su build.

## Alcance

1. Respaldar el componente React viejo y registrar la fecha del respaldo.
2. Cambiar la ruta de entrada `/masivos` por una redirección controlada al panel Stitch.
3. Ajustar `ModoSabor.pyw` para arrancar `D:\ModoSaborPromoStitch\server.js` de forma oculta y esperar `/api/status`.
4. Arrancar el backend principal con `WHATSAPP_DISABLE_STARTUP=1` desde el lanzador.
5. Verificar que solo exista un panel Stitch atendiendo `3867`, que el frontend principal siga atendiendo `5173` y que la API principal siga saludable en `3001`.

## Fuera de alcance

- Migrar ahora la autenticación/permisos del sistema principal al panel Stitch.
- Borrar inmediatamente las rutas/API antiguas.
- Migrar la base de datos o la carpeta de sesión de Stitch.
- Enviar mensajes o ejecutar campañas reales durante la verificación.

## Riesgos y recuperación

- El panel Stitch es local y no hereda la sesión de login del sistema principal.
- El lanzador local sí inicia los tres procesos juntos; eso no convierte todavía la instalación en un único proceso Railway.
- Si falla el arranque nuevo, se puede restaurar la ruta React y quitar la variable de desactivación del lanzador.
- El respaldo del componente viejo debe permanecer fuera del flujo de compilación.

## Verificación

- `python -m py_compile ModoSabor.pyw`
- `npm run build` en `D:\Proyectos\modosabor1`
- `npm run verify` en `D:\ModoSaborPromoStitch`
- HTTP 200 en `http://127.0.0.1:3867/api/status`
- HTTP 200 en `http://localhost:3001/api/health`
- `/masivos` abre el panel Stitch y no monta `WhatsAppMasivo.jsx`.
- No se envía ningún mensaje durante la prueba.

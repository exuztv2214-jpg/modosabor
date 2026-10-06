# Modo Sabor Promo Pro — reconstrucción fiel de Stitch

## Objetivo

Crear una aplicación nueva en `D:\ModoSaborPromoStitch` cuya interfaz siga la composición de las pantallas entregadas por Google Stitch: Inicio, Campaña, Contactos y Conversaciones. La app debe conservar la operación real de WhatsApp del proyecto anterior, pero no reutilizar su HTML/CSS ni su sesión personal.

## Fuente visual aprobada

- `code.html` y `screen.png` de Inicio.
- `code.html` y `screen.png` del Constructor de Campaña.
- `code.html` y `screen.png` del CRM de Contactos.
- `code.html` y `screen.png` de Conversaciones.
- `DESIGN.md` con tokens, tipografía, colores, espaciado, densidad y componentes.

La referencia visual se tratará como estructura de producto, no sólo como paleta: sidebar con sucursal y salud de línea, topbar operativo, tarjetas densas, métricas, campañas, CRM y bandeja de tres columnas.

## Alcance funcional

- QR y estado real de WhatsApp.
- Sincronización de chats/contactos, nombres y fotos.
- Constructor de campaña con variables, imágenes, PDF, segmentos, simulacro, prueba personal y envío.
- Conversaciones CRM y ficha de contacto.
- Resultados, configuración, límites y programación.
- Lanzador de escritorio sin ventana de PowerShell.

## Arquitectura

- Nuevo backend Node/Express aislado y sesión WhatsApp propia.
- Puerto separado del proyecto anterior.
- Frontend estructurado a partir de las pantallas Stitch, con IDs y adaptadores para las rutas API reales.
- Sin dependencias de frontend nuevas en la primera versión.
- `D:\ModoSaborPromoPro` y `C:\Users\Exuz\Documents\kimi\Workspaces\masivos` quedan intactos.

## Criterio de fidelidad

- Mantener proporciones, orden, densidad, colores, radios, sombras, jerarquía tipográfica y distribución de las capturas.
- Reemplazar sólo contenido ficticio por estado real cuando la conexión exista.
- Cuando no haya datos, conservar la misma composición con estados vacíos explícitos, sin inventar métricas.
- El diseño debe conservar la estructura de dos columnas en escritorio/tablet ancho y pasar a navegación inferior en móvil.

## Secuencia de implementación

1. Copiar el contrato funcional del backend a la carpeta nueva, con puerto y sesión separados.
2. Construir shell y tokens visuales a partir de `DESIGN.md`.
3. Portar Inicio y conectar estado, QR, salud, métricas y actividad.
4. Portar Campaña y conectar editor, adjuntos, segmentos, simulacro y envío.
5. Portar Contactos y Conversaciones con sus paneles laterales/detalle.
6. Portar Resultados/Configuración y crear el lanzador.
7. Verificar sintaxis, API, captura visual de cada pantalla y no envío real hasta escanear QR.

## Fuera de alcance de esta reconstrucción

- No se copian sesiones, cachés ni datos personales.
- No se agregan IA, facturación ni multiusuario antes de validar esta versión.
- No se envían mensajes durante la construcción ni durante las pruebas visuales.

# Modo Sabor Social — diseño de producto

## Decisión de diseño

Modo Sabor Social no será una copia de un autoposter genérico. Está pensado
para el ritmo del local: elegir un flyer, describir una promo una vez,
seleccionar `Grupos Monteros` y publicar o programar. La complejidad de
cuentas, sesiones, logs y errores queda fuera del camino principal, pero es
visible cuando necesita atención.

Vive en **Marketing → Redes sociales**. No reemplaza promociones, campañas ni
la agenda actual: puede tomar una promo o el menú del día como punto de partida,
pero conserva sus publicaciones propias.

## Navegación

```text
Redes sociales
├── Inicio
├── Crear publicación
├── Calendario
├── Publicaciones
├── Destinos
│   ├── Cuentas
│   ├── Grupos Facebook
│   └── Conjuntos
├── Multimedia
├── Plantillas
├── Automatizaciones
├── Métricas
└── Actividad y errores
```

"Destinos" concentra la configuración operativa: conectar cuentas, ver grupos
detectados y armar conjuntos reutilizables.

## Inicio

La portada responde tres preguntas sin tablas técnicas: qué se publica hoy, si
el worker/cuentas están listos y qué fallos requieren atención.

```text
Redes sociales                              [ + Nueva publicación ]
Publicá una vez en todas tus redes y grupos.

[ Worker activo ] [ Facebook conectado ] [ 24 grupos habilitados ] [ 2 pendientes ]

HOY                         PRÓXIMAS                     NECESITAN ATENCIÓN
12:30 Menú del día          20:00 Promo noche            Grupo Monteros Compra Venta
Facebook + 18 grupos        Instagram + Facebook         Requiere aprobación
[Ver campaña]               [Ver calendario]             [Ver detalle]
```

Un fallo debe ser accionable: "sesión vencida", "grupo no permite publicar",
"requiere aprobación" o "compositor no encontrado". Nunca sólo "Error".

## Composer: cuatro pasos

Es una sola pantalla con autoguardado de borrador:

1. **Contenido:** nombre interno, texto general, adjuntos de Multimedia y
   acciones IA (`Generar`, `Mejorar`, `Más vendedor`, `Emojis`, `Hashtags`).
   La IA propone texto: nunca publica sin confirmación humana.
2. **Destinos:** primero Page, Perfil e Instagram; después conjuntos de grupos
   expandibles. Cada grupo continúa siendo un destino individual.
3. **Horario:** publicar ahora, guardar borrador o programar en hora argentina.
4. **Revisar:** resumen de destinos, formatos, adjuntos y advertencias reales;
   botón explícito `Publicar en 21 destinos` o `Programar para 20:00`.

La personalización por red está disponible pero no obliga: Facebook, Instagram,
Grupos, Story y Reel heredan el texto general hasta que se abra su editor.

## Grupos Facebook: prioridad

```text
Grupos Facebook                         [ Actualizar desde el navegador ]
El worker local lee sólo los grupos de la sesión iniciada por vos.

[ Buscar grupo… ]  [Todos] [Habilitados] [Favoritos]

[x] Compra Venta Monteros        Publicación permitida       ★
[x] Delivery Monteros            Requiere aprobación
[ ] Ventas Tucumán               No publicar por ahora

CONJUNTOS
Grupos Monteros · 18 grupos                    [Editar]
Promos noche · 12 grupos                       [Editar]
[ + Crear conjunto ]
```

Actualizar grupos crea una tarea para el worker local; nunca solicita cookies
ni contraseñas en el panel. Si la sesión venció, muestra que debe iniciarse
manualmente en Chrome.

## Publicaciones, calendario y actividad

- Calendario mensual como vista principal y semanal para operar el día.
- Estados: gris borrador, azul programada, violeta procesando, verde publicada,
  ámbar parcial/aprobación y rojo fallida.
- El detalle de campaña muestra una fila por destino: resultado, enlace si la
  plataforma lo entrega, motivo y reintento manual de fallidos.
- Las capturas se guardan sólo ante fallo y no incluyen tokens, cookies, HTML
  completo de Facebook ni datos de sesión.

## Diseño visual

- Mismo lenguaje del panel: fondo claro, tarjetas blancas, bordes suaves,
  tipografía legible y rojo Modo Sabor para acciones principales.
- Verde para conectado/publicado; ámbar para aprobación; rojo sólo para un
  bloqueo o acción destructiva.
- Optimizado para escritorio/tablet; en móvil se conserva el flujo por pasos
  con resumen fijo inferior.

## Límites deliberados de la primera versión

- No unirse a grupos, comentar, reaccionar ni variar textos para evadir
  controles.
- No publicar si worker/sesión/medio no están listos.
- Stories y Reels aparecen como capacidades preparadas, pero se mantienen
  inactivas hasta validar el flujo real de cada plataforma.
- Los reintentos son explícitos y acotados; nunca se repite en silencio un
  resultado ambiguo.

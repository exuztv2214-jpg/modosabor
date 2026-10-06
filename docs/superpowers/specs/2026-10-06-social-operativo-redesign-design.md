# Social operativo: rediseño y datos reales

## Objetivo y decisión aprobada

Convertir el módulo Social existente en una herramienta clara para preparar, programar y seguir publicaciones reales de Modo Sabor. Página de Facebook/Instagram y perfil/grupos tienen la misma prioridad, pero son vías independientes: una puede estar lista mientras la otra no. Se conserva el motor actual de campañas, cola, pausas, límites, registro y resultados ambiguos. No se empieza otro proyecto ni se sustituyen estas protecciones por una pantalla nueva.

El resultado buscado es que la persona entre a `/social`, entienda qué vía está disponible, prepare una publicación, elija destinos reales, confirme exactamente qué saldrá y vea el resultado por destino. Si falta una conexión, debe poder guardar un borrador y encontrar un paso concreto para resolverlo, sin que el panel finja estar conectado.

## Estado de partida comprobado

- El panel React vive en `client/src/pages/Social.jsx`; la API y la cola están en `server/routes/social.js`, `server/services/socialService.js` y `server/services/socialScheduler.js`.
- El servidor usa SQLite y ya separa destinos que ejecuta por API de los que dependen de la extensión/navegador.
- En la sesión de producción revisada había extensión desconectada, sesión de Facebook vencida, cero grupos y cero campañas. Eso describe esa sesión, no demuestra que todas las instalaciones estén vacías.
- Las migraciones crean identidades con nombres comerciales fijos y un destino de perfil `me` antes de verificar la conexión. Son estructuras técnicas, no evidencia de una cuenta vinculada.
- «Cómo se instala» lleva a una sección inexistente (`configuracion` frente a `config`); la tasa de éxito aparece como cero sin publicaciones; el dashboard no entrega el `resumen` que la interfaz consulta para el modo seguro. Son defectos existentes que el rediseño debe corregir.

## Alcance y límites

Incluye Inicio, Crear, Calendario, Publicaciones, Destinos, Autolistas, Métricas, Actividad y Configuración; estados de conexión, datos de demostración, diseño adaptable y pruebas de los flujos principales. No incluye crear una red social nueva, importar seguidores, enviar mensajes privados, publicar automáticamente una campaña real durante la verificación ni cambiar el motor de WhatsApp/Masivos.

No se promete evitar restricciones de las plataformas. Los intervalos y límites son controles operativos, no garantías. Las capacidades concretas de formatos y permisos se validarán contra la conexión real antes de habilitar una acción, sin convertir comentarios del código en promesas de la interfaz.

## Arquitectura y fuentes de verdad

Se mantiene la autenticación de `/social`, las rutas `/api/social` y la persistencia actuales. Se mejora el contrato de estado en el servicio existente y se consume desde la interfaz; no se crea un segundo motor de publicaciones.

Cada vía expone un estado comprensible: **sin configurar**, **sin conectar**, **comprobando**, **lista**, **requiere atención** o **en pausa**. El backend calcula ese estado con las señales que ya guarda y recibe: identidad y credenciales, destinos, último control con fecha, sesión/latido del worker y pausa. `habilitada = 1`, una fila sembrada o la ausencia de errores no bastan para decir «lista». Para perfil/grupos se respeta el umbral existente de dos minutos sin latido y se exige un control de sesión posterior a la última vinculación. Para Página/Instagram se exige una prueba exitosa de credenciales de las últimas 24 horas; conectar la cuenta ejecuta esa prueba y la pantalla ofrece repetirla cuando vence. Una prueba vencida o fallida muestra «requiere atención» con fecha y acción para comprobar. La API conserva la validación final al crear y encolar, y el despachador vuelve a comprobar las condiciones necesarias antes de publicar; ocultar un botón en React no es una protección suficiente.

Para Página/Instagram, la vista distingue configuración de la app, conexión de la página y destino publicable. Para perfil/grupos, distingue extensión detectada, worker vinculado, sesión vigente y grupos sincronizados. Las dos vías pueden prepararse por separado. El tablero no exige completar ambas para poder usar una que ya esté lista.

Los números y listas salen de campañas, destinos, resultados y registros persistidos. «Sin datos» significa que no existe una muestra para calcular; nunca se convierte en 0 % de éxito o en un horario «mejor». El alcance sólo se muestra cuando hay un dato de alcance obtenido de la plataforma; las métricas de ejecución se etiquetan como tal. Una vista previa se alimenta del borrador del usuario y se identifica como aproximación, no como publicación real.

## Eliminación segura del relleno

En instalaciones nuevas no se crearán identidades con nombres de negocios supuestos ni destinos visibles que aparenten estar conectados. Si el flujo de la extensión necesita una identidad técnica previa, ésta tendrá una clave interna estable y permanecerá fuera de «cuentas conectadas» hasta validarse. Los nombres visibles vendrán de la conexión confirmada o de un nombre que el usuario haya guardado expresamente.

En instalaciones existentes, primero se clasifican las filas sembradas y sus referencias en campañas, destinos y logs. Se modifica la migración que las recrea antes de cualquier limpieza. Las filas sin uso histórico pueden retirarse con una migración reversible y copia de seguridad; las referenciadas permanecen internamente para no romper el historial, pero se presentan como pendientes de conexión, nunca con indicador verde de cuenta real. No se borra una campaña ni un resultado histórico para mejorar la apariencia.

Se quitan tarjetas, nombres, recuentos y horarios de ejemplo que parezcan datos del negocio. Las ayudas de campos pueden usar ejemplos claramente rotulados, pero no se insertan registros ficticios en la base de producción.

## Experiencia y diseño visual

El lenguaje visual seguirá el panel de Masivos que el usuario aprobó: navegación lateral oscura, superficie de trabajo clara, rojo de marca reservado a la acción principal, tarjetas compactas y estados legibles con texto además de color. No se copiarán cifras ni contenido de las capturas de referencia.

**Inicio** responde en este orden: qué vías están listas, qué publicación está por salir y qué requiere atención. Una acción principal lleva a Crear. Los diagnósticos y ajustes avanzados quedan secundarios; se evita una pared de tarjetas iguales.

**Crear** presenta contenido, cuentas/destinos, horario y revisión en un flujo continuo. El texto y los adjuntos son la fuente de la vista previa. Se conservan el generador opcional de texto con IA, las plantillas, la biblioteca multimedia y los conjuntos de grupos existentes; ninguno de ellos añade contenido sin elección explícita del usuario. Las opciones por red y formato aparecen cuando aplican; un formato imposible no se ofrece como listo. El último paso enumera destinos, archivos, horario y advertencias. «Guardar borrador», «Programar» y «Publicar ahora» son acciones distintas; crear una campaña no debe publicarla por accidente.

Guardar un borrador admite contenido sin destinos mientras se configura una cuenta; esto requiere ajustar la validación actual de `createCampaign`, que hoy exige un destino aun para borradores. Programar o publicar, en cambio, exige destinos configurados y listos y conserva la validación del servidor. Si una conexión se pierde después de programar, el trabajo permanece pendiente y visible; no se marca como publicado ni se reintenta de manera ciega.

**Destinos** separa Página/Instagram de perfil/grupos, muestra sólo conexiones verificadas como activas, deja buscar y agrupar destinos reales, y ofrece pasos de recuperación junto al problema. **Publicaciones** y **Actividad** permiten ver resultado y motivo por destino. **Calendario** y **Autolistas** sólo muestran contenido persistido, con vacío útil cuando no hay nada.

En móvil se anteponen estado, acción principal y borrador; navegación y diagnósticos pasan a menús compactos. Las tablas extensas pasan a filas de resumen con detalle. Los botones, campos, diálogos y avisos deben tener nombre accesible, foco visible y salida con teclado. No se mantiene CSS adaptable que apunte a clases ya retiradas.

## Flujo de publicación y recuperación

1. La pantalla carga estado y datos autenticados; muestra carga, vacío o error con causa y siguiente acción.
2. El usuario redacta, adjunta archivos existentes o nuevos y selecciona una o ambas vías y sus destinos reales.
3. La interfaz muestra la vista previa y valida requisitos de formato, conexión, destinos y horario. El servidor repite estas validaciones con datos actuales.
4. Guardar crea un borrador. Programar o publicar requiere confirmación explícita de contenido, destinos y momento; entonces el motor actual encola la campaña.
5. La cola aplica pausas, cupos y deduplicación existentes. Cada destino informa publicado, pendiente, requiere aprobación, fallido o ambiguo, según la evidencia disponible.
6. Un fallo explica impacto y acción posible. Sólo los fallidos inequívocos admiten reintento manual; un resultado ambiguo nunca se reenvía automáticamente. La desconexión de una vía no oculta los resultados de la otra.

## Verificación y aceptación

- Pruebas con SQLite temporal comprueban que una fila sembrada no equivale a conexión, que las dos vías tienen estados independientes, que los datos vacíos no producen métricas falsas y que guardar un borrador no encola.
- Pruebas de servicio/rutas cubren validación final antes de encolar, modo seguro después de la primera publicación, estados por destino y ausencia de reintento automático para lo ambiguo.
- Build y suite existente del monorepo pasan sin usar la base activa para pruebas que escriben.
- Recorrido visual y funcional en escritorio y móvil: Inicio, Crear, Destinos, Calendario, Publicaciones, Autolistas, Métricas, Actividad y Configuración; navegación «Cómo se instala» incluida. Se revisan carga, vacío, error, texto largo, teclado y foco.
- En una instalación sin conexiones ni campañas no se ven cuentas «activas», campañas, tasas ni alcances ficticios. Se puede crear un borrador; no se puede publicar en un destino no listo.
- La verificación automatizada no se presentará como prueba de publicación externa. Una prueba real requerirá contenido y destinos concretos acordados con el usuario. El despliegue a producción se decidirá tras la verificación local; esta especificación por sí sola no lo autoriza.

## Riesgos y recuperación

Las filas antiguas pueden estar referenciadas, por lo que la limpieza se hace después de inspección y respaldo, con migración que no las regenere. El rediseño mantiene la API y el motor actuales para poder revertir la vista sin perder campañas. Si falla una conexión externa, el borrador y el historial siguen disponibles; ninguna vía publica silenciosamente por la otra.

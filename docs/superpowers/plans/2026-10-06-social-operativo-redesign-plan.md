# Social operativo: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/social` en un panel claro y verificable para preparar, programar y seguir publicaciones reales por Página/Instagram y perfil/grupos, sin datos simulados ni envíos accidentales.

**Architecture:** Conservar SQLite, las rutas `/api/social`, los providers y la cola existentes. El servicio calcula estados independientes de cada vía y valida cada transición; React muestra esos estados y los resultados persistidos. Cambios visuales progresivos sobre la página actual, sin segundo motor ni dependencia nueva.

**Tech Stack:** React 18, Vite, Express, Node.js, better-sqlite3, CSS existente, `assert`/runner propio del servidor y `node --test` para helpers puros del cliente.

**Spec:** `docs/superpowers/specs/2026-10-06-social-operativo-redesign-design.md`

## Global Constraints

- Página/Instagram y perfil/grupos son vías independientes y de igual prioridad.
- Worker listo: latido dentro de **2 minutos** y control de sesión posterior a la última vinculación. API lista: prueba de credenciales exitosa dentro de **24 horas**.
- Estados visibles: `sin_configurar`, `sin_conectar`, `comprobando`, `lista`, `requiere_atencion`, `en_pausa`; texto y acción explican cada uno.
- Un borrador admite contenido sin destinos. Programar/publicar requiere destinos habilitados y listos, y confirmación explícita. Ninguna prueba automática publica contenido real.
- Mantener cola, pausas, cupos, deduplicación, historial y política de ambiguos sin reintento automático. No tocar Masivos/WhatsApp.
- La vista previa es aproximada y usa contenido elegido por el usuario. Métricas sin muestra son `null`/«Sin datos»; alcance sólo con dato real de plataforma.
- No agregar paquetes ni credenciales al repositorio. Pruebas que escriben usan SQLite temporal; no tocar la base activa. Despliegue posterior a verificación local y autorización separada.
- Identidades históricas referenciadas se conservan; no hacer borrado físico sin copia y revisión de referencias.

## Review Focus

1. Fecha de comprobación futura o ilegible: nunca convierte la cuenta en «lista» (Task 2).
2. Revinculación del worker tras un control sano antiguo: exige otro control posterior (Task 2).
3. Campaña con destinos de vías distintas, una caída: no encola ni despacha silenciosamente por la caída; la otra conserva su historial (Task 3).
4. Destinos retirados entre revisión y confirmación: el servidor rechaza la operación y el borrador permanece recuperable (Task 3).
5. Texto largo, error de carga y ancho móvil: no se corta la acción ni desaparecen la recuperación y el foco (Task 7).

---

## Mapa de archivos

| Archivo                                      | Responsabilidad prevista                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `server/db/migrations.js`                    | Dejar de sembrar nombres comerciales y perfil `me` no vinculado; conservar filas heredadas.                   |
| `server/services/socialService.js`           | Estado de vías, pruebas de credenciales, validación de campañas/cola/despacho y métricas.                     |
| `server/services/social/vinculacion.js`      | Guardar la última vinculación real del worker.                                                                |
| `server/routes/social.js`                    | Comprobar tras OAuth y mantener protección/errores de rutas.                                                  |
| `server/services/social/oauthFacebook.js`    | Conservar conexión y destinos reales de Page/Instagram, sin pintar una prueba no ejecutada como exitosa.      |
| `server/tests/utils/socialOperativo.test.js` | Casos de estado, migración, campañas y métricas sobre la base aislada del runner.                             |
| `client/src/pages/Social.jsx`                | Flujo de Inicio, Crear, Destinos, Publicaciones, Calendario, Autolistas, Métricas, Actividad y Configuración. |
| `client/src/pages/Social.css`                | Jerarquía visual y estados desktop/móvil; retirar selectores muertos.                                         |
| `client/src/pages/social/socialUi.js`        | Sólo helpers puros de presentación ya existentes; no introducir otro store.                                   |
| `client/src/pages/social/socialUi.test.js`   | Estado/vista previa/valor sin datos, con `node --test`.                                                       |

### Task 1: Quitar relleno sin romper historial

**Files:** Modify `server/db/migrations.js`; create `server/tests/utils/socialOperativo.test.js`.

**Interfaces:** Produce identidades técnicas identificadas por `identificador_externo` (`fb_perfil`, `fb_page`), no por nombre visible. `crearDestinosQueFaltan(db)` sólo crea `facebook_profile/me` si la vinculación verificada de perfil existe; Page/Instagram siguen exigiendo IDs/token reales.

- [ ] **Step 1: Test rojo.** En `socialOperativo.test.js`, `fresh_social_has_no_branded_accounts_or_profile_destination`: afirmar que la base temporal recién migrada no contiene `Perfil Modo Sabor`, `Fan Page Modo Sabor Delivery` ni `facebook_profile/me` visible; `legacy_social_history_survives_migration`: insertar campaña/target histórico que referencia identidad heredada, repetir migración y comprobar IDs y target intactos.
- [ ] **Step 2: Ejecutar** `npm --prefix server test`; esperar fallo sólo de las nuevas aserciones.
- [ ] **Step 3: Implementar** `sembrarIdentidades(db)` buscando las claves técnicas, usando nombres neutrales sólo internos; cambiar `crearDestinosQueFaltan(db)` para no crear `me` por la mera existencia de la fila. No borrar cuentas/campañas heredadas: filtrar su falsa apariencia de conexión en Task 2. Resolver `migrarIdentidadesSociales` para que el perfil legado siga disponible como referencia de filas antiguas.
- [ ] **Step 4: Ejecutar** `npm --prefix server test`; todas las pruebas pasan, incluido historial.
- [ ] **Step 5: Commit** sólo esos archivos: `git commit -m "fix(social): stop seeding visible demo identities"`.

### Task 2: Estados reales e independientes de conexión

**Files:** Modify `server/services/socialService.js`, `server/services/social/vinculacion.js`, `server/routes/social.js`, `server/services/social/oauthFacebook.js`; test `server/tests/utils/socialOperativo.test.js`.

**Interfaces:** Produce `estadoDeDestinoSocial(destino, { now = Date.now() } = {}) -> { estado, motivo, comprobadoEn, accion }` para validar una cuenta/destino concreto; `estadoViasSocial({ now = Date.now() } = {}) -> { pagina, instagram, perfilGrupos }` resume sin mezclar cuentas, y `dashboard().vias` lo expone. `probarCredenciales(cuentaId, tipo)` persiste resultado y fecha por canal sin exponer token. `vinculacion.canjearCodigo` guarda marca de vinculación sólo tras canje válido.

- [ ] **Step 1: Test rojo.** Afirmar `pagina.estado === 'lista'` e `instagram.estado !== 'lista'` con sólo Page verificada; dos cuentas Page, una no comprobada => sólo su destino queda no listo; prueba vencida, futura o ilegible => `requiere_atencion`; worker con latido >120 s o control anterior a revinculación => no listo; pausa => `en_pausa`; metadatos enviados al cliente nunca incluyen token.
- [ ] **Step 2: Ejecutar** `npm --prefix server test`; esperar esos fallos.
- [ ] **Step 3: Implementar** estados desde `social_accounts.metadata`, `ultimo_check_en`, `social_workers`, último `health_check` y marca de canje; usar el parser de fechas del servicio. Tras `POST /oauth/facebook/elegir`, ejecutar/registrar pruebas independientes de Page e Instagram (si existe IG), devolviendo conexión guardada aun si la prueba falla. `POST /identidades/:id/probar` refresca el canal solicitado. No marcar listo por `habilitada`, token existente o fila sembrada.
- [ ] **Step 4: Ejecutar** `npm --prefix server test`; comprobar contrato de `dashboard().vias` y que OAuth fallido no pierde la conexión guardada.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "feat(social): expose verified channel readiness"`.

### Task 3: Borrador recuperable y validación final de publicación

**Files:** Modify `server/services/socialService.js`, `server/services/socialScheduler.js` si el ascenso de programadas lo requiere, `server/routes/social.js` si cambia el error HTTP; test `server/tests/utils/socialOperativo.test.js`.

**Interfaces:** `createCampaign(args)` conserva firma y devuelve borrador con `targets: []` si no hay fecha/destinos; `queueCampaign(id, { now = false } = {})` sólo encola targets todavía habilitados y con vía `lista`; `claimWork()` y `claimApiWork()` respetan la misma disponibilidad sin convertir una pausa/desconexión en éxito o fallo inequívoco.

- [ ] **Step 1: Test rojo.** Afirmar creación de borrador sin destino y cero targets; programada sin destino rechazada; `queueCampaign` sin targets o con destino inactivo/desconectado rechaza sin mutación parcial; destino quitado tras revisión tampoco se encola; campaña mixta conserva historial de la vía sana y deja pendiente la caída; resultado ambiguo no pasa automáticamente a reintento.
- [ ] **Step 2: Ejecutar** `npm --prefix server test`; esperar fallo de las nuevas aserciones.
- [ ] **Step 3: Implementar** guardas transaccionales en `createCampaign`/`queueCampaign` y en reclamación/despacho usando `estadoDeDestinoSocial` por cuenta; una selección mixta con destino no listo se rechaza completa antes de encolar, explicando cuál retirar o reconectar. Si una conexión cae después de programar, mantener ese target pendiente con motivo visible; no falsear `published` ni reintentar ambiguos. Reutilizar reglas existentes de cupo/pausa/duplicados.
- [ ] **Step 4: Ejecutar** `npm --prefix server test`; comprobar también tests existentes de programación, providers y ambiguos.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "fix(social): guard drafts queue and dispatch"`.

### Task 4: Métricas, resumen y contrato honesto

**Files:** Modify `server/services/socialService.js`; test `server/tests/utils/socialOperativo.test.js`.

**Interfaces:** `getMetrics(days)` devuelve `resumen.tasaExito: number | null`, `alcance.disponible: false` hasta disponer de dato real y estadísticas de ejecución con nombre correcto; `dashboard().resumen.yaPublicoAlgunaVez: boolean` satisface el modo seguro del cliente.

- [ ] **Step 1: Test rojo.** Con cero targets, `tasaExito === null`, no alcance ni «mejor horario» inferido; con un target publicado y uno fallido, tasa 50; primera publicación histórica activa `dashboard().resumen.yaPublicoAlgunaVez` aun fuera de la ventana de 30 días.
- [ ] **Step 2: Ejecutar** `npm --prefix server test`; esperar fallo de las nuevas aserciones.
- [ ] **Step 3: Implementar** SQL/serialización mínima en `getMetrics` y `dashboard`, sin nueva tabla ni cálculo de alcance inventado.
- [ ] **Step 4: Ejecutar** `npm --prefix server test`; comprobar métricas y modo seguro.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "fix(social): report only measured metrics"`.

### Task 5: Inicio y Destinos con estados útiles

**Files:** Modify `client/src/pages/Social.jsx`, `client/src/pages/Social.css`, `client/src/pages/social/socialUi.js`; create `client/src/pages/social/socialUi.test.js`.

**Interfaces:** `estadoVisualDeVia(via) -> { etiqueta, tono, accion }` en `socialUi.js`, consumiendo `dashboard.vias` del Task 2; la pantalla mantiene IDs de sección existentes para no romper rutas internas.

- [ ] **Step 1: Test rojo.** En `socialUi.test.js`, probar que `sin_conectar` nunca se traduce como «Conectado», que cada vía obtiene acción específica y que el estado de Page no oculta el de perfil/grupos.
- [ ] **Step 2: Ejecutar** `node --test client/src/pages/social/socialUi.test.js`; esperar fallo del helper nuevo.
- [ ] **Step 3: Implementar** Inicio con estado/acción principal/publicación siguiente/atención, Destinos separado por vía y sólo conexiones verificadas en «activas». Mantener sincronización, conjuntos, OAuth y extensión existentes; quitar tarjetas y copy de ejemplo. Arreglar «Cómo se instala» para ir a `config`. CSS sigue lenguaje aprobado de Masivos: lateral oscuro, superficie clara, rojo para principal y tarjetas compactas.
- [ ] **Step 4: Ejecutar** test de helper, `npm run build` y `npm run lint`; abrir localmente Inicio/Destinos para verificar acciones y vacíos sin datos inventados.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "feat(social): clarify dashboard and destinations"`.

### Task 6: Crear, confirmar y seguir publicaciones

**Files:** Modify `client/src/pages/Social.jsx`, `client/src/pages/Social.css`, `client/src/pages/social/socialUi.js`, `client/src/pages/social/socialUi.test.js`.

**Interfaces:** `resumenDeRevision(borrador, destinos, media) -> { texto, destinos, adjuntos, momento, alertas }` es sólo presentación; `createCampaign` y `queueCampaign` mantienen contratos del Task 3. Acciones separadas: Guardar borrador, Programar, Publicar ahora.

- [ ] **Step 1: Test rojo.** Probar que revisión vacía enumera cero destinos y no habilita publicación; texto/adjuntos/destinos elegidos aparecen exactamente una vez; fecha inválida se muestra como alerta y nunca se convierte en «ahora»; guardar borrador no llama `queueCampaign` (recorrido UI local).
- [ ] **Step 2: Ejecutar** `node --test client/src/pages/social/socialUi.test.js` y recorrido UI; esperar fallos nuevos.
- [ ] **Step 3: Implementar** flujo contenido → destinos → horario → revisión, vista previa aproximada del contenido real y confirmación antes de encolar. Conservar IA opcional, plantillas, media, formatos por red, ensayo y conjuntos. Mostrar errores del servidor junto a la acción y permitir reabrir borrador. Publicaciones/Actividad/Calendario/Autolistas muestran persistencia, estado y motivo por destino, con vacío útil.
- [ ] **Step 4: Ejecutar** helper tests, `npm --prefix server test`, `npm run build`, `npm run lint`; en navegador local probar borrador sin conexión, publicación impedida, cambio de destino y recuperación de error, sin publicar fuera.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "feat(social): review and confirm publishing"`.

### Task 7: Métricas, configuración, móvil y verificación integral

**Files:** Modify `client/src/pages/Social.jsx`, `client/src/pages/Social.css`, `client/src/pages/social/socialUi.test.js` si hace falta.

**Interfaces:** Consume `getMetrics` del Task 4 y `dashboard.vias` del Task 2. No altera API ni publica datos reales.

- [ ] **Step 1: Test rojo.** En helper, cero muestra => «Sin datos» y nunca `0 %`; alcance indisponible => no tarjeta numérica. En navegador, registrar fallos de ancho 375 px/texto largo/error de carga: botón principal, recuperación y foco deben seguir visibles; `Escape` cierra diálogo y el foco vuelve al disparador.
- [ ] **Step 2: Ejecutar** `node --test client/src/pages/social/socialUi.test.js` y recorrido móvil; observar los fallos.
- [ ] **Step 3: Implementar** Métricas como ejecución real, sin alcance ni horario prometido; Configuración con conexiones y controles actuales sin falsos indicadores. Retirar selectores responsive obsoletos y ajustar layout móvil, estados de carga/error/vacío, foco y etiquetas accesibles. No reescribir motor ni añadir biblioteca UI.
- [ ] **Step 4: Ejecutar** `npm --prefix server test`, `npm run build`, `npm run lint`, `git diff --check`; recorrer las nueve secciones a 375 px y escritorio, con teclado y sin conexión. Registrar aparte cualquier verificación externa no realizada.
- [ ] **Step 5: Commit** archivos del task: `git commit -m "feat(social): finish responsive operational views"`; revisión final del diff, sin incluir `server/scripts/exportar-contactos-whatsapp.cjs` ni desplegar.

## Criterio de cierre

Local sin conexiones: cero cuentas «activas», borrador posible, publicación bloqueada con causa. Con una sola vía lista: la otra sigue explicando su propio problema. Historial preservado, pruebas aisladas y build/lint verdes; ninguna publicación real ni deploy se declara hecho por este plan.

# Modo Sabor Social — Gap Analysis

Comparación de lo que hay hoy contra la especificación funcional definitiva.
Todo lo que sigue sale de leer el código, no de suponer.

**Archivos inspeccionados**

| Capa | Archivo | Líneas |
| --- | --- | --- |
| Base | `server/db/migrations.js` (tablas `social_*`) | 12 tablas |
| Servicio | `server/services/socialService.js` | 665 |
| Rutas | `server/routes/social.js` | 251 |
| Worker (servidor) | `server/routes/socialWorker.js` | 90 |
| Publicador | `server/services/facebookPublisherService.js` | 338 |
| Pantalla | `client/src/pages/Social.jsx` | ~1.500 |

---

## EL HALLAZGO PRINCIPAL

> **La regla de oro del punto 41 está rota en la base de datos.**

`social_destinations` tiene:

```sql
cuenta_id INTEGER REFERENCES social_accounts(id) ON DELETE SET NULL,
...
UNIQUE(provider, tipo, identificador_externo)
```

La clave única es **provider + tipo + id externo**. **No incluye la identidad.**

Y `createDestination()` inserta con:

```sql
ON CONFLICT(provider, tipo, identificador_externo) DO UPDATE ...
```

Consecuencia concreta, que es exactamente lo que el punto 4 prohíbe:

- Sincronizás *Compra Venta Monteros* como **Perfil** → se guarda una fila.
- Sincronizás *Compra Venta Monteros* como **Fan Page** → **pisa la misma fila.**

No son dos destinos. Es uno solo que cambia de dueño con la última
sincronización. Y como `createDestination` ni siquiera recibe `cuenta_id`, la
columna existe y queda siempre en `NULL`.

**La columna está. La relación no se usa.** Eso es peor que no tenerla, porque
al mirar el esquema parece resuelto.

---

## A. YA IMPLEMENTADO Y CORRECTO

### Base de datos

- **Doce tablas** con el modelo correcto en su forma general: cuentas,
  destinos, conjuntos, ítems de conjunto, campañas, targets, medios, plantillas,
  logs, workers, comandos de worker.
- **`social_post_targets` es un target por destino**, con `estado`, `intentos`,
  `max_intentos`, `proximo_reintento_en`, `lock_token`, `lock_hasta`,
  `external_post_url`, `ultimo_error`. Eso cubre los puntos 16, 17, 18 y 32 a
  nivel de modelo, incluido el **locking** para no duplicar.
- **Estados completos**: existen `requires_approval` y `ambiguous` en el set de
  estados válidos. El punto 18 —no reintentar `ambiguous`— está contemplado.
- Índice `idx_social_targets_due` para el scheduler.

### Servicio

- Campañas: crear, encolar, cancelar, **reintentar sólo fallidos**, duplicar.
- `claimWork()` para que el worker pida trabajo.
- `reportPublication()` y `refreshCampaignState()` para recalcular el estado de
  la campaña a partir de sus targets → el estado `partial` del punto 17.
- Conjuntos: listar, crear, listar destinos del conjunto.
- Plantillas: alta, baja, modificación.
- Config y métricas.

### Worker (lado servidor)

- Router propio con **clave exclusiva** (`x-social-worker-key`), comparada con
  `timingSafeEqual`. No usa la cookie del panel ni expone clientes ni pedidos.
- Heartbeat, claim, reporte de publicación, reporte de comando.
- **Screenshots sólo en fallo**, con límite de 2 MB, guardados aparte. Cumple
  el punto 26.

### Seguridad (punto 43)

- No pide contraseñas, no automatiza login, no exporta cookies, no toca CAPTCHA.
- La sesión la inicia una persona a mano en un Chrome aparte.
- Está explícito en la pantalla.

### Pantalla

- Siete secciones: Inicio, Métricas, Crear, Calendario, Destinos, Campañas,
  Actividad.
- **Los veinte endpoints se usan.** No hay código muerto, cosa que sí pasaba en
  WhatsApp Masivo.
- Estado de conexión con error accionable y paso a paso (arreglado hoy).

---

## B. IMPLEMENTADO PERO HAY QUE MODIFICAR

### 1. La clave única de destinos — **bloqueante**

Hay que pasar de:

```sql
UNIQUE(provider, tipo, identificador_externo)
```

a:

```sql
UNIQUE(provider, cuenta_id, tipo, identificador_externo)
```

Y que `createDestination()` reciba y guarde `cuenta_id`.

En SQLite no se puede cambiar una restricción con `ALTER TABLE`: hay que crear
la tabla nueva, copiar, renombrar. Con los datos actuales —cero destinos— la
migración es trivial hoy y dolorosa dentro de un mes.

### 2. Sincronización de grupos — no sabe de identidad

```js
router.post('/grupos/sincronizar', (_req, res) =>
  res.json({ comandoId: social.createWorkerCommand('sync_facebook_groups') })
);
```

No recibe `identityId`. El punto 5 pide elegir Perfil / Page / Ambos antes de
sincronizar.

Falta: parámetro en la ruta, en el payload del comando, y que el worker lo use.

### 3. Conjuntos — no preservan identidad

`social_destination_sets` tiene sólo `nombre` y `descripcion`. El punto 7 pide
que un conjunto sepa a qué identidad pertenece, y que exista el combinado
—"TODO MONTEROS: 35 del Perfil + 18 de la Page"—.

Hoy un conjunto es una bolsa de destinos sin esa distinción.

### 4. `createWorkerCommand` — dos comandos nada más

```js
const allowed = new Set(['sync_facebook_groups', 'health_check']);
```

Falta al menos `switch_identity`, y `sync_facebook_groups` con payload.

### 5. Health check — no distingue identidades

El punto 34 pide ocho filas (Worker, Chrome, Facebook, Instagram, Perfil, Page,
Grupos Perfil, Grupos Page). Hoy devuelve tres campos: `chrome`,
`facebook_session`, `groups_sync`.

Y el punto es explícito: *"no considerar Facebook ACTIVE sólo porque Chrome
abre"*. Habría que revisar si la comprobación de sesión es real.

### 6. Publicador — un solo tipo de destino

`facebookPublisherService.js` tiene `autopublishFacebookGroup` y
`autopublishFacebookQueue`. **Sólo grupos.**

No hay feed de perfil, feed de página, historias ni reels. Y no hay nada
equivalente a `switchFacebookIdentity()` (punto 22): cero menciones a identidad,
perfil o página en las 338 líneas.

### 7. Estructura del worker — todo junto

El punto 21 pide `providers/facebook/{profile,page,groups,story,reel}` y
`providers/instagram/*`. Hoy es un archivo plano con los selectores adentro
(punto 24 sin cumplir).

### 8. Errores tipados

El punto 25 pide códigos (`SESSION_EXPIRED`, `REQUIRES_APPROVAL`,
`PUBLICATION_AMBIGUOUS`…). Hoy los errores son texto libre. La traducción a
lenguaje humano se hace en la pantalla, caso por caso —lo hice hoy para el
health check— pero no hay contrato.

### 9. Composer — un texto para todos

No existe elegir destinos por identidad y tipo (puntos 10, 11, 12), ni
personalización por plataforma (punto 13), ni media por formato (punto 14).

---

## C. NO IMPLEMENTADO

| # | Qué falta | Punto |
| --- | --- | --- |
| 1 | **Identidades como entidad de UI**: elegir Perfil / Page / Ambos | 3 |
| 2 | Grupos filtrados por identidad en la pantalla | 4, 6 |
| 3 | Sincronizar eligiendo identidad | 5 |
| 4 | Pantalla de Grupos con buscador y filtros (Todos / Habilitados / Favoritos / Requieren aprobación) | 6 |
| 5 | Conjuntos por identidad y conjunto combinado | 7 |
| 6 | Feed del Perfil | 10 |
| 7 | Feed de la Fan Page | 10 |
| 8 | Historias (Perfil y Page) | 10 |
| 9 | Reels (Perfil y Page) | 10 |
| 10 | **Instagram completo** — feed, story, reel | 11 |
| 11 | Publicación simultánea con resumen de destinos | 12 |
| 12 | Personalización por plataforma | 13 |
| 13 | Media específica por formato + advertencias | 14 |
| 14 | **Matriz de capacidades** con "Pendiente de validación" | 15 |
| 15 | `switchFacebookIdentity()` | 22 |
| 16 | `syncFacebookGroups(identityId)` | 23 |
| 17 | Selectores centralizados | 24 |
| 18 | Errores tipados | 25 |
| 19 | Dashboard con las ocho filas y "Necesitan atención" | 27 |
| 20 | Biblioteca multimedia con categorías | 29 |
| 21 | Selectores rápidos / presets | 31 |
| 22 | **Las dieciséis herramientas del agente** | 36 |
| 23 | Frases que el agente debe entender | 37 |
| 24 | Automatizaciones | 35 |

### Sobre el punto 36 — el agente

Cero. Busqué `sincronizar_grupos_facebook`, `crear_campana_social`,
`publicar_campana_social`, `listar_identidades_sociales` en todo el servidor: no
existe ninguna. El agente de Modo Sabor no puede tocar Social.

Es un bloque grande pero **depende de que el núcleo esté validado**: darle
herramientas a la IA sobre algo que todavía no publica bien sería multiplicar el
problema.

---

## RESUMEN EN NÚMEROS

| | Cantidad |
| --- | --- |
| Correcto y aprovechable | ~35% |
| Existe pero hay que modificarlo | ~25% |
| No existe | ~40% |

**La buena noticia:** el esqueleto —campañas, targets, estados, reintentos,
locking, worker con clave propia— está bien pensado y no hay que rehacerlo.

**La mala:** la relación identidad → grupo, que es el corazón de la
especificación, **está rota en la clave única**, y el publicador sólo sabe hacer
una de las diez cosas que se le piden a Facebook.

---

## FASE SIGUIENTE EXACTA

Respetando el orden del punto 39 y sin tocar Instagram.

### Fase A — Arreglar el modelo (medio día)

Es lo primero porque **todo lo demás se apoya acá**, y hoy sale gratis: no hay
un solo destino cargado en la base.

1. Migrar `social_destinations` a `UNIQUE(provider, cuenta_id, tipo, identificador_externo)`.
2. `createDestination()` recibe y guarda `cuenta_id`.
3. Sembrar las dos identidades en `social_accounts`:
   - Perfil Modo Sabor
   - Fan Page Modo Sabor Delivery
4. Test que verifique que **el mismo grupo con dos identidades produce dos
   destinos**, verificado rompiéndolo a propósito.

### Fase B — Sincronizar por identidad (un día)

1. `POST /grupos/sincronizar { identityId }`.
2. `createWorkerCommand('sync_facebook_groups', { identityId })`.
3. Worker: `syncFacebookGroups(identityId)` — descubre y devuelve grupos, sin
   publicar, sin unirse, sin comentar.
4. Guardar con `cuenta_id`.

### Fase C — La pantalla de Grupos (un día)

Selector de identidad arriba, buscador, los cuatro filtros, favoritos, estado y
fecha de última sincronización. Al cambiar de identidad cambia la lista.

### Fase D — Publicar en un grupo, de verdad (punto 40)

La prueba crítica, en orden: sincronizar → ver la lista real → un grupo →
publicar → confirmar → tres grupos → confirmar estado individual → confirmar que
no duplica → probar el retry de un fallido.

**Hasta que esto no pase, nada más.**

### Fase E — Fan Page

Identidad, `switchFacebookIdentity()`, sincronizar sus grupos, publicar. Y
repetir la prueba crítica completa.

### Fase F — Selector Perfil / Page / Ambos y conjuntos

Recién acá los conjuntos con identidad y el "un solo click" del punto 2.

---

## UNA ACLARACIÓN QUE CORRESPONDE HACER

La especificación es clara y la voy a seguir. Pero hay algo que no cambia por
escribirlo en un documento, y prefiero dejarlo asentado una vez:

**Publicar en grupos de Facebook que no son propios sólo se puede automatizando
el navegador con una sesión iniciada.** Va contra los términos de Meta, y la
sanción no cae sobre el programa: cae sobre **la cuenta y la página del local**.

La especificación ya toma los recaudos correctos —sesión manual, sin evasión,
sin anti-detección, sin CAPTCHA, sin unirse solo, publicación sólo en destinos
elegidos a mano—. Eso reduce el riesgo pero no lo elimina, porque lo que
molesta a Meta no es cómo iniciaste sesión: es automatizar la interfaz.

Lo digo una vez, queda escrito, y sigo con la implementación.

# Auditoría Masivos (2): cómo está armado, qué está de relleno y qué falta

Fecha: 2026-10-08. Revisión del código (`masivos/server.js`, `masivos/public/app.js`, `index.html`) y del
panel en producción, solo lectura. Datos reales: el negocio es **Modo Sabor, Monteros (Tucumán)**, y el
usuario logueado es **Hernan Lorenzo, rol admin** (lo devuelve `/api/auth/me`).

## 1. Cómo está construido hoy

```
Navegador ──► www.modosabor.com.ar/masivos ──► modosabor-api (login + permiso marketing.edit)
                                                 │ proxy con token
                                                 ▼
                                       modosabor-masivos (Railway, volumen /app/data)
                                       ├─ server.js: Express + SSE + whatsapp-web.js (Chromium)
                                       ├─ datos en JSON: clientes, chats, enviados-<día>, respuestas-<día>,
                                       │  excluidos, pausados, grupos, campañas, config-override
                                       └─ public/app.js: panel de una sola página (6 secciones)
```

- **Lo que funciona bien:** la sesión de WhatsApp, la sincronización de chats y contactos, el motor de envío
  (pausas aleatorias, tandas, cupo por hora, días sin envío, no repetir en el día, baja automática, salud
  del número), los grupos de envío, la bandeja con respuesta y adjuntos, y la importación CSV/VCF.
- **El problema de fondo:** Masivos es una isla. **No está conectado con el sistema Modo Sabor**: no sabe
  quién es el usuario, ni el nombre y la localidad del negocio, ni el logo, ni los clientes y pedidos
  reales. Por eso tiene texto inventado y métricas "adivinadas".

## 2. Texto de relleno o inventado (lo que se ve y no es real)

| Dónde | Qué dice | Realidad |
|---|---|---|
| Encabezado, arriba a la derecha | **"Facundo · Jefe de Salón · Panel local"**, avatar "F" | Escrito a mano en `index.html:49`. No se puede editar. El usuario real es Hernan Lorenzo (admin) |
| Barra lateral | **"Sucursal Palermo Soho"** con flecha de menú | Escrito a mano (`index.html:19`). El botón no hace nada |
| Encabezado, migas de pan | **"Modo Sabor Palermo"** | Escrito a mano (`index.html:42`). En Configuración ya guardaste "Modo Sabor Monteros" y se ignora |
| Valores por defecto | "Modo Sabor Palermo" | `config.js:6`, `server.js:2831`, `app.js:649` y `app.js:655` |
| Barra lateral, salud | **"Calentamiento OK"** | Fijo cuando hay conexión, aunque el calentamiento esté apagado |
| Inicio, "Cola de salida" | "0 msgs" | Lee `stats.pendientes`, que no existe: siempre 0 |
| Inicio, "Última sincronización" | "504 chats" | Es una cantidad de chats, no una fecha |
| Inicio, tarjeta "Campaña activa en fila" | "Tu próxima campaña empieza acá", "Frecuencia: Configurable", "Programación: Manual", "Lista de control activa" | Toda la tarjeta es fija. Dice "Manual" aunque la programación esté activa |
| Inicio, salud | "RIESGO CONTROLADO", "Reportes (7d) —", "Velocidad: Regulada", barra al 8 % | Todo fijo. Dice "controlado" aunque la salud esté en rojo |
| Inicio, "Cupo diario utilizado" | "0 / — mensajes" | Lee `stats.enviados`, que no existe |
| Inicio, "Actividad del sistema" | "Todavía no hay actividad" | `state.events` nunca se llena: siempre vacío |
| Campaña, "Simulación de rendimiento" | "Apertura proyectada —", "Reservas / Mesas", "Costo operativo $0" | Decoración: nada de eso se calcula |
| Campaña, paso 4 | "Mensaje revisado ✓", "Variables mapeadas ✓", "Intervalo configurado ✓", "Validación activa" | Tildes fijos: no se valida nada |
| Campaña, paso 3 | "La audiencia se mantiene bloqueada hasta que exista conexión y consentimiento" | No existe ese bloqueo ni el "consentimiento" |
| Campaña, descripción de segmentos | "Activos: con consentimiento"; "Nuevos: sin segunda visita confirmada" | Activo = respondió en los últimos 14 días; nuevo = chat de menos de 7 días |
| Vista previa de WhatsApp | Flyer de ejemplo (`/assets/promo.png`) cuando no subiste ninguno; botones "Ver menú / Quiero pedir"; horas 9:41 y 18:45 | El flyer no se manda. WhatsApp común no permite botones. La vista previa no muestra el saludo, el cierre ni el pie de BAJA que sí se agregan |
| Contactos | "Comensal", "Perfil de paladar & salón", "Bitácora del salón" | Vocabulario de restaurante de salón; ustedes son delivery |
| Contactos, "Último pedido" | Una fecha | Es la fecha de la última **respuesta**, no de un pedido |
| Contactos, "Pedidos" | Un número | Cuenta mensajes con palabras como "milanesa" o "precio" |
| Contactos, botón de notas | — | Muestra "quedará disponible…". El servidor sí tiene `/api/cliente-nota` |
| Configuración | Interruptor "Sesión persistente" | Decorativo: no guarda nada |
| Configuración, programación | "El panel debe permanecer abierto" | Ya no aplica: en Railway el servidor está siempre encendido |
| Modal del QR | "La sesión persistente está activa en Railway" | Se muestra igual en local |

## 3. Lo que no está conectado (el servidor lo tiene, la pantalla no)

**Lo más grave: no se puede controlar ni seguir una campaña en curso.**
- El servidor tiene `/api/pausar`, `/api/reanudar` y `/api/detener`, y emite en vivo `progreso`, `motor`,
  `tanda`, `espera` y `log`. **La interfaz no muestra ningún botón para pausar o detener, ni el progreso.**
  Una vez que tocás "Ejecutar envío real", no ves cuántos van, cuántos fallaron, cuánto falta ni cuándo
  sale el próximo, y no lo podés frenar desde el panel.

**Funciones del servidor que la pantalla no usa:**
| Endpoint | Para qué sirve | Estado |
|---|---|---|
| `/api/pausar`, `/api/reanudar`, `/api/detener` | Control de la campaña | Sin botones |
| `/api/logs` | Historial del motor | Sin pantalla (Resultados no lo muestra) |
| `/api/cliente-nota` | Notas por cliente | El botón muestra "quedará disponible" |
| `/api/recordatorios` y `/completar` | Volver a contactar | Sin pantalla |
| `/api/analizar`, `/api/analisis` | Detectar país y característica (ej. 3863 Monteros) | Sin botón |
| `/api/accion-inteligente`, `/api/acciones-masivas`, `/deshacer` | Pausar fríos, otros países, etc., con deshacer | Sin pantalla |
| `/api/reporte-dia`, `/api/cierre-dia` | Cierre de jornada | Sin pantalla |
| `/api/operador`, `/api/automatizaciones` | Próximo paso sugerido real | La tarjeta "Próximo paso" es fija |
| `/api/etiquetas` | Etiquetas manuales | Sin pantalla |
| `/api/backups` | Respaldos automáticos | Sin pantalla |

**Otras desconexiones:**
- **Detalle de campañas:** cada campaña se guarda con su lista de destinatarios y el estado de cada uno
  (enviado o fallido, con el motivo), pero Resultados solo muestra cuántas campañas hay. No hay forma de
  ver a quién le falló ni de reintentar esos envíos.
- **La programación automática** manda a "todos" (por prioridad) y no deja elegir segmento ni grupo.
- **Hay dos sistemas de masivos.** El viejo sigue visible en el sistema principal (Admin → Marketing
  Digital → pestaña WhatsApp, `client/src/pages/Marketing/MarketingWhatsapp.jsx` + `server/routes/whatsappMasivo.js`).
  Usa una conexión de WhatsApp que en producción está apagada (`WHATSAPP_DISABLE_STARTUP=1`): confunde y no anda.
- **Logo propio:** Masivos usa su logo (`/assets/logo.png`), no el del sistema (`negocio_logo`).
- **Dominio público:** el servicio de Masivos sigue expuesto en `modosabor-masivos-production.up.railway.app`
  (pide el token del proxy, pero no hace falta que esté expuesto).

## 4. Bugs menores encontrados
- La nota de un cliente, si existiera, se mostraría como "[object Object]": el servidor devuelve
  `{texto, actualizado}` y la pantalla imprime el objeto (`app.js:450`).
- `renderConfiguracion()` es código muerto: se usa `renderConfiguracionCompleta()`.
- `render()` reemplaza el texto "Confirmar y Programar Envío" con un `replace` sobre el HTML (truco frágil).

## 5. Qué agregar o modificar (propuesta, por prioridad)

**A. Datos reales en vez de relleno** (rápido, es lo que más molesta)
1. Usuario real: leer `/api/auth/me` y mostrar nombre y rol ("Hernan Lorenzo · Dueño/Admin"). Si no hay
   sesión (uso local), mostrar "Panel local".
2. Negocio real: tomar `negocio_nombre`, `negocio_localidad` y `negocio_logo` del sistema (`/api/configuracion`)
   y usarlos en el encabezado, la vista previa y los valores por defecto. Quitar "Sucursal Palermo Soho"
   (no hay sucursales) y todo "Palermo".
3. Sacar o reemplazar por datos reales cada elemento de la tabla de la sección 2: salud con su estado real,
   cupo real (enviados hoy / límite), programación real, actividad en vivo con los eventos `log`, y quitar
   "Simulación de rendimiento", "Reservas/Mesas", los tildes falsos y los botones falsos de la vista previa.
4. Vista previa fiel: armar el mensaje exactamente como sale (saludo, cuerpo, cierre y pie de BAJA) y
   mostrar el flyer real o ninguno.
5. Vocabulario de delivery: "Cliente" en vez de "Comensal", "Notas" en vez de "Bitácora del salón",
   "Última respuesta" en vez de "Último pedido".

**B. Control de campañas** (imprescindible en un sistema de envíos masivos)
6. Panel de campaña en curso: barra de progreso (enviados, fallidos, faltan), próximo envío o espera,
   tanda actual, y botones **Pausar / Reanudar / Detener** conectados al servidor.
7. Historial por campaña: lista de destinatarios con su estado y el motivo de cada falla, y un botón
   "Reintentar fallidos".
8. Log del motor visible en Resultados.

**C. Conectar con Modo Sabor** (lo que más valor agrega)
9. Clientes y pedidos reales: cruzar los teléfonos de WhatsApp con los clientes y pedidos del sistema, y
   segmentar por "pidió ayer", "frecuentes" o "no pide hace 30 días" con datos reales, no por palabras clave.
10. Programación con segmento o grupo elegido.

**D. Limpieza**
11. Retirar el módulo de masivos viejo del sistema principal (pestaña WhatsApp de Marketing Digital y sus
    rutas y servicios), o redirigirlo al panel nuevo.
12. Conectar o sacar las funciones huérfanas: notas, recordatorios, análisis de números y acciones inteligentes.
13. Quitar el dominio público del servicio de Masivos en Railway.

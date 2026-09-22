# Auditoría Técnica — Panel WhatsApp Masivo (`/masivos`)

**Fecha:** 19 de agosto de 2026  
**Ruta auditada:** `http://localhost:5173/masivos`  
**Alcance:** Frontend (`WhatsAppMasivo.jsx`), rutas API (`whatsappMasivo.js`), motor de envío (`motor.js`, `reglas.js`, `conexion.js`, `agenda.js`, `telefono.js`)  
**Auditor:** Agente IA (revisión de código + navegación visual)

---

## 1. Resumen Ejecutivo

El panel `/masivos` es una **superficie autónoma** para campañas de WhatsApp, diseñada para operar fuera del layout principal de administración. Está protegida por autenticación (`auth`) y permiso `marketing.edit`. El backend usa **Baileys** (protocolo nativo de WhatsApp) en lugar de `whatsapp-web.js`, lo que elimina la dependencia de Chromium y permite ejecutarse en contenedores.

**Veredicto general:** El módulo está bien arquitectado, con buenas prácticas de seguridad en el backend (anti-duplicados, cupos, rampa de calentamiento, bajas automáticas). Sin embargo, existen **mejoras importantes** en el frontend (datos hardcodeados, carga de CSS externa frágil) y **observaciones de seguridad menor** en los endpoints de importación y subida de archivos.

---

## 2. Hallazgos por Categoría

### 2.1 🔒 Seguridad

| Severidad | Hallazgo | Detalle |
|-----------|----------|---------|
| **BAJA** | `window.confirm()` para confirmar envío | En `WhatsAppMasivo.jsx:229` se usa `window.confirm()`. Es bloqueable por el navegador y no permite estilos. Recomendación: modal propio con diseño del sistema. |
| **BAJA** | Número de teléfono expuesto en la UI | La barra superior muestra el número completo (`5493863438281`). Considerar ofuscar parcialmente en entornos compartidos (ej. `54938****3281`). |
| **BAJA** | Falta rate limiting en endpoints de campaña | Los endpoints `/whatsapp/preparar` y `/whatsapp/enviar` no tienen rate limiting explícito. Aunque el permiso `marketing.edit` limita quién puede usarlo, un usuario autenticado podría spammear. |
| **MEDIA** | Importación masiva de contactos sin validación profunda | `/whatsapp/contactos/importar` acepta hasta 5000 contactos. Aunque hay límite, no se valida la estructura interna de cada objeto (podrían inyectarse campos inesperados en la base si la query no los usa). |
| **MEDIA** | Subida de archivos sin sanitización de nombre | En `/whatsapp/media`, el `fileName` se genera con timestamp y random, pero el `originalname` se devuelve en la respuesta sin sanitizar. Aunque no se usa directamente en rutas, es un vector potencial. |
| **INFO** | QR dibujado server-side ✅ | **Positivo:** El QR nunca sale en texto plano. Se dibuja con `qrcode` en el servidor y se envía como data URL. |
| **INFO** | Marca "enviado" ANTES de enviar ✅ | **Positivo:** En `motor.js:413`, se marca el envío en la base *antes* de llamar a WhatsApp. Si el proceso muere, no hay duplicados. |
| **INFO** | Simulacro no consume turno ✅ | **Positivo:** En `motor.js:400-406`, los simulacros se marcan como `salteado` y no afectan el cupo ni el turno del contacto. |

### 2.2 🎨 UX / UI

| Severidad | Hallazgo | Detalle |
|-----------|----------|---------|
| **MEDIA** | Termómetro de "salud del número" hardcodeado | En `WhatsAppMasivo.jsx:518-525`, los 5 indicadores del termómetro siempre muestran 4/5 verdes y el texto "Sano". Es decorativo, no refleja datos reales. Debería calcularse desde métricas (tasa de bloqueo, reportes, bajas). |
| **MEDIA** | Riesgo de campaña hardcodeado | En `WhatsAppMasivo.jsx:691-699`, siempre dice "Bajo" con 2/5 verdes. Debería calcularse según cantidad de destinatarios, frecuencia de envío, antigüedad del número, etc. |
| **BAJA** | Badge "Respuestas" no se actualiza en tiempo real | El globo rojo del sidebar muestra `respuestas.length`, pero las respuestas solo se cargan al montar el componente. No hay polling ni WebSocket para nuevas respuestas. |
| **BAJA** | "Pausa mínima (segundos)" aparece vacía | En la sección "Ritmo y seguridad", el campo "Pausa mínima (segundos)" no muestra valor por defecto aunque `reglas.js` define `demoraMinMs: 15000`. Falta conversión o default en la UI. |
| **INFO** | Preview de mensaje en formato teléfono ✅ | **Positivo:** El paso 2 de "Nueva campaña" muestra una preview del mensaje en una burbuja de chat, ayudando al operador a visualizar el resultado. |
| **INFO** | Confirmación en dos pasos ✅ | **Positivo:** Separar `preparar` de `enviar` obliga al operador a revisar antes de disparar. |

### 2.3 ⚡ Rendimiento

| Severidad | Hallazgo | Detalle |
|-----------|----------|---------|
| **MEDIA** | Carga masiva inicial sin paginación | `cargar()` en `WhatsAppMasivo.jsx:101-122` hace 7 requests en paralelo, incluyendo 200 contactos, 30 campañas y 50 respuestas. Para locales grandes, esto puede ser lento. Considerar paginación lazy o virtualización. |
| **BAJA** | `useEstilosDeClaude` fetch de CSS en runtime | `WhatsAppMasivo.jsx:47-76` hace un fetch a `/whatsapp-masivo.html`, extrae el `<style>` con regex y lo inyecta en el DOM. Si el archivo no existe o el servidor responde lento, la UI se ve sin estilos. Es un punto de fallo extra. |
| **BAJA** | Re-renders potenciales en `Nueva` | El paso 2 de la campaña usa `setForm({ ...form, mensaje: e.target.value })` en cada tecla. Con objetos grandes puede causar re-renders innecesarios. Considerar `useReducer` o dividir el estado. |
| **INFO** | Motor con EventEmitter ✅ | **Positivo:** El backend usa `EventEmitter` para notificar estado sin bloquear la petición HTTP. El envío corre en background. |

### 2.4 🏗️ Código / Mantenibilidad

| Severidad | Hallazgo | Detalle |
|-----------|----------|---------|
| **MEDIA** | `whatsapp-masivo.html` como fuente de estilos | La dependencia entre el componente React y un archivo HTML estático es un acoplamiento inusual. Si se migra el CSS a Tailwind o CSS Modules, este hack se puede eliminar. |
| **BAJA** | Comentarios en `App.jsx` desactualizados | El comentario en `App.jsx:13-21` menciona `WebPublica` como import directo "a propósito", pero la referencia a `Layout` parece copy-pasteado de una versión anterior. |
| **BAJA** | `MarketingWhatsapp.jsx` vs `WhatsAppMasivo.jsx` | Existen dos componentes con nombres similares. `MarketingWhatsapp.jsx` parece una versión anterior o alternativa usada en `/admin/whatsapp-masivo`, mientras que `WhatsAppMasivo.jsx` es el de `/masivos`. Considerar deprecar o renombrar para claridad. |
| **INFO** | Normalización de teléfonos robusta ✅ | **Positivo:** `telefono.js` maneja correctamente los formatos argentinos (0, 15, +54, 9) y devuelve `null` en caso de duda. |
| **INFO** | Reglas puras y testeables ✅ | **Positivo:** `reglas.js` no toca base ni red, facilita unit tests. |
| **INFO** | Manejo de LID -> PN en Baileys ✅ | **Positivo:** `agenda.js` maneja el mapeo de LID a número de teléfono, evitando escribir a identificadores inválidos. |

---

## 3. Recomendaciones Priorizadas

### 🔴 Alta prioridad

1. **Eliminar datos hardcodeados del frontend**
   - Reemplazar el termómetro fijo de "Sano" con una métrica real calculada desde el backend (tasa de respuesta, bajas, bloqueos).
   - Reemplazar el "Riesgo: Bajo" fijo con un cálculo basado en volumen, frecuencia y antigüedad del número.

2. **Revisar la estrategia de carga de CSS**
   - Migrar los estilos de `whatsapp-masivo.html` a Tailwind classes nativas o a un CSS Module importado normalmente. El fetch dinámico es un riesgo de mantenibilidad.

### 🟡 Media prioridad

3. **Agregar rate limiting a los endpoints críticos**
   - `/whatsapp/preparar`, `/whatsapp/enviar`, `/whatsapp/contactos/importar` deberían tener rate limiting por usuario (ej. máximo 1 envío cada 30 segundos, máximo 3 importaciones por hora).

4. **Implementar polling o WebSocket para respuestas**
   - El badge de "Respuestas" y la sección de respuestas deberían actualizarse automáticamente, no solo al cargar la página.

5. **Validar y sanitizar la importación de contactos**
   - Rechazar objetos con campos inesperados o estructuras inválidas antes de procesar.

### 🟢 Baja prioridad

6. **Reemplazar `window.confirm()` por modal del sistema**
   - Usar el mismo patrón de confirmación que el resto del panel (ej. `Confirmar` component en `MarketingWhatsapp.jsx`).

7. **Paginación lazy en audiencias**
   - Cargar contactos bajo demanda en lugar de 200 de una vez.

8. **Ofuscar número de teléfono en la UI**
   - Mostrar parcialmente en la barra superior si la pantalla puede ser visible por terceros.

---

## 4. Aspectos Positivos Destacados

- ✅ **Arquitectura de envío segura:** marca antes de enviar, anti-duplicados por turno, cupos por ventana.
- ✅ **Rampa de calentamiento:** protege números nuevos de ser bloqueados.
- ✅ **Bajas automáticas inteligentes:** dos niveles de detección (exacta y por prefijo) evitan falsos positivos.
- ✅ **Baileys en el servidor:** elimina dependencia de Chromium y PC local encendida.
- ✅ **Sesión persistente en volumen:** la sesión de WhatsApp sobrevive a deploys en Railway.
- ✅ **QR server-side:** la credencial de vinculación nunca sale del servidor en texto plano.
- ✅ **Simulacros que no contaminan:** las pruebas no afectan los cupos ni los turnos de los contactos.
- ✅ **Código comentado:** los archivos del backend tienen comentarios claros sobre las decisiones de diseño.

---

## 5. Métricas Rápidas

| Métrica | Valor |
|---------|-------|
| Líneas de código (frontend) | ~994 (`WhatsAppMasivo.jsx`) |
| Líneas de código (backend) | ~1,606 (motor + reglas + conexion + agenda + telefono + rutas) |
| Endpoints API | 25+ |
| Tablas de base relacionadas | `wa_campanas`, `wa_envios`, `wa_contactos`, `wa_respuestas`, `wa_excluidos`, `whatsapp_conversaciones`, `whatsapp_mensajes` |
| Permisos requeridos | `marketing.edit` |
| Dependencias críticas | `@whiskeysockets/baileys`, `qrcode`, `multer` |

---

*Fin del informe de auditoría.*

# Auditoría — Panel WhatsApp Masivo Local (`C:\Users\Exuz\Documents\kimi\Workspaces\masivos`)

**Fecha:** 19 de agosto de 2026  
**Tipo:** Aplicación de escritorio / local (Node.js + Express + whatsapp-web.js)  
**Puerto:** `localhost:3847`  
**Auditor:** Agente IA

---

## 1. Qué es este workspace

Este es el **panel original de envío masivo** de Modo Sabor, construido antes de la integración con el sistema principal. Corre localmente en la PC del local y usa `whatsapp-web.js` (abre Chromium y automatiza la web de WhatsApp) en vez de Baileys (protocolo nativo).

### Archivos principales
| Archivo | Líneas | Rol |
|---------|--------|-----|
| `server.js` | 2,656 | Panel web + motor de envío + CRM + segmentación + plan operativo |
| `enviar-promo.js` | 321 | Script de consola para envío directo (sin panel) |
| `listar-clientes.js` | 121 | Script para escanear chats de WhatsApp y generar `clientes.json` |
| `config.js` | 133 | Configuración centralizada (delays, límites, saludos, cierres) |
| `session-utils.js` | 99 | Limpieza de procesos Chrome huérfanos vía PowerShell |

---

## 2. Comparativa: Local vs. Sistema Integrado

### 2.1 Ventajas de la versión LOCAL (este workspace)

| Característica | Detalle |
|----------------|---------|
| **CRM completo** | Estados CRM (`nuevo`, `pedido_probable`, `consulta`, `respondido`, `cerrado`, `baja`, `problema`) con persistencia. |
| **Plan operativo** | Genera pasos diarios recomendados según segmentos y bandeja (responder pedidos, recuperar fríos, etc.). |
| **Score por cliente** | Cada contacto tiene un `scoreAuto` calculado por pedidos, respuestas, recencia, frío/viejo. |
| **Cierre de jornada** | Reporte diario con embudo de ventas, salud del número, métricas. |
| **Recordatorios** | Sistema de recordatorios por cliente con vencimiento y completado. |
| **Notas por cliente** | Notas persistentes asociadas a cada número. |
| **Etiquetas manuales** | Tags editables por el operador (`frecuente`, `ejecutivo`, `economico`, etc.). |
| **Plantillas por segmento** | Mensajes diferentes según el segmento (`mensaje-pidio.txt`, `mensaje-nuevo.txt`, etc.). |
| **Salud del número real** | `calcularSaludNumero()` usa tasa de respuesta, lectura, fríos y envíos por hora. Devuelve score 0-100 con recomendaciones. |
| **Embudo de ventas** | `embudoVentasDelDia()` con conversión, cierre sobre pedido, alertas automáticas. |
| **Acks persistentes** | Guarda doble tilde / leído por número por día. |
| **Lock de panel** | Evita abrir dos instancias simultáneas vía `panel.lock.json` y chequeo de PID. |
| **Backup automático** | Copia `clientes.json`, `excluidos.json`, `etiquetas.json` con rotación de 30 copias. |
| **Pausas operativas** | Puede pausar contactos por N días sin excluirlos permanentemente. |
| **Liberación de Chrome** | `session-utils.js` mata procesos Chrome huérfanos de sesiones previas. |

### 2.2 Desventajas de la versión LOCAL

| Problema | Impacto |
|----------|---------|
| **Requiere PC local encendida** | Si la máquina se apaga, no hay envíos programados ni recepción de respuestas. |
| **Dependencia de Chromium** | `whatsapp-web.js` abre un navegador real (~500MB RAM), requiere pantalla virtual en servidores. |
| **Sin autenticación** | El panel en `localhost:3847` no tiene login ni permisos. Cualquiera con acceso a la red local puede usarlo. |
| **Datos en archivos JSON** | Todo vive en `data/*.json`. Sin base de datos: sin backups automáticos, sin concurrencia, sin integridad referencial. |
| **Sin integración con TPV** | Los pedidos detectados en WhatsApp no se vinculan automáticamente con el sistema de pedidos. |
| **Fragilidad de sesión** | Si Chromium crashea, la sesión puede quedar corrupta. |
| **Un solo número** | No puede escalar a múltiples locales o números. |

### 2.3 Qué tiene la versión INTEGRADA (sistema principal) que no tiene esta

| Característica | Detalle |
|----------------|---------|
| **Baileys (sin Chromium)** | Protocolo nativo de WhatsApp. Corre en el servidor, sin PC local. |
| **Autenticación + permisos** | Requiere `marketing.edit`. Protegido contra accesos no autorizados. |
| **Base de datos SQLite** | `wa_campanas`, `wa_envios`, `wa_contactos`, `wa_respuestas`, `wa_excluidos` con integridad transaccional. |
| **Persistencia en servidor** | La sesión sobrevive a deploys en Railway. |
| **Anti-duplicados robusto** | Marca "enviado" en la base ANTES de mandar. Si el servidor se reinicia, no hay duplicados. |
| **QR server-side seguro** | El QR nunca sale en texto plano; se dibuja en el servidor con `qrcode`. |
| **Simulacro sin contaminar** | Los simulacros no consumen turnos ni cupos. |
| **Conversaciones con IA** | Integrado con el agente IA de atención al cliente (gateway). |
| **Badge de esperando persona** | `/conversaciones/esperando-persona` para el cajero. |

---

## 3. Hallazgos de Seguridad (versión local)

| Severidad | Hallazgo | Detalle |
|-----------|----------|---------|
| **ALTA** | **Panel sin autenticación** | `server.js` sirve el panel en `127.0.0.1:3847` sin login. En una red local compartida (ej. WiFi del local), cualquier dispositivo conectado puede acceder y enviar campañas. |
| **MEDIA** | **Datos sensibles en archivos JSON planos** | `data/clientes.json`, `excluidos.json`, `respuestas-*.json` contienen números de teléfono y nombres sin cifrar. Cualquiera con acceso al sistema de archivos puede leerlos. |
| **MEDIA** | **Sin rate limiting** | Cualquiera que acceda al panel puede iniciar envíos masivos sin restricciones. |
| **BAJA** | **Lock por PID puede fallar** | Si el proceso anterior muere abruptamente sin limpiar `panel.lock.json`, el lock queda huérfano. Aunque `procesoVivo()` lo detecta, hay una ventana de condición de carrera. |
| **BAJA** | `session-utils.js` usa `Stop-Process -Force` | Mata procesos Chrome por nombre y ruta. En teoría podría matar un Chrome legítimo si otro usuario tiene abierta una pestaña con `sesion` en la URL. |
| **INFO** | **whatsapp-web.js desde GitHub** | `package.json` apunta a un commit específico de GitHub (`github:wwebjs/whatsapp-web.js#1780711...`). No es un release de npm, lo que introduce riesgo de supply chain si el repo se compromete. |

---

## 4. Hallazgos de Código

### 4.1 Positivos
- ✅ `calcularSaludNumero()` es una métrica real y útil (score 0-100 con recomendaciones).
- ✅ `construirPlanOperativo()` da prioridades diarias basadas en datos.
- ✅ Segmentación automática rica (14 segmentos) con score predictivo.
- ✅ Manejo de LIDs (nuevo formato de WhatsApp) en `listar-clientes.js`.
- ✅ Backup con rotación automática.
- ✅ Pausas operativas (no solo excluir permanentemente).

### 4.2 Problemas
- ⚠️ `server.js` tiene **2,656 líneas** en un solo archivo. Es difícil de mantener y testear.
- ⚠️ Persistencia basada en **JSON sobre filesystem**. Sin transacciones, sin concurrencia. Si dos operaciones escriben al mismo tiempo, se corrompe.
- ⚠️ No hay tests unitarios ni de integración.
- ⚠️ `enviar-promo.js` y `server.js` duplican lógica de envío (`armarMensaje`, delays, reintentos).

---

## 5. Recomendación Estratégica

### La versión integrada (sistema principal) debería "absorber" las funcionalidades más valiosas de esta versión local antes de deprecarla completamente.

| Funcionalidad local | Estado en sistema integrado | Prioridad de migración |
|---------------------|----------------------------|------------------------|
| CRM con estados | ❌ No existe | **ALTA** |
| Plan operativo diario | ❌ No existe | **ALTA** |
| Score por cliente | ❌ No existe | **MEDIA** |
| Cierre de jornada / reporte diario | ❌ No existe | **MEDIA** |
| Recordatorios por cliente | ❌ No existe | **BAJA** |
| Notas por cliente | ❌ No existe | **BAJA** |
| Etiquetas manuales | ❌ No existe (solo segmentos auto) | **BAJA** |
| Plantillas por segmento | ❌ No existe | **MEDIA** |
| Salud del número (score real) | ❌ Hardcodeado a "Sano" | **ALTA** |
| Embudo de ventas | ❌ No existe | **MEDIA** |
| Pausas operativas (no permanentes) | ❌ No existe | **BAJA** |

### Qué NO migrar
- ❌ `whatsapp-web.js` → ya se reemplazó por Baileys (correcto).
- ❌ Archivos JSON como base de datos → SQLite es superior.
- ❌ Panel sin autenticación → el sistema integrado ya tiene login + permisos.

---

## 6. Conclusión

Este workspace es un **buen producto con features valiosas** que la versión integrada aún no tiene. Sin embargo, su arquitectura local (Chromium + archivos JSON + sin auth) lo hace inadecuado para producción a largo plazo.

**La mejor estrategia:**
1. **No borrar** este workspace todavía; sirve como respaldo funcional.
2. **Migrar progresivamente** las features de alto valor (CRM, plan operativo, salud del número) al sistema integrado.
3. Una vez que el sistema integrado tenga paridad de features, **deprecar** este workspace y eliminarlo.

---

*Fin del informe de auditoría del workspace local.*

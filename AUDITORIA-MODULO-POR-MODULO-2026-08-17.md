# AUDITORÍA MÓDULO POR MÓDULO — MODOSABOR
**Fecha:** 2026-08-17  
**Sistema:** ModoSabor v1.3.6  
**Backend:** Node.js + Express + SQLite (better-sqlite3)  
**Frontend:** React 18 + Vite + Tailwind CSS + Capacitor (Android/iOS)  
**Total líneas backend:** ~18.500 (rutas)  
**Total líneas frontend:** ~29.200 (páginas JSX)

---

## ÍNDICE DE ESTADOS

| Estado | Significado |
|--------|-------------|
| 🟢 | Saludable — funciona bien, código limpio |
| 🟡 | Advertencia — funciona pero tiene deuda técnica o riesgos |
| 🔴 | Crítico — tiene bugs, fallos de seguridad o está incompleto |
| ⚪ | Incompleto — existe esqueleto pero falta funcionalidad |

---

## 1. ARQUITECTURA & INFRAESTRUCTURA 🟡

### Lo que funciona
- Servidor Express con CORS, Helmet, rate limiting, compresión y sanitización
- Conversión automática centavos↔pesos via middleware
- Health check completo con verificación de DB, URLs y MercadoPago
- Backups automáticos
- WebSocket con socket.io para tiempo real
- Seed automático de menú si la base está vacía

### Qué falta
- Monolito sin separación de servicios (API, WhatsApp worker, social worker en un solo proceso)
- SQLite en producción sin pool de conexiones ni replicas
- Sin migraciones automáticas en deploy (`migrations.js` de 71KB se ejecuta manualmente)
- Dockerfile existente pero sin CI/CD automatizado
- n8n databases (3 archivos SQLite de ~10MB cada uno) en la raíz del repo
- Logs sin rotación estructurada (`server.err.log`, `server.out.log` acumulándose)
- Sin monitoreo de uptime ni alertas de caída (no hay Pingdom, UptimeRobot, ni similar)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar `npm run migrate` al script de start del servidor | 2 horas | 🔴 Alta |
| Mover n8n databases fuera del repo (`.gitignore` + path config) | 1 hora | 🟡 Media |
| Configurar rotación de logs (max 5 archivos de 10MB) | 3 horas | 🟡 Media |
| Separar WhatsApp gateway en proceso independiente | 2 días | 🟡 Media |
| Evaluar migración a PostgreSQL (plan a 3 meses) | 1 semana de análisis | 🟢 Baja |

---

## 2. AUTENTICACIÓN & SEGURIDAD 🟡

### Lo que funciona
- JWT con cookie httpOnly + secure en producción
- Rate limiting en login (20 intentos / 15 min)
- Validación Zod en login y creación de usuarios
- Bcrypt con salt 10
- Roles y permisos granulares
- Native login para app Mozo

### Qué falta
- Sin invalidación de sesiones: si desactivás un usuario, su token sigue válido 7 días
- Sin 2FA para admin
- Sin auditoría de intentos de login fallidos
- Passwords mínimos de 6 caracteres (muy bajo)
- `reset-admin-once.json` en `scripts/` — riesgo de reset accidental si queda el archivo
- JWT_SECRET depende de config, sin fallback documentado si falla
- Sin tabla de sesiones activas (no se puede ver quién está logueado ni forzar logout)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar tabla `sesiones_activas` con JWT jti + logout forzado | 1 día | 🔴 Alta |
| Subir mínimo de password a 8 caracteres con validación de fortaleza | 2 horas | 🟡 Media |
| Registrar intentos de login fallidos en `auditoria_eventos` | 3 horas | 🟡 Media |
| Mover `reset-admin-once.json` a variable de entorno o prompt interactivo | 2 horas | 🟡 Media |

---

## 3. BASE DE DATOS 🟡

### Lo que funciona
- 40+ tablas bien normalizadas con índices estratégicos
- Soft delete vía campo `activo`
- Campos de auditoría (`creado_en`, `actualizado_en`, `actor_id`, `actor_nombre`)
- JSON en TEXT para flexibilidad
- Índices únicos para idempotencia

### Qué falta
- SQLite no escala: tablas como `pedidos`, `whatsapp_mensajes`, `repartidor_ubicaciones_log` crecen indefinidamente
- Sin particionamiento ni archiving de datos históricos
- JSON en columnas TEXT impide queries SQL eficientes (no se puede hacer `WHERE json_extract(items, '$.producto_id') = 5` de forma indexada)
- Sin tabla de sesiones
- Sin soft delete en `whatsapp_mensajes`, `auditoria_eventos`
- Falta índice compuesto en `pedidos(cliente_id, estado, creado_en)`
- No hay política de retención de datos (¿cuánto tiempo guardar ubicaciones GPS?)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar índice `idx_pedidos_cliente_estado_fecha` | 30 minutos | 🟡 Media |
| Crear script de archiving mensual para `repartidor_ubicaciones_log` (>90 días) | 1 día | 🟡 Media |
| Evaluar migración a PostgreSQL con jsonb para items/variantes | 3 días de análisis | 🟢 Baja |
| Agregar soft delete a tablas que lo faltan | 2 horas | 🟢 Baja |

---

## 4. PRODUCTOS, CATEGORÍAS & CARTA 🟢

### Lo que funciona
- CRUD completo con Zod
- Listas de opciones compartidas
- Recetas de inventario vinculadas
- Menú del día con historial
- Stock directo y por receta
- Mermas con motivo obligatorio y costo congelado

### Qué falta
- Sin variantes compuestas (ej: "Pizza mitad muzza, mitad napolitana")
- Sin fotos múltiples por producto (solo una imagen)
- Sin gestión de alérgenos o etiquetas dietéticas
- Sin integración con balanza (para productos por peso)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar campo `alergenos` JSON a productos | 3 horas | 🟢 Baja |
| Permitir múltiples imágenes por producto | 1 día | 🟢 Baja |
| Soporte para productos por peso (kg) con precio variable | 2 días | ⚪ Cuando sea necesario |

---

## 5. PEDIDOS & OPERACIÓN 🟢

### Lo que funciona
- Máquina de estados con validación
- Múltiples orígenes (TPV, web, WhatsApp, mozo-app)
- Pagos parciales (split payments)
- Geocodificación de direcciones
- Tracking público con token seguro
- Recorrido GPS del repartidor
- Trazabilidad completa
- Impresión de tickets/comandas
- Reservas, fusión y movimiento de mesas
- MercadoPago (webhook + sync)

### Qué falta
- **Motivo de cancelación:** Se cancela y no queda registrado por qué (ya identificado en `LISTA-QUE-NOS-FALTA.md`)
- **Número corto para cantar:** El número de pedido llega a 4 cifras y deja de servir para gritarlo en el salón
- **Pantalla de pedidos para el salón:** No hay una URL pública que muestre "en preparación / listos" en un televisor
- **Tiempo de preparación real:** Se estima con número fijo pero no se mide lo que tardó de verdad
- **Pedidos programados:** Aparecen en cocina desde que se cargan, mezclados con lo del momento
- **Impuestos (taxes):** No modelados en ninguna parte (AFIP requiere esto para facturación electrónica)
- Sin notificaciones push al cliente (solo WhatsApp)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar campo `motivo_cancelacion` a pedidos | 2 horas | 🔴 Alta |
| Crear número corto (`token_corto` de 3-4 dígitos) para cantar | 3 horas | 🔴 Alta |
| Pantalla pública de salón (`/salon`) con pedidos en preparación/listos | 2 días | 🟡 Media |
| Guardar timestamps de transición de estado para medir tiempos reales | 1 día | 🟡 Media |
| Filtrar pedidos programados en KDS (mostrar solo si `hora_entrega` está dentro de X minutos) | 4 horas | 🟡 Media |
| Agregar `impuesto` (IVA) a productos y pedidos | 3 días | 🟢 Baja (pero urgente para AFIP) |

---

## 6. DELIVERY & REPARTIDORES 🟢

### Lo que funciona
- Panel Rider nativo (Capacitor/Android)
- Asignación automática de repartidores
- GPS en tiempo real
- Notificaciones FCM
- Tracking con token seguro

### Qué falta
- Sin estimación de distancia/tiempo en tiempo real (no integra Google Maps Directions)
- Sin optimización de ruta para repartidor con múltiples pedidos
- Sin penalización automática por demoras repetidas
- Sin foto de entrega obligatoria (existe el campo `entrega_foto` pero no parece forzado)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Foto obligatoria al marcar "entregado" en app Rider | 1 día | 🟡 Media |
| Mostrar distancia al cliente en tiempo real (ya se guardan puntos GPS) | 4 horas | 🟢 Baja |
| Optimización de ruta para múltiples deliverys (algoritmo nearest-neighbor) | 2 días | 🟢 Baja |

---

## 7. INVENTARIO & COMPRAS 🟢

### Lo que funciona
- Insumos con stock mínimo
- Recetas condicionales
- Movimientos trazables
- Compras con items
- Mermas con costo congelado
- Sincronización masiva por categoría

### Qué falta
- Sin proveedores como entidad (solo texto libre en `inventario_compras.proveedor`)
- Sin órdenes de compra pendientes (solo se registra cuando llega)
- Sin cálculo de costo promedio ponderado (solo `costo_unitario` actual)
- Sin alerta automática por email/WhatsApp cuando stock bajo
- Sin conteo cíclico (solo ajustes manuales)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Crear tabla `proveedores` y vincular a compras | 1 día | 🟡 Media |
| Agregar `orden_compra` con estado pendiente/recibido | 2 días | 🟢 Baja |
| Alerta de stock bajo vía WhatsApp (reutilizar gateway existente) | 4 horas | 🟡 Media |

---

## 8. CLIENTES & CRM 🟡

### Lo que funciona
- CRUD con direcciones múltiples
- Estadísticas automáticas
- Tags
- Cuenta corriente
- Cupones por cliente

### Qué falta
- Sin pipeline de ventas ni estados de lead
- Sin segmentación avanzada (solo tags manuales)
- Sin campañas automáticas basadas en comportamiento (ej: "no compró hace 30 días")
- Sin integración con email marketing
- Sin historial completo de interacciones (solo pedidos)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Agregar campo `ultima_compra` y query para "clientes inactivos" | 2 horas | 🟡 Media |
| Campaña automática de reactivación vía WhatsApp masivo | 1 día | 🟡 Media |
| Segmentación por gasto/frecuencia (RFM básico) | 1 día | 🟢 Baja |

---

## 9. CAJA & FINANZAS 🟢

### Lo que funciona
- Apertura/cierre con turno operativo
- Arqueo ciego (resuelto en servidor)
- Movimientos manuales
- Propinas por mozo
- Resumen por método de pago y por turno
- Ticket de cierre imprimible

### Qué falta
- Sin conciliación bancaria automática (MercadoPago se sincroniza, pero transferencias/QR no)
- Sin cierre parcial de turno (solo cierre completo)
- Sin reporte de evolución de caja en el tiempo (tendencias)
- Sin retiro de efectivo parcial (solo movimientos de entrada/salida)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Reporte de tendencia de caja (ventas por hora en el turno) | 1 día | 🟢 Baja |
| Retiro de efectivo parcial con ticket | 4 horas | 🟢 Baja |

---

## 10. PERSONAL / EMPLEADOS 🟢

### Lo que funciona
- Reloj de asistencia con QR
- Liquidaciones completas
- Objetivos por período
- Categorías con sueldo base
- Historial de carrera
- Reconocimientos con puntos

### Qué falta
- Los sueldos se guardan en pesos donde el resto del sistema espera centavos (ya identificado como roto)
- Sin integración con AFIP (SICOSS, F931)
- Sin control de vacaciones automático
- Sin recibos de sueldo digitales descargables

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| **Migrar sueldos de Personal a centavos (crítico, ya está roto)** | 1 día | 🔴 Alta |
| Generar recibo de sueldo en PDF | 2 días | 🟡 Media |
| Exportación SICOSS para AFIP | 3 días | 🟢 Baja |

---

## 11. MARKETING DIGITAL 🟡

### Lo que funciona
- Promociones con fechas
- Contenidos para redes
- Calendario de publicaciones
- Publicador a grupos de Facebook
- Atribución de ventas a campañas

### Qué falta
- Publicador a Meta depende de Playwright/Puppeteer — frágil ante cambios de UI
- Sin métricas de ROI integradas
- Sin A/B testing de campañas
- Sin integración con Google Ads ni Meta Ads API oficial

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Reemplazar publicador Playwright por Meta Graph API | 3 días | 🟡 Media |
| Dashboard de ROI por campaña (costo vs ventas atribuidas) | 2 días | 🟡 Media |

---

## 12. FIDELIZACIÓN 🟢

### Lo que funciona
- Puntos por peso gastado
- Niveles (Bronce/Plata/Oro)
- Sellos para premio
- Canje y expiración automática
- Tarjeta física QR

### Qué falta
- Sin notificación de cambio de nivel
- Sin beneficios automáticos (ej: envío gratis solo se aplica si el operador se acuerda)
- Sin referidos (trae un amigo, ganás puntos)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Aplicar envío gratis automático si el cliente tiene nivel con ese beneficio | 1 día | 🟢 Baja |
| Notificación WhatsApp al subir de nivel | 3 horas | 🟢 Baja |

---

## 13. WHATSAPP 🟡

### Lo que funciona
- Baileys 7.0.0 (protocolo nativo)
- Envío masivo
- Agente conversacional con IA (n8n)
- Carrito en chat
- Transcripción de audio (Whisper)
- Borradores de pedido

### Qué falta
- **Baileys rc14 = riesgo de bloqueo de número** (versión no estable)
- Sin fallback SMS si bloquean el número
- n8n databases en la raíz del repo (datos sensibles)
- Agente-whatsapp no integrado en CI/CD
- Sin métricas de conversión del agente (cuántos chats terminan en pedido)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| **Actualizar Baileys a versión estable o migrar a WhatsApp Business API** | 3 días | 🔴 Alta |
| Mover n8n databases fuera del repo | 1 hora | 🔴 Alta |
| Métricas de conversión del agente (tasa de chats → pedidos) | 1 día | 🟡 Media |
| Configurar fallback SMS via Twilio para pedidos críticos | 2 días | 🟢 Baja |

---

## 14. IA / ASISTENTE VIRTUAL 🟢

### Lo que funciona
- Chat con múltiples proveedores
- Herramientas de solo lectura
- Acciones de reparación con confirmación
- Firma criptográfica HMAC-SHA256
- Blindaje contra prompt injection
- Revisión automática cada 30 min
- Dashboard widget
- 15 tests pasando

### Qué falta
- Sin medición de consumo de IA (tokens, costo por consulta)
- Sin rate limiting por usuario (alguien podría hacer 100 consultas en 1 minuto)
- Sin caché de respuestas frecuentes
- Sin historial persistente de conversaciones (solo en memoria del frontend)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Registrar tokens usados y costo estimado por consulta | 1 día | 🟡 Media |
| Rate limiting por usuario (20 consultas / hora) | 3 horas | 🟡 Media |
| Guardar historial de chat en base de datos | 2 días | 🟢 Baja |

---

## 15. SOCIAL MEDIA 🟡

### Lo que funciona
- Scheduler de publicaciones
- Worker separado
- Chrome controlado por Playwright

### Qué falta
- Worker depende de Chrome local — no es portable
- Sin métricas de engagement
- Sin integración con Instagram ni TikTok

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Publicar vía APIs oficiales en lugar de Chrome | 3 días | 🟡 Media |
| Agregar Instagram y TikTok al scheduler | 2 días | ⚪ Cuando sea necesario |

---

## 16. AUDITORÍA & CONFIGURACIÓN 🟢

### Lo que funciona
- Log de eventos
- Exportación/importación de datos
- Configuración runtime
- Smoke tests
- Backup/restore

### Qué falta
- Sin dashboard de auditoría en tiempo real
- Sin alertas automáticas por eventos críticos (ej: cierre de caja con diferencia > X)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Alerta automática si cierre de caja tiene diferencia > $5.000 | 4 horas | 🟢 Baja |

---

## 17. TESTS 🟡

### Lo que funciona
- Runner propio que descubre `.test.js`
- 15 tests del asistente pasando
- Scripts de verificación (`verify:core`, `verify:mozo`, etc.)
- Fixtures con base temporal

### Qué falta
- **Solo 1 archivo de test para 50.000+ líneas de código**
- Sin tests de integración para pedidos, caja, inventario, personal, auth
- Sin tests de frontend
- Sin cobertura de código
- Tests viejos que no se ejecutaban (detectados por el runner)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Tests de integración para auth (login, permisos, logout) | 1 día | 🔴 Alta |
| Tests de integración para pedidos (crear, cancelar, pagar) | 2 días | 🔴 Alta |
| Tests de integración para caja (apertura, movimiento, cierre) | 1 día | 🔴 Alta |
| Tests de inventario (movimiento, merma, receta) | 1 día | 🟡 Media |
| Configurar cobertura de código (`c8` o `nyc`) | 2 horas | 🟡 Media |

---

## 18. FRONTEND 🟡

### Lo que funciona
- React 18 con lazy loading
- Tailwind + Framer Motion
- Router con permisos
- App nativa Android
- Web pública

### Qué falta
- Páginas de 1.000-3.600 líneas (TPV: 2.116, RiderPanel: 3.690)
- Sin tests de frontend
- Algunas páginas son proxies de 1 línea (refactorización incompleta)
- Sin PWA (la web pública no tiene service worker ni offline)

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Extraer componentes de TPV.jsx (dividir en sub-componentes) | 2 días | 🟡 Media |
| Configurar Vitest + React Testing Library | 1 día | 🟡 Media |
| Convertir web pública en PWA (service worker + offline) | 1 día | 🟢 Baja |

---

## 19. MÓDULOS SATÉLITE

### mozo-app/ 🟢
- Estado: Funcional
- Qué falta: Sin actualización automática OTA (tiene que reinstalar APK)
- Propuesta: Integrar Firebase App Distribution o CodePush — 1 día

### social-worker/ 🟡
- Estado: Frágil (depende de Chrome local)
- Qué falta: Portabilidad, métricas
- Propuesta: Migrar a APIs oficiales — 3 días

### agente-whatsapp/ 🟡
- Estado: En desarrollo activo, fuera del CI/CD principal
- Qué falta: Integración con el build principal, versionado del workflow n8n
- Propuesta: Mover workflow a código versionado y agregar test de integración — 2 días

---

## 20. DOCUMENTACIÓN & OPERACIÓN 🟡

### Lo que funciona
- Múltiples archivos markdown con análisis previos
- Especificación de facturación AFIP
- Prompts para CLI y Codex

### Qué falta
- 15+ archivos sueltos, dispersos en la raíz
- Sin docs/ estructurado
- Sin runbook de operación (¿qué hacer si se cae?)
- Sin diagrama de arquitectura

### Propuesta
| Tarea | Esfuerzo | Prioridad |
|-------|----------|-----------|
| Crear carpeta `docs/` y mover documentación ahí | 1 hora | 🟢 Baja |
| Runbook: "Qué hacer si se cae el servidor" | 2 horas | 🟡 Media |
| Diagrama de arquitectura (draw.io o Mermaid) | 2 horas | 🟢 Baja |

---

## RESUMEN EJECUTIVO — TOP 10 POR HACER

| # | Tarea | Módulo | Esfuerzo | Impacto |
|---|-------|--------|----------|---------|
| 1 | **Tests de integración para auth, pedidos y caja** | Tests | 4 días | 🔴 Crítico |
| 2 | **Migrar sueldos de Personal a centavos** | Personal | 1 día | 🔴 Crítico |
| 3 | **Actualizar Baileys o migrar a WhatsApp Business API** | WhatsApp | 3 días | 🔴 Crítico |
| 4 | **Agregar motivo de cancelación a pedidos** | Pedidos | 2 horas | 🟡 Alto |
| 5 | **Crear número corto para cantar en salón** | Pedidos | 3 horas | 🟡 Alto |
| 6 | **Pantalla pública de salón (/salon)** | Pedidos | 2 días | 🟡 Alto |
| 7 | **Agregar invalidación de sesiones (tabla sesiones_activas)** | Auth | 1 día | 🟡 Alto |
| 8 | **Medir consumo de IA (tokens/costo)** | IA | 1 día | 🟡 Medio |
| 9 | **Alerta de stock bajo vía WhatsApp** | Inventario | 4 horas | 🟡 Medio |
| 10 | **Archiving de ubicaciones GPS (>90 días)** | DB | 1 día | 🟢 Medio |

---

*Auditoría generada por Kimi — ModoSabor*

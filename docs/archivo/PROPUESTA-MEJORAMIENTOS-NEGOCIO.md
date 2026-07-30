# Propuesta de Mejoras de Negocio - Modo Sabor

**Fecha:** 2026-04-04  
**Área:** Fidelización, Marketing Automation e Integraciones

---

## 1. PROGRAMA DE FIDELIZACIÓN

### 1.1 Sistema de Puntos

#### Concepto

Los clientes acumulan puntos por cada compra que pueden canjear por productos gratis o descuentos.

#### Reglas de Negocio

| Concepto                    | Configuración              | Ejemplo                                   |
| --------------------------- | -------------------------- | ----------------------------------------- |
| Tasa de conversión          | 1 punto cada $100          | Compra $350 = 3.5 puntos                  |
| Puntos por producto         | Variable                   | Pizza especial = 10 pts, Empanada = 5 pts |
| Valor del punto             | 1 punto = $10 de descuento | 50 puntos = $500 off                      |
| Expiración                  | 6 meses sin actividad      | Se resetean si no compra                  |
| Bonificación primera compra | 2x puntos                  | Bienvenida al sistema                     |

#### Implementación Técnica

**Nuevas tablas necesarias:**

```sql
-- Tabla de configuración de puntos
CREATE TABLE config_puntos (
  id INTEGER PRIMARY KEY,
  pesos_por_punto REAL DEFAULT 100,
  valor_punto_real REAL DEFAULT 10,
  dias_expiracion INTEGER DEFAULT 180,
  activo BOOLEAN DEFAULT 1
);

-- Tabla de transacciones de puntos
CREATE TABLE puntos_transacciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  pedido_id INTEGER,
  tipo TEXT CHECK(tipo IN ('ganancia', 'canje', 'expiracion', 'bonus')),
  puntos REAL NOT NULL,
  descripcion TEXT,
  fecha TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (pedido_id) REFERENCES pedidos(id)
);

-- Vista de saldo actual por cliente
CREATE VIEW cliente_puntos_saldo AS
SELECT
  cliente_id,
  SUM(CASE WHEN tipo IN ('ganancia', 'bonus') THEN puntos ELSE -puntos END) as saldo
FROM puntos_transacciones
WHERE fecha > datetime('now', '-180 days')
GROUP BY cliente_id;
```

**Flujo:**

1. Cliente completa pedido
2. Sistema calcula puntos ganados
3. Se acreditan automáticamente (estado = 'entregado')
4. Cliente puede ver puntos en seguimiento
5. En próxima compra, opción de canjear

#### UI/UX

- **Widget en Web Pública:** "Tenés 150 puntos = $1.500 de descuento"
- **En TPV:** Checkbox "Usar puntos" con slider de cuántos
- **Dashboard Admin:** Top clientes por puntos activos

---

### 1.2 Niveles de Cliente (Tier System)

#### Concepto

Los clientes suben de nivel según su gasto acumulado en los últimos 12 meses.

#### Niveles Propuestos

| Nivel      | Gasto Anual         | Beneficios                                                     |
| ---------- | ------------------- | -------------------------------------------------------------- |
| 🥉 Bronce  | $0 - $50.000        | Puntos normales                                                |
| 🥈 Plata   | $50.001 - $150.000  | 1.5x puntos, envío gratis >$8.000                              |
| 🥇 Oro     | $150.001 - $300.000 | 2x puntos, envío siempre gratis, prioridad en hora pico        |
| 💎 Platino | >$300.000           | 3x puntos, envío gratis, atención prioritaria, regalo sorpresa |

#### Beneficios por Nivel

**Plata:**

- Multiplicador 1.5x en puntos
- Envío gratis en compras >$8.000
- Acceso a promos exclusivas

**Oro:**

- Multiplicador 2x en puntos
- Envío gratis sin mínimo
- Atención prioritaria en fila de pedidos
- Cumpleaños: pizza gratis

**Platino:**

- Multiplicador 3x en puntos
- Regalo sorpresa cada 3 meses
- Número VIP (atención inmediata)
- Preview de nuevos productos

#### Implementación

```sql
-- Actualizar tabla clientes
ALTER TABLE clientes ADD COLUMN nivel TEXT DEFAULT 'bronce';
ALTER TABLE clientes ADD COLUMN gasto_ultimos_12_meses REAL DEFAULT 0;
ALTER TABLE clientes ADD COLUMN fecha_ultima_evaluacion TEXT;

-- Función de recálculo (ejecutar mensualmente)
UPDATE clientes
SET nivel = CASE
  WHEN gasto_ultimos_12_meses > 300000 THEN 'platino'
  WHEN gasto_ultimos_12_meses > 150000 THEN 'oro'
  WHEN gasto_ultimos_12_meses > 50000 THEN 'plata'
  ELSE 'bronce'
END;
```

---

### 1.3 Sellos (Stamp Card Digital)

#### Concepto

Por cada compra, el cliente gana un sello. Al completar la tarjeta (ej: 10 sellos), gana un producto gratis.

#### Variantes

**Tarjeta de Pizzas:**

- 10 sellos = 1 pizza gratis
- Válido por 3 meses
- Solo pizzas de hasta $8.000

**Tarjeta de Empanadas:**

- 6 sellos = 1 docena gratis
- Válido por 2 meses

**Tarjeta Mixta:**

- 5 compras = Empanada gratis
- 10 compras = Pizza gratis
- 15 compras = Combo gratis

#### Implementación

```sql
CREATE TABLE tarjetas_sellos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  tipo TEXT CHECK(tipo IN ('pizzas', 'empanadas', 'mixta')),
  sellos_actuales INTEGER DEFAULT 0,
  sellos_necesarios INTEGER NOT NULL,
  recompensa TEXT NOT NULL,
  estado TEXT DEFAULT 'activa', -- activa, completada, canjeada, vencida
  creada_en TEXT DEFAULT CURRENT_TIMESTAMP,
  vence_en TEXT,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- Al entregar pedido
INSERT INTO sellos_historial (tarjeta_id, pedido_id, fecha)
VALUES (?, ?, CURRENT_TIMESTAMP);

UPDATE tarjetas_sellos
SET sellos_actuales = sellos_actuales + 1,
    estado = CASE WHEN sellos_actuales + 1 >= sellos_necesarios THEN 'completada' ELSE 'activa' END
WHERE id = ?;
```

#### Notificación al Completar

**WhatsApp:**

```
🎉 ¡Felicitaciones [Nombre]!

Completaste tu tarjeta de sellos 🍕

Canjeá tu PIZZA GRATIS en tu próximo pedido.
Válido hasta: 15/05/2026

¿Querés pedir ahora?
```

---

## 2. MARKETING AUTOMATION

### 2.1 Recuperación de Carritos Abandonados

#### Concepto

Si el cliente agrega productos al carrito en la web pero no completa el pedido, enviar recordatorios automáticos.

#### Flujo de Recuperación

| Tiempo | Acción           | Contenido                                                |
| ------ | ---------------- | -------------------------------------------------------- |
| 15 min | WhatsApp         | "¿Te quedó algo pendiente? Tenés una pizza esperando 🍕" |
| 24 hs  | WhatsApp + Email | "Tu carrito te extraña. 10% off si completás ahora"      |
| 72 hs  | WhatsApp         | "Última chance: tu carrito expira en 24 hs"              |

#### Implementación

```sql
-- Tabla de carritos abandonados
CREATE TABLE carritos_abandonados (
  id INTEGER PRIMARY KEY,
  cliente_telefono TEXT NOT NULL,
  items TEXT NOT NULL, -- JSON
  total REAL NOT NULL,
  estado TEXT DEFAULT 'pendiente', -- pendiente, recordatorio_1, recordatorio_2, recuperado, perdido
  creado_en TEXT DEFAULT CURRENT_TIMESTAMP,
  ultimo_recordatorio TEXT,
  recuperado_en TEXT
);

-- Worker que corre cada 15 minutos
SELECT * FROM carritos_abandonados
WHERE estado = 'pendiente'
AND datetime(creado_en) < datetime('now', '-15 minutes')
AND datetime(creado_en) > datetime('now', '-1 hour');
```

**Contenido del mensaje:**

```
👋 Hola [Nombre]

Vimos que dejaste esto en tu carrito:
🍕 1 Pizza Napolitana Especial
🥤 1 Coca 1.5L

Total: $8.500

¿Te lo enviamos?
👉 [Link de checkout con carrito pre-cargado]

⚡ Tenés 10% OFF si pedís en las próximas 2 horas
Código: VOLVI10
```

---

### 2.2 Re-activación de Clientes Inactivos

#### Concepto

Detectar clientes que no compran hace X tiempo y enviarles ofertas personalizadas.

#### Segmentación

| Segmento    | Inactividad         | Estrategia                                  |
| ----------- | ------------------- | ------------------------------------------- |
| Riesgo      | 30 días sin comprar | "Te extrañamos" + 15% off                   |
| Perdido     | 60 días sin comprar | "Volvemos a verte" + 20% off + envío gratis |
| Muy Perdido | 90 días sin comprar | "¿Todo bien?" + 30% off + regalo            |

#### Implementación

```sql
-- Clientes a reactivar
SELECT
  c.id,
  c.nombre,
  c.telefono,
  MAX(p.creado_en) as ultima_compra,
  COUNT(p.id) as total_pedidos_historicos,
  AVG(p.total) as ticket_promedio
FROM clientes c
LEFT JOIN pedidos p ON c.id = p.cliente_id
WHERE p.creado_en < datetime('now', '-30 days')
  OR p.creado_en IS NULL
GROUP BY c.id
HAVING ultima_compra < datetime('now', '-30 days');
```

**Mensaje personalizado:**

```
Hola [Nombre] 👋

Hace [X días] que no nos pedís nada 😢

Tu última compra fue: [Producto favorito]
¿Querés volver a disfrutarlo?

🎁 Te regalamos 20% OFF en tu próximo pedido
Código: VOLVI20

Válido por 7 días 👆
```

---

### 2.3 Marketing de Cumpleaños

#### Concepto

Enviar regalo automático en el cumpleaños del cliente.

#### Regalos por Nivel

| Nivel        | Regalo                         | Mensaje                        |
| ------------ | ------------------------------ | ------------------------------ |
| Todos        | Email/SMS de felicitación      | "¡Feliz cumple! 🎂"            |
| Bronce/Plata | 15% off                        | "Tu regalo de cumple"          |
| Oro          | Pizza gratis                   | "¡Pizza de regalo por tu día!" |
| Platino      | Combo gratis + delivery gratis | "¡Festejemos juntos!"          |

#### Implementación

```sql
ALTER TABLE clientes ADD COLUMN fecha_nacimiento TEXT;

-- Cron diario a las 9 AM
SELECT * FROM clientes
WHERE strftime('%m-%d', fecha_nacimiento) = strftime('%m-%d', 'now')
AND YEAR(ultimo_cumple_enviado) != YEAR('now');
```

---

### 2.4 Campañas Segmentadas

#### Ejemplos de Segmentación

**1. Amantes de la Pizza (compran 80% pizzas)**

- Oferta: "2x1 en pizzas los martes"
- Canal: WhatsApp

**2. Familias (ticket promedio >$15.000)**

- Oferta: "Combo familiar + gaseosa gratis"
- Canal: Email + WhatsApp

**3. Compradores de Noche (pedidos después 20hs)**

- Oferta: "Envío gratis después de las 22hs"
- Canal: Push (si hay app)

**4. Fieles (más de 10 pedidos)**

- Oferta: Acceso anticipado a nuevos productos
- Canal: WhatsApp VIP

#### Implementación

```javascript
// Servicio de segmentación
function segmentarClientes(criterio) {
  switch (criterio) {
    case 'amantes_pizza':
      return db.query(`
        SELECT cliente_id, 
               COUNT(*) as total_pedidos,
               SUM(CASE WHEN categoria = 'pizzas' THEN 1 ELSE 0 END) as pedidos_pizza
        FROM pedidos p
        JOIN pedido_items pi ON p.id = pi.pedido_id
        GROUP BY cliente_id
        HAVING (pedidos_pizza * 1.0 / total_pedidos) > 0.8
      `);

    case 'familias':
      return db.query(`
        SELECT cliente_id, AVG(total) as ticket_promedio
        FROM pedidos
        GROUP BY cliente_id
        HAVING ticket_promedio > 15000
      `);
  }
}
```

---

### 2.5 Sistema de Referidos

#### Concepto

"Trae un amigo y ambos ganan"

#### Mecánica

1. Cliente recibe código único de referido
2. Comparte con amigo
3. Amigo hace primer pedido con el código
4. Ambos reciben recompensa

#### Recompensas

| Rol       | Recompensa            | Condición                    |
| --------- | --------------------- | ---------------------------- |
| Referidor | $1.000 de crédito     | Amigo completa primer pedido |
| Referido  | 20% OFF primer pedido | Usa código de referido       |

#### Implementación

```sql
ALTER TABLE clientes ADD COLUMN codigo_referido TEXT UNIQUE;
ALTER TABLE clientes ADD COLUMN referido_por INTEGER;

CREATE TABLE referidos_tracking (
  id INTEGER PRIMARY KEY,
  referidor_id INTEGER NOT NULL,
  referido_id INTEGER NOT NULL,
  codigo_usado TEXT NOT NULL,
  estado TEXT DEFAULT 'pendiente', -- pendiente, completado, pagado
  recompensa_referidor REAL DEFAULT 1000,
  recompensa_referido REAL DEFAULT 0,
  fecha_conversion TEXT
);
```

**Flujo WhatsApp:**

```
🎁 ¡Ganá $1.000 por cada amigo que traigas!

Tu código: MS-[Número]

Compartí este link con tus amigos:
https://modosabor.com?ref=MS-1234

Cuando hagan su primer pedido, vos ganás $1.000 y ellos 20% OFF 🎉
```

---

## 3. INTEGRACIÓN CON RAPPI

### 3.1 Alcance de la Integración

#### Opciones de Integración

| Tipo                      | Complejidad | Costo | Tiempo      | Recomendación                   |
| ------------------------- | ----------- | ----- | ----------- | ------------------------------- |
| API Directa               | Alta        | $$$$  | 2-3 meses   | ❌ No recomendado para arrancar |
| Middleware Rappi          | Media       | $$$   | 1-2 meses   | ⚠️ Si hay volumen alto          |
| Tiendanube/Tienda virtual | Baja        | $$    | 2-4 semanas | ✅ Recomendado para empezar     |
| Manual (dashboard Rappi)  | Nula        | $     | Inmediato   | ✅ Empezar aquí                 |

#### Recomendación para Modo Sabor

**Fase 1 (Inmediata):** Uso manual del dashboard de Rappi mientras se consolida operación propia.

**Fase 2 (3-6 meses):** Integración vía Tiendanube o desarrollo de middleware.

**Fase 3 (1 año):** API directa si el volumen lo justifica.

---

### 3.2 Integración Manual (Dashboard Rappi)

#### Setup Inicial

1. **Alta en Rappi:**
   - Registro en partners.rappi.com
   - Documentación: CUIT, logo, datos bancarios
   - Aprobación: 5-10 días hábiles
   - Comisión: ~15-25% + IVA

2. **Configuración:**
   - Subir menú (fotos, descripciones, precios)
   - Configurar horarios de apertura
   - Definir zonas de cobertura
   - Configurar tiempo de preparación

3. **Operación Diaria:**
   - Recibir pedidos en tablet/celular Rappi
   - Confirmar o rechazar
   - Preparar y embalar
   - Esperar rider de Rappi

#### Limitaciones

- ❌ No integra con sistema propio de pedidos
- ❌ Stock no sincronizado
- ❌ Precios diferentes (Rappi más caro por comisión)
- ❌ Cliente no entra a base de datos propia
- ✅ Rápido de implementar
- ✅ Acceso a base de usuarios Rappi

---

### 3.3 Integración API Directa (Objetivo a Futuro)

#### Arquitectura Propuesta

```
Rappi Cloud ←→ Middleware Modo Sabor ←→ Sistema Modo Sabor
                    ↓
              Cola de Pedidos
                    ↓
            Socket.IO → TPV/Cocina
```

#### Flujo de Pedido Rappi

```
1. Cliente pide en App Rappi
2. Rappi envía webhook a nuestro middleware
3. Middleware valida y transforma payload
4. Crea pedido en nuestra DB
5. Emite evento a TPV/Cocina
6. TPV confirma recepción
7. Middleware notifica a Rappi: "Confirmado"
8. Cocina prepara
9. Rider Rappi retira
10. Entrega completada → Webhook a nuestro sistema
```

#### Endpoints Necesarios

```javascript
// server/routes/integraciones/rappi.js

// Rappi nos envía nuevo pedido
router.post('/webhook/nuevo-pedido', async (req, res) => {
  const pedidoRappi = req.body;

  // Transformar a nuestro formato
  const pedidoPropio = transformarPedidoRappi(pedidoRappi);

  // Crear en nuestra DB
  const creado = await crearPedido(pedidoPropio);

  // Emitir a cocina
  io.emit('nuevo_pedido_rappi', creado);

  res.json({ status: 'confirmed', id: creado.id });
});

// Rappi notifica cambio de estado (rider asignado, en camino, etc)
router.post('/webhook/estado', async (req, res) => {
  const { pedido_id, estado } = req.body;

  await actualizarEstadoPedido(pedido_id, mapearEstadoRappi(estado));

  res.json({ ok: true });
});
```

#### Mapeo de Estados

| Estado Rappi | Estado Modo Sabor | Acción                      |
| ------------ | ----------------- | --------------------------- |
| `created`    | `nuevo`           | Crear pedido, emitir alerta |
| `confirmed`  | `confirmado`      | -                           |
| `preparing`  | `preparando`      | -                           |
| `ready`      | `listo`           | Notificar rider             |
| `dispatched` | `en_camino`       | -                           |
| `delivered`  | `entregado`       | Cerrar pedido, fidelización |
| `cancelled`  | `cancelado`       | Restaurar stock             |

#### Transformación de Productos

```javascript
function transformarPedidoRappi(rappiPayload) {
  return {
    origen: 'rappi',
    rappi_order_id: rappiPayload.id,
    cliente_nombre: rappiPayload.customer.name,
    cliente_telefono: rappiPayload.customer.phone,
    cliente_direccion: formatearDireccionRappi(rappiPayload.delivery.address),
    items: rappiPayload.items.map((item) => ({
      producto_id: mapearProductoRappi(item.sku),
      nombre: item.name,
      cantidad: item.quantity,
      precio_unitario: item.unit_price,
      notas: item.comments,
    })),
    total: rappiPayload.total,
    tipo_entrega: 'delivery',
    metodo_pago: 'online', // Rappi ya cobró
    notas: rappiPayload.notes,
  };
}
```

---

### 3.4 Sincronización de Menú

#### Problema

Los precios en Rappi deben ser mayores (comisión 20-30%). Mantener dos menús es tedioso.

#### Solución: Multiplicador Automático

```sql
-- Tabla de configuración por canal
CREATE TABLE precios_por_canal (
  producto_id INTEGER NOT NULL,
  canal TEXT CHECK(canal IN ('local', 'web', 'rappi', 'pedidosya')),
  precio REAL NOT NULL,
  activo BOOLEAN DEFAULT 1,
  PRIMARY KEY (producto_id, canal)
);

-- Insertar precios Rappi con markup automático
INSERT INTO precios_por_canal (producto_id, canal, precio)
SELECT
  id,
  'rappi',
  ROUND(precio * 1.25, -1) -- 25% más, redondeado
FROM productos;
```

**Dashboard de sincronización:**

- Ver productos sin sincronizar
- Aplicar markup porcentual
- Publicar cambios a Rappi vía API

---

### 3.5 Métricas de Integración

#### KPIs a Monitorear

| Métrica                         | Objetivo   | Fuente          |
| ------------------------------- | ---------- | --------------- |
| Pedidos Rappi / Pedidos propios | < 40%      | Dashboard       |
| Tiempo de confirmación          | < 2 min    | Logs            |
| Cancelaciones                   | < 5%       | Dashboard Rappi |
| Rating en Rappi                 | > 4.5      | App Rappi       |
| Ticket promedio Rappi           | vs Propios | Comparativa     |

#### Alertas

- Si cancelaciones > 10% → Revisar operación
- Si tiempo confirmación > 5 min → Aumentar staff
- Si rating < 4.0 → Urgente revisión

---

## 4. ROADMAP DE IMPLEMENTACIÓN

### Fase 1: Fidelización Básica (Semanas 1-2)

**Entregables:**

- [ ] Sistema de puntos básico
- [ ] Acumulación automática al entregar
- [ ] Visualización en web y TPV
- [ ] Canje simple de puntos

**Costo:** Desarrollo interno, ~40 horas

---

### Fase 2: Marketing Automation (Semanas 3-4)

**Entregables:**

- [ ] Carritos abandonados (1 recordatorio)
- [ ] Re-activación 30 días
- [ ] Cumpleaños básico
- [ ] Dashboard de campañas

**Costo:** ~30 horas + posible servicio email (SendGrid/Mailgun)

---

### Fase 3: Programa Completo (Semanas 5-8)

**Entregables:**

- [ ] Niveles de cliente
- [ ] Sellos digitales
- [ ] Referidos
- [ ] Segmentación avanzada
- [ ] App de cliente (opcional)

**Costo:** ~80 horas

---

### Fase 4: Rappi Integración (Mes 2-3)

**Opción A - Manual:**

- [ ] Registro en Rappi
- [ ] Carga de menú
- [ ] Operación manual
- [ ] Métricas de seguimiento

**Costo:** $0 desarrollo, 15-25% comisión

**Opción B - API (futuro):**

- [ ] Desarrollo middleware
- [ ] Testing
- [ ] Go-live

**Costo:** ~120 horas desarrollo

---

## 5. ESTIMACIÓN DE IMPACTO

### ROI Esperado

| Iniciativa           | Inversión | Retorno Esperado           | Tiempo    |
| -------------------- | --------- | -------------------------- | --------- |
| Puntos/Niveles       | Baja      | +15% frecuencia            | 3 meses   |
| Carritos abandonados | Baja      | +8% conversion             | 1 mes     |
| Re-activación        | Baja      | +10% clientes recuperados  | 2 meses   |
| Rappi Manual         | Media     | +30% volumen               | Inmediato |
| Rappi API            | Alta      | +30% volumen, -5% comisión | 6 meses   |

### Métricas de Éxito

**Fidelización:**

- % de clientes que usan programa: > 40%
- Ticket promedio miembros vs no-miembros: +20%
- Frecuencia de compra: +25%

**Marketing Automation:**

- Tasa de apertura WhatsApp: > 70%
- Tasa de conversión carritos abandonados: > 15%
- Tasa recuperación inactivos: > 10%

**Rappi:**

- % de pedidos por canal: < 30%
- Ticket promedio: vs propios
- Costo de adquisición: vs marketing propio

---

## 6. NOTAS TÉCNICAS

### Dependencias Necesarias

```json
{
  "node-cron": "^3.0.2", // Workers automáticos
  "axios": "^1.6.0", // HTTP para APIs
  "twilio": "^4.19.0", // SMS/WhatsApp oficial
  "sendgrid": "^7.7.0", // Emails
  "bull": "^4.11.0" // Colas de jobs
}
```

### Workers a Implementar

```javascript
// workers/marketingScheduler.js
const cron = require('node-cron');

// Cada 15 minutos: carritos abandonados
cron.schedule('*/15 * * * *', () => {
  procesarCarritosAbandonados();
});

// Cada día 9 AM: cumpleaños
cron.schedule('0 9 * * *', () => {
  enviarFelicitacionesCumple();
});

// Cada domingo: re-activación
cron.schedule('0 10 * * 0', () => {
  procesarReactivacionClientes();
});

// Cada mes: evaluación de niveles
cron.schedule('0 2 1 * *', () => {
  recalcularNivelesClientes();
});
```

---

**Documento creado:** 2026-04-04  
**Revisión:** Mensual mientras se implementa  
**Responsable:** [Asignar Product Owner]

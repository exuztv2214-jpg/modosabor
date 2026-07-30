# Modo Sabor - Checklist de salida a produccion

## 1. Base tecnica

- [ ] Backend publicado con URL HTTPS fija
- [ ] Frontend publicado con URL HTTPS fija
- [ ] `JWT_SECRET` fuerte cargado en backend
- [ ] `INITIAL_ADMIN_EMAIL` y `INITIAL_ADMIN_PASSWORD` definidos para bootstrap seguro si arranca una base nueva
- [ ] `public_app_url` cargada en configuracion
- [ ] `public_api_url` cargada en configuracion
- [ ] `CORS_ORIGINS` configurado con la URL real del frontend
- [ ] Disco persistente configurado en Render o estrategia equivalente
- [ ] `DATA_DIR`, `UPLOADS_DIR` y `BACKUPS_DIR` apuntando al disco persistente
- [ ] Backup de la base SQLite definido
- [ ] Probar `GET /api/health`
- [ ] Definir en `Configuracion -> Modulos` cuales modulos quedan activos al salir a produccion
- [ ] Aplicar el preset operativo mas cercano a la realidad del local y luego ajustar modulos finos
- [ ] Si la operacion sera con comandas impresas, desactivar `KDS` antes de abrir

## 2. MercadoPago

- [ ] Cargar `mercadopago_token` real
- [ ] Confirmar diagnostico en configuracion
- [ ] Crear pedido real con MercadoPago
- [ ] Volver al sitio despues del pago
- [ ] Confirmar que el retorno publico consulta `GET /api/pedidos/:id/pago/mercadopago` sin 404
- [ ] Confirmar webhook en `mercadopago_eventos`
- [ ] Confirmar estado final del pedido: `approved`, `pending` o `rejected`
- [ ] Probar boton de sincronizacion manual de pagos

## 3. WhatsApp API

- [ ] Cargar `whatsapp_api_token`
- [ ] Cargar `whatsapp_phone_number_id`
- [ ] Cargar `whatsapp_webhook_verify_token`
- [ ] Cargar `whatsapp_test_destino`
- [ ] Configurar webhook en Meta hacia `/api/whatsapp/webhook`
- [ ] Enviar mensaje de prueba desde configuracion
- [ ] Si Meta devuelve `131030`, agregar el numero en `API Setup -> To`
- [ ] Confirmar recepcion de mensaje entrante
- [ ] Confirmar respuesta automatica del agente
- [ ] Confirmar derivacion a inbox humano

## 4. Menu y pedidos

- [ ] Revisar categorias y productos cargados
- [ ] Revisar precios y variantes del menu real
- [ ] Probar pedido web
- [ ] Probar pedido por TPV
- [ ] Probar pedido generado por WhatsApp
- [ ] Confirmar que todos entren en `Pedidos`

## 5. Delivery

- [ ] Configurar zonas reales de delivery
- [ ] Probar direccion valida con zona
- [ ] Probar direccion fuera de zona
- [ ] Confirmar costo de envio correcto
- [ ] Confirmar ETA correcto
- [ ] Probar seguimiento del pedido con link que incluya `tracking_token`
- [ ] Probar rider compartiendo ubicacion
- [ ] Validar autoasignacion cuando haya un solo rider disponible
- [ ] Validar que con mas de un rider disponible el pedido no se autoasigne por error
- [ ] Probar asignacion manual desde TPV
- [ ] Probar asignacion y despacho desde panel de delivery
- [ ] Probar entrega final con PIN
- [ ] Confirmar que al entregar se libere el rider y se invalide el token de tracking

## 6. Impresion

- [ ] Ajustar `impresion_margen_mm`
- [ ] Ajustar `impresion_escala_fuente`
- [ ] Usar prueba A6 desde configuracion
- [ ] Revisar la previsualizacion de ticket, comanda y hoja delivery antes de abrir
- [ ] Probar comanda desde TPV
- [ ] Probar ticket desde Pedidos
- [ ] Confirmar lectura correcta de variantes y notas

## 7. Operacion y seguridad

- [ ] Probar login con cada rol
- [ ] Confirmar permisos por modulo
- [ ] Cambiar contrasena desde `Mi cuenta`
- [ ] Probar cierre de caja
- [ ] Revisar auditoria de eventos
- [ ] Revisar reportes premium
- [ ] Revisar clientes inactivos y campana de recompra

## 8. Ensayo general

- [ ] Pedido web + pago + impresion + cocina o comanda impresa + entrega + seguimiento
- [ ] Pedido por WhatsApp + confirmacion + impresion + entrega
- [ ] Pedido delivery en TPV + asignacion de rider + ticket/comanda
- [ ] Pedido take away en TPV + ticket
- [ ] Confirmar que el sistema aguante todo el flujo sin errores

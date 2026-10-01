# Migración de Modo Sabor a otra cuenta de Railway

Este procedimiento prepara una migración conservadora. No copia secretos al
repositorio, no borra el proyecto actual y no crea un segundo entorno con los
mismos servicios de WhatsApp mientras el origen siga atendiendo.

## Preparar GitHub CLI para la cuenta nueva

Git ya tiene configurado Git Credential Manager. La cuenta de GitHub y el
remoto son decisiones separadas: cambiar la identidad de un commit no cambia
las credenciales de `push`.

El script seguro muestra las cuentas autenticadas y, por defecto, sólo simula:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\conectar-github.ps1
```

Cuando se conozcan el usuario y el repositorio nuevos, cambiar la cuenta y
agregar un remoto separado:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\conectar-github.ps1 `
  -GithubUser USUARIO_NUEVO -Repository modosabor -Apply
```

Esto conserva `origin` viejo y crea `nuevo-origin`. Sólo después de verificar
que la URL existe se hace el push explícito:

```powershell
git push --set-upstream nuevo-origin main
```

Para reemplazar `origin` hay que indicarlo de forma consciente con
`-ReplaceOrigin`; el script nunca fuerza pushes ni elimina remotos.

## Estado observado en la preparación

La auditoría se ejecuta desde el proyecto local con:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\railway-migration.ps1
```

El inventario se guarda fuera del control de versiones en
`deploy/railway-migration-output/` y sólo contiene nombres de variables,
identificadores de recursos y metadatos; nunca valores de secretos.

En la revisión del 1 de octubre de 2026 se observó:

- Proyecto Railway: `modo-sabor`, ambiente `production`.
- Servicios: `modosabor-api`, `n8n` y `Postgres`.
- Servicio principal: volumen `modosabor-api-volume`, 500 MB, aproximadamente
  482,3 MB usados (96,5 %), montado en
  `/opt/render/project/src/server/data`.
- Dominios configurados en el servicio principal: `modosabor.com.ar` y el
  dominio Railway `modosabor-api-production-0b46.up.railway.app`.
- La CLI informó que el servicio principal no tenía un deployment activo y las
  URLs públicas respondieron 404 durante esta preparación.

Esto es un bloqueo para el corte final, no una orden de borrar o redeployar.
Antes de transferir hay que confirmar en el panel cuál es el deployment que
debe quedar operativo y hacer una prueba real de inicio. El volumen también
debe ampliarse o limpiarse con un procedimiento de backup aprobado; no se debe
intentar empaquetarlo dentro del mismo volumen casi lleno.

Si el workspace realmente quedó fuera del trial, tratarlo como una ventana
urgente: Railway indica que los volúmenes de cuentas Trial/Free se eliminan 30
días después del vencimiento si no se actualiza el plan. Mientras el proyecto
siga visible, no crear un proyecto nuevo ni borrar el actual; primero reactivar
el workspace o transferirlo y luego verificar los volúmenes.

## Ruta recomendada: transferir el proyecto

Si la otra cuenta puede ser miembro de la misma organización/workspace, la
opción más segura es transferir el proyecto existente, en lugar de crear uno
nuevo y copiar SQLite a mano:

1. Invitar a la cuenta destino al proyecto con permisos de administrador.
2. Confirmar que ambas cuentas/workspaces tengan un plan Hobby o Pro activo.
3. En Railway abrir `Project settings` → `Transfer Project`.
4. Seleccionar el workspace destino y confirmar.
5. Si se transfiere a otro usuario, el destinatario debe aceptar el correo en
   un plazo de 24 horas.
6. No eliminar ni desconectar el proyecto origen hasta completar la lista de
   validación de abajo.

La transferencia conserva el proyecto como unidad de Railway. Aun así, hay
que revisar después los servicios, volúmenes, variables, dominios y permisos;
las credenciales de Meta, WhatsApp, Firebase, Gemini/NVIDIA y los DNS externos
no deben darse por validados sólo porque el proyecto cambió de cuenta.

## Ruta alternativa: proyecto nuevo

Usar esta ruta sólo si Railway no permite transferir el proyecto existente.

### 1. Congelar la fuente

- Anunciar una ventana de mantenimiento.
- Pausar atención automática de WhatsApp y cargas desde TPV.
- Detener el servicio de origen para que SQLite y `uploads` queden en un punto
  consistente.
- Crear y descargar un backup SQLite desde el panel de configuración o desde
  `GET /api/configuracion/backup/export` con una cuenta administradora.
- Guardar el archivo y su hash SHA-256 fuera del repositorio.
- Descargar también el contenido de `uploads/` y conservar la estructura de
  nombres. Las fotos de productos, opciones, categorías, comprobantes y el APK
  de Rider viven allí.

La exportación de datos debe hacerse con un destino local seguro. No colocar
el `.sqlite`, el backup de Railway ni los uploads bajo `deploy/` para evitar
versionarlos por accidente.

### 2. Crear el destino

En la cuenta nueva:

1. Crear un proyecto con el repositorio `kisu33/modosabor` y el ambiente
   `production`.
2. Crear el servicio `modosabor-api` desde el `Dockerfile` de la raíz.
3. Crear un volumen de al menos 1 GB y montarlo en una ruta única.
4. Mantener coherentes `DATA_DIR`, `DB_FILE`, `UPLOADS_DIR` y `BACKUPS_DIR`: las
   cuatro rutas tienen que estar dentro del mismo volumen.
5. Crear `n8n` y `Postgres` sólo si se va a migrar también esa parte de la
   instalación; el backend de Modo Sabor usa SQLite como fuente operativa.
6. Cargar las variables desde una copia segura de la configuración, nunca
   desde un archivo versionado.

La plantilla segura puede generarse así:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\railway-migration.ps1 -Action env-template
```

Variables que deben revisarse especialmente:

- `JWT_SECRET`: conservar el valor actual si se quiere invalidar sesiones sólo
  cuando corresponda; cambiarlo cierra todas las sesiones existentes.
- `INITIAL_ADMIN_*`: sólo se usan en el bootstrap inicial; no reemplazar la
  base restaurada por un bootstrap accidental.
- `PUBLIC_APP_URL`, `PUBLIC_API_URL`, `CORS_ORIGINS`: actualizar al dominio
  final y comprobar que no queden URLs de prueba.
- `DATA_DIR`, `DB_FILE`, `UPLOADS_DIR`, `BACKUPS_DIR`: deben apuntar al volumen
  nuevo.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: volver a cargarlo como variable protegida;
  nunca guardar el JSON en Git.
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_REDIRECT_URI` y
  `FACEBOOK_PANEL_URL`: actualizar la URI de callback de Meta si cambia el
  dominio.
- `WHATSAPP_AGENT_WEBHOOK_URL`,
  `WHATSAPP_AGENT_FALLBACK_WEBHOOK_URL`, `AGENT_API_KEY` y las variables de
  n8n: deben apuntar al n8n destino.
- `GEMINI_API_KEY`, `NVIDIA_API_KEY` y cualquier clave configurada dentro de la
  tabla `configuracion`: comprobarlas en el panel después de restaurar.

### 3. Publicar y restaurar

1. Desplegar el código sin activar aún WhatsApp.
2. Restaurar el `.sqlite` mediante el endpoint de bootstrap/importación o desde
   el panel, dejando que el sistema cree antes un backup de seguridad.
3. Subir `uploads/` conservando nombres y subcarpetas; comprobar que las URLs
   `/uploads/...` respondan 200.
4. Reiniciar el servicio para ejecutar todas las migraciones de esquema.
5. Verificar que el commit publicado coincida con el commit local preparado.

No usar el paquete de datos base para una migración completa: ese paquete es
útil para catálogo/configuración no sensible, pero no reemplaza el backup
SQLite completo de pedidos, clientes, caja, turnos, auditoría y sesiones.

## WhatsApp y servicios externos

Debe existir una sola instancia autorizada atendiendo el número durante el
corte. Si `whatsapp-sesion` está presente en el volumen, no arrancar origen y
destino simultáneamente con la misma sesión. Si no está presente, vincular el
QR desde el destino y probar texto, audio, carga de pedido, cliente nuevo y
derivación a humano.

Después del corte comprobar por separado:

- n8n: URL pública, credenciales de WhatsApp Cloud API y workflow activo.
- Meta/Facebook: callback OAuth, página y permisos.
- Firebase: credencial del servicio y token FCM de un Rider real.
- Gemini/NVIDIA: proveedor elegido, modelo y límites.
- DNS de `modosabor.com.ar`: certificado, CNAME y propagación.
- Rider: manifiesto y APK descargables desde `/rider-app`.

## Validación antes de retirar el origen

- `GET /` devuelve la aplicación y no 404.
- Login de administrador y renovación de sesión.
- Catálogo, opciones con imágenes y precios actuales.
- TPV: cobrar una venta de prueba controlada, imprimir comanda y ticket una
  sola vez, y comprobar que el pedido aparece en tiempo real.
- Pedidos: editar un pedido existente y confirmar que no abre impresión desde
  ese módulo.
- Turnos/caja: turno mañana y noche, cierre automático y reporte detallado.
- Rider/Mozo: login, pedido nuevo, actualización Socket.IO y comportamiento sin
  red.
- WhatsApp: mensaje, audio, cliente nuevo, pedido confirmado y transferencia
  humana; sin enviar una campaña real durante la prueba.
- Backups: crear un backup, descargarlo, calcular hash y ensayar restauración
  en un entorno aislado.
- Volumen: espacio libre mayor al 20 % y backup reciente visible.

Sólo después de aprobar esta lista se cambia el DNS definitivo, se reanuda
WhatsApp y se mantiene el proyecto anterior como rollback durante la ventana
acordada. No borrar el proyecto ni el volumen antiguo inmediatamente.

## Rollback

Si falla una prueba crítica, pausar el destino, volver a habilitar el servicio
origen, apuntar el DNS al dominio anterior y reanudar una única sesión de
WhatsApp. Conservar logs, hash del backup y el inventario generado para poder
repetir la migración sin improvisar.

## Referencias oficiales de Railway

- [Transferir proyectos entre workspaces o usuarios](https://docs.railway.com/projects)
- [Descargar y subir archivos de un volumen con la CLI](https://docs.railway.com/volumes)
- [Backups y restauración de volúmenes](https://docs.railway.com/volumes/backups)

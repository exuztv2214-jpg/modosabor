# Deploy en Railway

Este proyecto queda preparado para Railway como **un solo servicio**:

- backend Express + Socket.IO
- frontend Vite compilado y servido por el backend
- SQLite, uploads y backups en un volumen persistente

## 1. Crear el proyecto

1. Subir este repo a GitHub.
2. En Railway: `New Project` -> `Deploy from GitHub repo`.
3. Elegir este repositorio.

## 2. Forzar Dockerfile

Este repo incluye `Dockerfile` en la raíz. Railway debería detectarlo automáticamente.

## 3. Crear volumen

Agregar un `Volume` al servicio y montarlo en:

```txt
/data
```

## 4. Variables de entorno mínimas

Configurar estas variables en Railway:

```txt
NODE_ENV=production
PORT=3001
TRUST_PROXY=1
JWT_SECRET=una-clave-larga-y-segura
INITIAL_ADMIN_NAME=Administrador
INITIAL_ADMIN_EMAIL=admin@tudominio.com
INITIAL_ADMIN_PASSWORD=una-clave-segura
DATA_DIR=/data
UPLOADS_DIR=/data/uploads
BACKUPS_DIR=/data/backups
DB_FILE=/data/modosabor.db
PUBLIC_APP_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
PUBLIC_API_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
CORS_ORIGINS=https://${{RAILWAY_PUBLIC_DOMAIN}}
```

Si después conectás dominio propio:

```txt
PUBLIC_APP_URL=https://tu-dominio.com
PUBLIC_API_URL=https://tu-dominio.com
CORS_ORIGINS=https://tu-dominio.com,https://www.tu-dominio.com
```

## 5. Dominio público

En Railway:

1. Abrir el servicio
2. `Settings` -> `Networking`
3. `Generate Domain`

Con eso Railway te da una URL tipo:

```txt
https://tu-servicio.up.railway.app
```

## 6. Qué expone el servicio

- app web
- panel admin
- rutas `/api`
- Socket.IO en la misma URL
- uploads en `/uploads`

## 7. Importante

- Sin volumen, SQLite y uploads no quedan persistentes.
- El frontend no necesita `VITE_API_URL` en este modo porque usa la misma URL del backend.
- Si más adelante querés separar frontend y backend, también se puede, pero para este sistema conviene mantenerlo junto.

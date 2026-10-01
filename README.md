# Modo Sabor

Sistema integral de gestión para restaurantes, rotiserías y negocios de comida. Incluye punto de venta (TPV), cocina/KDS, delivery, caja, personal, inventario, fidelización, marketing digital y una web pública para pedidos online.

---

## 🚀 Tecnologías

### Frontend

- **React 18** con Vite
- **Tailwind CSS 3.4**
- **React Router 6**
- **Recharts** para gráficos
- **Socket.IO Client** para tiempo real
- **Lucide React** para iconos

### Backend

- **Node.js** con Express 4
- **SQLite** mediante `better-sqlite3`
- **Socket.IO** para notificaciones en vivo
- **JWT** para autenticación
- **MercadoPago** para pagos online

---

## 📁 Estructura del proyecto

```
modosabor/
├── client/                 # Aplicación React (PWA admin + web pública)
│   ├── src/
│   │   ├── components/     # Componentes reutilizables
│   │   ├── pages/          # Pantallas principales
│   │   ├── context/        # Contextos de React (auth, config)
│   │   ├── lib/            # Utilidades y helpers
│   │   └── hooks/          # Custom hooks
│   ├── public/             # Assets estáticos y manifests PWA
│   └── dist/               # Build de producción
├── server/                 # API REST y base de datos
│   ├── routes/             # Endpoints de la API
│   ├── services/           # Lógica de negocio
│   ├── utils/              # Utilidades
│   ├── middleware/         # Middlewares de Express
│   ├── scripts/            # Scripts de verificación y seed
│   └── data/               # Base de datos SQLite y uploads
├── deploy/                 # Scripts y configuraciones de deploy
├── docs/                   # Documentación operativa
├── Dockerfile              # Build containerizado
├── railway.json            # Configuración para Railway
├── render.yaml             # Configuración para Render
└── package.json            # Scripts principales
```

---

## ⚙️ Instalación local

### Requisitos

- Node.js 20 o superior
- npm o pnpm

### Pasos

```bash
# Clonar o descargar el proyecto
cd modosabor

# Instalar dependencias de todos los paquetes
npm run setup

# Copiar y configurar variables de entorno
cp server/.env.example server/.env
# Editar server/.env con tus datos

# Iniciar backend y frontend en paralelo
npm run dev
```

El frontend estará en `http://localhost:5173` y el backend en `http://localhost:3001`.

---

## 🔧 Variables de entorno

Copiar `server/.env.example` a `server/.env` y completar:

| Variable                 | Descripción                          | Ejemplo                       |
| ------------------------ | ------------------------------------ | ----------------------------- |
| `PORT`                   | Puerto del servidor                  | `3001`                        |
| `NODE_ENV`               | Entorno                              | `development` / `production`  |
| `TRUST_PROXY`            | Proxies confiables delante de la API | `1`                           |
| `JWT_SECRET`             | Clave secreta para JWT               | `una-clave-larga-y-aleatoria` |
| `INITIAL_ADMIN_EMAIL`    | Email del admin inicial              | `admin@tudominio.com`         |
| `INITIAL_ADMIN_PASSWORD` | Contraseña del admin inicial         | `una-clave-segura`            |
| `CORS_ORIGINS`           | Orígenes permitidos                  | `http://localhost:5173`       |
| `PUBLIC_APP_URL`         | URL pública de la app                | `https://tudominio.com`       |
| `PUBLIC_API_URL`         | URL pública de la API                | `https://tudominio.com`       |
| `DATA_DIR`               | Directorio de datos persistentes     | `/data`                       |
| `UPLOADS_DIR`            | Directorio de uploads                | `/data/uploads`               |
| `BACKUPS_DIR`            | Directorio de backups                | `/data/backups`               |
| `DB_FILE`                | Ruta de la base SQLite               | `/data/modosabor.db`          |

> **Importante:** en producción siempre usar `JWT_SECRET` largo y único. El sistema se niega a iniciar si usa el valor por defecto en producción.

---

## 🧪 Comandos útiles

```bash
# Desarrollo (frontend + backend)
npm run dev

# Solo backend
npm run server

# Solo frontend
npm run client

# Build del frontend
npm run build

# Verificaciones
npm run smoke
npm run verify:core
npm run verify:operacion

# Lint y formato
npm run lint
npm run format

# Deploy Railway
git push origin main
```

---

## 🏗️ Arquitectura

### Aplicaciones

- **Modo Sabor — Sistema:** PWA principal para administrar el negocio. Se instala en la PC del local.
- **Modo Sabor — Repartidores:** PWA dedicada para el celular de los delivery.
- **Web pública:** Catálogo online donde los clientes pueden hacer pedidos.

### Flujo de datos

1. El frontend se comunica con el backend vía REST API (`/api/*`).
2. Socket.IO mantiene actualizaciones en tiempo real (nuevos pedidos, cambios de estado, ubicación de riders).
3. SQLite almacena productos, pedidos, clientes, caja, personal, inventario y configuración.
4. Los archivos estáticos (imágenes) se sirven desde `/uploads`.

---

## 🛡️ Seguridad

- Autenticación JWT con expiración de 7 días.
- Contraseñas hasheadas con bcrypt.
- Rate limiting en login y endpoints públicos críticos.
- CORS configurado por lista de orígenes permitidos.
- Validación de subidas de archivos por extensión y tamaño.

---

## 🚀 Deploy

### Railway

El repositorio incluye `railway.json` y `Dockerfile`. Conectar el repo a Railway y configurar las variables de entorno.

### Render

Usar `render.yaml` como blueprint. Crea el servicio web `modosabor-api` y el sitio estático `modosabor-app`.

## 📚 Documentación adicional

- `docs/RAILWAY-DEPLOY.md` — Deploy en Railway.
- `docs/RAILWAY-MIGRACION-CUENTA.md` — Preparación, transferencia y rollback de Railway.
- `docs/BITACORA-TURNOS-Y-PERSONAL-2026-06-23.md` — Cambios en módulo de personal.

---

## 🧑‍💻 Desarrollo

- Seguir el estilo definido por ESLint y Prettier.
- Antes de commitear correr `npm run lint` y `npm run format`.
- Cada cambio grande debe pasar `npm run build`, `npm run verify:core` y `npm run verify:operacion`.

---

## 📄 Licencia

Proyecto privado. Todos los derechos reservados.

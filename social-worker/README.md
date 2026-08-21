# Modo Sabor Social Worker

Worker de escritorio para automatizar publicaciones en Facebook desde Modo Sabor Social.

## Requisitos

- **Node.js** 18 o superior
- **Google Chrome** instalado
- **Playwright**: `npx playwright install chromium`

## Instalación

```bash
cd social-worker
npm install
```

## Uso

### Modo consola (legacy)

```bash
npm run worker
```

### Modo escritorio (Electron)

```bash
npm start
```

## Configuración

La primera vez que abrís la app de escritorio, completá:

1. **URL del servidor**: `http://localhost:3001/api/social-worker` (o la IP del servidor)
2. **API Key**: La clave configurada en `SOCIAL_WORKER_KEY` del servidor
3. **Chrome CDP**: Dejá el default `http://127.0.0.1:9222`

### Paso 1: Abrir Chrome con depuración remota

Antes de iniciar el worker, abrí Chrome con el siguiente comando en **CMD** (como Administrador):

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir="C:\ChromeSocial" ^
  --no-first-run ^
  --no-default-browser-check
```

> **Importante**: El `--user-data-dir` debe ser una carpeta separada de tu Chrome habitual para no interferir.

### Paso 2: Iniciar sesión en Facebook

En la ventana de Chrome que se abrió, andá a `facebook.com` e iniciá sesión con la cuenta del local.

### Paso 3: Iniciar el Worker

Hacé clic en **"Iniciar Worker"** en la app de escritorio.

## Empaquetar para distribución

```bash
npm run dist
```

Esto genera un instalador `.exe` en `dist/`.

## Troubleshooting

| Problema                               | Solución                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| "Chrome no tiene un perfil disponible" | Verificá que Chrome esté abierto con `--remote-debugging-port=9222`        |
| "La sesión de Facebook venció"         | Iniciá sesión manualmente en Chrome y volvé a iniciar el worker            |
| "Worker no autorizado"                 | Verificá que la API Key coincida con la del servidor (`SOCIAL_WORKER_KEY`) |
| El worker no publica                   | Activá "Capturar screenshots de errores" para ver qué ve el browser        |

## Arquitectura

```
┌─────────────────┐     claim/heartbeat      ┌──────────────────┐
│  Worker Electron│  ◄────────────────────►  │  Servidor Node   │
│  (Playwright)   │                        │  /api/social-worker│
└─────────────────┘                        └──────────────────┘
         │
         └──► Chrome CDP (http://127.0.0.1:9222)
                    │
                    └──► Facebook.com
```

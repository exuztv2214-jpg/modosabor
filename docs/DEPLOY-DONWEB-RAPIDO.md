# Deploy DonWeb rápido

## Variables recomendadas en PowerShell

```powershell
$env:MODOSABOR_VPS_HOST="149.50.133.118"
$env:MODOSABOR_VPS_PORT="5942"
$env:MODOSABOR_VPS_USER="root"
$env:MODOSABOR_VPS_PATH="/opt/modosabor"
$env:MODOSABOR_PUBLIC_URL="https://modosabor.com.ar"
```

## Flujo corto

1. Verificar local:

```powershell
npm run build
npm run verify:core
npm run verify:operacion
```

2. Empaquetar:

```powershell
npm run package:donweb
```

3. Desplegar:

```powershell
npm run deploy:donweb
```

4. Validar producción:

```powershell
npm run deploy:donweb:check
```

## Qué hace cada script

- `package:donweb`: arma el paquete sin `node_modules`, bases locales, launcher ni temporales.
- `deploy:donweb`: primero valida el build local, sube el paquete al VPS, guarda datos persistentes, reinstala dependencias, rebuild del cliente, reinicia PM2 y recarga nginx. El script remoto se sube como `/root/modosabor-deploy.sh` para evitar errores de quoting por SSH.
- `deploy:donweb:check`: consulta `/api/health` del dominio público.

## Nota de seguridad

El deploy no reemplaza `server/.env`, `server/data` ni `server/uploads` del VPS: los preserva antes de limpiar `/opt/modosabor` y los restaura después de extraer el paquete nuevo.

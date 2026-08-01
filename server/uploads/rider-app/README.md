# Distribución del APK Rider

Esta carpeta hospeda los APK release de la Rider App y el `manifest.json`
que la app rider consulta al abrir para detectar si hay una versión nueva
disponible.

## Publicar una versión nueva

1. **Buildear el APK release** desde el repo:

   ```powershell
   cd D:\Proyectos\modosabor1
   npm --prefix client run android:release-apk
   ```

2. **Copiar el APK a esta carpeta** con un nombre versionado (no usar
   `latest.apk` para no romper caches en clientes viejos):

   ```powershell
   copy client\android\app\build\outputs\apk\release\app-release.apk `
        server\uploads\rider-app\modosabor-rider-1.2.0.apk
   ```

3. **Editar `manifest.json`** con los datos de la nueva versión:

   ```json
   {
     "versionCode": 10200,
     "versionName": "1.2.0",
     "apkFile": "modosabor-rider-1.2.0.apk",
     "changelog": "• Foto de entrega obligatoria\n• Nuevo splash screen\n• Cola offline mejorada",
     "forceUpdate": false,
     "minVersionCode": 10000,
     "releasedAt": "2026-08-01T14:00:00Z"
   }
   ```

   - `versionCode`: `MAJOR*10000 + MINOR*100 + PATCH` (mismo formato que Gradle).
   - `apkFile`: nombre del archivo `.apk` en ESTA carpeta.
   - `changelog`: markdown-ish con los cambios (líneas cortas, se muestran en el modal).
   - `forceUpdate`: `true` bloquea la app hasta que el rider actualice
     (usar solo si hay cambios de backend incompatibles).
   - `minVersionCode`: versión mínima aceptada. Si el rider tiene menos,
     se le fuerza update aunque `forceUpdate` sea false.

4. **Deploy a Railway** (`git add`, `commit`, `push origin main`). Railway
   redeploya solo. Los riders al abrir la app reciben el aviso.

## Cómo lo consume la app rider

- `GET /api/rider-app/version` → devuelve la info del manifest.
- La app compara `versionCode` recibido contra el suyo (`@capacitor/app`
  → `App.getInfo()`) y muestra el modal si es menor.
- Al aceptar, abre `downloadUrl` con `target=_system` en Android: el
  sistema descarga y ofrece instalar.

## Notas

- Los APK pueden ser grandes (~7-15 MB cada uno). No se borran automático,
  hay que limpiar a mano de vez en cuando (dejar los últimos 2-3 por si
  hay que rollback).
- No commitear los `.apk` al repo (ya está en `.gitignore` la carpeta
  `uploads/`, se mantiene solo por el volume persistido de Railway).
- Si en Railway se pierde el volume (cambio de plan, migración), hay que
  volver a subir el APK y el manifest a mano.

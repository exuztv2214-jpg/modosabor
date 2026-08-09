# Publicar Modo Sabor Rider

La app Rider se distribuye como APK Android versionado. Nunca se debe publicar
un APK `debug`: el build de release queda bloqueado si faltan sus credenciales
de firma.

## Requisitos de la máquina de release

- JDK 21 o el JBR de Android Studio.
- Android SDK instalado.
- El keystore de producción, guardado fuera del repositorio.
- Variables de entorno de la sesión de build:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:MODOSABOR_KEYSTORE_PATH = 'C:\ruta-segura\modosabor-rider.jks'
$env:MODOSABOR_KEYSTORE_PASSWORD = '<secreto>'
$env:MODOSABOR_KEY_ALIAS = '<alias>'
$env:MODOSABOR_KEY_PASSWORD = '<secreto>'
```

No subir el keystore ni las contraseñas. El repositorio los ignora por diseño.

## Generar y verificar

Desde la raíz del proyecto:

```powershell
npm --prefix client run build:native
Push-Location client\android
.\gradlew.bat assembleRelease --console=plain
Pop-Location
```

El APK queda en `client/android/app/build/outputs/apk/release/app-release.apk`.
Instalarlo primero en un teléfono de prueba y validar: login, asignación de
pedido, modo sin conexión y su reenvío, GPS en segundo plano, cámara, cierre
de sesión y actualización desde el panel.

## Publicar la actualización

1. Subir el APK firmado al almacenamiento configurado para Rider.
2. Actualizar el manifest servido por `GET /api/rider-app/version` con
   `versionCode` 10301, `versionName` `1.3.1`, URL HTTPS y tamaño reales.
3. Probar el aviso de actualización desde una Rider anterior antes de marcarla
   como obligatoria.
4. Conservar el APK anterior hasta que la versión nueva esté validada.

## Notificaciones push

La Rider está registrada en Firebase como `modosabor-rider`, con el paquete
`com.modosabor.rider`. Su `google-services.json` queda sólo en la máquina de
build porque Android lo ignora deliberadamente; se puede recuperar con:

```powershell
firebase apps:sdkconfig ANDROID 1:474654393154:android:93105c1d570d2f2f1b7edb --project modosabor-rider
```

Para habilitar el envío desde Railway, crear una cuenta de servicio del mismo
proyecto y cargar su JSON completo en la variable protegida
`FIREBASE_SERVICE_ACCOUNT_JSON`. Ese archivo no se versiona. Con la variable
cargada, cada asignación de pedido envía una notificación FCM de prioridad alta
al dispositivo del rider; los tokens vencidos se invalidan automáticamente.

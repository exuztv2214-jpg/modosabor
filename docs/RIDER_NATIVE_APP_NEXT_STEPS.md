# Rider Nativo Android · Próximos pasos operativos

Guía para completar los ítems que la app rider necesita para pasar de
"usable" a "profesional en producción". Todo el código base ya está
subido; lo que sigue es infra externa o gestos manuales del operador.

## 1. Firma release del APK (`android:release-apk`)

El build gradle ya está configurado para leer 4 variables de entorno
y firmar el APK release. Sin ellas, cae automáticamente a firma debug
para que el build no rompa en desarrollo, pero **no es apto para
distribución** al equipo de riders.

### Generar keystore (una sola vez)

```powershell
cd D:\Proyectos\modosabor1\client\android
keytool -genkey -v -keystore modosabor-rider.jks -keyalg RSA -keysize 2048 -validity 10000 -alias rider-key
```

- Poné una contraseña fuerte al keystore (`ksPass`) — anotala.
- La misma contraseña o distinta al alias key (`ksAliasPass`).
- **Guardá el `.jks` con backup**: si lo perdés, no podés subir updates que
  se instalen encima. Google Play no acepta cambio de firma.

### Setear variables antes del build

En PowerShell (o agregá al perfil del usuario):

```powershell
$env:MODOSABOR_KEYSTORE_PATH = "D:\Proyectos\modosabor1\client\android\modosabor-rider.jks"
$env:MODOSABOR_KEYSTORE_PASSWORD = "MI_CONTRASEÑA"
$env:MODOSABOR_KEY_ALIAS = "rider-key"
$env:MODOSABOR_KEY_PASSWORD = "MI_CONTRASEÑA"
```

### Build

```powershell
cd D:\Proyectos\modosabor1
npm --prefix client run android:release-apk
```

Sale en `client/android/app/build/outputs/apk/release/app-release.apk`.
Ese APK se instala encima del debug o del release anterior sin
desinstalar (mismo `applicationId` + firma consistente + versionCode
incremental).

## 2. Versionado automático (`versionCode`)

Ya no hay que tocar más `build.gradle`. Simplemente subís el número de
versión en `client/package.json`:

```json
{
  "version": "1.2.0"
}
```

El build calcula automáticamente:

- `versionName = "1.2.0"` (lo que ve el usuario en Ajustes → Apps).
- `versionCode = 10200` (para Android).

Regla: `MAJOR*10000 + MINOR*100 + PATCH`. Siempre creciente si sigás
semver, sin colisiones.

## 3. Firebase Cloud Messaging (push remoto)

El único hueco crítico que queda para que el rider reciba avisos con la
app 100% cerrada.

### Pasos

1. **Crear proyecto Firebase gratis**: <https://console.firebase.google.com>.
2. **Agregar app Android** con package `com.modosabor.rider`.
3. **Descargar `google-services.json`** y ponerlo en
   `client/android/app/google-services.json`. El build.gradle ya tiene
   un `try/catch` que lo detecta y activa el plugin automáticamente.
4. **Instalar el plugin Capacitor**:
   ```powershell
   npm --prefix client i @capacitor/push-notifications
   npx --prefix client cap sync android
   ```
5. **Integrar en `nativeRiderGps.js`** un método `registerPushToken()`
   que llame a `PushNotifications.register()` y mande el token al
   backend (`POST /api/repartidores/:id/fcm-token`).
6. **Backend**: guardar el token por rider, agregar un módulo que use
   la Firebase Admin SDK para enviar push cuando se asigna un pedido.
7. **Probar** desde la consola de Firebase con "Cloud Messaging → New
   Notification → Target device token".

Sin FCM la app sigue funcionando: recibe pedidos cuando está abierta o
en background reciente. Solo falla si Android la mata por RAM/ahorro.

## 4. Sonido custom fuerte

Sirve para que el rider distinga el "nuevo pedido" de cualquier
WhatsApp.

### Pasos

1. Grabar o buscar un `.mp3` corto (2-4 segundos) tipo "ding-dong de
   restaurante" fuerte.
2. Guardarlo como `client/android/app/src/main/res/raw/rider_alert.mp3`.
   El nombre debe ser todo minúsculas y sin guiones (usar underscore).
3. Editar `client/src/lib/nativeRiderGps.js`, en `prepareRiderNotifications`,
   cambiar el `sound: 'default'` del canal por `sound: 'rider_alert'`.
4. Rebuild APK.

Android usa el sonido del canal al mostrar la LocalNotification, así
que sonará distinto que un WhatsApp normal.

## 5. Cámara y foto de entrega

Ya está integrada. Para activar la foto obligatoria al marcar
entregado, ir a **Admin → Configuración → Delivery** y prender el flag
`delivery_requiere_foto_entrega = 1` (agregar el setting si no existe
en la UI). Si está en 1, el rider tiene que sacar foto antes de cerrar
el pedido; la foto viaja como `entrega_foto` (dataURL base64) en el
POST de entrega y ya se guarda en la DB.

Backend: el campo `entrega_foto` ya existe en `pedidos` (viene de
migración vieja) y el handler `POST /repartidores/:id/rider/:code/entregar/:pedidoId`
lo persiste si viene en el body.

## 6. Cola offline

Ya está activa. Ver el badge "N pend." en el footer cuando hay
acciones esperando reconexión. Se procesa cada 15 s cuando hay red +
al disparar el evento `online` del navegador.

Acciones que se encolan automático hoy:

- **Marcar entregado** (`kind: 'mark_delivered'`) cuando `navigator.onLine === false`.

Faltan encolar (para futuras iteraciones):

- Envío de ubicación GPS (hoy se descarta silent si falla).
- Cambio de estado de pedido (comenzar reparto, listo, etc.).
- Reporte de incidencia.

Para agregarlas: envolver el `api.post/put` en un `try/catch` que llame
a `enqueueRiderAction({ kind, url, method, body })` si `!navigator.onLine`.

## 7. Distribución al equipo

Opciones para pasarle el APK a los riders:

1. **Firebase App Distribution** (gratis, ideal). Subís el APK, agregás
   emails de los riders como testers, les llega notificación de update.
2. **Google Play Console** ($25 USD por vida). Para producción real,
   permite updates automáticos, control de versiones, canales beta.
3. **Manual por WhatsApp**: mandás el `.apk` directo. Los riders tienen
   que activar "instalar apps de fuentes desconocidas" y desinstalar la
   anterior si cambió la firma.

Recomendado: **Firebase App Distribution** hasta que el equipo tenga
más de 5 riders o quieran subir a Play Store.

## 8. Splash screen nativo (logo animado al abrir)

El plugin `@capacitor/splash-screen` ya está configurado en
`client/capacitor.config.json` y se oculta automático desde el
bootstrap del `RiderPanel` (con fade de 400 ms). Falta solo generar
las imágenes con la marca.

### Assets a crear

Necesitás dos imágenes en `client/resources/`:

- `splash.png` → **2732×2732 px**, PNG con fondo rojo `#dc1f2d`, logo
  Modo Sabor centrado (idealmente 40 % del alto para que quepa en
  todas las densidades).
- `icon.png` → **1024×1024 px**, PNG del ícono de la app (sin fondo o
  con fondo cuadrado; el launcher lo recorta).

### Generar todas las densidades de Android

```powershell
npm --prefix client i -D @capacitor/assets
cd client
npx @capacitor/assets generate --android
```

Esto crea automáticamente los archivos en
`android/app/src/main/res/drawable-*` y en `mipmap-*`. Después
correr `npx cap sync android` y rebuild.

### Cambiar la duración del splash

Se controla desde `client/capacitor.config.json`:

```json
"SplashScreen": {
  "launchShowDuration": 2500,
  "launchAutoHide": false
}
```

- `launchShowDuration`: máximo antes de que el sistema fuerce el hide
  (2500 ms está bien; si el bootstrap tarda más, igual se oculta con
  el `SplashScreen.hide()` que dispara la app cuando termina de cargar).
- `launchAutoHide: false` deja que la app controle el hide (mejor UX,
  no hay flash blanco entre splash y login).

## 9. Métricas de crash remoto

Para saber si la app crashea en un celular específico sin que el rider
avise:

1. **Sentry** (gratis 5k eventos/mes): `npm i @sentry/capacitor`.
2. **Firebase Crashlytics**: viene con Firebase, tiene reportes lindos.

Elegir uno y agregarlo en `client/src/main.jsx` con el DSN. Sin esto,
crashes silenciosos pueden pasar semanas antes de detectarse.

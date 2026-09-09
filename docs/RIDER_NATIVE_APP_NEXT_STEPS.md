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

Todo el scaffolding cliente y backend está listo. Solo faltan los pasos
que requieren acción externa (crear proyecto Firebase, bajar credenciales).

### Lo que YA está integrado

- ✅ **Cliente**: `client/src/lib/riderPush.js` con `registerRiderPushToken()`
  y `subscribeRiderPush()`. Import dinámico de `@capacitor/push-notifications`:
  si no está instalado, es no-op silencioso. Se dispara automáticamente
  en el bootstrap del `RiderPanel` después del login.
- ✅ **Backend**: columnas `fcm_token`, `fcm_platform`, `fcm_actualizado_en`
  en tabla `repartidores` (migración auto). Endpoint
  `POST /api/repartidores/:id/rider/:codigo/fcm-token` que persiste el token
  del device del rider.
- ✅ **Gradle**: `try/catch` que detecta `google-services.json` y activa el
  plugin automático.

### Pasos que faltan (todos externos)

1. **Crear proyecto Firebase gratis**: <https://console.firebase.google.com>.
2. **Agregar app Android** con package `com.modosabor.rider`.
3. **Descargar `google-services.json`** y ponerlo en
   `client/android/app/google-services.json`.
4. **Instalar el plugin Capacitor**:
   ```powershell
   npm --prefix client i @capacitor/push-notifications
   npx --prefix client cap sync android
   ```
5. **Backend sender** (nuevo): instalar `firebase-admin` en el server y
   agregar en el handler de `POST /pedidos` (cuando `repartidor_id` cambia)
   un envío push al `fcm_token` de ese rider. Aproximadamente:
   ```js
   const admin = require('firebase-admin');
   admin.initializeApp({ credential: admin.credential.cert(require('./firebase-service.json')) });
   await admin.messaging().send({
     token: rider.fcm_token,
     notification: { title: 'Nuevo pedido', body: `Pedido #${numero}` },
     android: {
       priority: 'high',
       notification: { channelId: 'rider-orders', sound: 'rider_alert' },
     },
   });
   ```
6. **Probar** desde la consola de Firebase con "Cloud Messaging → New
   Notification → Target device token".

Sin FCM la app sigue funcionando: recibe pedidos cuando está abierta o
en background reciente. Solo falla si Android la mata por RAM/ahorro.

## 4. Sonido custom fuerte

Sirve para que el rider distinga el "nuevo pedido" de cualquier
WhatsApp.

### Estado

`nativeRiderGps.js` ya declara `sound: 'rider_alert'` en el canal y en el
schedule. Falta el archivo. Si el archivo no existe, Android cae al sonido
default automático (no rompe la notificación).

### Único paso pendiente

1. Grabar o buscar un `.mp3` corto (2-4 segundos) tipo "ding-dong de
   restaurante" fuerte.
2. Guardarlo como `client/android/app/src/main/res/raw/rider_alert.mp3`.
   El nombre debe ser todo minúsculas y sin guiones (usar underscore).
3. Rebuild APK.

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

- ✅ **Marcar entregado** (`kind: 'mark_delivered'`) cuando `navigator.onLine === false`.
- ✅ **Cambio de estado de pedido** (`kind: 'change_state'`) — aceptar,
  comenzar reparto, marcar cancelado, etc.
- ✅ **Reporte de incidencia** (`kind: 'report_issue'`) — con motivo
  preseteado. También abre WhatsApp al local si hay red.

Actualización optimista local: cuando encolamos un cambio de estado, el UI
del rider se actualiza al toque como si hubiera funcionado, para que pueda
seguir trabajando. La cola se sincroniza al reconectar.

**GPS no se encola por diseño**: son ~1 punto cada 5s. Encolar 100+ puntos
en un rato sin señal es basura y satura el server al reconectar. Lo que sí
hacemos es descartar los puntos GPS offline y retomar el streaming en vivo
apenas hay red. Es el mismo comportamiento que Uber/Rappi. El cliente ve
al rider "congelado" en el mapa hasta que recupera señal.

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

El paquete histórico `@capacitor/assets` no se usa: su última versión sólo
soporta Capacitor 5 y arrastra dependencias vulnerables. Las imágenes actuales
siguen siendo válidas; para regenerarlas con una nueva marca, abrir
`client/android` en Android Studio y usar **New → Image Asset** para crear los
recursos `mipmap-*` y `drawable-*` desde los dos PNG. Después correr:

```powershell
cd client
npx cap sync android
```

y hacer el rebuild habitual. Así los assets se generan con la toolchain nativa
de Capacitor 8, sin agregar un generador desactualizado al proyecto.

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

## 9. Auto-actualización de la app (in-app updater)

La app rider chequea sola si hay una versión nueva disponible en el
server y le muestra un modal al rider con la opción de descargar e
instalar. Ya no hace falta pasarle el APK por WhatsApp cada vez que
haya un update.

### Cómo funciona

1. El backend expone `GET /api/rider-app/version` (público) que
   devuelve el manifest de la última versión publicada.
2. La app al abrir (post-login, con throttle de 6 h) hace ese GET y
   compara el `versionCode` recibido contra el que tiene instalado
   (leído con `@capacitor/app`).
3. Si el server tiene una versión más nueva, muestra un modal con el
   changelog y dos botones: **Actualizar ahora** / **Más tarde**.
4. Al tocar Actualizar, se abre el navegador del sistema con la URL
   del APK, Android lo descarga y muestra el instalador nativo. El
   rider toca "Instalar" y listo.

### Publicar una versión nueva (flujo de 4 pasos)

**1) Buildear el APK release**

```powershell
cd D:\Proyectos\modosabor1
npm --prefix client run android:release-apk
```

Sale en `client/android/app/build/outputs/apk/release/app-release.apk`.

**2) Copiar el APK a la carpeta de distribución**

Usar un nombre versionado (nunca `latest.apk` — se rompen caches):

```powershell
copy client\android\app\build\outputs\apk\release\app-release.apk `
     server\uploads\rider-app\modosabor-rider-1.2.0.apk
```

**3) Editar el manifest**

Abrir `server/uploads/rider-app/manifest.json` y actualizar:

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

- `versionCode`: mismo formato que Gradle (`MAJOR*10000 + MINOR*100 + PATCH`).
  Debe ser mayor al de la versión que están usando los riders.
- `apkFile`: nombre exacto del archivo que copiaste en el paso 2.
- `changelog`: markdown-ish, se muestra en el modal (líneas cortas).
- `forceUpdate: true` → el rider **no puede cerrar el modal**; obligado
  a actualizar. Usar solo si hay cambios de backend incompatibles.
- `minVersionCode`: si el rider tiene menos, se le fuerza aunque
  `forceUpdate` sea false. Sirve para cortar versiones muy viejas.

**4) Deploy**

```powershell
cd D:\Proyectos\modosabor1
git add server/uploads/rider-app/manifest.json server/uploads/rider-app/*.apk
git commit -m "rider: release v1.2.0"
git push origin main
```

Railway redeploya solo. Los riders al abrir la app (o al volver del
background) ven el modal en máximo unos minutos.

### Comportamiento del modal

- **Voluntario** (forceUpdate=false): tienen botón "Más tarde". Si lo
  tocan, la app no vuelve a mostrar el modal para **esa misma versión**.
  Si publicás una v1.2.1, el modal vuelve a aparecer.
- **Obligatorio** (forceUpdate=true o versión < minVersionCode): no hay
  botón "Más tarde"; el modal bloquea el uso de la app.

### Notificar al equipo (opcional pero útil)

El sistema de update chequea al abrir la app. Para que el rider abra la
app cuando hay update, mandale un WhatsApp al grupo: "🚀 Nueva versión
disponible, abrí la app para actualizar". Sin FCM, ese es el único
"push" hasta que la app esté abierta.

Con FCM configurado (sección 3) se puede mandar un push automático al
publicar versión — endpoint del backend `POST /api/repartidores/broadcast-update`
podría dispararlo. Queda para futura iteración.

### Requisitos técnicos ya integrados

- Permiso `REQUEST_INSTALL_PACKAGES` en `AndroidManifest.xml` ✅
- Endpoint backend `/api/rider-app/version` ✅
- Cliente `client/src/lib/riderUpdater.js` ✅
- Modal en `RiderPanel.jsx` (se muestra pre y post-login) ✅
- Carpeta `server/uploads/rider-app/` con `manifest.json` inicial ✅

### Limpieza periódica de APKs viejos

Los archivos `.apk` se acumulan. Cada tanto (cada 5-10 releases), borrar
manualmente los más viejos de `server/uploads/rider-app/` dejando los
últimos 2-3 por si hay que hacer rollback.

## 10. Métricas de crash remoto

Para saber si la app crashea en un celular específico sin que el rider
avise:

1. **Sentry** (gratis 5k eventos/mes): `npm i @sentry/capacitor`.
2. **Firebase Crashlytics**: viene con Firebase, tiene reportes lindos.

Elegir uno y agregarlo en `client/src/main.jsx` con el DSN. Sin esto,
crashes silenciosos pueden pasar semanas antes de detectarse.

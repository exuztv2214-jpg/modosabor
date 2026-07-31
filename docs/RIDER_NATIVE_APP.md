# Modo Sabor Rider nativo

## Estado

La app rider ahora tiene envoltorio Capacitor para Android e iOS.

- Android: proyecto en `client/android`.
- iOS: proyecto en `client/ios`.
- App ID: `com.modosabor.rider`.
- Pantalla inicial nativa: `/rider`.
- API por defecto en nativo: `https://modosabor-api-production.up.railway.app`.

## GPS

En web/PWA se mantiene el fallback del navegador.

En app nativa se usa:

- `@capacitor-community/background-geolocation` para tracking en background.
- `@capacitor/geolocation` para permisos y lectura puntual.
- `@capacitor/local-notifications` para pedir permiso de notificacion persistente en Android.
- `CapacitorHttp` para enviar ubicaciones al backend desde el runtime nativo.
- Foreground notification en Android con titulo `Modo Sabor Rider`.

El filtro existente sigue activo:

- descarta precision mayor a 100 metros.
- descarta saltos bruscos.
- suaviza movimientos cortos antes de subir al backend.

## Android

Permisos configurados:

- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`
- `POST_NOTIFICATIONS`
- `INTERNET`

Para generar APK debug:

```powershell
cd D:\Proyectos\modosabor1
npm run native:android:debug
```

Salida:

```text
client\android\app\build\outputs\apk\debug\app-debug.apk
```

## iOS

Configurado en `Info.plist`:

- `NSLocationWhenInUseUsageDescription`
- `NSLocationAlwaysAndWhenInUseUsageDescription`
- `NSLocationAlwaysUsageDescription`
- `UIBackgroundModes` con `location`

Para compilar iOS hace falta macOS + Xcode. Desde Windows se deja el proyecto preparado, pero no se genera `.ipa`.

## Resto del sistema

No conviene empaquetar todo como nativo por ahora.

- TPV, cocina, admin y web publica siguen como web/PWA.
- Solo Rider necesita GPS nativo y background tracking.

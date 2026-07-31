param(
  [string]$JavaHome = "C:\Program Files\Android\Android Studio\jbr",
  [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) {
  throw "No se encontro Java en $JavaHome. Instala Android Studio o pasa -JavaHome."
}

if (-not (Test-Path $AndroidSdk)) {
  throw "No se encontro Android SDK en $AndroidSdk. Abri Android Studio e instala el SDK."
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk

npm --prefix client run android:debug

$apk = Resolve-Path "client\android\app\build\outputs\apk\debug\app-debug.apk"
Write-Host ""
Write-Host "APK debug generado:" -ForegroundColor Green
Write-Host $apk.Path

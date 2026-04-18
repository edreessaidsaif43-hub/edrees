$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Test-Path "$root\keystore.properties")) {
  throw "keystore.properties غير موجود. شغّل scripts/generate-keystore.ps1 أولًا."
}

if (Test-Path "$root\gradlew.bat") {
  & "$root\gradlew.bat" clean :app:assembleRelease :app:bundleRelease
} else {
  Write-Host "gradlew.bat غير موجود. افتح المشروع في Android Studio وشغّل Build > Generate Signed Bundle / APK."
}

Write-Host "If build succeeds, outputs are usually under:"
Write-Host "app/build/outputs/apk/release"
Write-Host "app/build/outputs/bundle/release"

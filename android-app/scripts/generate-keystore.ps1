param(
  [string]$Alias = "lessonplatform",
  [string]$KeystoreRelativePath = "keystore/release-key.jks"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$keystorePath = Join-Path $root $KeystoreRelativePath
$keystoreDir = Split-Path -Parent $keystorePath
if (!(Test-Path $keystoreDir)) { New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null }

$keytool = "keytool"
try {
  & $keytool -help | Out-Null
} catch {
  throw "keytool غير متاح. ثبّت JDK 17 واضبط JAVA_HOME."
}

if (Test-Path $keystorePath) {
  throw "ملف keystore موجود بالفعل: $keystorePath"
}

$storePass = Read-Host "Enter keystore password"
$keyPass = Read-Host "Enter key password"
$fullName = Read-Host "CN (Full Name)"
$orgUnit = Read-Host "OU (Org Unit, optional)"
$org = Read-Host "O (Organization, optional)"
$city = Read-Host "L (City)"
$state = Read-Host "S (State)"
$country = Read-Host "C (2-letter country code, e.g. AE)"

$dname = "CN=$fullName, OU=$orgUnit, O=$org, L=$city, S=$state, C=$country"

& $keytool -genkeypair -v \
  -keystore $keystorePath \
  -alias $Alias \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass $storePass \
  -keypass $keyPass \
  -dname $dname

@"
storeFile=$KeystoreRelativePath
storePassword=$storePass
keyAlias=$Alias
keyPassword=$keyPass
"@ | Set-Content -Path (Join-Path $root "keystore.properties") -Encoding UTF8

Write-Host "Done. Generated: $keystorePath"
Write-Host "Created: $(Join-Path $root 'keystore.properties')"

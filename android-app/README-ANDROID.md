# Lesson Platform Android App

## Location
`C:\Users\Irfan Bashir\Documents\New project2\android-app`

## Open in Android Studio
1. Open Android Studio.
2. Choose **Open**.
3. Select folder: `android-app`.
4. Wait for Gradle sync.

## Debug Build (Quick)
1. Build > Build Bundle(s) / APK(s) > Build APK(s)
2. Output: `app/build/outputs/apk/debug/app-debug.apk`

## Release Signing Setup (Required for publish)
1. Open terminal in `android-app`.
2. Run:
   `powershell -ExecutionPolicy Bypass -File .\scripts\generate-keystore.ps1`
3. Script will create:
   - `keystore/release-key.jks`
   - `keystore.properties`

## Build Signed Release
- If Gradle wrapper exists:
  `powershell -ExecutionPolicy Bypass -File .\scripts\build-release.ps1`
- Or from Android Studio:
  Build > Generate Signed Bundle / APK

## Release Outputs
- APK: `app/build/outputs/apk/release/`
- AAB: `app/build/outputs/bundle/release/`

## Important
- Keep `keystore.properties` and `keystore/*.jks` safe and private.
- Do not lose keystore/passwords or you cannot update the same app on Play Store.

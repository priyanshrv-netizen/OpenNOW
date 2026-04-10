@echo off
setlocal enabledelayedexpansion

set "BUILD_TYPE=%~1"
if "%BUILD_TYPE%"=="" set "BUILD_TYPE=debug"

if /I not "%BUILD_TYPE%"=="debug" if /I not "%BUILD_TYPE%"=="release" (
  echo Usage: build-apk.bat [debug^|release]
  exit /b 1
)

cd /d "%~dp0"

echo ===============================================================
echo   OpenNOW Mobile - Windows APK Builder
echo   Build Type: %BUILD_TYPE%
echo ===============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not on PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not installed or not on PATH.
  exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Java is not installed or not on PATH.
  exit /b 1
)

echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
  echo [ERROR] npm install failed.
  exit /b 1
)
echo.

echo [2/4] Generating Android project...
call npx expo prebuild --platform android
if errorlevel 1 (
  echo [ERROR] expo prebuild failed.
  exit /b 1
)
echo.

if not exist "android\gradlew.bat" (
  echo [ERROR] android\gradlew.bat not found after prebuild.
  exit /b 1
)

echo [3/4] Building APK...
pushd android
if /I "%BUILD_TYPE%"=="release" (
  call gradlew.bat assembleRelease
  set "APK_PATH=app\build\outputs\apk\release\app-release.apk"
) else (
  call gradlew.bat assembleDebug
  set "APK_PATH=app\build\outputs\apk\debug\app-debug.apk"
)
if errorlevel 1 (
  popd
  echo [ERROR] Gradle build failed.
  exit /b 1
)
popd
echo.

echo [4/4] Build finished.
if not exist "android\%APK_PATH%" (
  echo [ERROR] APK not found at android\%APK_PATH%
  exit /b 1
)

echo.
echo APK created:
echo   %CD%\android\%APK_PATH%
echo.

where adb >nul 2>nul
if errorlevel 1 (
  echo adb not found on PATH. Install platform-tools to use USB install.
  echo Manual install: copy the APK to your phone and open it.
  exit /b 0
)

for /f %%D in ('adb devices ^| findstr /R /C:".*	device$"') do (
  set "HAS_DEVICE=1"
)

if not defined HAS_DEVICE (
  echo No Android device detected over adb.
  echo Manual install: copy the APK to your phone and open it.
  exit /b 0
)

set /p "INSTALL_NOW=Install on connected device now? [y/N]: "
if /I "%INSTALL_NOW%"=="y" (
  adb install -r "android\%APK_PATH%"
)

exit /b 0

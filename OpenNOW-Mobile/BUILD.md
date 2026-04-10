# OpenNOW Mobile - Build Instructions

## Building APK for Testing

### Prerequisites

1. **Android Studio** (latest version)
2. **JDK 17** or higher
3. **Android SDK** (API 33+ recommended)
4. **Node.js** 18+

### Step 1: Install Dependencies

```bash
cd /home/OpenNOW/OpenNOW-Mobile
npm install
```

### Step 2: Generate Native Android Project

```bash
npx expo prebuild --platform android
```

This creates the `android/` directory with all native files.

### Step 3: Configure Signing (Debug Build)

For testing, you can use the debug keystore that Android Studio generates automatically.

For release builds, create `android/app/my-release-key.keystore` and configure in `android/app/build.gradle`.

### Step 4: Build APK

#### Option A: Debug APK (Recommended for Testing)

```bash
cd android
./gradlew assembleDebug
```

APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

#### Option B: Release APK

```bash
cd android
./gradlew assembleRelease
```

APK location: `android/app/build/outputs/apk/release/app-release.apk`

### Step 5: Install on Device

#### Method 1: USB + ADB

1. Enable **Developer Options** on your phone:
   - Go to Settings → About Phone → Tap "Build Number" 7 times

2. Enable **USB Debugging** in Developer Options

3. Connect phone via USB

4. Install APK:
   ```bash
   adb install -r android/app/build/outputs/apk/debug/app-debug.apk
   ```

#### Method 2: Transfer + Install

1. Transfer APK to phone (email, cloud drive, USB, etc.)
2. On phone: Enable "Install from Unknown Sources" in Settings
3. Open APK file on phone and install

#### Method 3: Expo Development Build (Easier for Iteration)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build development APK (Expo handles signing)
eas build -p android --profile development

# Download APK from Expo dashboard link
```

## Development Mode (Hot Reload)

For faster development without rebuilding APK each time:

```bash
# Start Metro bundler
npx expo start

# Install Expo Go app from Play Store
# Scan QR code with Expo Go
```

**Note**: Expo Go doesn't support `react-native-webrtc`, so streaming won't work. Use this only for UI development.

## Troubleshooting

### Build Errors

**Gradle daemon issues:**
```bash
./gradlew --stop
./gradlew clean
```

**Missing SDK:**
- Open Android Studio → SDK Manager → Install Android 13 (API 33)

**Native module issues:**
```bash
cd android
./gradlew clean
./gradlew assembleDebug --stacktrace
```

### Runtime Issues

**WebRTC not working:**
- Ensure camera/mic permissions granted in app settings
- Check AndroidManifest.xml has required permissions

**OAuth not opening:**
- Check if browser is available
- Verify `opennow://oauth/callback` scheme registered

**Black screen on stream:**
- WebRTC requires hardware acceleration on some devices
- Try different codec in settings (H264 most compatible)

## App Signing for Distribution

To create a signed release APK:

1. Generate keystore:
   ```bash
   keytool -genkey -v -keystore my-release-key.keystore -alias opennow -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Move to `android/app/`

3. Create `android/keystore.properties`:
   ```
   storePassword=YOUR_PASSWORD
   keyPassword=YOUR_PASSWORD
   keyAlias=opennow
   storeFile=my-release-key.keystore
   ```

4. Update `android/app/build.gradle` signing config

5. Build:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```

## Size Optimization

The APK may be large due to WebRTC. To reduce size:

```bash
# Build APK split by ABI (creates smaller per-device APKs)
./gradlew bundleRelease
```

This creates an AAB (Android App Bundle) for Play Store, or use:
```bash
./gradlew assembleRelease -Pandroid.injected.build.abi=arm64-v8a
```

For single architecture APK.

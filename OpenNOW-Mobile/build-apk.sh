#!/bin/bash

# OpenNOW Mobile - APK Build Script
# Usage: ./build-apk.sh [debug|release]

BUILD_TYPE=${1:-debug}

echo "═══════════════════════════════════════════════════════════════"
echo "  OpenNOW Mobile - APK Builder"
echo "  Build Type: $BUILD_TYPE"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from OpenNOW-Mobile directory"
    echo "   cd OpenNOW-Mobile && ./build-apk.sh"
    exit 1
fi

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"
echo ""

# Step 2: Generate native project
echo "🏗️  Step 2: Generating Android project..."
if [ ! -d "android" ]; then
    npx expo prebuild --platform android
    if [ $? -ne 0 ]; then
        echo "❌ Failed to prebuild Android project"
        exit 1
    fi
    echo "✅ Android project generated"
else
    echo "ℹ️  Android project already exists (skipping prebuild)"
fi
echo ""

# Step 3: Build APK
echo "🔨 Step 3: Building APK ($BUILD_TYPE)..."
cd android

if [ "$BUILD_TYPE" = "release" ]; then
    ./gradlew assembleRelease
    APK_PATH="app/build/outputs/apk/release/app-release.apk"
else
    ./gradlew assembleDebug
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
fi

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi
echo "✅ Build completed"
echo ""

# Step 4: Show results
cd ..
echo "═══════════════════════════════════════════════════════════════"
echo "  ✅ APK Build Complete!"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "📱 APK Location:"
echo "   android/$APK_PATH"
echo ""

# Show file size
if [ -f "android/$APK_PATH" ]; then
    SIZE=$(du -h android/$APK_PATH | cut -f1)
    echo "📊 File Size: $SIZE"
    echo ""
fi

echo "📲 Installation Options:"
echo ""
echo "   Option 1 - USB + ADB (recommended):"
echo "      1. Enable USB debugging on your phone"
echo "      2. Connect phone via USB"
echo "      3. Run: adb install -r android/$APK_PATH"
echo ""
echo "   Option 2 - Manual Transfer:"
echo "      1. Copy android/$APK_PATH to your phone"
echo "      2. Enable 'Install from Unknown Sources' in Settings"
echo "      3. Open the APK on your phone to install"
echo ""
echo "   Option 3 - QR Code Transfer:"
echo "      1. Upload APK to file sharing service"
echo "      2. Download via link/QR on phone"
echo ""

# Check if adb is available and device connected
if command -v adb &> /dev/null; then
    DEVICES=$(adb devices | grep -v "List" | grep "device" | wc -l)
    if [ "$DEVICES" -gt 0 ]; then
        echo "🔌 ADB device detected! Install now? (y/n)"
        read -r response
        if [ "$response" = "y" ]; then
            echo "Installing..."
            adb install -r "android/$APK_PATH"
            if [ $? -eq 0 ]; then
                echo "✅ Installed successfully!"
                echo "   Open the app: adb shell am start -n com.opennow.mobile/.MainActivity"
            else
                echo "❌ Installation failed"
            fi
        fi
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"

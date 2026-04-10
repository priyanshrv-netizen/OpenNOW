# OpenNOW Mobile

Android port of OpenNOW - A GeForce NOW client for Android devices.

## Overview

OpenNOW Mobile brings GeForce NOW game streaming to Android devices. This React Native implementation ports the core functionality from the Electron desktop app:

- OAuth authentication with NVIDIA
- Game catalog browsing and library
- WebRTC streaming with touch controls
- Virtual gamepad overlay
- Session management and queuing

## Architecture

### From Desktop (Electron) to Mobile (React Native)

| Desktop (Electron) | Mobile (React Native) |
|-------------------|----------------------|
| Electron Main Process | React Native + Expo |
| IPC Bridge | Direct JS API calls |
| Node.js HTTP/WebSocket | React Native fetch/WebSocket |
| Electron OAuth | expo-web-browser |
| Desktop Settings (file) | AsyncStorage |
| Chromium WebRTC | react-native-webrtc |
| Keyboard/Mouse Input | Touch + Virtual Gamepad |
| Window Management | Fullscreen native views |

## Project Structure

```
OpenNOW-Mobile/
├── src/
│   ├── api/           # API modules (auth, games, session, streaming)
│   ├── components/    # Reusable UI components
│   ├── screens/       # Main screens (Login, Home, Stream)
│   ├── types/         # TypeScript type definitions
│   ├── utils/         # Utilities (input protocol)
│   └── App.tsx        # Main app component
├── android/           # Android native project (after prebuild)
├── ios/               # iOS native project (after prebuild)
├── assets/            # App icons and splash screens
├── app.json           # Expo configuration
└── package.json
```

## Setup

### Prerequisites

- Node.js 18+
- Android Studio with SDK
- JDK 11
- Expo CLI

### Installation

1. Navigate to the mobile directory:
   ```bash
   cd opennow-stable/OpenNOW-Mobile
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. For Android development, prebuild the native project:
   ```bash
   npx expo prebuild --platform android
   ```

4. Configure Android manifest for OAuth callback:
   - Add `opennow://oauth/callback` intent filter

## Running

### Development (Expo Go)

```bash
# Start the development server
npm start

# Scan QR code with Expo Go app on Android device
```

### Native Build

```bash
# Android debug build
npm run android

# Android release build
cd android
./gradlew assembleRelease
```

## Mobile-Specific Features

### Touch Controls

- **Direct Touch Mode**: Touch maps directly to screen coordinates
- **Touchpad Mode**: Relative movement (trackpad style)
- **Tap**: Left click
- **Two-finger tap**: Right click
- **Long press**: Can be mapped to right click or drag

### Virtual Gamepad

When streaming:
- Tap screen to show/hide overlay controls
- D-pad and action buttons (A/B)
- Full gamepad available with button to expand

### WebRTC Streaming

Uses `react-native-webrtc` for video/audio streaming:
- Hardware H.264 decoding where available
- Adaptive bitrate based on connection
- Diagnostics overlay (FPS, latency, packet loss)

### Screen Orientation

App defaults to landscape for streaming:
- Home screen: Portrait or landscape
- Streaming: Locked landscape

## Authentication

OAuth flow uses `expo-web-browser`:
1. Opens system browser for NVIDIA login
2. Callback to `opennow://oauth/callback`
3. Exchange code for tokens
4. Store tokens in AsyncStorage

## API Modules

### `api/auth.ts`
- OAuth login/logout
- Token refresh
- Session persistence

### `api/games.ts`
- Fetch game catalog
- Library games
- Search

### `api/session.ts`
- Create streaming session
- Poll for queue position
- Stop/claim sessions

### `api/streaming.ts`
- WebRTC peer connection
- Input protocol encoding
- Stats collection

### `api/signaling.ts`
- WebSocket NVST protocol
- SDP exchange
- ICE candidates

### `api/settings.ts`
- Persistent preferences
- Mobile-optimized defaults

## Utilities

### `utils/inputProtocol.ts`

Ports the desktop input protocol to mobile:
- `TouchInputHandler`: Converts touch events to mouse input
- `VirtualGamepadHandler`: Gamepad state encoding
- `InputEncoder`: Binary protocol encoding

## Configuration

### Mobile Default Settings

Resolution: 1280x720 (mobile-optimized)
FPS: 60
Max Bitrate: 20 Mbps (lower for mobile networks)
Codec: H264 (best mobile support)
Controller Mode: Enabled by default

## Troubleshooting

### WebRTC not working
- Ensure camera/microphone permissions granted
- Check Android manifest for required permissions
- Verify STUN/TURN servers accessible

### OAuth fails
- Check custom URL scheme registered
- Verify `opennow://oauth/callback` in manifest
- Test in release build (some OAuth providers block debug)

### Streaming lag
- Reduce bitrate in settings
- Check network connection
- Enable/disable hardware decoding

## Limitations vs Desktop

1. **Recording/Screenshots**: Android restricts background recording
2. **Keyboard Shortcuts**: Virtual keyboard only
3. **Multi-monitor**: Single screen only
4. **Clipboard**: Limited paste support
5. **Hardware acceleration**: Device-dependent H.264 support

## Contributing

This is an early port. Key areas for improvement:

1. Native WebRTC optimizations
2. Hardware keyboard support
3. Physical gamepad auto-detection
4. Picture-in-picture mode
5. Battery optimization

## License

MIT - See parent project license.

---

**Not affiliated with NVIDIA. GeForce NOW is a trademark of NVIDIA Corporation.**
